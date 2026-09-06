-- 0029 · Retirar las funciones de la 0027
--
-- La 0027 resolvió leer y cambiar el equipo mirando `memberships`. Horas
-- después se decidió unir agentes y accesos en una sola lista de personas, y
-- la 0028 rehízo lo mismo partiendo de `team_members`. Estas dos quedaron sin
-- usar.
--
-- Se retiran en vez de dejarlas ahí: una función que nadie llama es una trampa
-- para el próximo que lea el esquema y crea que es la buena.

drop function if exists public.equipo_de_la_org();
drop function if exists public.equipo_actualizar(uuid, text, jsonb);
