-- 0027 · Ver y cambiar quién puede qué
--
-- La 0024 dejó los permisos guardados y la función `auth_puede`. Faltaba lo
-- obvio: una pantalla donde el dueño los toque. Y para eso hacen falta dos
-- cosas que NO se pueden hacer desde el cliente.
--
-- 1) LEER EL CORREO DE CADA PERSONA. `memberships` solo guarda un `user_id`;
--    los correos viven en `auth.users`, que no es accesible desde PostgREST
--    (y hace bien en no serlo). Sin correo, la pantalla mostraría una lista de
--    identificadores y nadie sabría a quién le está quitando permisos.
--
-- 2) CAMBIAR ROL Y PERMISOS CON RESGUARDOS. Si esto fuera un `update` normal,
--    cualquiera con sesión podría ascenderse a administrador editando la
--    petición. Las reglas tienen que vivir aquí, donde no se pueden saltar.

-- ── Quién está en mi organización ───────────────────────────────────────────
create or replace function equipo_de_la_org()
returns table (
  id           uuid,
  user_id      uuid,
  correo       text,
  rol          text,
  permisos     jsonb,
  es_tu_cuenta boolean
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select m.id,
         m.user_id,
         u.email::text,
         m.role::text,
         coalesce(m.permisos, '{}'::jsonb),
         m.user_id = auth.uid()
    from memberships m
    join auth.users u on u.id = m.user_id
   where m.org_id in (select auth_org_ids())
     and auth_puede('equipo')          -- sin este permiso, la lista sale vacía
   order by (m.role = 'owner') desc, u.email;
$fn$;

-- ── Cambiar el rol y los permisos de alguien ────────────────────────────────
create or replace function equipo_actualizar(
  p_membresia uuid,
  p_rol       text,
  p_permisos  jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_org  uuid;
  v_rol  text;
  v_yo   uuid;
begin
  if not auth_puede('equipo') then
    raise exception 'No tienes permiso para cambiar el equipo.';
  end if;

  select m.org_id, m.role::text, m.user_id
    into v_org, v_rol, v_yo
    from memberships m
   where m.id = p_membresia
     and m.org_id in (select auth_org_ids());

  if v_org is null then
    raise exception 'Esa persona no está en tu organización.';
  end if;

  -- EL DUEÑO ES INTOCABLE. Es la regla que evita el caso clásico de quedarse
  -- fuera de tu propia cuenta sin manera de volver a entrar.
  if v_rol = 'owner' then
    raise exception 'Al dueño no se le pueden cambiar los permisos.';
  end if;

  -- Y no se fabrica un segundo dueño por la puerta de atrás. El índice único
  -- de la 0024 también lo impediría, pero un error de índice no le dice nada
  -- a quien está mirando la pantalla.
  if p_rol = 'owner' then
    raise exception 'Solo puede haber un dueño.';
  end if;

  -- NADIE SE EDITA A SÍ MISMO. Un administrador podría quitarse el permiso de
  -- equipo y quedarse sin forma de devolvérselo. Que lo haga otra persona.
  if v_yo = auth.uid() then
    raise exception 'No puedes cambiar tus propios permisos. Pídeselo a otra persona del equipo.';
  end if;

  update memberships
     set role     = p_rol::member_role,
         permisos = coalesce(p_permisos, '{}'::jsonb)
   where id = p_membresia;
end $fn$;

-- EXECUTE se concede a PUBLIC por defecto y `anon` hereda de PUBLIC, así que
-- revocar solo de `anon` no sirve. Ha pasado tres veces.
revoke execute on function public.equipo_de_la_org()                    from public, anon;
revoke execute on function public.equipo_actualizar(uuid, text, jsonb)  from public, anon;
grant  execute on function public.equipo_de_la_org()                    to authenticated, service_role;
grant  execute on function public.equipo_actualizar(uuid, text, jsonb)  to authenticated, service_role;
