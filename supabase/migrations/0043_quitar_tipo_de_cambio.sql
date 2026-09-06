-- Se quita: la conversión a moneda local la hace Stripe con Adaptive Pricing,
-- no nosotros. Mantener una tabla de tipos de cambio propia era duplicar —
-- y peor: dos números distintos para lo mismo (el nuestro de referencia y el
-- de Stripe al cobrar) es exactamente la clase de detalle que hace que un
-- cliente sienta que le cambiaron el precio.
--
-- La tabla llegó a existir unas horas el 23 ago. Este archivo la retira; si
-- alguien clona el repo desde cero, nunca llega a crearse.
drop table if exists public.tipos_de_cambio;
