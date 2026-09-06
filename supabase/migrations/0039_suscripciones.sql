-- Suscripciones: el estado de cobro de cada cliente.
--
-- DECISIONES QUE ESTE ARCHIVO DA POR HECHAS (acordadas con el dueño, 22 ago 2026):
--   · Prueba de 14 días SIN tarjeta. La prueba la lleva Demandu, no Stripe:
--     el cliente entra, arma su bot y solo al final se le pide pagar.
--   · Si el pago falla, 7 días de gracia con avisos antes de cortar. Una
--     tarjeta vencida no debe costar un cliente.
--   · Los planes a la medida los paga el propio cliente desde su pantalla.
--
-- POR QUÉ EL ESTADO VIVE AQUÍ Y NO SE LE PREGUNTA A STRIPE: cada pantalla
-- necesita saber si la cuenta está al día, y no se puede llamar a Stripe en
-- cada carga. Stripe avisa por webhook y nosotros guardamos; la base es la
-- única verdad para la plataforma.

alter table organizations
  -- Quién es este cliente dentro de Stripe. Se crea la primera vez que paga.
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  -- prueba · activa · pago_fallido · cancelada · sin_plan
  add column if not exists estado_cobro text not null default 'prueba',
  add column if not exists prueba_termina_at timestamptz,
  -- Hasta cuándo está pagado el mes en curso (lo dice Stripe).
  add column if not exists periodo_termina_at timestamptz,
  -- Si el pago falló: hasta cuándo sigue funcionando por cortesía.
  add column if not exists gracia_termina_at timestamptz,
  -- Se apunta para poder decir "cancelaste el 3 de marzo" sin adivinar.
  add column if not exists cancelada_at timestamptz;

comment on column organizations.estado_cobro is
  'prueba | activa | pago_fallido | cancelada | sin_plan. Lo mantiene el webhook de Stripe.';

create index if not exists organizations_stripe_customer on organizations (stripe_customer_id);
create index if not exists organizations_stripe_sub on organizations (stripe_subscription_id);

-- Los clientes que ya existen NO se quedan sin prueba por haber llegado antes.
-- Sin esto, el día que se encienda el cobro se quedarían fuera de golpe.
update organizations
   set prueba_termina_at = now() + interval '14 days'
 where prueba_termina_at is null;

/* ─────────────────────────────────────────────────────────────────────────────
 * Eventos de Stripe
 *
 * DOS RAZONES POR LAS QUE ESTA TABLA EXISTE:
 *
 *  1. IDEMPOTENCIA. Stripe reenvía el mismo evento si no contestamos rápido, y
 *     puede mandarlo varias veces por diseño. Sin una clave única por evento,
 *     un reintento podría activar dos veces un plan o duplicar un complemento.
 *     El `unique` de `stripe_event_id` lo hace imposible.
 *
 *  2. PODER MIRAR ATRÁS. Cuando un cliente diga "yo sí pagué", aquí está el
 *     evento crudo con su fecha. Sin esto, la única versión de los hechos
 *     estaría en el panel de Stripe.
 * ───────────────────────────────────────────────────────────────────────────── */
create table if not exists billing_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  tipo text not null,
  org_id uuid references organizations(id) on delete set null,
  payload jsonb,
  procesado_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_org on billing_events (org_id, created_at desc);

alter table billing_events enable row level security;
-- Solo el servidor. Un cliente no tiene nada que hacer aquí: son datos crudos
-- de Stripe, con identificadores internos.
revoke all on billing_events from public, anon, authenticated;
grant select, insert, update on billing_events to service_role;

/* ─────────────────────────────────────────────────────────────────────────────
 * ¿Esta cuenta puede enviar mensajes?
 *
 * UNA SOLA FUNCIÓN PARA TODA LA PLATAFORMA. El motor de WhatsApp, el canal web,
 * las difusiones y los seguimientos tienen que dar la MISMA respuesta. Si cada
 * uno lo calculara por su cuenta, tarde o temprano uno cobraría de más o
 * dejaría enviar gratis, y sería imposible de encontrar.
 *
 * Devuelve `true` cuando: está en prueba y no ha vencido · está al día ·
 * el pago falló pero sigue dentro de los días de gracia.
 * ───────────────────────────────────────────────────────────────────────────── */
create or replace function org_puede_enviar(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case o.estado_cobro
           when 'activa'        then true
           when 'prueba'        then coalesce(o.prueba_termina_at, now()) > now()
           when 'pago_fallido'  then coalesce(o.gracia_termina_at, now()) > now()
           else false
         end
    from organizations o
   where o.id = p_org_id;
$$;

/**
 * El estado de cobro en lenguaje humano, para pintarlo en pantalla.
 *
 * Devuelve una sola fila con lo que la pantalla necesita, ya calculado, para
 * que ninguna pantalla tenga que volver a razonar las reglas.
 *
 * COMPRUEBA LA PERTENENCIA A MANO. Es `security definer` —tiene que leer
 * columnas de cobro que la RLS no expone— y eso significa que se salta la RLS.
 * Sin el `exists` de abajo, cualquiera con sesión podría preguntar por el
 * identificador de OTRA organización y enterarse de si está al día o le falló
 * el pago. Es poca información, pero es información de otro negocio.
 */
create or replace function estado_de_cobro(p_org_id uuid)
returns table (
  estado text,
  puede_enviar boolean,
  dias_restantes integer,
  plan_code text,
  periodo_termina_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.estado_cobro,
    case o.estado_cobro
      when 'activa'        then true
      when 'prueba'        then coalesce(o.prueba_termina_at, now()) > now()
      when 'pago_fallido'  then coalesce(o.gracia_termina_at, now()) > now()
      else false
    end,
    case o.estado_cobro
      when 'prueba'       then greatest(0, ceil(extract(epoch from (o.prueba_termina_at - now())) / 86400)::int)
      when 'pago_fallido' then greatest(0, ceil(extract(epoch from (o.gracia_termina_at - now())) / 86400)::int)
      else null
    end,
    o.plan,
    o.periodo_termina_at
  from organizations o
  where o.id = p_org_id
    and exists (
      select 1 from memberships m
       where m.org_id = o.id and m.user_id = auth.uid()
    );
$$;

-- Postgres concede EXECUTE a PUBLIC por defecto, y `anon` hereda de PUBLIC.
-- Revocar solo de `anon` NO sirve: hay que quitárselo a PUBLIC primero.
-- (Esta misma trampa ya nos mordió tres veces.)
revoke execute on function org_puede_enviar(uuid) from public, anon, authenticated;
revoke execute on function estado_de_cobro(uuid) from public, anon;
-- `org_puede_enviar` es cosa de los motores, no de las pantallas: solo servidor.
grant execute on function org_puede_enviar(uuid) to service_role;
grant execute on function estado_de_cobro(uuid) to authenticated, service_role;
