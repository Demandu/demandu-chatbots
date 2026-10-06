-- Lo que puede la cuenta de quien está usando la plataforma ahora mismo.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EXISTE PARA QUE LA PANTALLA NO TENGA QUE SABER SU PROPIO `org_id`. Y sobre
-- todo, PARA QUE NO PUEDA PREGUNTAR POR EL DE OTRO.
--
-- `org_features(p_org_id)` recibe el identificador como parámetro. Concedida a
-- `authenticated`, cualquiera con una sesión podría preguntar qué tiene
-- contratado otro cliente — si tiene la tienda, si le pusieron la IA aparte.
-- No es lo más grave del mundo, pero es información de negocio de otro y no hay
-- ninguna razón para que viaje.
--
-- Aquí el identificador sale de la SESIÓN, no de un parámetro. Es la misma idea
-- que `auth_org_ids()`: la pregunta solo se puede hacer sobre uno mismo.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.org_features_mias()
returns text[]
language sql
stable security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select array_agg(distinct f)
        from public.auth_org_ids() as o(id),
             lateral unnest(public.org_features(o.id)) as g(f)
    ),
    '{}'::text[]
  );
$fn$;

comment on function public.org_features_mias is
  'Las capacidades de la cuenta de quien pregunta. El org_id sale de la sesión, no de un parámetro.';

-- Las dos que reciben el id por parámetro se quedan SOLO para el motor, que usa
-- la llave de servicio. Las pantallas usan `org_features_mias()` y `auth_tiene()`.
revoke execute on function public.org_features(uuid) from authenticated;
revoke execute on function public.org_puede(uuid, text) from authenticated;

grant execute on function public.org_features_mias() to authenticated, service_role;
