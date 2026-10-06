-- ARREGLO DE UN HUECO QUE ABRIÓ LA MIGRACIÓN 0044.
--
-- Antes NO había ninguna política de UPDATE sobre `memberships`, así que RLS
-- lo bloqueaba todo y los permisos de columna sueltos daban igual. Al añadir
-- la política «apagar mi cambio de contrasena» se abrió la puerta — y una
-- política de UPDATE deja tocar TODAS las columnas sobre las que el rol tenga
-- permiso, no solo la que menciona el `with check`.
--
-- `authenticated` tenía UPDATE sobre todas las columnas, incluidas `role` y
-- `permisos`. Con la política nueva, cualquier agente podía hacer:
--
--     update memberships set role = 'owner' where user_id = auth.uid();
--
-- y ascenderse a dueño de la organización de su jefe. Pasaba el `using` y
-- pasaba el `with check`, porque ninguno de los dos mira `role`.
--
-- La política sola no basta: hay que quitar el permiso a nivel de COLUMNA.
-- Es la misma trampa de siempre en este proyecto — los permisos anchos por
-- defecto — pero por el lado de las columnas en vez del de EXECUTE.
--
-- Comprobado contra la base haciéndose pasar por un usuario real:
--   1. apagar su propia bandera .......... permitido  (la función sigue viva)
--   2. ascenderse a dueño ................ bloqueado
--   3. cambiarse sus permisos ............ bloqueado
--   4. tocar la fila de otra persona ..... 0 filas (lo filtra el `using`)
-- Datos de prueba revertidos con un `raise exception` deliberado.
revoke update on public.memberships from anon, authenticated;

-- Lo único que el propio usuario puede tocar de su membresía.
grant update (debe_cambiar_contrasena) on public.memberships to authenticated;

-- Todo lo demás (rol, permisos, org) sigue pasando solo por las funciones
-- `persona_guardar_acceso` y `persona_borrar`, que llevan sus resguardos.
