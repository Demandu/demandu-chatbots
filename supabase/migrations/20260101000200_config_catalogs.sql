-- ============================================================================
-- 0002 · Catálogos de configuración por cliente + onboarding de organización
-- (aplicado al proyecto Supabase "Demandu Chatbot")
-- ============================================================================

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null default '#F64A97',
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  team_id uuid references teams(id) on delete set null,
  name text not null,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists lead_groups (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#6E42FF',
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table if not exists conversation_states (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  color text not null default '#3A85FF',
  is_default boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

alter table tags                enable row level security;
alter table teams               enable row level security;
alter table team_members        enable row level security;
alter table lead_groups         enable row level security;
alter table conversation_states enable row level security;

do $$
declare t text;
begin
  foreach t in array array['tags','teams','team_members','lead_groups','conversation_states'] loop
    execute format($f$
      create policy %1$s_all on %1$s for all
        using (org_id in (select auth_org_ids()))
        with check (org_id in (select auth_org_ids()));
    $f$, t);
  end loop;
end $$;

-- Onboarding: al registrarse, crear org + membresía + estados base
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  insert into organizations (name, slug)
    values (coalesce(nullif(split_part(new.email, '@', 1), ''), 'Mi negocio'),
            'org-' || replace(new.id::text, '-', ''))
    returning id into new_org;
  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');
  insert into conversation_states (org_id, name, color, is_default, sort) values
    (new_org, 'Abierta','#3A85FF',true,1),(new_org,'Pendiente','#FFC857',true,2),
    (new_org,'En proceso','#6E42FF',true,3),(new_org,'En atención','#FF6FB0',true,4),
    (new_org,'Cerrada','#6E70A0',true,5),(new_org,'Ganada','#3DDC97',true,6);
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Endurecimiento (linter): estas funciones no deben exponerse como RPC
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.auth_org_ids() from public, anon;
grant execute on function public.auth_org_ids() to authenticated, service_role;
