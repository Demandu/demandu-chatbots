-- `auth_puede()` no sabía de qué organización hablaba.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL FALLO. La función que decide qué puede hacer cada persona NO recibía la
-- organización. Elegía UNA membresía —`limit 1`— y devolvía ese rol para TODAS.
-- Y `auth_org_ids()`, cuando NO hay soporte vigente, devuelve TODAS tus
-- cuentas, no una. Las dos cosas juntas dan la escalada:
--
--   Alguien dueño de su propia cuenta que acepta una invitación como AGENTE en
--   la cuenta de un cliente pasa como DUEÑO en las dos. Con eso abre las
--   puertas que la 0092 construyó —`token_de_whatsapp`, `secreto_de_salida`—
--   y se lleva el token de Meta y los secretos de firma del cliente.
--
-- Probado contra producción en una transacción que se deshace: con la regla
-- vieja, `auth_puede('conexiones')` en la cuenta ajena daba TRUE siendo solo
-- agente. Con la nueva da FALSE, y en la propia sigue dando TRUE.
--
-- Hoy hay un solo usuario con dos membresías y es de soporte, camino que sí es
-- seguro (con soporte vigente `auth_org_ids()` devuelve solo esa cuenta). Esto
-- se vuelve explotable EL DÍA que se invite a alguien que ya tenga cuenta
-- propia — y la plataforma tiene un botón para hacer justo eso.
--
-- El lado de TypeScript ya estaba bien: `misPermisos()` saca el rol de la MISMA
-- fila que la organización (`membresiaDeLaSesion`). Era solo la base la que
-- podía discrepar — y la base es la que manda.
--
-- ── LA FORMA DEL ARREGLO ──────────────────────────────────────────────────
--
-- 1. Una versión que RECIBE la organización y lee la membresía DE ESA cuenta.
--    Es la que usan ahora todas las políticas: la fila siempre sabe su
--    `org_id`, así que no hay nada que adivinar.
--
-- 2. La versión de un argumento se queda —hay código que la llama— pero FALLA
--    CERRADO: si el usuario tiene más de una cuenta candidata devuelve `false`
--    en vez de elegir una al azar. Quien tiene una sola cuenta, que es todo el
--    mundo hoy, no nota nada.
--
--    Negar de más se ve enseguida y se arregla; conceder de más no se ve nunca.
--
-- 3. Las dos puertas de secretos pasan el `org_id` de su propia fila.
--
-- La tabla de roles es la misma de la migración 0049 y sigue repetida en
-- `src/lib/permisos.ts`. SI SE CAMBIA UNA, HAY QUE CAMBIAR LA OTRA.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_puede(p_permiso text, p_org_id uuid)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare r text; ajustes jsonb; base text[];
begin
  if p_org_id is null then return false; end if;

  -- Respeta la regla de «una sola cuenta activa» (migración 0084): con un
  -- acceso de soporte vigente, la cuenta propia no cuenta. `auth_org_ids()` es
  -- la única definición de esa regla y aquí se reutiliza en vez de repetirla.
  if p_org_id not in (select auth_org_ids()) then return false; end if;

  select m.role::text, coalesce(m.permisos, '{}'::jsonb)
    into r, ajustes
    from memberships m
   where m.user_id = auth.uid()
     and m.org_id = p_org_id
     and (m.soporte_hasta is null or m.soporte_hasta > now())
   order by (m.soporte_hasta is not null) desc,
            m.soporte_hasta desc nulls last,
            m.created_at asc
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
end $fn$;

-- La de siempre, ahora sin adivinar.
create or replace function public.auth_puede(p_permiso text)
returns boolean language plpgsql stable security definer set search_path = public as $fn$
declare cuentas uuid[];
begin
  select array_agg(o) into cuentas from (select auth_org_ids() as o) t;
  -- Ni ninguna ni varias: si no hay UNA sola cuenta evidente, se niega. Elegir
  -- por orden de creación es exactamente lo que causaba la escalada.
  if cuentas is null or array_length(cuentas, 1) <> 1 then return false; end if;
  return auth_puede(p_permiso, cuentas[1]);
end $fn$;

revoke execute on function public.auth_puede(text, uuid) from public, anon;
grant  execute on function public.auth_puede(text, uuid) to authenticated, service_role;

comment on function public.auth_puede(text, uuid) is
  'Si quien llama tiene ese permiso EN ESA organizacion. Es la que deben usar las politicas.';
comment on function public.auth_puede(text) is
  'Compatibilidad. Falla cerrado si la persona tiene mas de una cuenta: usa la de dos argumentos.';

-- ── LAS POLÍTICAS PASAN LA ORGANIZACIÓN DE SU PROPIA FILA ─────────────────

drop policy if exists llaves_ver on public.api_keys;
create policy llaves_ver on public.api_keys for select
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones', org_id));

drop policy if exists llaves_crear on public.api_keys;
create policy llaves_crear on public.api_keys for insert
  with check (org_id in (select auth_org_ids()) and auth_puede('conexiones', org_id));

drop policy if exists llaves_editar on public.api_keys;
create policy llaves_editar on public.api_keys for update
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones', org_id));

drop policy if exists inv_ver on public.invitations;
create policy inv_ver on public.invitations for select
  using (org_id in (select auth_org_ids()) and auth_puede('equipo', org_id));

drop policy if exists inv_crear on public.invitations;
create policy inv_crear on public.invitations for insert
  with check (org_id in (select auth_org_ids()) and auth_puede('equipo', org_id));

drop policy if exists inv_borrar on public.invitations;
create policy inv_borrar on public.invitations for delete
  using (org_id in (select auth_org_ids()) and auth_puede('equipo', org_id));

drop policy if exists sheets_editar on public.sheets_config;
create policy sheets_editar on public.sheets_config for all
  using (org_id in (select auth_org_ids()) and auth_puede('conexiones', org_id))
  with check (org_id in (select auth_org_ids()) and auth_puede('conexiones', org_id));

-- ── LAS DOS PUERTAS DE SECRETOS, CON LA ORGANIZACIÓN DE SU FILA ───────────

create or replace function public.token_de_whatsapp(p_bot_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select w.access_token
    from whatsapp_channels w
   where w.bot_id = p_bot_id
     and w.org_id in (select auth_org_ids())
     and auth_puede('conexiones', w.org_id)
   limit 1;
$fn$;

create or replace function public.secreto_de_salida(p_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select s.secreto
    from salidas s
   where s.id = p_id
     and s.org_id in (select auth_org_ids())
     and auth_puede('conexiones', s.org_id)
   limit 1;
$fn$;
