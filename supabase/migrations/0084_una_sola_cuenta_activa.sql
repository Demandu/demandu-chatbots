-- Cuando tienes dos membresías, la plataforma tiene que saber en cuál estás.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE PASÓ. El dueño entró como soporte a la cuenta de un cliente y la
-- plataforma le enseñó SU PROPIA cuenta. Durante ese minuto su usuario tenía dos
-- filas en `memberships`: dueño de la suya, y soporte temporal en la del
-- cliente. Y todo el sistema —aquí y en TypeScript— elegía así:
--
--     where user_id = auth.uid() ... limit 1
--
-- `limit 1` SIN `order by` no es «la primera»: es la que Postgres devuelva ese
-- día. Puede cambiar entre dos consultas seguidas de la misma petición.
--
-- ── POR QUÉ ESTO ERA MUCHO PEOR DE LO QUE SE VIO ───────────────────────────
--
-- Lo que se vio fue inofensivo (viste tu cuenta en vez de la del cliente). El
-- reverso no lo es: `auth_puede()` hacía SU PROPIA consulta con el mismo
-- `limit 1` suelto, independiente de la que elegía la organización. Nada
-- garantizaba que las dos cayeran en la misma fila.
--
-- Es decir: organización = la del CLIENTE, rol = `owner` de la TUYA. Y arriba
-- del todo de esta función hay un `if r = 'owner' then return true`, que da por
-- bueno CUALQUIER permiso. El soporte se abre a propósito como `viewer` de solo
-- lectura; ese cruce lo convertía en dueño dentro de la cuenta ajena.
--
-- No hacía falta mala intención ni un ataque: dos filas y un `limit 1` sin
-- orden.
--
-- ── LA REGLA, Y POR QUÉ ESTA ──────────────────────────────────────────────
--
-- SI HAY UNA SESIÓN DE SOPORTE VIGENTE, MANDA ESA. Y NO SE VE NADA MÁS.
--
-- Entrar a la cuenta de un cliente significa entrar: mientras dure, la propia
-- cuenta no existe. No es una preferencia de diseño, es lo único que se puede
-- razonar — con las dos cuentas visibles a la vez, cualquier consulta que se
-- apoye solo en RLS (y hay cuatro) devuelve una de las dos al azar, y una lista
-- puede acabar mezclando datos de dos negocios.
--
-- El desempate secundario es la más antigua, que es estable y es la propia.
-- Nunca al azar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Qué organizaciones ve esta persona ─────────────────────────────────────
--
-- Antes devolvía TODAS (propia + soporte). Ahora, con soporte abierto, devuelve
-- SOLO la del cliente. Es el cierre de verdad: da igual lo que pida el código
-- de la aplicación, la base ya no le enseña la otra.
create or replace function public.auth_org_ids()
returns setof uuid
language sql
stable security definer
set search_path to 'public'
as $function$
  -- La del cliente, si hay soporte vigente.
  --
  -- LOS PARÉNTESIS NO SON ADORNO: un `order by ... limit` pegado a un `union`
  -- se lee como el orden del conjunto entero, y Postgres lo rechaza. Sin ellos
  -- esto no compila.
  (select m.org_id
     from memberships m
    where m.user_id = auth.uid()
      and m.soporte_hasta is not null
      and m.soporte_hasta > now()
    order by m.soporte_hasta desc, m.org_id
    limit 1)

  union all

  -- Las propias, solo si NO hay ninguna sesión de soporte abierta.
  (select m.org_id
     from memberships m
    where m.user_id = auth.uid()
      and m.soporte_hasta is null
      and not exists (
        select 1 from memberships s
         where s.user_id = auth.uid()
           and s.soporte_hasta is not null
           and s.soporte_hasta > now()
      ));
$function$;

comment on function public.auth_org_ids is
  'Las organizaciones que esta persona puede ver AHORA. Con una sesión de soporte '
  'vigente devuelve solo la del cliente: entrar a una cuenta significa entrar.';

-- ── Qué puede hacer, y en cuál ─────────────────────────────────────────────
--
-- Misma precedencia, y esto es lo que impide el cruce: el rol sale de la MISMA
-- fila que la organización. Con soporte abierto, el rol es el del soporte
-- (`viewer` + los permisos de su ficha), nunca el `owner` de la cuenta propia.
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
     and (m.soporte_hasta is null or m.soporte_hasta > now())
   -- EL ORDEN ES LA CORRECCIÓN. Sin él, esta consulta y la de arriba podían
   -- caer en filas distintas: cuenta del cliente con permisos de dueño.
   order by (m.soporte_hasta is not null) desc,
            m.soporte_hasta desc nulls last,
            m.created_at asc,
            m.org_id
   limit 1;

  if r is null then return false; end if;
  if r = 'owner' then return true; end if;

  if ajustes ? p_permiso then
    return coalesce((ajustes ->> p_permiso)::boolean, false);
  end if;

  base := case r
    when 'admin'       then array['chatbots','conversaciones','embudo','contactos','resultados','ia','config','equipo','plan','conexiones','envios','borrar']
    when 'coordinador' then array['conversaciones','embudo','contactos','resultados','config','equipo','envios']
    when 'agent'       then array['conversaciones','embudo','contactos']
    when 'developer'   then array['chatbots','ia','conexiones']
    else                    array['embudo','contactos','resultados']
  end;

  return p_permiso = any(base);
end $function$;

revoke execute on function public.auth_puede(text) from public, anon;
grant execute on function public.auth_puede(text) to authenticated, service_role;

-- ── Una sola sesión de soporte a la vez ────────────────────────────────────
--
-- Con dos abiertas, el aviso rojo «estás dentro de la cuenta de X» desaparecía
-- —lo pintaba una consulta que esperaba una sola fila y se rompía con dos— y
-- sin aviso no hay botón de salir. El acceso seguía vivo, invisible, hasta
-- caducar solo. Esto lo hace imposible desde la base, no desde el código.
create unique index if not exists memberships_un_soporte_por_persona_uidx
  on public.memberships (user_id)
  where soporte_hasta is not null;
