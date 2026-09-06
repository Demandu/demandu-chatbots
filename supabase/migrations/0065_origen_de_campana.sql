-- ═══════════════════════════════════════════════════════════════════════════
-- 0065 · De qué anuncio vino este lead.
--
-- Cuando alguien pulsa un anuncio de «Click to WhatsApp» en Facebook o
-- Instagram, Meta manda en el webhook un objeto `referral` con el anuncio, el
-- titular, la URL y el `ctwa_clid`. Hasta ahora el motor NI LO MIRABA: se
-- perdía en cada mensaje que entraba.
--
-- Sin esto solo se sabe cuánta gente escribe. Con esto se sabe QUÉ ANUNCIO
-- trae gente que compra, que es lo único que permite decidir dónde poner el
-- presupuesto.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Dos orígenes, y son preguntas distintas ────────────────────────────────
--
-- `contacts.origen`      → POR DÓNDE LLEGÓ ESTA PERSONA LA PRIMERA VEZ.
--                          No se sobrescribe nunca. Es el que dice qué anuncio
--                          consiguió el cliente.
--
-- `conversations.origen` → QUÉ ANUNCIO ARRANCÓ ESTA CONVERSACIÓN CONCRETA.
--                          Sí cambia: la misma persona puede volver meses
--                          después por otra campaña, y esa segunda venta es de
--                          la segunda campaña.
--
-- Guardar solo uno de los dos obliga a elegir entre «quién trajo al cliente» y
-- «qué disparó esta venta», y marketing necesita las dos.
alter table public.contacts      add column if not exists origen jsonb;
alter table public.conversations add column if not exists origen jsonb;

comment on column public.contacts.origen is
  'Primer toque: por donde llego esta persona la primera vez. NO se sobrescribe.';
comment on column public.conversations.origen is
  'El anuncio o enlace que arranco esta conversacion concreta.';

-- Para poder preguntar «cuantos leads trajo el anuncio X» sin recorrer todo.
create index if not exists contacts_origen_anuncio_idx
  on public.contacts ((origen->>'anuncio_id')) where origen is not null;

create index if not exists conversations_origen_anuncio_idx
  on public.conversations ((origen->>'anuncio_id')) where origen is not null;

-- ── Guardarlo ──────────────────────────────────────────────────────────────
--
-- VIVE EN LA BASE porque la regla «el primer toque no se pisa» tiene que ser
-- la misma para WhatsApp, para el widget web y para lo que venga. Hay dos
-- motores en runtimes distintos y esa regla no puede divergir: ya nos ha
-- pasado dos veces con otras.
--
-- Devuelve el origen que quedó en el CONTACTO, que es lo que el motor necesita
-- para meterlo en las variables del flujo.
create or replace function public.guardar_origen(
  p_org_id          uuid,
  p_contact_id      uuid,
  p_conversation_id uuid,
  p_origen          jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_primero jsonb;
begin
  if p_origen is null or p_origen = 'null'::jsonb then return null; end if;

  -- Primer toque: solo si estaba vacío. `coalesce` en el update haría lo
  -- mismo, pero escrito así se lee la intención.
  update public.contacts c
     set origen = coalesce(c.origen, p_origen)
   where c.id = p_contact_id and c.org_id = p_org_id
  returning c.origen into v_primero;

  -- Esta conversación sí se actualiza: es el anuncio que la disparó.
  if p_conversation_id is not null then
    update public.conversations
       set origen = p_origen
     where id = p_conversation_id and org_id = p_org_id;
  end if;

  return v_primero;
end $$;

revoke all on function public.guardar_origen(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function public.guardar_origen(uuid, uuid, uuid, jsonb) to service_role;

-- ── Cuánto trae cada campaña ───────────────────────────────────────────────
--
-- La pregunta que de verdad se hace quien paga los anuncios. Se ordena por
-- leads, pero la columna que importa es `pasaron_a_persona`: un anuncio que
-- trae cien curiosos vale menos que uno que trae diez conversaciones reales.
create or replace view public.leads_por_campana as
select
  ct.org_id,
  ct.origen->>'anuncio_id'  as anuncio_id,
  ct.origen->>'titular'     as titular,
  ct.origen->>'tipo'        as tipo,
  count(*)                                                     as leads,
  count(*) filter (where cv.handoff_requested_at is not null)  as pasaron_a_persona,
  min(ct.created_at)                                           as primero,
  max(ct.created_at)                                           as ultimo
from public.contacts ct
left join public.conversations cv on cv.contact_id = ct.id
where ct.origen is not null
group by 1, 2, 3, 4;

revoke all on public.leads_por_campana from public, anon;
grant select on public.leads_por_campana to authenticated;
