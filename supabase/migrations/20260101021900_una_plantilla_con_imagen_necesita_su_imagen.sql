-- ════════════════════════════════════════════════════════════════════════════
-- Una plantilla con imagen arriba necesita saber QUÉ imagen mandar.
--
-- 2 oct 2026, en la cuenta de ventas de Demandu. La plantilla `capac` —imagen
-- de cabecera, aprobada por Meta, usada para prospectar en el evento de CAPAC—
-- no salía nunca:
--
--     (#132012) Parameter format does not match format in the created template
--
-- Su `HEADER` es de formato `IMAGE`, y Meta exige la imagen EN CADA ENVÍO.
-- Nosotros mandábamos solo el cuerpo: la palabra «header» no aparecía ni una
-- vez en todo el código que arma plantillas, ni en el motor ni en la web.
--
-- ── POR QUÉ NO SIRVE LA QUE YA TRAE LA PLANTILLA ──────────────────────────
--
-- `components[].example.header_handle[0]` existe, pero es la MUESTRA de la
-- aprobación: una dirección firmada de `scontent.whatsapp.net` con su fecha de
-- caducidad dentro (`oe=…`). Usarla para enviar funciona hoy y deja de
-- funcionar un día cualquiera, sin avisar y sin que nadie lo relacione.
--
-- Por eso la dirección de envío se guarda aparte. El FORMATO no: ese sigue
-- saliendo de `components`, que es lo que sincronizamos de Meta y es la única
-- verdad sobre cómo es la plantilla.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.whatsapp_templates
  add column if not exists encabezado_url    text,
  add column if not exists encabezado_nombre text;

comment on column public.whatsapp_templates.encabezado_url is
  'La imagen, video o documento que se manda en el encabezado. Hace falta en CADA envío de una plantilla con cabecera de archivo: sin esto Meta rechaza con #132012. El formato sale de `components`, no de aquí.';

comment on column public.whatsapp_templates.encabezado_nombre is
  'El nombre del archivo. Solo lo admite el encabezado de tipo DOCUMENT; en imagen y video Meta lo rechaza.';
