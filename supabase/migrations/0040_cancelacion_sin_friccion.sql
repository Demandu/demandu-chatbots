-- Cancelar sin fricción.
--
-- REGLA DE NEGOCIO (decisión del dueño, 23 ago 2026): el cliente cancela
-- cuando quiere, sin contratos ni penalizaciones.
--
-- Y una decisión que va con ella: al cancelar NO se corta en el acto. El mes
-- ya está pagado, así que sigue funcionando hasta que termine el periodo.
-- Cortar antes sería quedarse con dinero por un servicio que dejamos de dar,
-- y además convierte una salida tranquila en una queja.
--
-- Por eso hace falta este estado intermedio: la suscripción está CANCELADA
-- pero la cuenta sigue ACTIVA hasta `periodo_termina_at`. Sin esta columna,
-- las dos únicas opciones serían mentir (decir que sigue activa sin avisar que
-- no se renueva) o cortar de golpe.

alter table organizations
  add column if not exists cancela_al_terminar boolean not null default false;

comment on column organizations.cancela_al_terminar is
  'El cliente canceló pero su periodo pagado sigue corriendo. Lo mantiene el webhook desde cancel_at_period_end de Stripe.';

-- Se recrea para devolver también la bandera. Postgres no deja cambiar el tipo
-- de retorno de una función existente, así que hay que soltarla primero.
drop function if exists estado_de_cobro(uuid);

create function estado_de_cobro(p_org_id uuid)
returns table (
  estado text,
  puede_enviar boolean,
  dias_restantes integer,
  plan_code text,
  periodo_termina_at timestamptz,
  cancela_al_terminar boolean
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
    o.periodo_termina_at,
    o.cancela_al_terminar
  from organizations o
  where o.id = p_org_id
    and exists (
      select 1 from memberships m
       where m.org_id = o.id and m.user_id = auth.uid()
    );
$$;

revoke execute on function estado_de_cobro(uuid) from public, anon;
grant execute on function estado_de_cobro(uuid) to authenticated, service_role;
