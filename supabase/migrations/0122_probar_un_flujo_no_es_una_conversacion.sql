-- Probar un flujo no es una conversación con un cliente.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- «Probar flujo» deja de simular el flujo con un motor de juguete y pasa a
-- correr EL MOTOR DE VERDAD (`runWebFlow`, el mismo del widget web y de
-- Instagram). Eso significa que la prueba necesita una conversación real donde
-- guardar el estado del flujo.
--
-- Y una conversación real aparece en la Bandeja, cuenta en Resultados y mete
-- un contacto en el CRM. El dueño acaba con «Visitante 4F2A» entre sus leads
-- por haber pulsado un botón de su propio panel.
--
-- Esta marca la separa. Lo que trae `prueba = true`:
--
--   · no sale en la Bandeja
--   · no abre recorrido en la analítica (lo salta el motor)
--   · no guarda mensajes (la ruta de prueba pasa `guardarEnBandeja: false`),
--     así que tampoco gasta del plan
--
-- Hay UNA por chatbot y se reutiliza siempre: probar veinte veces no deja
-- veinte conversaciones muertas.
--
-- El índice parcial es el que mantiene rápida la consulta de la Bandeja ahora
-- que lleva un filtro más.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists prueba boolean not null default false;

create index if not exists conversations_prueba_fuera
  on public.conversations (org_id, last_message_at desc)
  where prueba = false;

comment on column public.conversations.prueba is
  'La conversacion la creo el boton «Probar flujo» del panel. No es un cliente: no sale en la Bandeja ni cuenta en Resultados.';
