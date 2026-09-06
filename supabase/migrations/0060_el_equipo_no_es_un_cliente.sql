-- DAR DE ALTA A ALGUIEN DEL EQUIPO NO PUEDE CREARLE UN NEGOCIO.
--
-- QUÉ PASABA. `handle_new_user` corre con CADA usuario nuevo de `auth.users`, y
-- si no hay invitación pendiente le monta una organización entera: negocio,
-- membresía de dueño, embudo y siete estados. Perfecto para quien se registra
-- desde la web — y equivocado para un vendedor, que no es cliente de nadie.
--
-- Resultado: al crear a Darwin desde el superadmin apareció también en la lista
-- de clientes, en prueba, contaminando el conteo y el MRR. Y la lista de
-- clientes es donde se decide a quién cobrar y a quién llamar.
--
-- CÓMO SE DISTINGUE. El alta del superadmin marca al usuario con
-- `equipo_demandu` en sus metadatos. Es la única forma honesta: el disparador
-- no puede adivinar la intención de quien lo insertó, así que hay que
-- decírsela.
--
-- Lo demás queda EXACTAMENTE igual: la rama de invitaciones y la de registro
-- normal no se tocan.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  inv invitations%rowtype; new_org uuid; new_pipe uuid; nombre text; lo_dijo boolean;
begin
  select * into inv from invitations
   where lower(btrim(email)) = lower(btrim(coalesce(new.email, '')))
     and accepted_at is null
   order by created_at desc limit 1;

  if inv.id is not null then
    insert into memberships (org_id, user_id, role, permisos)
      values (inv.org_id, new.id, inv.rol::member_role, coalesce(inv.permisos, '{}'::jsonb));

    if inv.team_member_id is not null then
      update team_members set user_id = new.id
       where id = inv.team_member_id and org_id = inv.org_id;
    else
      insert into team_members (org_id, user_id, name, email, available)
      values (inv.org_id, new.id,
        coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
                 nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Sin nombre'),
        new.email, false);
    end if;

    update invitations set accepted_at = now(), user_id = new.id where id = inv.id;
    return new;
  end if;

  -- ── ES DEL EQUIPO DE DEMANDU: no es cliente de nadie ──────────────────────
  --
  -- Un vendedor o un partner entra a las cuentas de SUS clientes; no tiene
  -- negocio propio en la plataforma. Crearle uno lo mete en la lista de
  -- clientes y le suma al MRR un negocio que no existe.
  if coalesce(new.raw_user_meta_data ->> 'equipo_demandu', '') = 'true' then
    return new;
  end if;

  nombre  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  lo_dijo := nombre is not null;
  nombre  := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  insert into organizations (name, slug, nombre_confirmado)
    values (nombre, 'org-' || replace(new.id::text, '-', ''), lo_dijo)
    returning id into new_org;

  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');

  insert into pipelines (org_id, name, is_default, sort, auto_create)
    values (new_org, 'Ventas', true, 1, true) returning id into new_pipe;

  insert into conversation_states (org_id, pipeline_id, name, color, is_default, sort, outcome) values
    (new_org, new_pipe, 'Abierta','#3A85FF',true,1,'abierto'),
    (new_org, new_pipe, 'Pendiente','#FFC857',true,2,'abierto'),
    (new_org, new_pipe, 'En proceso','#6E42FF',true,3,'abierto'),
    (new_org, new_pipe, 'En atención','#FF6FB0',true,4,'abierto'),
    (new_org, new_pipe, 'Cerrada','#6E70A0',true,5,'abierto'),
    (new_org, new_pipe, 'Ganada','#3DDC97',true,6,'ganado'),
    (new_org, new_pipe, 'Perdida','#FF6B6B',true,7,'perdido');

  return new;
end $function$;
