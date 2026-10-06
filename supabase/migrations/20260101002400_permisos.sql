-- 0024 · Permisos por persona
--
-- Ya existía `memberships.role` con owner / admin / agent / viewer, pero no lo
-- leía NADIE: todo el que entraba veía y podía todo. Esto le da dientes.
--
-- DOS IDEAS QUE NO HAY QUE MEZCLAR:
--   · El ROL es un atajo con permisos por defecto sensatos.
--   · `permisos` guarda SOLO lo que el dueño cambió a mano, y manda sobre el rol.
--
-- Se guarda la diferencia y no la lista completa a propósito: si mañana
-- cambiamos qué trae "Atención al cliente" de fábrica, todo el mundo lo hereda
-- sin migrar nada — salvo quien tenga una excepción puesta aposta.

-- ── El rol de desarrollo ────────────────────────────────────────────────────
-- Para quien arma chatbots, conexiones e integraciones pero no atiende clientes.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'member_role' and e.enumlabel = 'developer'
  ) then
    alter type member_role add value 'developer';
  end if;
end $$;

-- ── Dónde viven las excepciones ─────────────────────────────────────────────
alter table memberships
  add column if not exists permisos jsonb not null default '{}'::jsonb;

comment on column memberships.permisos is
  'Solo lo que se apartó del rol: {"plan": false, "envios": true}. Vacío = exactamente lo del rol.';

-- ── Un solo dueño por organización ──────────────────────────────────────────
-- El dueño es intocable: siempre lo puede todo, y nadie —ni él— puede
-- degradarlo. Sin esta regla existe el caso clásico de quedarte fuera de tu
-- propia cuenta sin manera de volver a entrar. El índice lo hace imposible a
-- nivel de base, no solo en la pantalla.
create unique index if not exists memberships_un_solo_dueno
  on memberships (org_id)
  where role = 'owner';

-- ── ¿Puede esta persona? ────────────────────────────────────────────────────
-- Misma lógica que `src/lib/permisos.ts`, para que la base pueda decidir igual
-- que la interfaz. Hoy la usan las pantallas; mañana puede sostener políticas
-- de RLS por rol sin reescribir el criterio en dos idiomas.
create or replace function auth_puede(p_permiso text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $fn$
declare r text; ajustes jsonb; base text[];
begin
  select m.role::text, coalesce(m.permisos, '{}'::jsonb)
    into r, ajustes
    from memberships m
   where m.user_id = auth.uid()
   limit 1;

  if r is null then return false; end if;
  if r = 'owner' then return true; end if;

  -- Lo puesto a mano manda sobre el rol, en los dos sentidos.
  if ajustes ? p_permiso then
    return coalesce((ajustes ->> p_permiso)::boolean, false);
  end if;

  base := case r
    when 'admin'     then array['chatbots','conversaciones','embudo','contactos','resultados','ia','config','equipo','plan','conexiones','envios','borrar']
    when 'agent'     then array['conversaciones','embudo','contactos']
    when 'developer' then array['chatbots','ia','conexiones','resultados']
    else                  array['embudo','contactos','resultados']   -- viewer
  end;

  return p_permiso = any(base);
end $fn$;

-- Igual que el resto de funciones internas: EXECUTE se concede a PUBLIC por
-- defecto y `anon` hereda de PUBLIC, así que revocar solo de `anon` no sirve.
revoke execute on function public.auth_puede(text) from public, anon;
grant  execute on function public.auth_puede(text) to authenticated, service_role;
