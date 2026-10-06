-- H-10 · Una tabla sin políticas tampoco reparte permisos
--
-- APLICADA EN PRODUCCIÓN el 19 sep 2026 como
-- `una_tabla_sin_politicas_tampoco_reparte_permisos` (versión 20260919200240).
-- Ver la nota de la 0133.
--
-- De las 12 tablas con RLS activo y SIN políticas, diez no tienen ningún
-- GRANT: esa es la denegación de verdad, en dos capas. `correos_enviados` y
-- `correos_plantillas` rompían el patrón con permisos COMPLETOS para `anon` y
-- `authenticated`: SELECT, INSERT, UPDATE, DELETE y TRUNCATE.
--
-- HOY NO FILTRAN, y se comprobó: como `anon`, las dos devuelven 0 filas porque
-- el RLS deniega sin políticas. El riesgo es el día que alguien añada una
-- política permisiva «para probar» o apague el RLS un momento: en ese instante
-- quedan abiertas a borrado y truncado SIN SESIÓN. Es una mina esperando.
--
-- QUÉ SE PUEDE ROMPER: nada. Todo lo que hoy funciona usa la llave de
-- servicio, que no pasa por estos permisos:
--   · `src/app/superadmin/correos/page.tsx:33`  → createAdminClient()
--   · `src/app/superadmin/correos/acciones.ts`  → createAdminClient()
--   · `src/lib/correo/enviar.ts` y `guardadas.ts` reciben ese mismo cliente.
-- Y no podría ser de otra forma: con RLS activo y cero políticas, una llamada
-- con sesión ya fallaba antes de esta migración.

revoke all on public.correos_enviados   from anon, authenticated;
revoke all on public.correos_plantillas from anon, authenticated;
