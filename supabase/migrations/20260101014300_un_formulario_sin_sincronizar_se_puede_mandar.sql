-- UN FORMULARIO QUE NADIE SINCRONIZÓ TAMBIÉN SE TIENE QUE PODER MANDAR.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL FALLO. Meta rechaza un formulario en BORRADOR si se manda como si
-- estuviera publicado, y lo hace con «(#131009) Parameter value is not valid»,
-- que no dice absolutamente nada. Todo formulario recién hecho está en
-- borrador: nadie publica antes de probar.
--
-- El motor ya sabía esquivarlo, pero preguntándole a `whatsapp_forms` — la
-- tabla que se llena al SINCRONIZAR desde la pantalla de Formularios. Y ahí
-- está el agujero: si el cliente creó su formulario directamente en Meta y solo
-- pegó el id en el bloque, esa tabla no tiene nada, el motor asume «publicado»
-- y Meta lo rechaza.
--
-- Pasó de verdad el 6 de septiembre con la encuesta de satisfacción: el flujo
-- `1992131281655061` estaba en la caché de pantallas —o sea, el motor SÍ había
-- hablado con Meta sobre él— y no estaba en `whatsapp_forms`. Al cliente le
-- salió «No pude abrirte el formulario 😕» al final de cada demo agendada.
--
-- ── SE LE PREGUNTA A META, QUE ES QUIEN LO SABE ───────────────────────────
--
-- El estado se guarda junto a la pantalla, en la misma caché y en la misma
-- llamada: ya se le pedían los assets al flujo, ahora también su estado. Una
-- consulta más la primera vez y ninguna las siguientes.
--
-- No se pone `not null`: nulo significa «todavía no se lo hemos preguntado», y
-- eso es distinto de «publicado». Es la misma lección de la zona horaria (ver
-- la 0102): un valor por defecto que parece correcto es peor que no tener uno.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.wa_flow_cache
  add column if not exists estado text,
  add column if not exists visto_at timestamptz not null default now();

comment on column public.wa_flow_cache.estado is
  'DRAFT o PUBLISHED, leído de Meta. Un formulario en borrador SOLO se puede mandar en modo borrador: mandarlo como publicado lo rechaza Meta con «(#131009) Parameter value is not valid», que no dice nada. Antes esto salía de whatsapp_forms, y un formulario que nadie sincronizó no estaba ahí.';
