-- ════════════════════════════════════════════════════════════════════════════
-- Un teléfono, una persona.
--
-- APLICADA EL 3 DE OCTUBRE DE 2026. La limpieza y el índice van JUNTOS en la
-- misma transacción a propósito: si el índice no se puede crear, la transacción
-- se deshace y el borrado tampoco queda. No existe el estado intermedio en el
-- que se hayan borrado fichas y la puerta siga abierta.
--
-- 25 sep 2026, CertifiedPrime: el mismo «Darwin Bracho», mismo teléfono, mismo
-- correo, QUINCE VECES, creado en 43 segundos. Ninguno con conversación,
-- etiquetas ni grupo: quince fichas vacías idénticas. Quedó una.
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
-- Es por donde llega casi todo, y es lo que manda WhatsApp.
--
-- LO QUE ESTE ÍNDICE **NO** CAZA, y conviene saberlo: compara el teléfono como
-- texto. El 3 oct, Casas Pacíficas tenía el mismo número guardado dos veces,
-- `50760170269` y `60170269` —con y sin prefijo de país—, y para el índice son
-- dos personas distintas. Juntar eso es normalizar el teléfono al guardarlo,
-- que es otro trabajo y toca el motor. Queda apuntado, no hecho.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. LA LIMPIEZA, CON LOS CANDADOS PUESTOS ───────────────────────────────
-- Se queda la más antigua de cada teléfono. Las demás solo se borran si NO
-- tienen nada colgando. Se miran LAS CATORCE tablas que apuntan a un contacto:
-- las dos últimas (`drip_sends` y `campaign_recipients`) no tienen clave
-- foránea hacia `contacts`, así que nadie habría avisado. Y de las doce que sí
-- la tienen, cinco borran en cascada y siete dejan el hueco en NULL: en
-- cualquiera de los dos casos el daño ya estaría hecho cuando se notara.
with d as (
  select id,
         row_number() over (partition by org_id, phone order by created_at, id) as n
    from public.contacts
   where phone is not null and phone <> ''
),
sobrantes as (select id from d where n > 1)
delete from public.contacts c
 using sobrantes s
 where c.id = s.id
   and not exists (select 1 from public.conversations       x where x.contact_id  = c.id)
   and not exists (select 1 from public.opportunities       x where x.contact_id  = c.id)
   and not exists (select 1 from public.contact_notes       x where x.contact_id  = c.id)
   and not exists (select 1 from public.citas               x where x.contact_id  = c.id)
   and not exists (select 1 from public.drip_subscriptions  x where x.contact_id  = c.id)
   and not exists (select 1 from public.drip_sends          x where x.contact_id  = c.id)
   and not exists (select 1 from public.llamadas            x where x.contact_id  = c.id)
   and not exists (select 1 from public.pedidos             x where x.contacto_id = c.id)
   and not exists (select 1 from public.permisos_de_llamada x where x.contact_id  = c.id)
   and not exists (select 1 from public.reservas            x where x.contact_id  = c.id)
   and not exists (select 1 from public.respuestas_de_flujo x where x.contact_id  = c.id)
   and not exists (select 1 from public.sheets_cola         x where x.contact_id  = c.id)
   and not exists (select 1 from public.tasks               x where x.contact_id  = c.id)
   and not exists (select 1 from public.campaign_recipients x where x.contact_id  = c.id);

-- ── 2. EL ÍNDICE ───────────────────────────────────────────────────────────
-- Parcial a propósito:
--   · `phone is not null` — un contacto de Instagram no tiene teléfono y no
--     debe estorbar a otro que tampoco.
--   · `phone <> ''` — y ESTO es lo que le faltaba a la primera versión. En
--     Postgres dos NULL no son iguales, pero dos cadenas vacías SÍ. Un
--     formulario que guarde '' en vez de NULL habría hecho que el segundo
--     contacto sin teléfono no se pudiera crear: el candado habría mordido a
--     quien no tocaba. El 3 oct había 10 contactos sin teléfono y los 10 eran
--     NULL, así que entró sin romper nada — pero el agujero estaba abierto.
create unique index if not exists contacts_un_telefono_una_persona
  on public.contacts (org_id, phone)
  where phone is not null and phone <> '';

comment on index public.contacts_un_telefono_una_persona is
  'Un telefono, una persona por cuenta. El indice de external_id no protege a WhatsApp ni a los contactos escritos a mano: ahi external_id es NULL, y un NULL nunca es igual a otro NULL. Excluye tambien la cadena vacia, porque dos cadenas vacias si son iguales y bloquearian a dos contactos legitimos sin telefono.';
