-- Un cliente nuevo nace con nombre y correo. Antes nacía en blanco.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL SÍNTOMA ERA «LOS DE FACEBOOK Y APPLE SALEN VACÍOS». LA CAUSA ERA OTRA.
--
-- En la pantalla de clientes del superadmin, quien entra con Facebook o Apple
-- aparecía sin nombre, sin correo y sin teléfono. La explicación evidente —«los
-- proveedores sociales no nos dan esos datos»— es FALSA, y comprobarlo costó una
-- consulta: `auth.users` tiene «Darwin Bracho» y «Elsie Y Molina A» guardados
-- desde el primer segundo, en `raw_user_meta_data`. El dato estaba ahí.
--
-- Y no eran solo los sociales: las TRES organizaciones de la plataforma tenían
-- los tres campos en nulo, incluida una creada con correo y contraseña. El
-- problema no es de dónde entra la gente.
--
-- ── LO QUE PASABA DE VERDAD ───────────────────────────────────────────────
--
-- `contacto_nombre`, `contacto_email` y `contacto_telefono` los escribía UN SOLO
-- sitio: el alta manual que el equipo de Demandu hace desde el superadmin
-- (0044). El alta normal —la que usa todo el mundo que se registra solo— pasa
-- por `provisionar_negocio`, que crea la organización, el embudo, los estados,
-- los atributos y el equipo… y no tocaba esas tres columnas.
--
-- Así que la pantalla no estaba rota: estaba enseñando fielmente unas columnas
-- que nadie llenaba nunca. El cliente que se da de alta solo —justo el que más
-- interesa mirar— era el único que salía en blanco.
--
-- ── POR QUÉ SE ARREGLA AQUÍ Y NO EN LA PANTALLA ───────────────────────────
--
-- La tentación es que la pantalla mire `auth.users` al pintar. Sería peor: son
-- datos de autenticación, la consulta se multiplica por cliente, y el mismo
-- hueco volvería a aparecer en el panel del equipo, en las comisiones y en la
-- ficha —los otros tres sitios que ya leen estas columnas—. Se llena en el
-- único sitio donde nace un negocio y todos los demás heredan el arreglo.
--
-- ── ESTA MIGRACIÓN REESCRIBE LA FUNCIÓN ENTERA, Y CASI LA MUTILO ──────────
--
-- `create or replace` sustituye el cuerpo COMPLETO: lo que no se vuelva a
-- escribir, desaparece. Al copiar la función para añadirle dos columnas se me
-- quedaron fuera tres piezas del final —los ajustes de reparto y las tres
-- etiquetas de calificación— y la primera versión llegó a aplicarse así.
--
-- No lo vi yo: lo cazó la prueba estática «El alta de una cuenta no vuelve a
-- perder piezas», que existe justamente porque esto YA pasó antes (0104). Sin
-- ella, cada cliente nuevo habría nacido sin reparto y sin etiquetas, y se
-- habría descubierto semanas después con un pase a humano que no le llega a
-- nadie. Se repuso todo y se volvió a aplicar.
--
-- ── EL TELÉFONO SIGUE VACÍO, Y ES HONESTO ─────────────────────────────────
--
-- Ni Facebook, ni Apple, ni el registro con correo lo piden. Inventarlo no se
-- puede y pedirlo en el alta es una casilla más entre la persona y su cuenta.
-- Se queda nulo hasta que alguien lo escriba; la pantalla ya sabe enseñar «—».
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.provisionar_negocio(
  p_user   uuid,
  p_email  text,
  p_nombre text,
  -- ¿El nombre lo escribió una persona, o lo sacamos del correo? Es lo que
  -- decide si se le pregunta al entrar (ver `faltaNombreDelNegocio`).
  p_lo_dijo boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid; new_pipe uuid; persona text; correo text;
begin
  -- ── QUIÉN ES LA PERSONA ─────────────────────────────────────────────────
  --
  -- Se lee de `auth.users` y no de un parámetro nuevo a propósito: las dos
  -- puertas que llaman aquí —el disparador de alta y la pantalla de
  -- bienvenida— ya saben el `p_user`, y así ninguna de las dos puede olvidarse
  -- de pasarlo.
  --
  -- `name` Y `full_name`, EN ESE ORDEN, porque los proveedores no coinciden:
  -- Facebook manda los dos, Apple manda los dos la PRIMERA vez y luego nada, y
  -- el registro con correo llena `name` solo si el formulario lo pidió. Con
  -- ninguno de los dos, se queda nulo — mejor un guion en la pantalla que un
  -- nombre inventado a partir del correo.
  select
    nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name',
                          u.raw_user_meta_data ->> 'full_name')), ''),
    nullif(btrim(coalesce(p_email, u.email, '')), '')
    into persona, correo
    from auth.users u
   where u.id = p_user;

  -- EL SLUG SALE DE UN UUID NUEVO, no del id de la persona. Antes era
  -- `'org-' || user_id`, que vale para el primer negocio y CHOCA con la clave
  -- única en el segundo — que es justo lo que pasa cuando alguien se queda sin
  -- negocio y crea otro. Nadie lee esta columna (las tiendas tienen la suya).
  insert into organizations (name, slug, nombre_confirmado, prueba_termina_at,
                             contacto_nombre, contacto_email)
    values (p_nombre, 'org-' || replace(gen_random_uuid()::text, '-', ''), p_lo_dijo,
            now() + interval '14 days', persona, correo)
    returning id into new_org;

  insert into memberships (org_id, user_id, role) values (new_org, p_user, 'owner');

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

  -- Los cuatro de la 0006, que se perdieron en la 0011. `correo` es el que más
  -- duele: sin él, agendar crea la cita sin invitado y nadie se entera.
  insert into custom_attributes (org_id, name, key, type, purpose, visible, sort) values
    (new_org, 'Nombre',   'nombre',   'string', 'chatbot', true, 1),
    (new_org, 'Correo',   'correo',   'email',  'chatbot', true, 2),
    (new_org, 'Teléfono', 'telefono', 'phone',  'chatbot', true, 3),
    (new_org, 'Ciudad',   'ciudad',   'string', 'chatbot', true, 4);

  -- El dueño ES el equipo cuando el equipo es una persona. Sin ninguna fila en
  -- `team_members`, `crm_elegir_agente` no tiene a quién asignar y el pase a
  -- humano no le llega a nadie.
  insert into team_members (org_id, user_id, name, email, available)
    values (new_org, p_user,
      coalesce(persona, nullif(split_part(coalesce(correo, ''), '@', 1), ''), 'Yo'),
      correo, true);

  insert into assignment_settings (org_id) values (new_org) on conflict (org_id) do nothing;

  -- Tres, en un grupo, porque dentro de un grupo solo puede haber UNA a la vez
  -- (ver `poner_etiqueta`): así la IA no puede dejar a alguien como lead-alto Y
  -- lead-bajo, que es lo que pasó el 31 de agosto.
  insert into tags (org_id, name, color, grupo) values
    (new_org, 'lead-alto',  '#3DDC97', 'Calificación'),
    (new_org, 'lead-medio', '#FFC857', 'Calificación'),
    (new_org, 'lead-bajo',  '#6E70A0', 'Calificación')
  on conflict (org_id, name) do nothing;

  return new_org;
end $$;

revoke execute on function public.provisionar_negocio(uuid, text, text, boolean)
  from public, anon, authenticated;

comment on function public.provisionar_negocio is
  'Todo lo que un negocio necesita para funcionar el primer día, incluido su contacto. La llaman el disparador de alta y la pantalla de bienvenida: es la UNICA definicion del alta, a proposito.';

/* ── LOS QUE YA ESTABAN ─────────────────────────────────────────────────────
 *
 * Arreglar el alta no arregla a quien ya se dio de alta. Sin este relleno, los
 * clientes de hoy seguirían en blanco para siempre y el arreglo parecería no
 * haber funcionado — que es como se acaba «arreglando» dos veces lo mismo.
 *
 * SE TOMA EL DUEÑO, no un miembro cualquiera: en un negocio con tres agentes,
 * el contacto del cliente es quien lo abrió, no el último que entró. Y solo se
 * escribe lo que está vacío: si alguien lo escribió a mano desde el alta
 * manual, ese dato vale más que el del proveedor.
 */
update public.organizations o
   set contacto_nombre = coalesce(o.contacto_nombre, d.persona),
       contacto_email  = coalesce(o.contacto_email,  d.correo)
  from (
    select m.org_id,
           nullif(btrim(coalesce(u.raw_user_meta_data ->> 'name',
                                 u.raw_user_meta_data ->> 'full_name')), '') as persona,
           nullif(btrim(coalesce(u.email, '')), '')                          as correo,
           row_number() over (partition by m.org_id order by m.created_at)   as puesto
      from public.memberships m
      join auth.users u on u.id = m.user_id
     where m.role = 'owner'
  ) d
 where d.org_id = o.id
   and d.puesto = 1
   and (o.contacto_nombre is null or o.contacto_email is null);
