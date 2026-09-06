-- QUIEN SE QUEDA SIN NEGOCIO PUEDE CREAR UNO.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASÓ HOY, CON UN CLIENTE DE VERDAD. Se eliminó su cuenta desde superadmin —
-- una decisión legítima— y la ORGANIZACIÓN desapareció, pero la PERSONA siguió
-- existiendo: su usuario intacto, con cero membresías.
--
-- Qué le pasa a esa persona cuando vuelve a entrar: `getCurrentOrgId()`
-- devuelve nulo, el marco del panel no comprueba ese caso, y aterriza en un
-- panel vacío — sin chatbots, sin conversaciones, sin poder crear nada y sin
-- una sola frase que explique por qué. Exactamente la misma pantalla que veía
-- el equipo de Demandu antes de la 0060, y por el mismo motivo.
--
-- Ahora mismo hay DOS cuentas así en producción.
--
-- ── POR QUÉ ESTO ES UNA MIGRACIÓN Y NO CÓDIGO ─────────────────────────────
--
-- Porque dar de alta un negocio son OCHO inserciones que tienen que ir juntas
-- —organización, membresía, embudo, siete etapas, cuatro atributos, el dueño
-- como agente, los ajustes de reparto y las etiquetas de calificación— y ya
-- existen escritas una vez, dentro de `handle_new_user` (ver la 0104).
--
-- Escribirlas otra vez en TypeScript sería tener DOS altas distintas. Y ese
-- error ya nos costó caro: los cuatro atributos base se perdieron en la 0011
-- justamente porque había un solo sitio y alguien lo reescribió sin mirar. Con
-- dos sitios, la próxima divergencia no es un riesgo: es cuestión de tiempo.
--
-- Así que se saca el trozo a `provisionar_negocio` y las DOS puertas —el
-- disparador de alta y la pantalla de bienvenida— llaman a la misma función.
-- Una implementación, dos puertas.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ 1. EL ALTA DE UN NEGOCIO, EN UN SOLO SITIO ════════════════════════════

create or replace function public.provisionar_negocio(
  p_user   uuid,
  p_email  text,
  p_nombre text,
  -- ¿El nombre lo escribió una persona, o lo sacamos del correo? Es lo que
  -- decide si se le pregunta al entrar (ver `faltaNombreDelNegocio`).
  p_lo_dijo boolean
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid; new_pipe uuid;
begin
  -- EL SLUG SALE DE UN UUID NUEVO, no del id de la persona. Antes era
  -- `'org-' || user_id`, que vale para el primer negocio y CHOCA con la clave
  -- única en el segundo — que es justo lo que pasa cuando alguien se queda sin
  -- negocio y crea otro. Nadie lee esta columna (las tiendas tienen la suya).
  insert into organizations (name, slug, nombre_confirmado, prueba_termina_at)
    values (p_nombre, 'org-' || replace(gen_random_uuid()::text, '-', ''), p_lo_dijo,
            now() + interval '14 days')
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
      coalesce(nullif(split_part(coalesce(p_email, ''), '@', 1), ''), 'Yo'),
      p_email, true);

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

comment on function public.provisionar_negocio is
  'Todo lo que un negocio necesita para funcionar el primer día. La llaman el disparador de alta y la pantalla de bienvenida: es la ÚNICA definición del alta, a propósito.';

-- Nadie la llama desde fuera: es la pieza interna que comparten las dos
-- puertas. Quien tenga que crear un negocio pasa por `crear_mi_negocio`, que
-- comprueba quién eres.
revoke execute on function public.provisionar_negocio(uuid, text, text, boolean) from public, anon, authenticated;


-- ═══ 2. EL DISPARADOR DE ALTA, AHORA LLAMANDO A ESA FUNCIÓN ════════════════
--
-- Las dos ramas de arriba —invitación y equipo de Demandu— no cambian ni una
-- coma. Lo único que se sustituye es el bloque del alta normal.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype; nombre text; lo_dijo boolean;
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

  -- El equipo de Demandu NO tiene negocio propio, a propósito: si lo tuviera,
  -- ensuciaría la lista de clientes. Su panel es otro (ver la 0060).
  if coalesce(new.raw_user_meta_data ->> 'equipo_demandu', '') = 'true' then
    return new;
  end if;

  nombre  := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'negocio', '')), '');
  lo_dijo := nombre is not null;
  nombre  := coalesce(nombre, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Mi negocio');

  perform provisionar_negocio(new.id, new.email, nombre, lo_dijo);
  return new;
end $$;

comment on function public.handle_new_user is
  'Los tres caminos de alta —correo, login social y alta manual— pasan por aquí. El alta del negocio vive en `provisionar_negocio`, que también usa la pantalla de bienvenida: dos puertas, una implementación.';


-- ═══ 3. LA SEGUNDA PUERTA: CREAR UN NEGOCIO DESDE LA PLATAFORMA ════════════
--
-- Para quien se quedó sin ninguno. Es `security definer` porque tiene que
-- escribir en ocho tablas, y por eso comprueba TRES cosas antes de mover un
-- dedo. Sin esas tres, sería una forma de que cualquiera con sesión se fabrique
-- organizaciones a voluntad.

create or replace function public.crear_mi_negocio(p_nombre text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); correo text; limpio text;
begin
  -- 1. Hay que ser alguien.
  if uid is null then
    raise exception 'Hay que iniciar sesión.';
  end if;

  -- 2. SOLO PARA QUIEN NO TIENE NINGUNO. Esta es la comprobación que importa:
  -- sin ella, cualquier cliente podría crearse organizaciones sin límite desde
  -- la consola del navegador.
  if exists (select 1 from memberships m where m.user_id = uid) then
    raise exception 'Esta persona ya pertenece a un negocio.';
  end if;

  -- 3. El equipo de Demandu no tiene negocio propio y no debe acabar con uno
  -- por pasar por esta pantalla. Su sitio es `/panel`.
  if exists (select 1 from equipo_demandu e where e.user_id = uid and e.activo) then
    raise exception 'El equipo de Demandu no tiene negocio propio.';
  end if;

  select u.email into correo from auth.users u where u.id = uid;

  limpio := nullif(btrim(coalesce(p_nombre, '')), '');
  return provisionar_negocio(
    uid,
    correo,
    coalesce(limpio, nullif(split_part(coalesce(correo, ''), '@', 1), ''), 'Mi negocio'),
    limpio is not null
  );
end $$;

comment on function public.crear_mi_negocio is
  'Crea el negocio de quien no tiene ninguno. Pasó con un cliente al que se le eliminó la cuenta: el usuario sobrevivió sin organización y caía en un panel vacío sin explicación. Comprueba que haya sesión, que no tenga ya un negocio y que no sea del equipo de Demandu.';

revoke execute on function public.crear_mi_negocio(text) from public, anon;
grant execute on function public.crear_mi_negocio(text) to authenticated;
