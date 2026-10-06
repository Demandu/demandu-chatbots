-- 0021 · Que los visitantes web se puedan distinguir
--
-- QUÉ PASABA: todo visitante del chat web se llamaba "Visitante web". En la
-- Bandeja y en el Embudo salían tres renglones idénticos y el agente no tenía
-- forma de saber cuál era cuál — ni de nombrarlos en voz alta con un compañero.
--
-- Ahora cada sesión trae un código corto y estable: "Visitante 2F7A". Sale de
-- md5 de su propio identificador de sesión, el mismo cálculo que hace
-- `nombreDeVisitante()` en src/app/api/webchat/route.ts, para que un contacto
-- viejo y uno nuevo se nombren igual.
--
-- Solo toca los que siguen con el nombre genérico o sin nombre: si un agente ya
-- lo rebautizó, ese nombre se respeta. (En el mismo cambio, la ruta del canal
-- web dejó de usar `upsert`, que reescribía el nombre en cada mensaje y
-- deshacía lo que el agente hubiera puesto.)

update contacts
   set name = 'Visitante ' || upper(right(md5(external_id), 4))
 where channel = 'webchat'
   and external_id is not null
   and coalesce(trim(name), '') in ('', 'Visitante web');
