-- Poder conciliar un cobro con Yappy más tarde.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- APARECIÓ UNA SEGUNDA API. El botón de pago y las «APIs de Yappy» del portal
-- comercial son cosas distintas: la segunda tiene consulta de movimientos
-- (`/v1/movement/history` y `/v1/movement/{transaction-id}`), que es
-- exactamente lo que hacía falta para resolver un pago del que nunca llegó el
-- aviso.
--
-- ESTA MIGRACIÓN NO LA USA TODAVÍA. Hace la única parte que, si no se hace
-- ahora, no se puede hacer nunca: GUARDAR EL IDENTIFICADOR DE LA TRANSACCIÓN.
-- Yappy nos lo da al crear la orden y hasta hoy solo viajaba al navegador y se
-- perdía. Sin él, los pedidos de esta semana quedarían fuera de cualquier
-- conciliación futura — y ese dato no se puede recuperar después.
--
-- Y APARECIÓ UN ESTADO QUE NO TENÍAMOS: «anulada» (REVERSED). Un pago puede
-- deshacerse DESPUÉS de haberse ejecutado. Sin este estado, un cobro devuelto
-- se quedaría diciendo «Pagado» para siempre.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.pedidos
  add column if not exists pago_transaccion text;

alter table public.pedidos drop constraint if exists pedidos_pago_chk;
alter table public.pedidos
  add constraint pedidos_pago_chk
  check (pago in ('sin_cobro','pendiente','pagado','rechazado','cancelado','expirado','anulado'));

create index if not exists pedidos_pago_transaccion_idx
  on public.pedidos (pago_transaccion) where pago_transaccion is not null;

comment on column public.pedidos.pago_transaccion is
  'El id de transacción que devuelve Yappy al crear la orden. Se guarda para poder consultarla después: si no se guarda en el momento, no hay forma de recuperarlo.';
