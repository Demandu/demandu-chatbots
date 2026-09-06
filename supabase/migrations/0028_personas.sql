-- 0028 · Una sola lista de personas
--
-- EL PROBLEMA: hoy hay dos listas que el cliente no puede distinguir.
--
--   · `team_members` — los agentes que reciben chats por reparto. Nombre,
--     correo, teléfono. NO pueden entrar a la plataforma.
--   · `memberships`  — quién puede iniciar sesión, con su rol y sus permisos.
--
-- No están conectadas, así que se puede crear un agente que reciba
-- conversaciones y no pueda entrar a verlas. Para el cliente eso no tiene
-- ninguna lógica: para él son "las personas de mi equipo", y punto.
--
-- LA COLUMNA `team_members.user_id` YA EXISTÍA y estaba sin usar (las dos filas
-- que hay la tienen en null y ningún código la lee). Es exactamente el enganche
-- que hacía falta, así que se aprovecha en vez de inventar otra tabla.

-- ── 1. Que quien ya entra a la plataforma aparezca en la lista ──────────────
-- El dueño tiene `membership` pero no tiene fila de agente, así que hoy no
-- saldría en su propia pantalla de equipo.
--
-- NACEN CON `available = false` A PROPÓSITO: si nacieran disponibles, el
-- reparto automático empezaría a mandarle conversaciones al dueño desde el
-- minuto uno del despliegue, sin que nadie lo haya pedido. Que lo encienda él
-- si lo quiere.
insert into team_members (org_id, user_id, name, email, available)
select m.org_id,
       m.user_id,
       coalesce(
         nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
         nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
         'Sin nombre'
       ),
       u.email,
       false
  from memberships m
  join auth.users u on u.id = m.user_id
 where not exists (
   select 1 from team_members t
    where t.org_id = m.org_id and t.user_id = m.user_id
 );

-- ── 2. Enganchar por correo a los agentes que ya tienen cuenta ─────────────
-- Solo cuando la cuenta pertenece a la MISMA organización: sin esa condición,
-- dos clientes distintos con el mismo correo se enredarían entre sí.
update team_members t
   set user_id = m.user_id
  from memberships m
  join auth.users u on u.id = m.user_id
 where t.user_id is null
   and t.org_id = m.org_id
   and lower(btrim(t.email)) = lower(btrim(u.email));

create unique index if not exists team_members_una_cuenta_por_persona
  on team_members (org_id, user_id)
  where user_id is not null;

-- ── 3. La lista que ve la pantalla ─────────────────────────────────────────
-- Va como función y no como vista porque tiene que leer `auth.users` (los
-- correos no son accesibles desde PostgREST, y hace bien en no serlo) y porque
-- de paso cuenta el trabajo abierto de cada quien: sin ese dato, el aviso al
-- borrar diría "¿seguro?" a secas, que no informa de nada.
create or replace function personas_de_la_org()
returns table (
  id             uuid,
  nombre         text,
  correo         text,
  telefono       text,
  team_id        uuid,
  disponible     boolean,
  tiene_acceso   boolean,
  rol            text,
  permisos       jsonb,
  es_tu_cuenta   boolean,
  es_dueno       boolean,
  conversaciones integer,
  tarjetas       integer,
  tareas         integer
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
  select t.id,
         t.name,
         coalesce(u.email::text, t.email),
         t.phone,
         t.team_id,
         t.available,
         m.id is not null,
         m.role::text,
         coalesce(m.permisos, '{}'::jsonb),
         coalesce(t.user_id = auth.uid(), false),
         coalesce(m.role::text = 'owner', false),
         (select count(*)::int from conversations c
           where c.assignee_member_id = t.id and c.status <> 'closed'),
         (select count(*)::int from opportunities o
           where o.assignee_member_id = t.id and o.closed_at is null),
         (select count(*)::int from tasks k
           where k.assignee_member_id = t.id and k.done_at is null)
    from team_members t
    left join memberships m on m.user_id = t.user_id and m.org_id = t.org_id
    left join auth.users  u on u.id = t.user_id
   where t.org_id in (select auth_org_ids())
   order by (m.role::text = 'owner') desc nulls last, t.name;
$fn$;

-- ── 4. Cambiar el rol y los permisos de alguien ────────────────────────────
create or replace function persona_guardar_acceso(
  p_persona  uuid,
  p_rol      text,
  p_permisos jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_user uuid; v_org uuid; v_rol text;
begin
  if not auth_puede('equipo') then
    raise exception 'No tienes permiso para cambiar el equipo.';
  end if;

  select t.user_id, t.org_id into v_user, v_org
    from team_members t
   where t.id = p_persona and t.org_id in (select auth_org_ids());

  if v_org is null then
    raise exception 'Esa persona no está en tu organización.';
  end if;
  if v_user is null then
    raise exception 'Esa persona todavía no tiene cuenta. Invítala primero.';
  end if;

  select m.role::text into v_rol from memberships m
   where m.user_id = v_user and m.org_id = v_org;

  -- EL DUEÑO ES INTOCABLE: siempre lo puede todo y nadie —ni él mismo— puede
  -- degradarlo. Sin esta regla existe el caso clásico de quedarse fuera de la
  -- propia cuenta sin manera de volver a entrar.
  if v_rol = 'owner' then
    raise exception 'Al dueño no se le pueden cambiar los permisos.';
  end if;
  if p_rol = 'owner' then
    raise exception 'Solo puede haber un dueño.';
  end if;

  -- NADIE SE EDITA A SÍ MISMO: un administrador podría quitarse el permiso de
  -- equipo y quedarse sin forma de devolvérselo.
  if v_user = auth.uid() then
    raise exception 'No puedes cambiar tus propios permisos. Pídeselo a otra persona del equipo.';
  end if;

  update memberships
     set role = p_rol::member_role,
         permisos = coalesce(p_permisos, '{}'::jsonb)
   where user_id = v_user and org_id = v_org;
end $fn$;

-- ── 5. Quitar a una persona ────────────────────────────────────────────────
-- Sus conversaciones, tarjetas y tareas NO se borran: las claves foráneas son
-- `on delete set null`, así que sobreviven y quedan sin asignar. La pantalla
-- avisa antes de cuántas son.
create or replace function persona_borrar(p_persona uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_user uuid; v_org uuid; v_rol text;
begin
  if not auth_puede('equipo') then
    raise exception 'No tienes permiso para cambiar el equipo.';
  end if;

  select t.user_id, t.org_id into v_user, v_org
    from team_members t
   where t.id = p_persona and t.org_id in (select auth_org_ids());

  if v_org is null then
    raise exception 'Esa persona no está en tu organización.';
  end if;

  select m.role::text into v_rol from memberships m
   where m.user_id = v_user and m.org_id = v_org;

  if v_rol = 'owner' then
    raise exception 'No puedes quitar al dueño de la cuenta.';
  end if;
  if v_user is not null and v_user = auth.uid() then
    raise exception 'No puedes quitarte a ti mismo.';
  end if;

  -- Primero el acceso, después la persona: si fallara a la mitad, es mejor
  -- que quede alguien sin poder entrar que alguien borrado que sí puede.
  if v_user is not null then
    delete from memberships where user_id = v_user and org_id = v_org;
  end if;
  delete from team_members where id = p_persona;
end $fn$;

-- EXECUTE se concede a PUBLIC por defecto y `anon` hereda de PUBLIC, así que
-- revocar solo de `anon` no sirve. Ha pasado tres veces.
revoke execute on function public.personas_de_la_org()                        from public, anon;
revoke execute on function public.persona_guardar_acceso(uuid, text, jsonb)   from public, anon;
revoke execute on function public.persona_borrar(uuid)                        from public, anon;
grant  execute on function public.personas_de_la_org()                        to authenticated, service_role;
grant  execute on function public.persona_guardar_acceso(uuid, text, jsonb)   to authenticated, service_role;
grant  execute on function public.persona_borrar(uuid)                        to authenticated, service_role;
