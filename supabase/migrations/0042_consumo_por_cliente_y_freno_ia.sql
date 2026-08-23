-- Consumo por cliente (panel interno) + freno de mano para la IA.
--
-- POR QUÉ EXISTE ESTO. Al cliente se le vende UNA sola bolsa: mensajes. La IA
-- va incluida y no tiene contador aparte, a propósito — dos contadores se leen
-- como cobro doble. Pero por dentro sí necesitamos ver quién consume qué, y
-- necesitamos poder acotar un caso concreto que se desborde.
--
-- `tope_ia` es NULL para todo el mundo salvo excepciones. No es un límite de
-- producto: es una llave de paso para una cuenta que se salió de lo previsto
-- mientras se habla con ella.

-- ── El freno ────────────────────────────────────────────────────────────────
alter table public.organizations
  add column if not exists tope_ia integer;

comment on column public.organizations.tope_ia is
  'Máximo de respuestas de IA al mes para esta cuenta. NULL = sin tope (lo normal). '
  'Al llegar, el bot sigue funcionando con sus flujos y botones; solo deja de pensar '
  'respuestas nuevas. Degradar, no cortar.';

-- ── Qué consume cada cliente ────────────────────────────────────────────────
-- SECURITY DEFINER porque cruza TODAS las organizaciones: es justo lo que las
-- RLS impiden hacer a un usuario normal, y por eso el permiso de ejecución se
-- le quita a todo el mundo menos a service_role. El panel la llama con la
-- llave de servicio desde el servidor, detrás del guard de /superadmin.
create or replace function public.consumo_de_clientes()
returns table (
  org_id uuid,
  negocio text,
  plan_code text,
  plan_nombre text,
  precio numeric,
  estado_cobro text,
  mensajes_usados bigint,
  mensajes_limite bigint,
  ia_usada bigint,
  tope_ia integer,
  creado_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with per as (
    select date_trunc('month', now()) as ini,
           (date_trunc('month', now()) + interval '1 month') as fin
  )
  select
    o.id,
    o.name,
    o.plan,
    p.name,
    p.price_monthly,
    o.estado_cobro,
    -- Mensajes que SALEN. Lo que entra no se cuenta: recibir es gratis.
    -- Se descartan los que Meta no llegó a entregar: cobrar por un mensaje
    -- que el cliente final nunca vio no se sostiene.
    (select count(*) from messages m, per
      where m.org_id = o.id and m.direction = 'outbound'
        and m.created_at >= per.ini and m.created_at < per.fin
        and not (m.payload ? 'no_entregado'))::bigint,
    -- El límite del plan más las bolsitas de 1.000 que haya comprado.
    (coalesce(p.messages_month, 0)
      + coalesce((select sum(oa.quantity) * 1000 from org_addons oa
                   where oa.org_id = o.id and oa.active and oa.addon_code = 'msgs_1k'), 0))::bigint,
    (select coalesce(sum(u.quantity), 0) from usage_events u, per
      where u.org_id = o.id and u.kind = 'ai_message'
        and u.created_at >= per.ini and u.created_at < per.fin)::bigint,
    o.tope_ia,
    o.created_at
  from organizations o
  left join plans p on p.code = o.plan
  where o.datos_borrados_at is null;
$$;

-- EXECUTE se concede a PUBLIC por defecto, y `anon` hereda de PUBLIC. Sin
-- estas dos líneas, cualquiera con la llave pública podría listar los ingresos
-- de todos los clientes de la plataforma.
revoke all on function public.consumo_de_clientes() from public, anon, authenticated;
grant execute on function public.consumo_de_clientes() to service_role;
