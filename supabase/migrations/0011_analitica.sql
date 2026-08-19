-- ===========================================================================
-- 0011 — Lo que hace falta para medir de verdad
--
-- Dos cosas que hoy NO se pueden calcular y que sin esto habría que inventar:
--
--   1. "¿Qué flujo funciona mejor?"  Hasta ahora solo guardábamos en qué flujo
--      va la conversación AHORA (conversations.flow_state), y se sobrescribe
--      con cada mensaje. No quedaba rastro de por dónde pasó ni si terminó.
--      → tabla flow_runs: un renglón por cada vez que un lead entra a un flujo.
--
--   2. "¿Qué efectividad de cierre tenemos?"  Los estados los inventa cada
--      cliente ("Cotizando", "En proceso"…). Ninguno decía si es un cierre
--      ganado o perdido, así que la plataforma no podía contarlo.
--      → columna outcome en conversation_states, que el cliente elige.
--
-- Todo es aditivo: nada de lo que ya existe cambia de forma.
-- ===========================================================================

-- ── 1. Recorridos de flujo ──────────────────────────────────────────────────
create table if not exists flow_runs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  bot_id          uuid references bots(id) on delete set null,
  flow_id         uuid references flows(id) on delete set null,
  -- Se guarda el nombre además del id: si el cliente borra el flujo, el
  -- histórico no se queda con un renglón anónimo.
  flow_name       text,
  channel         text,
  started_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  ended_at        timestamptz,
  -- completado  → llegó a un bloque "Cerrar el flujo"
  -- agente      → pidió (o el flujo lo mandó a) una persona
  -- reiniciado  → el lead escribió el atajo de reinicio
  -- cambio      → un disparador lo movió a otro flujo
  ended_reason    text check (ended_reason in ('completado','agente','reiniciado','cambio')),
  steps           integer not null default 0,
  last_node_id    text
);

comment on table flow_runs is
  'Un renglón por cada vez que un lead entra a un flujo. Alimenta "qué flujo es más efectivo". '
  'Un recorrido sin ended_at y sin actividad reciente se cuenta como abandonado.';

create index if not exists flow_runs_org_started_idx  on flow_runs (org_id, started_at desc);
create index if not exists flow_runs_flow_idx         on flow_runs (flow_id);
create index if not exists flow_runs_conversation_idx on flow_runs (conversation_id);
create index if not exists flow_runs_abiertos_idx     on flow_runs (org_id, updated_at desc) where ended_at is null;

alter table flow_runs enable row level security;

drop policy if exists flow_runs_all on flow_runs;
create policy flow_runs_all on flow_runs for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 2. Qué estado cuenta como cierre ────────────────────────────────────────
alter table conversation_states
  add column if not exists outcome text not null default 'abierto';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversation_states_outcome_check'
  ) then
    alter table conversation_states
      add constraint conversation_states_outcome_check
      check (outcome in ('abierto','ganado','perdido'));
  end if;
end $$;

comment on column conversation_states.outcome is
  'Lo elige el cliente: si una conversación en este estado cuenta como venta ganada, perdida, o sigue abierta.';

-- Los estados que ya existen y se llaman "Ganada"/"Perdida" se marcan solos,
-- para que el cliente no tenga que configurar nada antes de ver su primer dato.
update conversation_states set outcome = 'ganado'
 where outcome = 'abierto' and lower(name) in ('ganada','ganado','cerrada ganada','venta');
update conversation_states set outcome = 'perdido'
 where outcome = 'abierto' and lower(name) in ('perdida','perdido','cerrada perdida','descartado','descartada');

-- Y las cuentas nuevas nacen con los dos lados del embudo.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into organizations (name, slug)
    values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Mi negocio'),
            'org-' || replace(new.id::text, '-', ''))
    returning id into new_org;
  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  insert into conversation_states (org_id, name, color, is_default, sort, outcome) values
    (new_org, 'Abierta','#3A85FF',true,1,'abierto'),
    (new_org, 'Pendiente','#FFC857',true,2,'abierto'),
    (new_org, 'En proceso','#6E42FF',true,3,'abierto'),
    (new_org, 'En atención','#FF6FB0',true,4,'abierto'),
    (new_org, 'Cerrada','#6E70A0',true,5,'abierto'),
    (new_org, 'Ganada','#3DDC97',true,6,'ganado'),
    (new_org, 'Perdida','#FF6B6B',true,7,'perdido');
  return new;
end; $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
