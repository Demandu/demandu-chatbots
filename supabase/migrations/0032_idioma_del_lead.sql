-- 0032 · En qué idioma escribe el lead
--
-- El traductor ya existía pero solo en un sentido: le traducía al agente lo que
-- LLEGABA. Lo que el agente escribe seguía saliendo en español, así que con un
-- cliente que escribe en inglés la conversación quedaba a medias.
--
-- POR QUÉ SE GUARDA Y NO SE DETECTA CADA VEZ: detectar en cada mensaje cuesta
-- una llamada más a Google y, peor, es inestable — con textos cortos ("ok",
-- "gracias") la detección falla y cambiaría de idioma a media conversación. Se
-- detecta una vez con lo que ya escribió el lead, se guarda, y el agente puede
-- corregirlo si ve que se equivocó.
alter table conversations
  add column if not exists idioma_lead text;

comment on column conversations.idioma_lead is
  'Idioma en el que escribe el lead (código ISO). Se detecta con sus mensajes y el agente puede corregirlo. Sirve para traducir lo que el agente responde.';
