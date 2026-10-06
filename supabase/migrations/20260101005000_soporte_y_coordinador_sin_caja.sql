-- ── Acceso de soporte a la cuenta de un cliente ─────────────────────────
--
-- CÓMO FUNCIONA, Y POR QUÉ ASÍ.
--
-- Se le crea al miembro de Demandu una membresía DE VERDAD en la organización
-- del cliente, con fecha de caducidad. A partir de ahí toda la plataforma
-- funciona sola: `auth_org_ids`, `auth_puede`, las políticas de RLS y las
-- pantallas no se enteran de nada y no hay que tocarlas.
--
-- La alternativa era meterle un caso especial a `auth_org_ids()`. Se descartó:
-- esa función es el cimiento del aislamiento entre clientes de toda la
-- plataforma, y un «salvo si...» ahí es cómo se acaba filtrando una cuenta en
-- otra. El cambio que sí lleva va en la dirección CONTRARIA: solo quita filas
-- (las caducadas), nunca añade. Para un usuario normal `soporte_hasta` es nulo
-- y todo queda exactamente igual que antes.
alter table public.memberships
  add column if not exists soporte_hasta timestamptz,
  add column if not exists soporte_de uuid references public.equipo_demandu(id) on delete cascade;

comment on column public.memberships.soporte_hasta is
  'Si tiene fecha, esta membresía es un acceso de soporte TEMPORAL y deja de '
  'valer sola al pasar. Nulo = membresía normal de alguien del cliente.';

create index if not exists memberships_soporte_idx
  on public.memberships (soporte_de, soporte_hasta) where soporte_hasta is not null;

-- Para poder abrir/renovar el acceso sin duplicar filas.
create unique index if not exists memberships_org_user_uidx
  on public.memberships (org_id, user_id);

-- La caducidad se comprueba EN LA BASE, no en el código de la aplicación. Si
-- viviera en TypeScript, bastaría con una consulta que se saltara esa función
-- para que un acceso vencido siguiera abierto.
create or replace function public.auth_org_ids()
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  select org_id from memberships
   where user_id = auth.uid()
     and (soporte_hasta is null or soporte_hasta > now());
$function$;

-- `is_platform_admin` mira a `auth.uid()`. Al abrir un acceso de soporte hace
-- falta preguntarlo de OTRA persona (la llave de servicio no tiene `auth.uid()`).
create or replace function public.is_platform_admin_de(p_user uuid)
returns boolean
language sql
stable
set search_path to 'public','pg_temp'
as $$
  select exists (select 1 from public.platform_admins a where a.user_id = p_user)
$$;

revoke execute on function public.is_platform_admin_de(uuid) from public, anon, authenticated;
grant execute on function public.is_platform_admin_de(uuid) to service_role;

-- ── El cliente decide si un partner puede entrar ────────────────────────
--
-- El equipo de Demandu entra a dar soporte sin pedir permiso: es su proveedor
-- y está en el contrato. Un PARTNER es otra empresa, y meterse en la cuenta de
-- un cliente sin que el cliente lo haya aceptado no se hace.
alter table public.organizations
  add column if not exists soporte_partner_ok boolean not null default false,
  add column if not exists soporte_partner_ok_at timestamptz;

comment on column public.organizations.soporte_partner_ok is
  'El cliente autorizó a su partner a entrar a su cuenta para darle soporte. '
  'Lo enciende y lo apaga EL CLIENTE, nunca Demandu.';

-- ── El coordinador se queda fuera de la caja ────────────────────────────
--
-- Decidido con el dueño: «coordinador sin acceso a la caja». Pierde también
-- «Eliminar información» — borrar conversaciones y contactos no se deshace, y
-- no es parte de coordinar el día a día. El dueño puede dárselos a una persona
-- concreta marcando la casilla; lo que cambia aquí es lo que trae de fábrica.
--
-- ⚠️ ESTA TABLA ESTÁ REPETIDA EN `src/lib/permisos.ts`. Si se cambia una, hay
-- que cambiar la otra.
create or replace function public.auth_puede(p_permiso text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare r text; ajustes jsonb; base text[];
begin
  select m.role::text, coalesce(m.permisos, '{}'::jsonb)
    into r, ajustes
    from memberships m
   where m.user_id = auth.uid()
     and (m.soporte_hasta is null or m.soporte_hasta > now())
   limit 1;

  if r is null then return false; end if;
  if r = 'owner' then return true; end if;

  if ajustes ? p_permiso then
    return coalesce((ajustes ->> p_permiso)::boolean, false);
  end if;

  base := case r
    when 'admin'       then array['chatbots','conversaciones','embudo','contactos','resultados','ia','config','equipo','plan','conexiones','envios','borrar']
    when 'coordinador' then array['conversaciones','embudo','contactos','resultados','config','equipo','envios']
    when 'agent'       then array['conversaciones','embudo','contactos']
    when 'developer'   then array['chatbots','ia','conexiones']
    else                    array['embudo','contactos','resultados']
  end;

  return p_permiso = any(base);
end $function$;

revoke execute on function public.auth_puede(text) from public, anon;
grant execute on function public.auth_puede(text) to authenticated, service_role;

-- ── Comisión pactada para UN cliente concreto ───────────────────────────
--
-- ORDEN DE MANDO, de más fuerte a más débil:
--   1. lo pactado para ESTE cliente   (organizations.comision_pct)
--   2. lo pactado con ESE vendedor    (equipo_demandu.comision_pct)
--   3. la escala                      (comision_de: 15% hasta 99, 20% arriba)
alter table public.organizations
  add column if not exists comision_pct numeric;

comment on column public.organizations.comision_pct is
  'Comisión pactada para este cliente. Pisa la del vendedor y la escala. '
  'Nulo = se aplica la del vendedor, y si tampoco tiene, la escala.';
