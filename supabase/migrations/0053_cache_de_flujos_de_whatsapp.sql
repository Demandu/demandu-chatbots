-- Nombre de la primera pantalla de cada Flujo de WhatsApp.
--
-- Meta exige `flow_action_payload.screen` para abrir un flujo con `navigate`,
-- y ese dato no está en el bloque del constructor: solo se guarda el id del
-- flujo. Hay que preguntárselo a Meta leyendo el JSON del flujo — dos viajes.
--
-- Sin esta caché, esos dos viajes ocurrirían en CADA mensaje enviado, delante
-- del cliente y sumando segundos a la respuesta. El nombre de la primera
-- pantalla no cambia salvo que el cliente rehaga el flujo, así que se guarda.
create table if not exists public.wa_flow_cache (
  flow_id      text primary key,
  screen       text not null,
  guardado_at  timestamptz not null default now()
);

comment on table public.wa_flow_cache is
  'Primera pantalla de cada Flujo de WhatsApp, para no preguntárselo a Meta en '
  'cada envío. Si un cliente rehace su flujo y cambia la primera pantalla, se '
  'borra su fila y se vuelve a descubrir sola.';

alter table public.wa_flow_cache enable row level security;
revoke all on public.wa_flow_cache from anon, authenticated;
-- Solo el motor, con la llave de servicio. No hay nada de ningún cliente aquí,
-- pero tampoco hay razón para que nadie más lo lea.
