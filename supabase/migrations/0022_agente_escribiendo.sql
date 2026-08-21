-- 0022 · "El agente está escribiendo…" en el chat web
--
-- Cuando un cliente pide hablar con una persona y se queda mirando la pantalla,
-- el silencio se siente eterno. El bot contestaba al instante; un humano tarda
-- veinte o treinta segundos en escribir, y sin ninguna señal el visitante cree
-- que lo dejaron plantado y se va.
--
-- Basta con una marca de tiempo: la Bandeja la refresca mientras el agente
-- teclea y el widget considera que sigue escribiendo si es reciente. No hace
-- falta websockets ni una tabla de presencia — el widget ya pregunta cada 4
-- segundos por mensajes nuevos, así que viaja en esa misma consulta, sin ni una
-- petición extra.
--
-- Se guarda en la conversación y no en el agente porque lo que importa es "en
-- ESTE chat hay alguien escribiendo", no quién.

alter table conversations
  add column if not exists agent_typing_at timestamptz;

comment on column conversations.agent_typing_at is
  'Última vez que un agente tecleó en esta conversación. El chat web muestra los tres puntos si es de hace menos de 8 segundos.';
