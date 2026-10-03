-- ════════════════════════════════════════════════════════════════════════════
-- Un teléfono, una persona.
--
-- ⚠️ ESTA MIGRACIÓN NO SE PUEDE APLICAR CON DUPLICADOS DELANTE. Hay que juntar
--    primero los que ya existen (ver el bloque de limpieza, comentado abajo).
--
-- 25 sep 2026, CertifiedPrime: el mismo «Darwin Bracho», mismo teléfono, mismo
-- correo, QUINCE VECES, creado en 43 segundos. Ninguno con conversación,
-- etiquetas ni grupo: quince fichas vacías idénticas.
--
-- ── POR QUÉ EL ÍNDICE QUE YA HABÍA NO SERVÍA ──────────────────────────────
--
-- `contacts_org_id_channel_external_id_key` es único sobre
-- `(org_id, channel, external_id)`. Para un contacto que llega de Instagram o
-- de Messenger eso funciona, porque `external_id` es su identificador.
--
-- Pero para WhatsApp y para cualquier contacto escrito a mano, `external_id`
-- es NULL — y **en Postgres un NULL nunca es igual a otro NULL**. Un índice
-- único no impide dos filas con NULL: no las compara siquiera. O sea que ese
-- índice no estorbaba ni una sola vez a los contactos que de verdad se repiten.
--
-- ── LO QUE IDENTIFICA A UNA PERSONA AQUÍ ES SU TELÉFONO ───────────────────
--
-- Es por donde llega casi todo, y es lo que manda WhatsApp. Se guarda en
-- dígitos y se compara en dígitos: «+507 6017-0269» y «50760170269» son el
-- mismo número, y comparándolos como texto son dos personas distintas.
--
-- El índice es PARCIAL (`where phone is not null`) a propósito: un contacto de
-- Instagram no tiene teléfono y no debe estorbar a otro que tampoco.
-- ════════════════════════════════════════════════════════════════════════════

-- ── LIMPIEZA PREVIA, A MANO Y MIRANDO ──────────────────────────────────────
-- No va automática: borrar fichas de clientes es de un solo sentido. Se
-- comprueba primero que las sobrantes no tengan nada colgando y se ejecuta
-- aparte, con el resultado a la vista.
--
--   with d as (
--     select id, row_number() over (partition by org_id, phone order by created_at) as n
--     from contacts where phone is not null
--   )
--   delete from contacts c using d
--    where c.id = d.id and d.n > 1
--      and not exists (select 1 from conversations x where x.contact_id = c.id)
--      and not exists (select 1 from opportunities x where x.contact_id = c.id)
--      and not exists (select 1 from contact_notes x where x.contact_id = c.id)
--      and not exists (select 1 from campaign_recipients x where x.contact_id = c.id)
--      and not exists (select 1 from citas x where x.contact_id = c.id);

create unique index if not exists contacts_un_telefono_una_persona
  on public.contacts (org_id, phone)
  where phone is not null;

comment on index public.contacts_un_telefono_una_persona is
  'Un telefono, una persona por cuenta. El indice de external_id no protege a WhatsApp ni a los contactos escritos a mano: ahi external_id es NULL, y un NULL nunca es igual a otro NULL.';
