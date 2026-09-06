-- ============================================================================
-- 0010 · Canal de WhatsApp Cloud API por organización
-- El webhook (no autenticado) lee esta tabla con la service_role key.
-- El panel la administra con RLS por organización.
-- ============================================================================

create table if not exists whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  bot_id uuid references bots(id) on delete set null,
  phone_number_id text not null unique,
  waba_id text,
  display_number text,
  access_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id)
);

alter table whatsapp_channels enable row level security;

drop policy if exists whatsapp_channels_all on whatsapp_channels;
create policy whatsapp_channels_all on whatsapp_channels for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

grant all on whatsapp_channels to authenticated;
