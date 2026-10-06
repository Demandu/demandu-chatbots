-- ════════════════════════════════════════════════════════════════════════════
-- UN LEAD ES NUEVO UNA SOLA VEZ — 6 oct 2026
--
-- LO QUE PASÓ. El 5 de octubre «Cm Nikos» escribió dos mensajes seguidos a
-- Demandu LLC, con seis segundos de diferencia. El motor de WhatsApp decide que
-- un lead es nuevo mirando si su ficha nació hace menos de 10 segundos, así que
-- LOS DOS mensajes dispararon `lead.nuevo`. La salida de esa cuenta apunta a un
-- flujo de Zoho que hace «Create module entry», y en el CRM aparecieron DOS
-- posibles clientes para la misma persona. Evento 204 y evento 205, el mismo
-- `contacto_id`.
--
-- No es un caso raro: quien escribe por WhatsApp manda «Hola» y en seguida la
-- pregunta. Dos mensajes en diez segundos es lo normal, no la excepción.
--
-- POR QUÉ SE ARREGLA AQUÍ Y NO EN EL MOTOR. La heurística de los 10 s vive en
-- el motor de WhatsApp, pero `lead.nuevo` es un evento del catálogo y mañana lo
-- puede emitir otro canal con otra heurística. La regla «un lead es nuevo una
-- sola vez» es del evento, no de quien lo dispara, y el único sitio que ven
-- todos los que lo disparan es la base. Es la misma razón por la que
-- `avisar_lead_calificado` y `poner_etiqueta` viven aquí.
--
-- CÓMO. Una marca en la ficha: `lead_nuevo_avisado_at`. El primero que llega la
-- pone (un UPDATE con `where … is null` que solo puede ganar uno, aunque los dos
-- lleguen en el mismo milisegundo); el segundo no la encuentra vacía y
-- `emitir_evento` devuelve 0 sin encolar nada ni mover la tarjeta del embudo.
--
-- Las fichas que YA existen se marcan con su fecha de alta: ninguna de ellas es
-- nueva, y así ningún contacto viejo puede volver a presentarse como nuevo.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.contacts
  add column if not exists lead_nuevo_avisado_at timestamptz;

comment on column public.contacts.lead_nuevo_avisado_at is
  'Cuándo salió el aviso lead.nuevo de esta ficha. Lo pone emitir_evento la primera vez; después ya no vuelve a salir. Nulo = todavía no ha salido (o la ficha no entró por un canal que lo emita).';

update public.contacts
   set lead_nuevo_avisado_at = created_at
 where lead_nuevo_avisado_at is null;

create or replace function public.emitir_evento(p_org_id uuid, p_tipo text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_cuantos  int := 0;
  v_contacto uuid;
begin
  if p_org_id is null or coalesce(btrim(p_tipo), '') = '' then return 0; end if;

  -- EL CANDADO — quién llama. Ver la cabecera de la migración original y la 0114.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  -- ── UN LEAD ES NUEVO UNA SOLA VEZ ─────────────────────────────────────────
  -- El UPDATE solo puede ganarlo una llamada: la que encuentra la marca vacía.
  -- Si el evento llega sin `contacto_id` válido no hay a quién marcar y sale
  -- como siempre — mejor un aviso de más que uno de menos sin poder evitarlo.
  if p_tipo = 'lead.nuevo'
     and coalesce(p_payload->>'contacto_id', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_contacto := (p_payload->>'contacto_id')::uuid;
    update public.contacts
       set lead_nuevo_avisado_at = now()
     where id = v_contacto
       and org_id = p_org_id
       and lead_nuevo_avisado_at is null;
    if not found then
      return 0;
    end if;
  end if;

  insert into public.eventos_salientes (org_id, salida_id, tipo, payload)
  select p_org_id, s.id, p_tipo, coalesce(p_payload, '{}'::jsonb)
    from public.salidas s
   where s.org_id = p_org_id and s.activa
     and (cardinality(s.eventos) = 0 or p_tipo = any (s.eventos));

  get diagnostics v_cuantos = row_count;

  perform public.crm_evento_mueve_tarjeta(p_org_id, p_tipo, coalesce(p_payload, '{}'::jsonb));

  return v_cuantos;
end;
$function$;
