-- ============================================================================
-- 0007 · Integraciones externas por organización (Google Calendar, etc.)
-- Guarda los tokens OAuth del proveedor. El nodo Agendar cita los usa para
-- crear eventos y revisar disponibilidad. RLS aísla por organización.
-- ============================================================================

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  provider text not null,          -- 'google_calendar'
  account_email text,
  access_token text,
  refresh_token text,
  token_expiry timestamptz,
  scope text,
  data jsonb not null default '{}', -- ej. lista de calendarios
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

alter table integrations enable row level security;

drop policy if exists integrations_all on integrations;
create policy integrations_all on integrations for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

grant all on integrations to authenticated;
