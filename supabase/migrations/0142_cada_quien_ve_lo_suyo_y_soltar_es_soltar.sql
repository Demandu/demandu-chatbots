-- ════════════════════════════════════════════════════════════════════════════
-- CADA QUIEN VE LO SUYO, SOLTAR ES SOLTAR, Y LA BANDEJA SE ENTERA AL INSTANTE.
--
-- 3 OCT 2026. Alex, probando con la conversación de Xóchitl en Demandu LLC:
--
--   «Le quito a Xóchitl a Darwin y la dejo "Sin asignar" para probar, y no se
--    le quita: se le vuelve a asignar a Darwin o a Alejandro Molina, solito.»
--
--   «Lo cambio en mi pantalla pero le sigue apareciendo a Darwin. Necesito
--    que cuando se cambie la asignación le desaparezca el chat al agente.»
--
-- Reproducido contra la base (con ROLLBACK): primer «Sin asignar» → Alejandro;
-- segundo → Darwin. No era un fallo: era la 0125 haciendo lo que decía
-- («soltar es devolver a la rueda»). Y Alejandro estaba «no disponible», pero
-- la 0124 daba el chat a CUALQUIERA del equipo cuando no había nadie libre.
--
-- Decidido con Alex, en este orden:
--
--   1. «Sin asignar» deja el chat SIN ASIGNAR. Nadie lo reparte después por su
--      cuenta… hasta que el cliente vuelva a pedir una persona: esa petición
--      nueva sí entra al reparto.
--
--   2. Si no hay nadie disponible, el chat va al DUEÑO de la cuenta (o, si el
--      dueño no está en el equipo, a un administrador), aunque esté marcado
--      «no disponible», para que él lo reparta a mano. Ya NO a cualquiera.
--
--   3. Permiso nuevo «ver_todas» («Ver todas las conversaciones»). Sin él, la
--      persona ve en la Bandeja SOLO los chats asignados a ella — ni los de
--      otros ni los sin asignar. El rol «Atención al cliente» nace SIN él;
--      dueño, administrador, coordinador y solo lectura, CON él. Se puede dar
--      o quitar a una persona concreta en Configuración → Equipo.
--
--      Va en RLS y no solo en la pantalla: esconder no es prohibir. Cubre
--      también la app del iPhone, que lee la misma base.
--
--   4. Tiempo real: `bandeja_pulso`, una fila por conversación que se toca
--      cada vez que la conversación cambia o le entra un mensaje. La Bandeja
--      escucha esa tabla por Supabase Realtime y se recarga al instante.
--
--      ¿POR QUÉ UNA TABLA APARTE Y NO ESCUCHAR `conversations`? Porque Realtime
--      aplica RLS: cuando a Darwin le quitan un chat, la fila nueva ya NO es
--      suya y Realtime NO se lo cuenta — que es justo el aviso que necesita
--      para quitarlo de la lista. El pulso solo lleva el id de la conversación
--      y la cuenta, nada del cliente, así que lo puede oír todo el equipo.
-- ════════════════════════════════════════════════════════════════════════════


-- ─── 1. El permiso nuevo en la tabla espejo de la base ──────────────────────
-- ⚠️ La misma tabla vive en `src/lib/permisos.ts` (POR_ROL). Si cambia una,
-- cambia la otra. `ver_todas`: admin, coordinador y viewer sí; agent y
-- developer no.
create or replace function public.auth_puede(p_permiso text, p_org_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare r text; ajustes jsonb; base text[];
begin
  if p_org_id is null then return false; end if;
  if p_org_id not in (select auth_org_ids()) then return false; end if;

  select m.role::text, coalesce(m.permisos, '{}'::jsonb)
    into r, ajustes
    from memberships m
   where m.user_id = auth.uid()
     and m.org_id = p_org_id
     and (m.soporte_hasta is null or m.soporte_hasta > now())
   order by (m.soporte_hasta is not null) desc,
            m.soporte_hasta desc nulls last,
            m.created_at asc
   limit 1;

  if r is null then return false; end if;
  if r = 'owner' then return true; end if;

  if ajustes ? p_permiso then
    return coalesce((ajustes ->> p_permiso)::boolean, false);
  end if;

  base := case r
    when 'admin'       then array['chatbots','conversaciones','ver_todas','embudo','contactos','resultados','ia','config','equipo','plan','conexiones','envios','borrar']
    when 'coordinador' then array['conversaciones','ver_todas','embudo','contactos','resultados','config','equipo','envios']
    when 'agent'       then array['conversaciones','embudo','contactos']
    when 'developer'   then array['chatbots','ia','conexiones']
    else                    array['embudo','contactos','resultados','ver_todas']
  end;

  return p_permiso = any(base);
end $$;


-- ─── 2. Dos ayudantes para que las políticas no pregunten fila por fila ─────
-- Se usan como `in (select …)`: Postgres las evalúa UNA vez por consulta, no
-- una por conversación. Con `auth_puede(...)` directo en la política, una
-- Bandeja de 2.000 chats haría 2.000 viajes a `memberships`.

-- Las cuentas en las que quien llama ve TODAS las conversaciones.
create or replace function public.auth_orgs_que_ven_todo()
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select o from auth_org_ids() o where auth_puede('ver_todas', o);
$$;

-- Las fichas de equipo de quien llama (una por cuenta en la que está).
create or replace function public.auth_mis_miembros()
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select tm.id from team_members tm
   where tm.user_id = auth.uid()
     and tm.org_id in (select auth_org_ids());
$$;

revoke all on function public.auth_orgs_que_ven_todo() from public, anon;
revoke all on function public.auth_mis_miembros() from public, anon;
grant execute on function public.auth_orgs_que_ven_todo() to authenticated, service_role;
grant execute on function public.auth_mis_miembros() to authenticated, service_role;


-- ─── 3. Quién ve qué conversación ───────────────────────────────────────────
-- Se MODIFICA la política que ya había (`conversations_all`, para todo) en vez
-- de borrarla y crear otras: mismo nombre, mismo alcance, otra regla.
--
--   USING (qué filas puedo leer, cambiar o borrar): las de mis cuentas donde
--     tengo «ver_todas», o las asignadas a mí.
--   WITH CHECK (cómo puede quedar una fila que escribo): solo que sea de mi
--     cuenta. A propósito: pasarle un chat a otro lo deja fuera de mi vista, y
--     eso tiene que estar permitido. (Por PostgREST igual no basta —pide la
--     fila de vuelta y ya no es mía—; por eso pasar chats va por
--     `conversaciones_asignar`, más abajo.)
alter policy conversations_all on public.conversations
  using (
    org_id in (select auth_orgs_que_ven_todo())
    or (org_id in (select auth_org_ids())
        and assignee_member_id in (select auth_mis_miembros()))
  )
  with check (org_id in (select auth_org_ids()));


-- ─── 4. Y sus mensajes ──────────────────────────────────────────────────────
-- Los de las conversaciones que veo. La subconsulta pasa por el RLS de
-- `conversations`, así que la regla vive en un solo sitio.
alter policy messages_all on public.messages
  using (
    org_id in (select auth_orgs_que_ven_todo())
    or (org_id in (select auth_org_ids())
        and conversation_id in (select id from public.conversations))
  )
  with check (org_id in (select auth_org_ids()));


-- ─── 5. Soltar es soltar ────────────────────────────────────────────────────
-- Antes: cualquier UPDATE que dejara la conversación sin responsable la
-- volvía a repartir (0125). Ahora el reparto solo actúa cuando:
--
--   · la conversación NACE pidiendo persona, o
--   · nadie la soltó a mano DESPUÉS de la última petición de persona.
--
-- «La soltó a mano» se lee de lo que ya guarda la 0118: `asignada_por` (quién
-- tocó al responsable por última vez) y `assigned_at` (cuándo). Sin
-- responsable + `asignada_por` puesto = una persona la dejó sin asignar.
-- Si después el cliente vuelve a pedir una persona, `handoff_requested_at`
-- queda más nuevo que `assigned_at` y el reparto vuelve a actuar.
create or replace function public.crm_repartir()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  elegido uuid;
begin
  if new.assignee_member_id is not null then return new; end if;

  -- La acaban de soltar en ESTE update: se queda sin asignar.
  if tg_op = 'UPDATE' and old.assignee_member_id is not null then
    return new;
  end if;

  if not (new.status = 'assigned' or new.handoff_requested_at is not null) then
    return new;
  end if;

  -- La soltó una persona y nadie ha vuelto a pedir atención desde entonces.
  if new.asignada_por is not null
     and (new.handoff_requested_at is null or new.assigned_at >= new.handoff_requested_at) then
    return new;
  end if;

  elegido := elegir_por_etiqueta(new.org_id, new.contact_id);
  if elegido is null then
    elegido := crm_elegir_agente(new.org_id, null::uuid);
  end if;

  if elegido is not null then
    new.assignee_member_id := elegido;
    new.assigned_at := now();
  end if;
  return new;
end $$;

-- La cola de cada 2 minutos tampoco recoge lo que una persona soltó.
create or replace function public.crm_repartir_pendientes()
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare c record; elegido uuid; n integer := 0;
begin
  for c in
    select cv.id, cv.org_id
      from conversations cv
      join assignment_settings s on s.org_id = cv.org_id and s.enabled
     where cv.assignee_member_id is null
       and (cv.status = 'assigned' or cv.handoff_requested_at is not null)
       and not (cv.asignada_por is not null
                and (cv.handoff_requested_at is null or cv.assigned_at >= cv.handoff_requested_at))
       and coalesce(cv.handoff_requested_at, cv.last_message_at, cv.created_at)
             > now() - make_interval(hours => greatest(1, s.espera_horas))
     order by coalesce(cv.handoff_requested_at, cv.created_at) asc
     limit 200
  loop
    elegido := crm_elegir_agente(c.org_id);
    exit when elegido is null;
    update conversations
       set assignee_member_id = elegido, assigned_at = now()
     where id = c.id and assignee_member_id is null;
    n := n + 1;
  end loop;
  return n;
end $$;


-- ─── 6. Si no hay nadie disponible, al dueño (no a cualquiera) ──────────────
-- Igual que antes hasta la lista de candidatos. Lo que cambia es el respaldo:
-- la 0124 daba el chat a quien tuviera menos carga, disponible o no. Ahora va
-- al dueño de la cuenta (o a un administrador si el dueño no tiene ficha en
-- el equipo), que es quien reparte a mano. Las cuentas de SOPORTE no cuentan:
-- el equipo de Demandu no es el administrador del negocio del cliente.
create or replace function public.crm_elegir_agente(p_org uuid, p_excluir uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  s assignment_settings%rowtype;
  elegido uuid;
  u_creado timestamptz;
  u_id uuid;
begin
  -- EL CANDADO — quién llama.
  if auth.uid() is not null and p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select * into s from assignment_settings where org_id = p_org;
  if s.org_id is null or not s.enabled then return null; end if;
  if s.solo_horario and not org_en_horario(p_org) then return null; end if;

  select created_at, id into u_creado, u_id from team_members where id = s.ultimo_member_id;
  u_creado := coalesce(u_creado, '-infinity'::timestamptz);
  u_id := coalesce(u_id, '00000000-0000-0000-0000-000000000000'::uuid);

  with candidatos as (
    select tm.id, tm.created_at,
           (select count(*) from conversations c
             where c.assignee_member_id = tm.id
               and c.status in ('open','pending','assigned')) as abiertas
      from team_members tm
     where tm.org_id = p_org
       and tm.available
       and (p_excluir is null or tm.id <> p_excluir)
       and (s.team_id is null or tm.team_id = s.team_id)
       and (
         not s.solo_en_linea
         or (tm.last_seen_at is not null
             and tm.last_seen_at > now() - make_interval(mins => greatest(1, s.minutos_en_linea)))
       )
  ),
  libres as (
    select * from candidatos
     where s.max_abiertas is null or abiertas < s.max_abiertas
  )
  select id into elegido from libres
   order by
     case when s.strategy = 'menos_carga' then abiertas else 0 end asc,
     case when s.strategy = 'rueda' and (created_at, id) > (u_creado, u_id) then 0 else 1 end asc,
     created_at asc, id asc
   limit 1;

  -- Nadie disponible: el dueño, y si no está en el equipo, un administrador.
  -- Aunque esté «no disponible»: lo recibe para repartirlo, no para atenderlo.
  if elegido is null then
    select tm.id into elegido
      from team_members tm
      join memberships m on m.user_id = tm.user_id and m.org_id = tm.org_id
     where tm.org_id = p_org
       and m.soporte_hasta is null
       and m.role::text in ('owner', 'admin')
     order by (m.role::text = 'owner') desc, m.created_at asc, tm.created_at asc
     limit 1;
  end if;

  if elegido is not null and elegido is distinct from s.ultimo_member_id then
    update assignment_settings set ultimo_member_id = elegido, updated_at = now() where org_id = p_org;
  end if;
  return elegido;
end $$;


-- ─── 7. Pasar chats: la única puerta para cambiar de responsable ────────────
-- Por PostgREST, pasarle MI chat a otro falla: el UPDATE devuelve la fila y la
-- fila ya no es mía («new row violates row-level security policy»). Esta
-- función hace el cambio y devuelve lo que quedó, con TRES candados:
--
--   · quien llama tiene `conversaciones` en la cuenta de ESA conversación;
--   · la conversación es una de las que ve (ver_todas, o es suya);
--   · el nuevo responsable es del equipo de ESA cuenta (o nulo = sin asignar).
--
-- `asignada_por` sale bien solo: `auth.uid()` sigue siendo quien llama dentro
-- de una `security definer`, y el disparador de la 0118 lo apunta.
create or replace function public.conversaciones_asignar(p_ids uuid[], p_member uuid)
returns table (id uuid, assignee_member_id uuid)
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then
    raise exception 'hace falta una sesión';
  end if;
  if p_ids is null or array_length(p_ids, 1) is null then
    return;
  end if;
  if array_length(p_ids, 1) > 500 then
    raise exception 'demasiadas conversaciones a la vez';
  end if;

  return query
  update conversations c
     set assignee_member_id = p_member
   where c.id = any (p_ids)
     and c.org_id in (select auth_org_ids())
     and auth_puede('conversaciones', c.org_id)
     and (c.org_id in (select auth_orgs_que_ven_todo())
          or c.assignee_member_id in (select auth_mis_miembros()))
     and (p_member is null
          or exists (select 1 from team_members tm where tm.id = p_member and tm.org_id = c.org_id))
  returning c.id, c.assignee_member_id;
end $$;

revoke all on function public.conversaciones_asignar(uuid[], uuid) from public, anon;
grant execute on function public.conversaciones_asignar(uuid[], uuid) to authenticated, service_role;


-- ─── 8. El pulso de la Bandeja ──────────────────────────────────────────────
create table if not exists public.bandeja_pulso (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  cambiado_at     timestamptz not null default now()
);
create index if not exists bandeja_pulso_org_idx on public.bandeja_pulso (org_id);

comment on table public.bandeja_pulso is
  'Una fila por conversación; se toca cada vez que la conversación cambia o le '
  'entra un mensaje. La Bandeja la escucha por Realtime para recargarse al '
  'instante. Solo ids: lo puede oír todo el equipo (ver 0142).';

alter table public.bandeja_pulso enable row level security;
create policy bandeja_pulso_ver on public.bandeja_pulso for select
  using (org_id in (select auth_org_ids()));
-- Nadie escribe a mano: solo los disparadores de abajo.

create or replace function public.bandeja_latir()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare v_conv uuid; v_org uuid;
begin
  if tg_table_name = 'messages' then
    v_conv := new.conversation_id;
    v_org  := new.org_id;
  else
    v_conv := new.id;
    v_org  := new.org_id;
  end if;
  if v_conv is null or v_org is null then return null; end if;

  insert into bandeja_pulso (conversation_id, org_id, cambiado_at)
  values (v_conv, v_org, now())
  on conflict (conversation_id) do update set cambiado_at = excluded.cambiado_at, org_id = excluded.org_id;
  return null;

-- El pulso es un aviso, no un dato: si falla, el mensaje o el cambio NO se
-- pueden perder por él. La Bandeja sigue refrescándose cada pocos segundos.
exception when others then
  raise warning '[bandeja_latir] (%): %', sqlstate, sqlerrm;
  return null;
end $$;

revoke all on function public.bandeja_latir() from public, anon, authenticated;

create or replace trigger conversations_latir
  after insert or update on public.conversations
  for each row execute function public.bandeja_latir();

create or replace trigger messages_latir
  after insert on public.messages
  for each row execute function public.bandeja_latir();

-- Realtime solo emite lo que está en esta publicación.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bandeja_pulso'
  ) then
    alter publication supabase_realtime add table public.bandeja_pulso;
  end if;
end $$;
