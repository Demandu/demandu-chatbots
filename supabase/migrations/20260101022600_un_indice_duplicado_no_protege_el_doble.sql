-- ════════════════════════════════════════════════════════════════════════════
-- SIN APLICAR. Tiene que pegarla Alex en el editor SQL de Supabase.
--
-- `memberships` tiene DOS índices únicos idénticos sobre `(org_id, user_id)`:
-- `memberships_org_id_user_id_key` (el que respalda la restricción UNIQUE de la
-- tabla) y `memberships_org_user_uidx` (uno suelto, creado después).
--
-- Dos índices iguales no protegen el doble: protegen lo mismo y se escriben los
-- dos en cada alta, baja y cambio. Se queda el de la restricción, porque ese no
-- se puede quitar sin tocar la restricción — y la restricción es la que de
-- verdad impide que una persona esté dos veces en la misma cuenta.
--
-- ⚠️ POR QUÉ NO SE APLICÓ DESDE AQUÍ: el MCP de Supabase pide confirmación
--    humana para las sentencias destructivas. `drop index` es una de ellas, y
--    sin nadie que confirme se agota a los 180 s. Ya pasó con `drop view` el 3
--    de octubre; ahora está confirmado también para `drop index`.
-- ════════════════════════════════════════════════════════════════════════════

drop index if exists public.memberships_org_user_uidx;
