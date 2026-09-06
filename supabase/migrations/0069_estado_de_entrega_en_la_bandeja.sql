-- Casar el aviso de entrega de Meta con el mensaje de la Bandeja.
--
-- POR QUÉ HACE FALTA ESTE ÍNDICE. Cuando Meta avisa de que un mensaje no se
-- pudo entregar, lo único que manda es su identificador (`wamid`). El motor lo
-- busca ahora en `messages` por `payload->>'wamid'`, y sin índice eso es un
-- recorrido de la tabla ENTERA por cada aviso — y los avisos llegan con cada
-- «enviado», «entregado» y «leído» de cada mensaje de cada cliente. Con el
-- volumen de esta cuenta, eso se nota rápido.
--
-- ES PARCIAL A PROPÓSITO: solo los mensajes que tienen `wamid` son los que
-- alguna vez se van a buscar así. Los entrantes y los del canal web no lo
-- tienen, y meterlos en el índice sería pagar sitio y escrituras por nada.
create index if not exists messages_wamid_idx
  on public.messages ((payload->>'wamid'))
  where payload ? 'wamid';

comment on index public.messages_wamid_idx is
  'Busca el mensaje al que se refiere un aviso de entrega de Meta. Ver marcarMensajeFallido en la función whatsapp.';
