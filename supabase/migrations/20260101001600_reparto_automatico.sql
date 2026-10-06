-- ===========================================================================
-- 0016 — Reparto automático de conversaciones
--
-- Es lo que respond.io hace mejor que nadie y lo que Kommo directamente no
-- tiene (su "round robin" es un paso del bot que rota acciones, no un reparto
-- real). Lo que hace que funcione en la vida diaria no es la rotación: son los
-- tres modificadores de alrededor.
--
--   1. SOLO A QUIEN ESTÁ EN LÍNEA. Sin esto, el chat cae en el buzón del que
--      se fue a comer y el cliente espera una hora.
--   2. AL QUE MENOS CARGA TIENE, no "al que le toca". La rotación pura le
--      sigue mandando chats al que ya trae quince abiertos.
--   3. TOPE POR PERSONA Y COLA. Si nadie cumple, la conversación espera en vez
--      de asignarse mal, y se reintenta sola.
--
-- Va en la BASE y no en los motores: así vale igual para WhatsApp, el widget
-- web y cualquier canal que venga después, sin duplicar la regla en cada uno.
-- ===========================================================================

-- ── 1. Quién puede atender ─────────────────────────────────────────────────
alter table team_members
  add column if not exists user_id      uuid references auth.users(id) on delete set null,
  -- Lo prende y apaga la persona: "estoy disponible" / "ahorita no".
  add column if not exists available    boolean not null default true,
  -- Lo actualiza la aplicación sola mientras el agente la tiene abierta.
  add column if not exists last_seen_at timestamptz;

create index if not exists team_members_disponibles_idx
  on team_members (org_id, available, last_seen_at desc);

-- Enlazar por correo a los miembros que ya existían.
update team_members tm
   set user_id = u.id
  from auth.users u
 where tm.user_id is null
   and tm.email is not null
   and lower(u.email) = lower(tm.email);

-- ── 2. Marca de tiempo de la asignación ────────────────────────────────────
-- Permite medir después "cuánto tardamos en asignar", que es distinto de
-- "cuánto tardó el agente en contestar". Separarlas es lo que deja gestionar
-- a un equipo: no es lo mismo un equipo lento que un chat que estuvo cuarenta
-- minutos sin dueño.
alter table conversations
  add column if not exists assigned_at timestamptz;

-- ── 3. Las reglas, por cliente ─────────────────────────────────────────────
create table if not exists assignment_settings (
  org_id          uuid primary key references organizations(id) on delete cascade,
  enabled         boolean not null default false,
  -- 'menos_carga' = al que menos conversaciones abiertas tenga (recomendado)
  -- 'rueda'       = por turnos, en orden
  strategy        text not null default 'menos_carga' check (strategy in ('rueda','menos_carga')),
  solo_en_linea   boolean not null default true,
  minutos_en_linea integer not null default 5,
  -- null = sin tope
  max_abiertas    integer,
  -- null = todo el equipo; si se indica, solo ese equipo atiende
  team_id         uuid references teams(id) on delete set null,
  solo_horario    boolean not null default false,
  -- Cuánto tiempo se queda esperando en la cola antes de rendirse.
  espera_horas    integer not null default 24,
  -- Memoria de la rueda: a quién le tocó la última vez.
  ultimo_member_id uuid references team_members(id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table assignment_settings enable row level security;
drop policy if exists assignment_settings_all on assignment_settings;
create policy assignment_settings_all on assignment_settings for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 4. ¿Estamos en horario? ────────────────────────────────────────────────
create or replace function org_en_horario(p_org uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  tz text; horario jsonb; dia text; ahora time; abre time; cierra time; d jsonb;
begin
  -- Es SECURITY DEFINER y recibe un org_id: sin este candado cualquiera con
  -- sesión podría preguntar el horario de otro cliente. El reparto la llama
  -- desde dentro de la base (donde auth.uid() es null), por eso ese caso pasa.
  if auth.uid() is not null and p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select coalesce(timezone, 'America/Mexico_City'), business_hours
    into tz, horario from organizations where id = p_org;
  if horario is null then return true; end if;

  -- El día y la hora, en la zona del cliente (no en la del servidor).
  dia := lower(to_char(now() at time zone tz, 'dy'));
  ahora := (now() at time zone tz)::time;
  d := horario -> dia;

  if d is null or coalesce((d->>'enabled')::boolean, false) = false then return false; end if;

  abre := coalesce(nullif(d->>'open', ''), '00:00')::time;
  cierra := coalesce(nullif(d->>'close', ''), '23:59')::time;

  -- Turno que cruza la medianoche (20:00 a 02:00), que es donde todos fallan.
  if cierra <= abre then
    return ahora >= abre or ahora < cierra;
  end if;
  return ahora >= abre and ahora < cierra;
end $$;

-- ── 5. A quién le toca ─────────────────────────────────────────────────────
create or replace function crm_elegir_agente(p_org uuid)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  s assignment_settings%rowtype;
  elegido uuid;
  u_creado timestamptz;
  u_id uuid;
begin
  select * into s from assignment_settings where org_id = p_org;
  if s.org_id is null or not s.enabled then return null; end if;
  if s.solo_horario and not org_en_horario(p_org) then return null; end if;

  -- Dónde se quedó la rueda la última vez.
  --
  -- OJO con el desempate por id: la primera versión ordenaba solo por
  -- created_at, y si dos personas se dan de alta en la misma operación — que
  -- es justo lo que pasa al cargar el equipo de un cliente nuevo — sus fechas
  -- quedan idénticas, nadie es "posterior" a nadie y la rueda le daba SIEMPRE
  -- el chat a la misma persona. Con el id el orden es total pase lo que pase.
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
     -- Menos carga: manda el número de conversaciones abiertas.
     case when s.strategy = 'menos_carga' then abiertas else 0 end asc,
     -- Rueda: primero los que van DESPUÉS del último al que le tocó.
     case when s.strategy = 'rueda' and (created_at, id) > (u_creado, u_id) then 0 else 1 end asc,
     created_at asc, id asc
   limit 1;

  if elegido is not null then
    update assignment_settings set ultimo_member_id = elegido, updated_at = now() where org_id = p_org;
  end if;
  return elegido;
end $$;

-- ── 6. Repartir en cuanto haga falta una persona ───────────────────────────
-- Se dispara cuando la conversación pide humano (el lead escribió el atajo, o
-- el flujo llegó a un bloque "Transferir a tu equipo") y todavía no tiene
-- dueño. Es BEFORE: se escribe el responsable en la misma operación, sin un
-- segundo UPDATE que volvería a disparar el trigger.
create or replace function crm_repartir()
returns trigger language plpgsql security definer set search_path = public as $$
declare elegido uuid;
begin
  if new.assignee_member_id is not null then return new; end if;
  if not (new.status = 'assigned' or new.handoff_requested_at is not null) then return new; end if;

  elegido := crm_elegir_agente(new.org_id);
  if elegido is not null then
    new.assignee_member_id := elegido;
    new.assigned_at := now();
  end if;
  -- Si nadie cumple, se queda sin dueño a propósito: mejor en la cola que
  -- asignada a alguien que no la va a ver. El reintento la recoge.
  return new;
end $$;

drop trigger if exists conversations_reparto on conversations;
create trigger conversations_reparto before insert or update on conversations
  for each row execute function crm_repartir();

-- ── 7. La cola: reintentar las que se quedaron sin nadie ───────────────────
create or replace function crm_repartir_pendientes()
returns integer language plpgsql volatile security definer set search_path = public as $$
declare c record; elegido uuid; n integer := 0;
begin
  for c in
    select cv.id, cv.org_id
      from conversations cv
      join assignment_settings s on s.org_id = cv.org_id and s.enabled
     where cv.assignee_member_id is null
       and (cv.status = 'assigned' or cv.handoff_requested_at is not null)
       -- Pasado el tiempo de espera se deja de intentar: sigue visible en la
       -- Bandeja para que alguien la tome a mano.
       and coalesce(cv.handoff_requested_at, cv.last_message_at, cv.created_at)
             > now() - make_interval(hours => greatest(1, s.espera_horas))
     order by coalesce(cv.handoff_requested_at, cv.created_at) asc
     limit 200
  loop
    elegido := crm_elegir_agente(c.org_id);
    exit when elegido is null;   -- no hay nadie: se reintenta en el siguiente ciclo
    update conversations
       set assignee_member_id = elegido, assigned_at = now()
     where id = c.id and assignee_member_id is null;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Cada 2 minutos: es el tiempo que un cliente tolera esperando a que alguien
-- lo tome. Más seguido no aporta; menos se nota.
select cron.schedule('demandu-reparto', '*/2 * * * *', 'select public.crm_repartir_pendientes()')
 where not exists (select 1 from cron.job where jobname = 'demandu-reparto');

-- ── 8. Nada de esto es una RPC ─────────────────────────────────────────────
-- Postgres da EXECUTE a PUBLIC por defecto y `anon` hereda de PUBLIC: quitarlo
-- solo a `anon` no sirve de nada. Es la trampa que ya nos mordió tres veces.
revoke execute on function public.crm_repartir()             from public, anon, authenticated;
revoke execute on function public.crm_elegir_agente(uuid)    from public, anon, authenticated;
revoke execute on function public.crm_repartir_pendientes()  from public, anon, authenticated;
revoke execute on function public.org_en_horario(uuid)       from public, anon;
grant  execute on function public.org_en_horario(uuid)       to authenticated, service_role;

-- ── 9. Presencia: "sigo aquí" ──────────────────────────────────────────────
-- La aplicación la llama sola mientras el agente la tiene abierta. Solo puede
-- tocar SU propio renglón: no hay forma de marcar en línea a un compañero.
create or replace function crm_sigo_aqui(p_disponible boolean default null)
returns void language plpgsql volatile security definer set search_path = public as $$
begin
  update team_members
     set last_seen_at = now(),
         available = coalesce(p_disponible, available)
   where user_id = auth.uid();
end $$;

revoke execute on function public.crm_sigo_aqui(boolean) from public, anon;
grant  execute on function public.crm_sigo_aqui(boolean) to authenticated;
