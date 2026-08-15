-- ============================================================================
-- 0006 · Atributos personalizados por organización
-- El nodo Pregunta guarda la respuesta del contacto en uno de estos atributos
-- (equivalente al "Question Mapping" de BotPenguin, con tipos más ricos).
-- ============================================================================

create table if not exists custom_attributes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  key text not null,
  type text not null default 'string',    -- string|number|float|email|phone|date|boolean|list
  purpose text not null default 'chatbot', -- chatbot|api|agent
  visible boolean not null default true,
  sort int not null default 100,
  created_at timestamptz not null default now(),
  unique (org_id, key)
);

alter table custom_attributes enable row level security;

drop policy if exists custom_attributes_all on custom_attributes;
create policy custom_attributes_all on custom_attributes for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

grant all on custom_attributes to authenticated;

-- Semilla para organizaciones existentes
insert into custom_attributes (org_id, name, key, type, purpose, sort)
select o.id, v.name, v.key, v.type, 'chatbot', v.sort
from organizations o
cross join (values
  ('Nombre', 'nombre', 'string', 1),
  ('Correo', 'correo', 'email', 2),
  ('Teléfono', 'telefono', 'phone', 3),
  ('Ciudad', 'ciudad', 'string', 4)
) as v(name, key, type, sort)
where not exists (
  select 1 from custom_attributes c where c.org_id = o.id and c.key = v.key
);

-- Onboarding: agrega los atributos base a cada organización nueva
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
  insert into custom_attributes (org_id, name, key, type, purpose, sort) values
    (new_org,'Nombre','nombre','string','chatbot',1),
    (new_org,'Correo','correo','email','chatbot',2),
    (new_org,'Teléfono','telefono','phone','chatbot',3),
    (new_org,'Ciudad','ciudad','string','chatbot',4);
  return new;
end; $$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
