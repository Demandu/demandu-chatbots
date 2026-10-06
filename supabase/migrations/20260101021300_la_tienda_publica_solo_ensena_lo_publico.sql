-- H-02 · La tienda pública solo enseña lo público
--
-- APLICADA EN PRODUCCIÓN el 19 sep 2026 como `la_tienda_publica_solo_ensena_lo_publico`
-- (versión 20260919191951). Este archivo es su copia en el repositorio: se
-- escribió después, y esa es justamente la deuda que H-05 nombra — una base
-- que no se puede reconstruir desde el repositorio no tiene entorno de pruebas
-- ni recuperación. Al aplicarla en una base nueva hace lo mismo; sobre esta ya
-- está hecha.
--
-- `anon` podía leer las ONCE columnas de `tiendas`. El documento decía que
-- eran dos (`org_id` y `bot_id`); medido, eran todas. Reproducido sin sesión:
-- 2 tiendas, 2 `org_id`, 2 `bot_id`.
--
-- Por sí solo es enumeración. El problema es que ese par de llaves es
-- exactamente lo que necesitaban los hallazgos 1.2 y 1.3 de la auditoría del
-- 8 de septiembre: con un `org_id` y un `bot_id` en la mano, varias funciones
-- y tablas dejan de ser anónimas.
--
-- QUÉ NECESITA DE VERDAD EL ESCAPARATE. Se leyó el código antes de tocar:
-- `src/app/t/[slug]/page.tsx` pide con la llave anónima
-- `id, nombre, slug, activa, config` y nada más. Las otras lecturas de
-- `tiendas` que sirven al público —la página de pago y `direccionAnterior`—
-- usan `createAdminClient()`, o sea la llave de servicio, que no pasa por
-- estos permisos.
--
-- `config` se queda a propósito: son título, colores, logo, banners y datos
-- de contacto. Es lo que el visitante ve pintado en la pantalla; esconderlo
-- sería esconder la tienda de sí misma.
--
-- Mismo patrón que ya llevan `whatsapp_channels`, `integrations` y
-- `tienda_cobros`: revocar la tabla entera y conceder columna por columna.
-- La política `tiendas_publicas` (solo tiendas activas) sigue intacta; esto
-- es la otra capa, la de permisos.
--
-- `authenticated` NO se toca: su política `tiendas_org` ya lo limita a su
-- propia organización, y el panel necesita `bot_id` y las fechas.

revoke select on public.tiendas from anon;

grant select (id, nombre, slug, activa, config) on public.tiendas to anon;
