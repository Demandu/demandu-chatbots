-- ════════════════════════════════════════════════════════════════════════════
-- EL LEAD CALIFICADO AVISA CUANDO ALGO CAMBIA, NO EN CADA ETIQUETA — 6 oct 2026
--
-- LO QUE PASÓ. Darwin probó el chatbot de Casas Pacíficas la noche del 5 oct.
-- El perfilamiento salió perfecto… y `lead.calificado` salió SIETE veces en un
-- minuto (eventos 211–217), todas con el mismo contenido. La función se llama
-- desde `etiquetar` después de CADA etiqueta, y en cuanto el lead tiene su
-- calificación, cada etiqueta de zona, proyecto o etapa que llega después
-- vuelve a avisar: la condición «exactamente una calificación» sigue siendo
-- cierta. Siete ejecuciones del flujo de Zoho para decir lo mismo.
--
-- La cabecera de la migración anterior prometía «sale UNA vez, cuando el lead
-- queda calificado». No era verdad. Esto lo hace verdad.
--
-- CÓMO. Una huella en la ficha (`calificado_huella`) de lo que viajaría al CRM:
-- la calificación y los atributos. Si la huella de ahora es la misma que la
-- última que salió, no sale nada (0). Si cambió —calificó por primera vez,
-- cambió de Lead Alto a Lead Revisar, o contestó un dato nuevo después de
-- calificar— sale, y el CRM recibe la actualización. El «por qué» y «en qué
-- me baso» NO entran en la huella a propósito: cambian con cada etiqueta
-- («Dijo: Panamá Oeste») y no son un cambio del lead.
--
-- La huella se guarda ANTES de encolar y de forma atómica (UPDATE condicional
-- sobre el valor anterior): si dos etiquetas llegan a la vez, solo una gana y
-- solo una avisa.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts
  add column if not exists calificado_huella text;

comment on column public.contacts.calificado_huella is
  'Huella (md5) de la última calificación + atributos que salieron en lead.calificado. Si no cambia, no se vuelve a avisar. Nulo = nunca ha salido.';

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
  v_huella       text;
begin
  -- EL CANDADO — quién llama. Igual que `poner_etiqueta` y `emitir_evento`.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select c.id, c.name, c.phone, c.external_id, c.channel, c.tags, c.attributes, c.calificado_huella
    into v_c
    from public.contacts c
   where c.id = p_contact_id and c.org_id = p_org_id;

  if not found then
    raise exception 'No encuentro esa ficha en esta organizacion'
      using errcode = 'no_data_found';
  end if;

  -- ── LA CALIFICACIÓN VIGENTE: EXACTAMENTE UNA ──────────────────────────────
  -- (Ninguna = no ha terminado; más de una = dato roto. En los dos casos, 0.)
  select count(*), min(t.name)
    into v_cuantas, v_calificacion
    from public.tags t
   where t.org_id = p_org_id
     and lower(btrim(coalesce(t.grupo, ''))) in ('calificación', 'calificacion')
     and t.name = any (coalesce(v_c.tags, array[]::text[]));

  if v_cuantas <> 1 then
    return 0;
  end if;

  -- ── LOS ATRIBUTOS: todos los definidos, los huecos en null ────────────────
  select coalesce(
           jsonb_object_agg(
             a.key,
             to_jsonb(nullif(btrim(coalesce(v_c.attributes ->> a.key, '')), ''))
           ),
           '{}'::jsonb)
    into v_atributos
    from public.custom_attributes a
   where a.org_id = p_org_id;

  -- ── ¿CAMBIÓ ALGO DESDE LA ÚLTIMA VEZ QUE SALIÓ? ───────────────────────────
  v_huella := md5(v_calificacion || '|' || coalesce(v_atributos, '{}'::jsonb)::text);

  update public.contacts
     set calificado_huella = v_huella
   where id = v_c.id
     and org_id = p_org_id
     and calificado_huella is distinct from v_huella;

  if not found then
    -- Lo mismo que ya salió. Avisar otra vez sería ruido para el CRM.
    return 0;
  end if;

  -- De quién hablamos (en WhatsApp el identificador ES el teléfono; en
  -- Instagram no, y ahí es mejor vacío que un dato falso).
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
  'Emite lead.calificado cuando el contacto tiene EXACTAMENTE una etiqueta del grupo Calificacion Y algo cambio desde la ultima vez que salio (calificacion o atributos; el porque no cuenta). Manda esa calificacion y TODOS los atributos definidos por la cuenta (los que faltan en null). NO manda las etiquetas de Etapa, Zona ni Proyecto. Devuelve cuantas salidas se encolaron; 0 = sin calificar, dos calificaciones a la vez, o nada nuevo que contar.';

revoke all on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) from public;
-- `create or replace` vuelve a conceder a `anon` por los privilegios por defecto
-- del proyecto, y quitárselo a `public` no se lo quita a `anon`. Un anónimo no
-- tiene auth.uid(), así que el candado no le aplicaría: fuera.
revoke all on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) from anon;
grant execute on function public.avisar_lead_calificado(uuid, uuid, text, jsonb, text) to authenticated, service_role;
