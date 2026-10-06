-- ============================================================================
-- Demandu · Plataforma Conversacional — Esquema inicial (multi-tenant)
-- Postgres 17 / Supabase. Ejecutar con `supabase db push` o desde el editor SQL.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";   -- para RAG / base de conocimiento (Demandu AI)

-- ── Enums ───────────────────────────────────────────────────────────────────
create type member_role as enum ('owner', 'admin', 'agent', 'viewer');
create type channel_type as enum ('whatsapp', 'instagram', 'messenger', 'telegram', 'webchat');
create type bot_status as enum ('draft', 'published');
create type conversation_status as enum ('open', 'pending', 'assigned', 'closed');
create type message_direction as enum ('inbound', 'outbound');
create type message_sender as enum ('contact', 'bot', 'agent', 'system');
create type ai_provider as enum ('demandu', 'anthropic', 'openai', 'gemini');

-- ── Organizaciones (tenant) y miembros ──────────────────────────────────────
create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  plan        text not null default 'growth',
  created_at  timestamptz not null default now()
);

create table memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        member_role not null default 'owner',
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);

-- Helper: orgs a las que pertenece el usuario autenticado (usado por RLS).
create or replace function auth_org_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select org_id from memberships where user_id = auth.uid();
$$;

-- ── Bots y flujos ────────────────────────────────────────────────────────────
create table bots (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  status      bot_status not null default 'draft',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table flows (
  id          uuid primary key default gen_random_uuid(),
  bot_id      uuid not null references bots(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  version     int not null default 1,
  is_live     boolean not null default false,
  -- Grafo del constructor: { nodes: [...], edges: [...] }
  graph       jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Canales conectados (WhatsApp, IG, etc.) ─────────────────────────────────
create table channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  bot_id      uuid references bots(id) on delete set null,
  type        channel_type not null,
  display_name text,
  -- credenciales/ids por canal (phone_number_id, page_id, tokens cifrados, etc.)
  config      jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Configuración de IA (pluggable / BYOK / Demandu AI) ─────────────────────
create table ai_configs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  bot_id        uuid references bots(id) on delete cascade,
  provider      ai_provider not null default 'demandu',
  model         text,
  system_prompt text,
  -- API key cifrada del cliente (BYOK). Para 'demandu' se usa la llave gestionada.
  api_key_ref   text,
  created_at    timestamptz not null default now()
);

-- ── Base de conocimiento (RAG con Voyage embeddings) ────────────────────────
create table knowledge_bases (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table kb_documents (
  id          uuid primary key default gen_random_uuid(),
  kb_id       uuid not null references knowledge_bases(id) on delete cascade,
  org_id      uuid not null references organizations(id) on delete cascade,
  content     text not null,
  metadata    jsonb not null default '{}'::jsonb,
  embedding   vector(1024),  -- voyage-3 => 1024 dims
  created_at  timestamptz not null default now()
);
create index kb_documents_embedding_idx on kb_documents
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ── Contactos ────────────────────────────────────────────────────────────────
create table contacts (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  name        text,
  phone       text,
  email       text,
  channel     channel_type,
  external_id text,               -- wa_id, ig user id, etc.
  attributes  jsonb not null default '{}'::jsonb,
  tags        text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (org_id, channel, external_id)
);

-- ── Conversaciones y mensajes ────────────────────────────────────────────────
create table conversations (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete set null,
  bot_id        uuid references bots(id) on delete set null,
  channel       channel_type not null,
  status        conversation_status not null default 'open',
  assignee_id   uuid references auth.users(id) on delete set null,
  -- puntero al nodo actual del flujo + variables capturadas
  flow_state    jsonb not null default '{}'::jsonb,
  last_message_at timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index conversations_org_idx on conversations(org_id, last_message_at desc);

create table messages (
  id            uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  org_id        uuid not null references organizations(id) on delete cascade,
  direction     message_direction not null,
  sender        message_sender not null,
  body          text,
  payload       jsonb not null default '{}'::jsonb,   -- media, botones, template
  created_at    timestamptz not null default now()
);
create index messages_convo_idx on messages(conversation_id, created_at);

-- ── updated_at trigger ───────────────────────────────────────────────────────
create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;
create trigger bots_touch  before update on bots  for each row execute function touch_updated_at();
create trigger flows_touch before update on flows for each row execute function touch_updated_at();

-- ============================================================================
-- Row Level Security — todo se aísla por organización del usuario
-- ============================================================================
alter table organizations  enable row level security;
alter table memberships    enable row level security;
alter table bots           enable row level security;
alter table flows          enable row level security;
alter table channels       enable row level security;
alter table ai_configs     enable row level security;
alter table knowledge_bases enable row level security;
alter table kb_documents   enable row level security;
alter table contacts       enable row level security;
alter table conversations  enable row level security;
alter table messages       enable row level security;

-- Organizaciones: el usuario ve/gestiona las suyas
create policy org_select on organizations for select using (id in (select auth_org_ids()));
create policy org_update on organizations for update using (id in (select auth_org_ids()));

-- Membresías: el usuario ve las de sus orgs; se inserta a sí mismo al crear org
create policy mem_select on memberships for select using (org_id in (select auth_org_ids()));
create policy mem_insert on memberships for insert with check (user_id = auth.uid());

-- Patrón genérico para tablas con org_id
do $$
declare t text;
begin
  foreach t in array array[
    'bots','flows','channels','ai_configs','knowledge_bases',
    'kb_documents','contacts','conversations','messages'
  ] loop
    execute format($f$
      create policy %1$s_all on %1$s for all
        using (org_id in (select auth_org_ids()))
        with check (org_id in (select auth_org_ids()));
    $f$, t);
  end loop;
end $$;

-- ── Endurecimiento (satisface el linter de seguridad de Supabase) ────────────
alter function public.touch_updated_at() set search_path = '';
revoke execute on function public.auth_org_ids() from public;
grant execute on function public.auth_org_ids() to authenticated, service_role;

-- ── Semilla opcional: descomenta para crear una org de prueba ────────────────
-- insert into organizations (name, slug) values ('Tienda Demo', 'tienda-demo');
