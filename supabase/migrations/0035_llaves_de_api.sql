-- 0035 · Llaves de API
--
-- Es el cimiento para Zapier y Make. Con una API pública, esas dos plataformas
-- traen consigo Salesforce, HubSpot, Zoho, Sheets, Calendly y miles más ya
-- construidas. Hacer cada una a mano sería pagar cinco veces por lo mismo.
--
-- LA LLAVE EN CLARO NO SE GUARDA. Solo su SHA-256. Si esta tabla se filtrara,
-- lo robado no serviría para entrar a ninguna cuenta. Es la misma razón por la
-- que no se guardan contraseñas: nadie que administre la base tiene por qué
-- poder actuar en nombre de un cliente.
--
-- Del `prefijo` sí se guarda el principio, y solo para que el cliente distinga
-- una llave de otra en la pantalla sin tener que verlas enteras.
create table if not exists api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  nombre       text not null,
  prefijo      text not null,
  hash         text not null unique,
  creada_por   uuid,
  created_at   timestamptz not null default now(),
  ultimo_uso   timestamptz,
  revocada_at  timestamptz
);

create index if not exists api_keys_por_org on api_keys (org_id) where revocada_at is null;

alter table api_keys enable row level security;

drop policy if exists llaves_ver    on api_keys;
drop policy if exists llaves_crear  on api_keys;
drop policy if exists llaves_editar on api_keys;

-- Las llaves valen tanto como la cuenta entera: solo quien puede tocar
-- conexiones puede crearlas o revocarlas.
create policy llaves_ver on api_keys for select
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones'));
create policy llaves_crear on api_keys for insert
  with check (org_id in (select auth_org_ids()) and auth_puede('conexiones'));
create policy llaves_editar on api_keys for update
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones'));

comment on column api_keys.hash is
  'SHA-256 de la llave completa. La llave en claro NO se guarda: si esta tabla se filtrara, no serviría para entrar.';
comment on column api_keys.prefijo is
  'Los primeros caracteres, para que el cliente reconozca cuál es cuál sin ver la llave entera.';

-- De la llave a la organización. Va como función porque quien llama a la API
-- pública NO tiene sesión: llega con una llave y nada más, así que RLS no puede
-- resolverlo por sí sola. Solo `service_role` puede ejecutarla — desde el
-- navegador no se llega a ella ni por error.
create or replace function api_key_resolver(p_hash text)
returns table (org_id uuid, key_id uuid)
language sql
security definer
set search_path to 'public'
as $fn$
  select k.org_id, k.id
    from api_keys k
   where k.hash = p_hash
     and k.revocada_at is null
   limit 1;
$fn$;

revoke execute on function public.api_key_resolver(text) from public, anon, authenticated;
grant  execute on function public.api_key_resolver(text) to service_role;
