-- ════════════════════════════════════════════════════════════════════════════
-- LO QUE DE VERDAD TIENE QUE VIAJAR AL CRM CUANDO EL LEAD QUEDA CALIFICADO.
--
-- APLICADA EL 6 DE OCTUBRE DE 2026, y comprobada contra la base real con
-- `scripts/pruebas/calificacion-base-de-datos.sql` (los 7 puntos en OK).
--
-- ── EL PROBLEMA, MEDIDO ───────────────────────────────────────────────────
--
-- Este es el último `lead.datos` que salió de verdad (evento 202, 30 sep 2026,
-- entregado):
--
--   etiquetas: ["Abierta", "Lead Alto", "Panamá Oeste", "Torres de España"]
--
-- Tres de esas cuatro NO deben salir de Demandu. «Abierta» es la etapa del
-- embudo, «Panamá Oeste» la zona y «Torres de España» el proyecto: son
-- herramientas internas de organización. En el CRM del cliente la etiqueta es
-- un campo con significado comercial, y llenarlo con el estado interno de otra
-- plataforma lo deja inservible para filtrar.
--
-- Y lo que sí hacía falta no iba: NINGUNO de los atributos. Casas Pacíficas
-- tiene los siete guardados —zona_interes, proyecto_interes, tipo_empleo,
-- tiempo_laborando, ingreso, ingreso_familiar, interes_visita, medidos en 6 de
-- sus 8 contactos— y ninguno viajaba. El asesor que recibía el caso tenía que
-- volver a preguntarlo todo, que es justo lo que el cliente pide evitar.
--
-- ── POR QUÉ VIVE EN LA BASE Y NO EN LOS MOTORES ───────────────────────────
--
-- Por la misma razón que `poner_etiqueta`, y está escrito en su comentario:
-- hay DOS motores —el de WhatsApp es Deno y no puede importar nada de `src/`,
-- y el de la web es TypeScript— y esta regla no puede divergir. La base es una
-- sola. Escribirla dos veces es garantizar que un día un cliente reciba una
-- cosa por WhatsApp y otra por la web, con el mismo contrato.
--
-- ── POR GRUPO, NUNCA POR NOMBRE ───────────────────────────────────────────
--
-- Qué es una calificación lo decide el GRUPO de la etiqueta, no cómo se llama.
-- Escribir «Lead Alto» y «Lead Revisar» aquí sería atarlo a un solo cliente: el
-- siguiente llamará a las suyas «Caliente» y «Tibio».
--
-- ── Y POR QUÉ UN EVENTO NUEVO, NO UN CAMBIO DE `lead.datos` ───────────────
--
-- `lead.datos` es un contrato ya publicado y tiene integraciones vivas. Además
-- salta en CADA dato y en CADA etiqueta. Este sale UNA vez, cuando el lead
-- queda calificado, que es el momento que el cliente describe.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function public.avisar_lead_calificado(
  p_org_id        uuid,
  p_contact_id    uuid,
  p_por_que       text  default null,
  p_en_que_me_baso jsonb default '[]'::jsonb,
  p_por           text  default 'agente_ia'
) returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_c            record;
  v_cuantas      int;
  v_calificacion text;
  v_atributos    jsonb;
  v_telefono     text;
begin
  -- EL CANDADO — quién llama. Igual que `poner_etiqueta` y `emitir_evento`.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select c.id, c.name, c.phone, c.external_id, c.channel, c.tags, c.attributes
    into v_c
    from public.contacts c
   where c.id = p_contact_id and c.org_id = p_org_id;

  if not found then
    raise exception 'No encuentro esa ficha en esta organizacion'
      using errcode = 'no_data_found';
  end if;

  -- ── LA CALIFICACIÓN VIGENTE: EXACTAMENTE UNA ──────────────────────────────
  --
  -- Se devuelve 0 —y no sale nada— en dos casos, los dos a propósito:
  --
  -- · NINGUNA puesta: el lead todavía no está calificado. Mandar la
  --   calificación vacía le diría al CRM que el perfilamiento terminó sin
  --   resultado, y lo que pasa es que no ha terminado.
  -- · MÁS DE UNA: el grupo es exclusivo, así que no debería ocurrir; si
  --   ocurre, elegir una sería inventarse cuál. «Nunca mandar Lead Alto y
  --   Lead Revisar a la vez» es la regla del cliente, y la forma honesta de
  --   cumplirla con el dato roto es no mandar nada.
  select count(*), min(t.name)
    into v_cuantas, v_calificacion
    from public.tags t
   where t.org_id = p_org_id
     and lower(btrim(coalesce(t.grupo, ''))) in ('calificación', 'calificacion')
     and t.name = any (coalesce(v_c.tags, array[]::text[]));

  if v_cuantas <> 1 then
    return 0;
  end if;

  -- ── LOS ATRIBUTOS ─────────────────────────────────────────────────────────
  --
  -- Van TODOS los que la cuenta tiene definidos, no solo los que esta persona
  -- contestó. Un CRM que recibe unas veces siete campos y otras veces tres no
  -- puede mapearlos: el que falta no se distingue de «este lead no lo trae».
  --
  -- Lo que no se preguntó viaja en `null`, nunca inventado. Una cadena vacía o
  -- de solo espacios ES un hueco. Y que falte uno no impide que salgan los
  -- demás — por eso se recorre la lista de campos DEFINIDOS y no lo guardado.
  select coalesce(
           jsonb_object_agg(
             a.key,
             to_jsonb(nullif(btrim(coalesce(v_c.attributes ->> a.key, '')), ''))
           ),
           '{}'::jsonb)
    into v_atributos
    from public.custom_attributes a
   where a.org_id = p_org_id;

  -- De quién hablamos. El respaldo del teléfono mira el canal: en WhatsApp el
  -- identificador de la persona ES su teléfono; en Instagram no lo es, y meter
  -- un identificador de Instagram en un campo llamado «teléfono» es peor que
  -- dejarlo vacío, porque el CRM lo guarda como bueno y alguien acaba marcando.
  v_telefono := coalesce(
    nullif(btrim(coalesce(v_c.phone, '')), ''),
    case when v_c.channel = 'whatsapp'
         then nullif(btrim(coalesce(v_c.external_id, '')), '')
         else null end
  );

  return public.emitir_evento(p_org_id, 'lead.calificado', jsonb_build_object(
    'contacto_id',    v_c.id,
    'telefono',       v_telefono,
    'nombre',         nullif(btrim(coalesce(v_c.name, '')), ''),
    'calificacion',   v_calificacion,
    'atributos',      coalesce(v_atributos, '{}'::jsonb),
    'por_que',        nullif(btrim(coalesce(p_por_que, '')), ''),
    'en_que_me_baso', coalesce(p_en_que_me_baso, '[]'::jsonb),
    'por',            coalesce(nullif(btrim(coalesce(p_por, '')), ''), 'agente_ia')
  ));
end;
$function$;

comment on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) is
  'Emite lead.calificado cuando el contacto tiene EXACTAMENTE una etiqueta del grupo Calificacion. Manda esa calificacion y TODOS los atributos definidos por la cuenta (los que faltan en null). NO manda las etiquetas de Etapa, Zona ni Proyecto: son internas. Devuelve cuantas salidas se encolaron; 0 significa que el lead todavia no esta calificado o que tiene dos calificaciones a la vez.';

revoke all on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) from public;
grant execute on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) to authenticated, service_role;
