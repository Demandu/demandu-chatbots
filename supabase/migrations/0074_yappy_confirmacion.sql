-- Saber si un cobro de Yappy salió o no salió.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE DICE LA DOCUMENTACIÓN DE YAPPY, Y POR QUÉ OBLIGA A ESTO:
--
-- 1. El botón del banco avisa al navegador (`eventSuccess` / `eventError`),
--    PERO ESO NO ES EL DINERO: no lleva ni estado ni referencia, y si el
--    cliente cierra la pestaña no llega nunca. La única voz que cuenta es el
--    aviso firmado que Yappy manda a nuestro servidor.
--
-- 2. NO EXISTE NINGÚN ENDPOINT PARA PREGUNTAR «¿cómo quedó esta transacción?».
--    Si el aviso no llega, no hay a quién preguntarle.
--
-- 3. Y el aviso de RECHAZO puede no llegar: el rechazo es «el cliente no
--    confirmó en cinco minutos», y hay integraciones que reportan no recibir
--    nunca ese aviso. Un pedido se quedaría «pago iniciado» para siempre, que
--    en un tablero se lee como «está por pagarse» — justo lo contrario.
--
-- Sin más fuentes que esas, el reloj es la única señal que nos queda: se apunta
-- CUÁNDO empezó el cobro, y pasada la ventana de Yappy el tablero deja de decir
-- que el pago va en camino.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pedidos
  add column if not exists pago_iniciado_en timestamptz,
  -- El número de confirmación que Yappy le enseña al cliente en su app. Es lo
  -- que el cliente lee por teléfono cuando dice «yo ya pagué», así que sin
  -- guardarlo no hay forma de darle la razón ni de quitársela.
  add column if not exists pago_referencia text;

comment on column public.pedidos.pago_iniciado_en is
  'Cuándo se creó la orden en Yappy. Yappy no tiene consulta de estado, así que pasada su ventana un pago sin aviso deja de darse por vivo.';
comment on column public.pedidos.pago_referencia is
  'Número de confirmación de Yappy, el que ve el cliente en su app. Llega en el aviso y NO entra en la firma.';
