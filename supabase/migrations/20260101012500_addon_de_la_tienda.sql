-- La Tienda en WhatsApp se vende como complemento, y se cobra por tienda.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ ES UN COMPLEMENTO Y NO PARTE DEL PLAN. La tienda no la quiere todo el
-- mundo: hay clientes que solo atienden por chat y no venden productos. Meterla
-- en el plan subiría el precio a todos por algo que la mitad no usa, y bajaría
-- la conversión de lo que de verdad vende la plataforma, que es el chatbot.
--
-- POR TIENDA, NO POR CUENTA. Una cadena de restaurantes tiene un local por
-- sucursal, y cada uno lleva su propio inventario, su propio Yappy y sus
-- propios pedidos — o sea, cada uno usa la plataforma entera. Cobrar una sola
-- vez por cinco locales sería regalar cuatro.
--
-- UNA TIENDA APAGADA NO SE COBRA. `tiendas.activa` ya existe y el negocio la
-- apaga en vacaciones o cuando cierra un local. Seguir cobrando una tienda
-- apagada es la clase de cargo que termina en una devolución y en una baja.
-- ─────────────────────────────────────────────────────────────────────────────

insert into public.addons (code, name, description, unit, price, currency, recurring, sort, active, is_quote)
values (
  'tienda',
  'Tienda en WhatsApp',
  'Tu catálogo, tus pedidos y tu cobro por Yappy dentro de WhatsApp. Sin comisión por venta. Se cobra por cada tienda activa.',
  'tienda',
  59.00,
  'USD',
  true,
  0,   -- PRIMERO EN LA LISTA. Es el complemento con más margen y el que más
       -- cambia lo que el cliente puede hacer; los paquetes de mensajes son
       -- consumibles y se compran solos cuando hacen falta.
  true,
  false
)
on conflict (code) do update set
  name        = excluded.name,
  description = excluded.description,
  unit        = excluded.unit,
  price       = excluded.price,
  recurring   = excluded.recurring,
  sort        = excluded.sort,
  active      = excluded.active;

-- ── Cuántas tiendas se le cobran a esta cuenta ─────────────────────────────
--
-- VA EN LA BASE porque la factura no puede depender de que una pantalla haga
-- bien la cuenta. Aquí se cuenta lo que hay, y lo mismo sirve para el panel del
-- cliente, para el cobro y para superadmin.
create or replace function public.tiendas_que_se_cobran(p_org_id uuid)
returns integer
language sql
stable security definer
set search_path = public
as $fn$
  select count(*)::int
    from tiendas t
   where t.org_id = p_org_id
     and t.activa;
$fn$;

comment on function public.tiendas_que_se_cobran is
  'Tiendas ACTIVAS de una cuenta. Es lo que se cobra: una tienda apagada no se cobra.';

grant execute on function public.tiendas_que_se_cobran(uuid) to authenticated, service_role;
