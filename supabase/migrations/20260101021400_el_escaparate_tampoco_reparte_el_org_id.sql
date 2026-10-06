-- H-02 (segunda mitad) · El escaparate tampoco reparte el `org_id`
--
-- APLICADA EN PRODUCCIÓN el 19 sep 2026 como `el_escaparate_tampoco_reparte_el_org_id`
-- (versión 20260919193242). Ver la nota de la 0133 sobre por qué el archivo
-- llega después que la aplicación.
--
-- Cerrar `tiendas` sin cerrar `tienda_productos` no cierra nada: la misma
-- llave sale por la otra puerta. Medido antes de tocar: un visitante sin
-- cuenta ve EXACTAMENTE dos tablas en toda la base — `tiendas` (2 filas) y
-- `tienda_productos` (96 filas) — y de la segunda podía leer `org_id`.
--
-- QUÉ NECESITA EL ESCAPARATE, leído de `src/app/t/[slug]/page.tsx:84`:
--   id, nombre, descripcion, categoria, precio, precio_anterior, stock,
--   imagen_url, variedades
-- más `tienda_id` (filtra con `.eq`) y `orden` (ordena con `.order`).
-- PostgREST exige permiso de lectura sobre la columna por la que se filtra o
-- se ordena, así que esas dos van aunque no se pinten.
--
-- `oculto` NO hace falta concederlo: lo usa la política de RLS, y la
-- expresión de una política no depende de los permisos de columna de quien
-- llama. Se comprobó que los 96 productos siguen viéndose.
--
-- Fuera quedan `org_id`, `created_at` y `updated_at`.

revoke select on public.tienda_productos from anon;

grant select (
  id, tienda_id, nombre, descripcion, categoria,
  precio, precio_anterior, stock, orden, imagen_url, variedades
) on public.tienda_productos to anon;
