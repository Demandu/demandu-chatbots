-- Los complementos también viven en Stripe, como los planes.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE PASABA. Los PLANES se sincronizan con Stripe desde que existen: al
-- guardarlos en superadmin se crea el producto y el precio, y sus identificadores
-- quedan en la fila (`syncPlanToStripe`). Los COMPLEMENTOS no: el cobro arma el
-- precio al vuelo, con `price_data`, en cada compra.
--
-- Funciona, y por eso nadie lo notó. Pero:
--
--   · CADA COMPRA CREA UN PRODUCTO NUEVO EN STRIPE. Veinte clientes comprando la
--     tienda son veinte productos distintos llamados «Tienda en WhatsApp». No
--     hay forma de ver cuánto factura la tienda como producto.
--   · SUBIR EL PRECIO NO SE PUEDE HACER EN UN SITIO. Quien ya compró sigue con
--     su producto viejo, y los informes de Stripe no cuadran con nada.
--   · Y NO HAY PANTALLA para crear un complemento: hasta hoy el único camino era
--     escribir el `insert` a mano, que es exactamente como entró el de la tienda.
--
-- ── LO QUE NO SE ROMPE ────────────────────────────────────────────────────
--
-- Las columnas nacen nulas y el cobro sigue funcionando igual mientras lo estén:
-- si un complemento no tiene precio en Stripe, se arma al vuelo como siempre.
-- Así nadie se queda sin poder comprar mientras se sincroniza lo que ya existe.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.addons
  add column if not exists stripe_product_id text,
  add column if not exists stripe_price_id   text,
  add column if not exists stripe_synced_at  timestamptz,
  -- EL ERROR SE GUARDA, NO SE PIERDE. Si Stripe falla al guardar, el
  -- complemento se guarda igual y queda marcado para reintentar: perder el
  -- trabajo del equipo por una caída de un tercero no es una opción.
  add column if not exists stripe_error      text;

comment on column public.addons.stripe_price_id is
  'Precio en Stripe. Mientras sea nulo, el cobro arma el precio al vuelo como antes.';
comment on column public.addons.stripe_error is
  'Por qué falló la última sincronización. Nulo = todo bien.';

-- ── Quién puede tocar el catálogo ──────────────────────────────────────────
--
-- LEER SÍ, ESCRIBIR NO. Cualquier cliente autenticado necesita leer los
-- complementos para verlos en su pantalla de plan; escribirlos es de Demandu.
-- Sin esta política, la llave anónima con una sesión cualquiera podría
-- cambiarse el precio de la tienda a cero antes de comprarla.
--
-- (El cobro no se fía de esto: `/api/checkout` relee el precio de la base con la
-- llave de servicio. Esto es la segunda cerradura, no la única.)
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'addons' and cmd = 'ALL'
       and policyname = 'addons_solo_demandu_escribe'
  ) then
    create policy addons_solo_demandu_escribe on public.addons
      for all
      using (public.is_platform_admin())
      with check (public.is_platform_admin());
  end if;
end $$;
