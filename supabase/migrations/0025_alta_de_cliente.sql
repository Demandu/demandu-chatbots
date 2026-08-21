-- 0025 · Que un cliente nuevo nazca con la cuenta completa
--
-- DOS FALLOS QUE SOLO SE VEN CON UN CLIENTE NUEVO, Y POR ESO NADIE LOS HABÍA
-- VISTO: la única cuenta que existe hoy se arregló sola a base de migraciones
-- posteriores, así que el camino de alta llevaba meses roto sin que se notara.
--
-- 1) EL EMBUDO NACÍA MUERTO. `handle_new_user` creaba las 7 etapas pero NO el
--    embudo al que pertenecen. `crm_enganchar_conversacion` busca el embudo
--    por defecto de la organización, no lo encontraba y se salía sin hacer
--    nada. Resultado: un cliente nuevo podía recibir cien conversaciones y su
--    Embudo seguiría vacío. Sin error, sin aviso: simplemente vacío para
--    siempre. Y el Embudo es de lo primero que enseña la plataforma.
--
-- 2) EL NEGOCIO SE LLAMABA COMO EL CORREO. De `the_alexmolina@icloud.com`
--    salía una organización llamada "the_alexmolina". Es lo primero que ve el
--    cliente al entrar y lo que aparece en su chat: da la sensación de que la
--    plataforma no sabe con quién está hablando. Ahora se toma el nombre que
--    escribe al registrarse, y el correo queda solo como último recurso.

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
begin
  -- El nombre del negocio viene del formulario de alta. Si alguien entra por
  -- otra vía (invitación, login social sin pasar por el formulario), se cae al
  -- correo, que es feo pero funciona.
  nombre := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  nombre := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  insert into organizations (name, slug)
    values (nombre, 'org-' || replace(new.id::text, '-', ''))
    returning id into new_org;

  insert into memberships (org_id, user_id, role) values (new_org, new.id, 'owner');

  -- EL EMBUDO PRIMERO: las etapas cuelgan de él. Este es el renglón que
  -- faltaba y que dejaba el Embudo vacío para siempre.
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

-- Red de seguridad para lo que ya existe: si alguna organización se quedó sin
-- embudo por el fallo de arriba, se le crea y se le enganchan sus etapas.
do $$
declare o record; p uuid;
begin
  for o in select id from organizations
            where not exists (select 1 from pipelines where org_id = organizations.id)
  loop
    insert into pipelines (org_id, name, is_default, sort, auto_create)
      values (o.id, 'Ventas', true, 1, true) returning id into p;
    update conversation_states set pipeline_id = p
     where org_id = o.id and pipeline_id is null;
  end loop;
end $$;
