-- 0030 · Invitar a alguien a TU organización, no a una suya
--
-- EL PROBLEMA QUE HAY QUE RESOLVER ANTES DE PODER INVITAR A NADIE:
-- `handle_new_user` le crea una organización nueva a TODA cuenta que nace. Si
-- invitáramos a un empleado sin tocar eso, acabaría solo en una empresa vacía
-- suya, con su propio embudo, sin ver ni una conversación de su jefe — y sin
-- ningún error que explicara por qué.
--
-- POR QUÉ UNA TABLA DE INVITACIONES Y NO UN DATO EN LOS METADATOS DEL USUARIO:
-- lo tentador es mandar el `org_id` en `raw_user_meta_data` al invitar y que el
-- disparador lo lea. Sería un agujero de seguridad: los metadatos los puede
-- poner CUALQUIERA al registrarse (`signUp` acepta `options.data`), así que
-- bastaría con darse de alta declarando el `org_id` de otro cliente para
-- meterse en su organización y ver todas sus conversaciones.
--
-- Con una tabla, el disparador busca por CORREO una invitación que ya exista.
-- Eso no se puede falsificar: haría falta que el dueño de esa organización
-- hubiera invitado antes justo ese correo.

create table if not exists invitations (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references organizations(id) on delete cascade,
  email          text not null,
  rol            text not null default 'agent',
  permisos       jsonb not null default '{}'::jsonb,
  team_member_id uuid references team_members(id) on delete set null,
  invited_by     uuid,
  user_id        uuid,
  created_at     timestamptz not null default now(),
  accepted_at    timestamptz
);

create index if not exists invitations_por_correo
  on invitations (lower(email)) where accepted_at is null;

-- SIN ESTO SE FILTRARÍAN LOS CORREOS DEL EQUIPO DE CADA CLIENTE. Postgres deja
-- la tabla abierta a todo el mundo hasta que se enciende RLS.
alter table invitations enable row level security;

drop policy if exists inv_ver     on invitations;
drop policy if exists inv_crear   on invitations;
drop policy if exists inv_borrar  on invitations;

create policy inv_ver on invitations for select
  using (org_id in (select auth_org_ids()) and auth_puede('equipo'));
create policy inv_crear on invitations for insert
  with check (org_id in (select auth_org_ids()) and auth_puede('equipo'));
create policy inv_borrar on invitations for delete
  using (org_id in (select auth_org_ids()) and auth_puede('equipo'));

-- ── El alta, ahora con dos caminos ─────────────────────────────────────────
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  inv      invitations%rowtype;
  new_org  uuid;
  new_pipe uuid;
  nombre   text;
  lo_dijo  boolean;
begin
  -- ¿Lo estaban esperando? Se toma la invitación más reciente sin usar.
  select * into inv
    from invitations
   where lower(btrim(email)) = lower(btrim(coalesce(new.email, '')))
     and accepted_at is null
   order by created_at desc
   limit 1;

  if inv.id is not null then
    insert into memberships (org_id, user_id, role, permisos)
      values (inv.org_id, new.id, inv.rol::member_role, coalesce(inv.permisos, '{}'::jsonb));

    -- Si ya existía como agente en la lista, se le engancha la cuenta a esa
    -- misma fila. Si no, se le crea una: para el cliente es "una persona", y
    -- que apareciera dos veces sería exactamente el lío que estamos quitando.
    if inv.team_member_id is not null then
      update team_members set user_id = new.id
       where id = inv.team_member_id and org_id = inv.org_id;
    else
      insert into team_members (org_id, user_id, name, email, available)
      values (
        inv.org_id, new.id,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                 nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
                 'Sin nombre'),
        new.email,
        false   -- que no entre al reparto hasta que alguien lo decida
      );
    end if;

    update invitations set accepted_at = now(), user_id = new.id where id = inv.id;
    return new;
  end if;

  -- ── Camino normal: cliente nuevo, organización nueva ────────────────────
  nombre  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  lo_dijo := nombre is not null;
  nombre  := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  insert into organizations (name, slug, nombre_confirmado)
    values (nombre, 'org-' || replace(new.id::text, '-', ''), lo_dijo)
    returning id into new_org;

  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');

  insert into pipelines (org_id, name, is_default, sort, auto_create)
    values (new_org, 'Ventas', true, 1, true)
    returning id into new_pipe;

  insert into conversation_states (org_id, pipeline_id, name, color, is_default, sort, outcome) values
    (new_org, new_pipe, 'Abierta','#3A85FF',true,1,'abierto'),
    (new_org, new_pipe, 'Pendiente','#FFC857',true,2,'abierto'),
    (new_org, new_pipe, 'En proceso','#6E42FF',true,3,'abierto'),
    (new_org, new_pipe, 'En atención','#FF6FB0',true,4,'abierto'),
    (new_org, new_pipe, 'Cerrada','#6E70A0',true,5,'abierto'),
    (new_org, new_pipe, 'Ganada','#3DDC97',true,6,'ganado'),
    (new_org, new_pipe, 'Perdida','#FF6B6B',true,7,'perdido');

  return new;
end $fn$;

-- ── Dejar constancia de la invitación ──────────────────────────────────────
-- El correo lo manda el servidor con la API de Supabase; esto solo apunta a
-- quién se invitó, con qué rol y a qué organización, para que el disparador de
-- arriba sepa qué hacer cuando esa persona acepte.
create or replace function invitar_persona(
  p_persona  uuid,        -- fila de team_members, o null si es alguien nuevo
  p_email    text,
  p_rol      text,
  p_permisos jsonb
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_org uuid; v_correo text; v_id uuid;
begin
  if not auth_puede('equipo') then
    raise exception 'No tienes permiso para invitar a nadie.';
  end if;
  if p_rol = 'owner' then
    raise exception 'Solo puede haber un dueño.';
  end if;

  v_correo := lower(btrim(coalesce(p_email, '')));
  if v_correo = '' or position('@' in v_correo) = 0 then
    raise exception 'Hace falta un correo válido para invitar.';
  end if;

  select id into v_org from organizations
   where id in (select auth_org_ids()) limit 1;
  if v_org is null then
    raise exception 'No encuentro tu organización.';
  end if;

  if p_persona is not null and not exists (
    select 1 from team_members where id = p_persona and org_id = v_org
  ) then
    raise exception 'Esa persona no está en tu organización.';
  end if;

  -- Si ya se le invitó y no ha aceptado, se reemplaza en vez de acumular
  -- invitaciones: si no, el rol que valdría sería el de la más vieja.
  delete from invitations
   where org_id = v_org and lower(btrim(email)) = v_correo and accepted_at is null;

  insert into invitations (org_id, email, rol, permisos, team_member_id, invited_by)
  values (v_org, v_correo, p_rol, coalesce(p_permisos, '{}'::jsonb), p_persona, auth.uid())
  returning id into v_id;

  return v_id;
end $fn$;

-- EXECUTE se concede a PUBLIC por defecto y `anon` hereda de PUBLIC, así que
-- revocar solo de `anon` no sirve. Ha pasado tres veces.
revoke execute on function public.invitar_persona(uuid, text, text, jsonb) from public, anon;
grant  execute on function public.invitar_persona(uuid, text, text, jsonb) to authenticated, service_role;
