-- UNA CUENTA NUEVA NACE FUNCIONANDO.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ RECIBÍA UNA CUENTA NUEVA HASTA HOY: su organización, su membresía, un
-- embudo y siete etapas. Nada más.
--
-- Se vio con un cliente de verdad. «Hauta Clinic» se registró y nació con CERO
-- atributos, CERO etiquetas, CERO agentes, sin ajustes de reparto y con la
-- prueba ya vencida. No es que le faltaran cosas bonitas: es que media
-- plataforma no podía funcionar en su cuenta y nada se lo decía.
--
-- ── LOS TRES AGUJEROS, POR ORDEN DE DAÑO ──────────────────────────────────
--
-- 1. LOS ATRIBUTOS SE PERDIERON EN LA 0011. La migración 0006 los creaba al
--    registrarse —Nombre, Correo, Teléfono, Ciudad—. La 0011 redefinió
--    `handle_new_user` para añadirle otra cosa y SE DEJÓ ESE TROZO FUERA. Cinco
--    redefiniciones después, nadie lo recuperó.
--
--    Sin atributos, «Datos del lead» está vacío: el bloque Pregunta no tiene
--    dónde guardar nada, la herramienta `guardar_dato` de la IA no puede
--    guardar, y el bloque «Agendar cita» no tiene de dónde sacar el correo —el
--    fallo que costó una invitación el 5 de septiembre.
--
-- 2. LA PRUEBA NACÍA VENCIDA. `estado_cobro` es 'prueba' por defecto y
--    `prueba_termina_at` se quedaba NULO. `org_puede_enviar()` hace
--    `coalesce(prueba_termina_at, now()) > now()`, o sea que un nulo se lee
--    como «venció». Las DOS cuentas de producción dan false ahora mismo.
--
--    Hoy no se nota porque el motor de WhatsApp todavía no consulta esa puerta.
--    El día que se conecte, todas las cuentas nuevas nacen mudas. Es
--    exactamente la clase de bomba que lleva toda la semana explotando.
--
-- 3. EL DUEÑO NO EXISTÍA COMO AGENTE. `crm_elegir_agente` reparte entre
--    `team_members`; sin ninguno, no hay a quién asignar y el pase a humano no
--    llega a nadie. El dueño ES el equipo cuando el equipo es una persona.
--
-- ── POR QUÉ SE ARREGLA EN EL DISPARADOR Y NO EN EL REGISTRO ───────────────
--
-- Porque hay TRES caminos de alta —correo, Apple/Facebook, y el alta manual
-- desde superadmin— y los tres pasan por aquí. Ponerlo en el formulario
-- significaría que el que se registra con Apple nace distinto, y ese es
-- justo el tipo de diferencia que nadie prueba.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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

  if coalesce(new.raw_user_meta_data ->> 'equipo_demandu', '') = 'true' then
    return new;
  end if;

  nombre  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  lo_dijo := nombre is not null;
  nombre  := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  -- ── LA PRUEBA CON FECHA DE VERDAD ──────────────────────────────────────
  -- Catorce días, que es lo que el código ya daba por hecho: el relleno de la
  -- 0039 puso `now() + 14 days` a las cuentas de entonces y se quedó como un
  -- `update` de una sola vez, nunca como valor por defecto.
  insert into organizations (name, slug, nombre_confirmado, prueba_termina_at)
    values (nombre, 'org-' || replace(new.id::text, '-', ''), lo_dijo, now() + interval '14 days')
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

  -- ── LOS DATOS DEL LEAD, DE VUELTA ──────────────────────────────────────
  -- Los cuatro de la 0006, que se perdieron en la 0011. `correo` es el que más
  -- duele: sin él, agendar crea la cita sin invitado y nadie se entera.
  insert into custom_attributes (org_id, name, key, type, purpose, visible, sort) values
    (new_org, 'Nombre',   'nombre',   'string', 'chatbot', true, 1),
    (new_org, 'Correo',   'correo',   'email',  'chatbot', true, 2),
    (new_org, 'Teléfono', 'telefono', 'phone',  'chatbot', true, 3),
    (new_org, 'Ciudad',   'ciudad',   'string', 'chatbot', true, 4);

  -- ── EL DUEÑO ES EL EQUIPO ──────────────────────────────────────────────
  -- `crm_elegir_agente` reparte entre `team_members`. Sin ninguno, el pase a
  -- humano no llega a nadie: la conversación se queda esperando en silencio.
  insert into team_members (org_id, user_id, name, email, available)
    values (new_org, new.id,
      coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
               nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Yo'),
      new.email, true);

  -- Los ajustes de reparto existen APAGADOS. `crm_elegir_agente` sale con
  -- `return null` si no hay fila, así que sin esto la pantalla de Reparto no
  -- tiene nada que enseñar y el negocio no puede ni encenderlo.
  insert into assignment_settings (org_id) values (new_org)
    on conflict (org_id) do nothing;

  -- ── LO MÍNIMO PARA QUE CALIFICAR LEADS FUNCIONE EL PRIMER DÍA ──────────
  --
  -- La IA solo etiqueta con lo que existe: sin etiquetas, `etiquetar` no hace
  -- nada y no lo dice. Tres, en un grupo, porque dentro de un grupo solo puede
  -- haber UNA a la vez (ver `poner_etiqueta`) — así la IA no puede dejar a
  -- alguien como lead-alto Y lead-bajo, que es lo que pasó el 31 de agosto.
  --
  -- Y solo estas: las etiquetas de negocio son del negocio. Llenarle la cuenta
  -- de etiquetas que no pidió es tan malo como dejársela vacía.
  insert into tags (org_id, name, color, grupo) values
    (new_org, 'lead-alto',  '#3DDC97', 'Calificación'),
    (new_org, 'lead-medio', '#FFC857', 'Calificación'),
    (new_org, 'lead-bajo',  '#6E70A0', 'Calificación')
  on conflict (org_id, name) do nothing;

  return new;
end $$;

-- ── LAS CUENTAS QUE YA ESTÁN ──────────────────────────────────────────────
--
-- No es opcional: «Hauta Clinic» es un cliente de verdad con la cuenta a medias
-- desde el día que se registró. Arreglar el disparador y dejarla como está
-- sería arreglar el futuro y abandonarla a ella.
--
-- Todo con `on conflict do nothing` y filtrado por lo que falta: quien ya tenga
-- sus atributos, sus etiquetas o su equipo no se entera de esto.

-- La prueba, a quien nació sin fecha. Se le dan 14 días DESDE HOY: la cuenta
-- nunca llegó a tener prueba, así que empezarla ahora es lo justo.
update organizations
   set prueba_termina_at = now() + interval '14 days'
 where estado_cobro = 'prueba' and prueba_termina_at is null;

-- Los atributos, a quien no tenga NINGUNO. Si tiene alguno es que ya los
-- gestiona, y meterle los nuestros le reordenaría su pantalla.
insert into custom_attributes (org_id, name, key, type, purpose, visible, sort)
select o.id, x.name, x.key, x.type, 'chatbot', true, x.sort
  from organizations o
  cross join (values
    ('Nombre','nombre','string',1),
    ('Correo','correo','email',2),
    ('Teléfono','telefono','phone',3),
    ('Ciudad','ciudad','string',4)
  ) as x(name, key, type, sort)
 where not exists (select 1 from custom_attributes a where a.org_id = o.id)
on conflict do nothing;

-- El dueño como agente, a quien no tenga ninguno.
insert into team_members (org_id, user_id, name, email, available)
select m.org_id, m.user_id,
       coalesce(nullif(split_part(coalesce(u.email, ''), '@', 1), ''), 'Yo'),
       u.email, true
  from memberships m
  join auth.users u on u.id = m.user_id
 where m.role = 'owner'
   and not exists (select 1 from team_members t where t.org_id = m.org_id);

insert into assignment_settings (org_id)
select o.id from organizations o
 where not exists (select 1 from assignment_settings s where s.org_id = o.id)
on conflict (org_id) do nothing;

-- Las etiquetas de calificación, a quien no tenga ninguna etiqueta.
insert into tags (org_id, name, color, grupo)
select o.id, x.name, x.color, 'Calificación'
  from organizations o
  cross join (values
    ('lead-alto','#3DDC97'),
    ('lead-medio','#FFC857'),
    ('lead-bajo','#6E70A0')
  ) as x(name, color)
 where not exists (select 1 from tags t where t.org_id = o.id)
on conflict (org_id, name) do nothing;

comment on function public.handle_new_user is
  'Todo lo que una cuenta necesita para funcionar el primer día. Los atributos base se perdieron en la 0011 y estuvieron meses sin crearse; la prueba nacía sin fecha, que el código lee como vencida. Los tres caminos de alta —correo, login social y alta manual— pasan por aquí, y por eso está aquí.';
