-- La misma decisión que `src/lib/permisos.ts`, escrita en Postgres.
--
-- NO ES DUPLICACIÓN POR DESCUIDO: la base tiene que poder decidir igual que la
-- interfaz para sostener políticas de RLS sin reescribir el criterio en dos
-- idiomas. Si se cambia una, HAY QUE CAMBIAR LA OTRA.
--
-- Cambios de esta versión:
--   · nace 'coordinador' — todo menos lo de desarrollo
--   · 'developer' pierde 'resultados': el rol es chatbots + Lana IA +
--     conexiones, ni más ni menos, tal como se pidió
create or replace function public.auth_puede(p_permiso text)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare r text; ajustes jsonb; base text[];
begin
  select m.role::text, coalesce(m.permisos, '{}'::jsonb)
    into r, ajustes
    from memberships m
   where m.user_id = auth.uid()
   limit 1;

  if r is null then return false; end if;
  if r = 'owner' then return true; end if;

  -- Lo que el dueño tocó a mano manda sobre lo que trae el rol.
  if ajustes ? p_permiso then
    return coalesce((ajustes ->> p_permiso)::boolean, false);
  end if;

  base := case r
    when 'admin'       then array['chatbots','conversaciones','embudo','contactos','resultados','ia','config','equipo','plan','conexiones','envios','borrar']
    when 'coordinador' then array['conversaciones','embudo','contactos','resultados','config','equipo','plan','envios','borrar']
    when 'agent'       then array['conversaciones','embudo','contactos']
    when 'developer'   then array['chatbots','ia','conexiones']
    else                    array['embudo','contactos','resultados']
  end;

  return p_permiso = any(base);
end $function$;

revoke execute on function public.auth_puede(text) from public, anon;
grant execute on function public.auth_puede(text) to authenticated, service_role;
