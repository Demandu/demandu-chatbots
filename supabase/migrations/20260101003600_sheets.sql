-- 0036 · Google Sheets: a qué hoja va cada lead, y la cola para llevarlo
--
-- POR QUÉ UNA COLA Y NO ESCRIBIR EN GOOGLE AL VUELO: un contacto nace en cuatro
-- sitios distintos —el canal web, el motor de WhatsApp (que es Deno), la API
-- pública y a mano en la Bandeja— y hacer que los cuatro hablen con Google
-- sería repetir la misma lógica de tokens cuatro veces.
--
-- Y hay una razón más fuerte: si Google tarda o falla, **el cliente no puede
-- quedarse esperando**. Con la cola, el contacto se crea al instante y la fila
-- viaja después. Si Google está caído, se reintenta; nadie pierde un lead
-- porque una hoja de cálculo no contestó.
create table if not exists sheets_config (
  org_id       uuid primary key references organizations(id) on delete cascade,
  hoja_id      text not null,
  hoja_nombre  text,
  activo       boolean not null default true,
  ultimo_error text,
  updated_at   timestamptz not null default now()
);

alter table sheets_config enable row level security;
drop policy if exists sheets_ver on sheets_config;
drop policy if exists sheets_editar on sheets_config;
create policy sheets_ver on sheets_config for select
  using (org_id in (select auth_org_ids()));
-- Elegir a qué hoja salen los leads es conectar un servicio externo.
create policy sheets_editar on sheets_config for all
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones'))
  with check (org_id in (select auth_org_ids()) and auth_puede('conexiones'));

create table if not exists sheets_cola (
  id          bigserial primary key,
  org_id      uuid not null references organizations(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  intentos    int not null default 0,
  enviado_at  timestamptz,
  error       text
);

create index if not exists sheets_cola_pendientes
  on sheets_cola (created_at) where enviado_at is null;

alter table sheets_cola enable row level security;
drop policy if exists cola_ver on sheets_cola;
create policy cola_ver on sheets_cola for select
  using (org_id in (select auth_org_ids()));

-- SOLO SE ENCOLA SI ESA ORGANIZACIÓN TIENE LA INTEGRACIÓN ENCENDIDA. Encolarlo
-- todo y filtrar después llenaría la tabla de trabajo que nadie va a hacer.
create or replace function sheets_encolar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if exists (select 1 from sheets_config s where s.org_id = new.org_id and s.activo) then
    insert into sheets_cola (org_id, contact_id) values (new.org_id, new.id);
  end if;
  return new;
end $fn$;

drop trigger if exists contacts_a_sheets on contacts;
create trigger contacts_a_sheets
  after insert on contacts
  for each row execute function sheets_encolar();
