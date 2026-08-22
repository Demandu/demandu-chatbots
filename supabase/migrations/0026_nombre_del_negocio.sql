-- 0026 · Que nadie se quede con un negocio llamado como su correo
--
-- EL HUECO: quien entra con Facebook o Apple NO pasa por el formulario de alta.
-- Sale a la pantalla del proveedor y vuelve por otra ruta, así que nadie le
-- preguntó nunca cómo se llama su negocio. `handle_new_user` se cae entonces al
-- correo: de `the_alexmolina@icloud.com` sale una organización llamada
-- "the_alexmolina". Es lo primero que ve el cliente al entrar y lo que aparece
-- en su chat.
--
-- LA SOLUCIÓN NO ES ADIVINAR EL NOMBRE, es saber que no lo sabemos. Esta
-- columna marca las organizaciones cuyo nombre nos lo inventamos nosotros, y la
-- plataforma se lo pregunta la primera vez que el cliente entra.
--
-- POR QUÉ `default true`: todas las organizaciones que ya existen se quedan
-- como confirmadas. Si el default fuera false, el día del deploy a TODOS los
-- clientes actuales les saldría una pantalla pidiéndoles algo que ya
-- contestaron hace meses.

alter table organizations
  add column if not exists nombre_confirmado boolean not null default true;

comment on column organizations.nombre_confirmado is
  'false = el nombre lo pusimos nosotros por falta de datos (login social). La plataforma se lo pregunta al cliente en cuanto entra.';

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  new_org uuid;
  new_pipe uuid;
  nombre text;
  lo_dijo boolean;
begin
  -- El nombre del negocio viene del formulario de alta. Si viene vacío es que
  -- el cliente entró por login social y nadie se lo preguntó.
  nombre := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  lo_dijo := nombre is not null;
  nombre := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  insert into organizations (name, slug, nombre_confirmado)
    values (nombre, 'org-' || replace(new.id::text, '-', ''), lo_dijo)
    returning id into new_org;

  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');

  -- EL EMBUDO PRIMERO: las etapas cuelgan de él.
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
