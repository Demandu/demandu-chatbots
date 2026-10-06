-- Cobrar con Yappy.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DOS COSAS QUE NO ESTABAN Y HACEN FALTA:
--
-- 1. EL DOMINIO Y EL AMBIENTE del comercio. Yappy firma cada aviso de pago con
--    el dominio dentro, y no acepta un pago que venga de otro. Además tiene un
--    entorno de pruebas: sin poder elegirlo, la única forma de comprobar que la
--    configuración sirve sería cobrarse a uno mismo de verdad.
--
-- 2. EL CÓDIGO DEL PEDIDO. Yappy devuelve el pago con un `orderId` de quince
--    caracteres como mucho, así que no cabe un uuid; y el número del pedido no
--    sirve porque se repite entre tiendas —el aviso no dice de qué tienda es—.
--    Hace falta un código corto y único en toda la plataforma.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.tienda_cobros
  add column if not exists dominio text not null default '',
  -- Arranca en pruebas A PROPÓSITO: nadie debería cobrarle a un cliente real
  -- con una configuración que todavía no ha visto funcionar.
  add column if not exists ambiente text not null default 'prueba',
  add column if not exists validado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tienda_cobros_ambiente_chk') then
    alter table public.tienda_cobros
      add constraint tienda_cobros_ambiente_chk check (ambiente in ('prueba','produccion'));
  end if;
end $$;

alter table public.pedidos
  -- Único en TODA la plataforma, no por tienda: es lo que Yappy nos devuelve
  -- para saber qué pedido se pagó, y llega sin decir de qué tienda viene.
  add column if not exists codigo text,
  -- Separado del estado del pedido a propósito: un pedido puede estar pagado y
  -- sin preparar, o entregado y cobrado en efectivo. Meterlos en la misma
  -- columna obliga a inventar estados como «entregado_pero_no_pagado».
  add column if not exists pago text not null default 'sin_cobro',
  add column if not exists pagado_en timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pedidos_pago_chk') then
    alter table public.pedidos
      add constraint pedidos_pago_chk
      check (pago in ('sin_cobro','pendiente','pagado','rechazado','cancelado','expirado'));
  end if;
end $$;

create unique index if not exists pedidos_codigo_idx on public.pedidos (codigo) where codigo is not null;

comment on column public.tienda_cobros.dominio is
  'El dominio registrado en el panel de Yappy. Entra en la firma del aviso de pago: si no coincide, el aviso se rechaza.';
comment on column public.pedidos.codigo is
  'Código corto y único con el que Yappy devuelve el pago. No es el número del pedido: ese se repite entre tiendas.';
comment on column public.pedidos.pago is
  'El cobro va aparte del estado del pedido: se puede estar entregado y cobrado en efectivo, o pagado y sin preparar.';
