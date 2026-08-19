-- ===========================================================================
-- 0013 — CRM: embudo de oportunidades y tareas
--
-- DECISIÓN DE MODELADO (la más cara de deshacer, así que va explicada):
--
--   Contacto ──< Conversación   → vive horas. Es la COLA DE TRABAJO del agente.
--       └──────< Oportunidad    → vive semanas. Es el EMBUDO del dueño.
--
-- Kommo funde las dos: cada mensaje entrante crea un lead, y el embudo se
-- llena de "¿tienen estacionamiento?" y de duplicados. respond.io las separa
-- pero renuncia al embudo y te manda a tu CRM de verdad — que la pyme no
-- tiene. Aquí se separan y se enganchan solas, con dos reglas:
--
--   1. Si el contacto YA tiene una oportunidad abierta, la conversación se
--      cuelga de esa. No se crea otra.
--   2. Solo nace una oportunidad nueva si la anterior ya está cerrada. Así el
--      cliente que vuelve a los tres meses genera tarjeta nueva (correcto) y
--      el que escribe cinco veces esta semana genera una sola.
--
--   3. Cerrar la conversación NO cierra la oportunidad. El agente cierra el
--      chat cuando terminó de atender; el dueño cierra la venta cuando cobró.
--
-- SOBRE LAS ETAPAS: se reutiliza `conversation_states`, que ya era un embudo
-- disfrazado (el cliente ya inventaba ahí "Cotizando", "Cerrada"…) y desde la
-- 0011 ya trae `outcome` = abierto/ganado/perdido. Solo se le cuelga un
-- `pipeline_id`. No se renombra la tabla a propósito: la usan la Bandeja, los
-- catálogos y la analítica, y romper eso no aporta nada. En la interfaz se
-- llaman "Etapas del embudo".
--
-- Todo es aditivo. Nada de lo que ya existe cambia de forma.
-- ===========================================================================

-- ── 1. Embudos ─────────────────────────────────────────────────────────────
create table if not exists pipelines (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  is_default  boolean not null default false,
  sort        integer not null default 0,
  -- Interruptor deliberado: en HubSpot hay gente que terminó APAGANDO la
  -- creación automática porque el tablero se les llenó de ruido. Que el
  -- cliente pueda decidirlo en vez de sufrirlo.
  auto_create boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists pipelines_org_idx on pipelines (org_id, sort);
alter table pipelines enable row level security;
drop policy if exists pipelines_all on pipelines;
create policy pipelines_all on pipelines for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- Las etapas viven en conversation_states (ver nota de arriba).
alter table conversation_states
  add column if not exists pipeline_id uuid references pipelines(id) on delete cascade;
create index if not exists conversation_states_pipeline_idx on conversation_states (pipeline_id, sort);

-- ── 2. Oportunidades ───────────────────────────────────────────────────────
create table if not exists opportunities (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  contact_id         uuid references contacts(id) on delete cascade,
  pipeline_id        uuid not null references pipelines(id) on delete cascade,
  stage_id           uuid references conversation_states(id) on delete set null,
  title              text not null default 'Nuevo prospecto',
  value              numeric(14,2),
  currency           text not null default 'MXN',
  assignee_member_id uuid references team_members(id) on delete set null,
  -- Se DERIVA de la etapa (ver trigger). No se escribe a mano.
  status             text not null default 'abierta' check (status in ('abierta','ganada','perdida')),
  lost_reason        text,
  source             text,
  bot_id             uuid references bots(id) on delete set null,
  channel            text,
  -- Orden manual dentro de la columna. Es double precision para poder soltar
  -- una tarjeta ENTRE otras dos sin renumerar toda la columna.
  sort               double precision not null default extract(epoch from now()),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  closed_at          timestamptz
);
create index if not exists opportunities_org_idx      on opportunities (org_id, created_at desc);
create index if not exists opportunities_tablero_idx  on opportunities (pipeline_id, stage_id, sort);
create index if not exists opportunities_contact_idx  on opportunities (contact_id);
create index if not exists opportunities_abiertas_idx on opportunities (org_id, contact_id) where status = 'abierta';
alter table opportunities enable row level security;
drop policy if exists opportunities_all on opportunities;
create policy opportunities_all on opportunities for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- Historial: para saber cuánto tarda una venta en cada etapa y quién la movió.
create table if not exists opportunity_events (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  opportunity_id uuid not null references opportunities(id) on delete cascade,
  kind           text not null,
  from_stage_id  uuid,
  to_stage_id    uuid,
  member_id      uuid,
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists opportunity_events_op_idx on opportunity_events (opportunity_id, created_at);
alter table opportunity_events enable row level security;
drop policy if exists opportunity_events_all on opportunity_events;
create policy opportunity_events_all on opportunity_events for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 3. Tareas ──────────────────────────────────────────────────────────────
-- El miedo real del vendedor no es olvidar una tarea vencida: es que un lead
-- se quede SIN próximo paso y nadie se entere. Por eso lo importante de esta
-- tabla no es lo que tiene, sino la consulta de las tarjetas que NO tienen
-- ningún renglón aquí (ver crm_board).
create table if not exists tasks (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  opportunity_id     uuid references opportunities(id) on delete cascade,
  contact_id         uuid references contacts(id) on delete cascade,
  conversation_id    uuid references conversations(id) on delete set null,
  title              text not null,
  notes              text,
  kind               text not null default 'seguimiento',
  due_at             timestamptz,
  done_at            timestamptz,
  assignee_member_id uuid references team_members(id) on delete set null,
  created_by         uuid,
  created_at         timestamptz not null default now()
);
create index if not exists tasks_org_pend_idx on tasks (org_id, due_at) where done_at is null;
create index if not exists tasks_op_idx       on tasks (opportunity_id) where done_at is null;
alter table tasks enable row level security;
drop policy if exists tasks_all on tasks;
create policy tasks_all on tasks for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 4. La conversación apunta a su oportunidad ─────────────────────────────
alter table conversations
  add column if not exists opportunity_id uuid references opportunities(id) on delete set null;
create index if not exists conversations_opportunity_idx on conversations (opportunity_id);

-- ── 5. El estado se DERIVA de la etapa, nunca se escribe a mano ────────────
create or replace function crm_estado_desde_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_kind text;
begin
  if tg_op = 'INSERT' or new.stage_id is distinct from old.stage_id then
    select outcome into v_kind from conversation_states where id = new.stage_id;
    new.status := case coalesce(v_kind, 'abierto')
                    when 'ganado'  then 'ganada'
                    when 'perdido' then 'perdida'
                    else 'abierta'
                  end;
    if new.status = 'abierta' then
      new.closed_at := null;                       -- se reabrió
    elsif tg_op = 'INSERT' or old.status = 'abierta' then
      new.closed_at := now();                      -- se cerró justo ahora
    end if;                                        -- de ganada a perdida: se respeta la fecha original
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists opportunities_estado on opportunities;
create trigger opportunities_estado before insert or update on opportunities
  for each row execute function crm_estado_desde_etapa();

-- Historial (va después del insert: antes no existe el id).
create or replace function crm_registrar_evento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into opportunity_events (org_id, opportunity_id, kind, to_stage_id, meta)
      values (new.org_id, new.id, 'creada', new.stage_id, jsonb_build_object('origen', new.source));
  elsif new.stage_id is distinct from old.stage_id then
    insert into opportunity_events (org_id, opportunity_id, kind, from_stage_id, to_stage_id, meta)
      values (new.org_id, new.id, 'cambio_etapa', old.stage_id, new.stage_id,
              jsonb_build_object('status', new.status));
  elsif new.assignee_member_id is distinct from old.assignee_member_id then
    insert into opportunity_events (org_id, opportunity_id, kind, member_id)
      values (new.org_id, new.id, 'asignada', new.assignee_member_id);
  end if;
  return null;
end $$;

drop trigger if exists opportunities_evento on opportunities;
create trigger opportunities_evento after insert or update on opportunities
  for each row execute function crm_registrar_evento();

-- ── 6. Enganchar cada conversación nueva a su oportunidad ──────────────────
-- Va en la base y no en los motores a propósito: así funciona igual para
-- WhatsApp, el widget web y cualquier canal que venga después, sin duplicar
-- la regla en cada uno.
create or replace function crm_enganchar_conversacion()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pipe uuid; v_auto boolean; v_stage uuid; v_op uuid; v_titulo text;
begin
  if new.contact_id is null or new.opportunity_id is not null then return new; end if;

  select id, auto_create into v_pipe, v_auto
    from pipelines where org_id = new.org_id and is_default order by sort limit 1;
  if v_pipe is null or not coalesce(v_auto, true) then return new; end if;

  -- Regla 1: si ya hay una abierta, se cuelga de esa.
  select id into v_op from opportunities
   where org_id = new.org_id and contact_id = new.contact_id
     and pipeline_id = v_pipe and status = 'abierta'
   order by created_at desc limit 1;

  -- Regla 2: solo nace una nueva si la anterior ya se cerró.
  if v_op is null then
    select id into v_stage from conversation_states
     where org_id = new.org_id and pipeline_id = v_pipe and outcome = 'abierto'
     order by sort limit 1;

    select nullif(trim(coalesce(c.name, c.wa_name, c.phone, '')), '')
      into v_titulo from contacts c where c.id = new.contact_id;

    insert into opportunities (org_id, contact_id, pipeline_id, stage_id, title, bot_id, channel, source)
      values (new.org_id, new.contact_id, v_pipe, v_stage,
              coalesce(v_titulo, 'Nuevo prospecto'), new.bot_id, new.channel::text, 'conversacion')
      returning id into v_op;
  end if;

  new.opportunity_id := v_op;
  return new;
end $$;

drop trigger if exists conversations_crm on conversations;
create trigger conversations_crm before insert on conversations
  for each row execute function crm_enganchar_conversacion();

-- ── 7. Estrenar el embudo con lo que cada cliente ya tenía ─────────────────
do $$
declare o record; v_pipe uuid; n int;
begin
  for o in select id from organizations loop
    -- Un embudo por cliente, si no tiene ninguno.
    select id into v_pipe from pipelines where org_id = o.id and is_default limit 1;
    if v_pipe is null then
      insert into pipelines (org_id, name, is_default, sort)
        values (o.id, 'Ventas', true, 0) returning id into v_pipe;
    end if;

    -- Sus estados de siempre pasan a ser las etapas de ese embudo.
    update conversation_states set pipeline_id = v_pipe
      where org_id = o.id and pipeline_id is null;

    -- Cliente sin estados: se le arma un embudo básico.
    select count(*) into n from conversation_states where org_id = o.id and pipeline_id = v_pipe;
    if n = 0 then
      insert into conversation_states (org_id, pipeline_id, name, color, is_default, sort, outcome) values
        (o.id, v_pipe, 'Nuevo',     '#3A85FF', true, 1, 'abierto'),
        (o.id, v_pipe, 'Contactado','#6E42FF', true, 2, 'abierto'),
        (o.id, v_pipe, 'Cotizando', '#FFC857', true, 3, 'abierto'),
        (o.id, v_pipe, 'Ganada',    '#3DDC97', true, 4, 'ganado'),
        (o.id, v_pipe, 'Perdida',   '#FF6B6B', true, 5, 'perdido');
    end if;
  end loop;
end $$;

-- Y una tarjeta por cada contacto que ya venía conversando, para que el
-- tablero no aparezca vacío el primer día.
do $$
declare c record; v_pipe uuid; v_stage uuid;
begin
  for c in
    select distinct on (cv.org_id, cv.contact_id)
           cv.org_id, cv.contact_id, cv.bot_id, cv.channel::text as canal, cv.state_id, cv.assignee_member_id
      from conversations cv
     where cv.contact_id is not null and cv.opportunity_id is null
     order by cv.org_id, cv.contact_id, cv.last_message_at desc nulls last
  loop
    select id into v_pipe from pipelines where org_id = c.org_id and is_default limit 1;
    continue when v_pipe is null;

    -- La etapa que ya tenía la conversación; si no tenía, la primera abierta.
    v_stage := c.state_id;
    if v_stage is null then
      select id into v_stage from conversation_states
       where org_id = c.org_id and pipeline_id = v_pipe and outcome = 'abierto'
       order by sort limit 1;
    end if;

    with nueva as (
      insert into opportunities (org_id, contact_id, pipeline_id, stage_id, title,
                                 bot_id, channel, assignee_member_id, source)
      select c.org_id, c.contact_id, v_pipe, v_stage,
             coalesce(nullif(trim(coalesce(ct.name, ct.wa_name, ct.phone, '')), ''), 'Prospecto'),
             c.bot_id, c.canal, c.assignee_member_id, 'historico'
        from contacts ct where ct.id = c.contact_id
      returning id
    )
    update conversations set opportunity_id = (select id from nueva)
     where org_id = c.org_id and contact_id = c.contact_id and opportunity_id is null;
  end loop;
end $$;

-- ── 8. Los disparadores NO son RPC ─────────────────────────────────────────
-- Postgres le da EXECUTE a PUBLIC por defecto y `anon` hereda de PUBLIC, así
-- que quitárselo solo a `anon` no sirve de nada: hay que revocar a public
-- primero. Es la misma trampa que ya nos mordió con las funciones de
-- seguimientos y con is_platform_admin.
revoke execute on function public.crm_enganchar_conversacion() from public, anon, authenticated;
revoke execute on function public.crm_estado_desde_etapa()     from public, anon, authenticated;
revoke execute on function public.crm_registrar_evento()       from public, anon, authenticated;
