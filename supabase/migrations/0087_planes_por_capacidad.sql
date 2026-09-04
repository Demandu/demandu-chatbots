-- Los planes pasan de vender CANTIDAD a vender CAPACIDAD.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE HABÍA. Los tres planes eran el mismo producto en tres tamaños: 3.000,
-- 6.000 y 12.000 mensajes. Nadie sube de plan por «más de lo mismo»; se sube
-- cuando el de arriba HACE ALGO que el tuyo no hace.
--
-- Ahora Emprende es flujos, Crece añade la IA, y Profesional añade la tienda.
-- Y quien está abajo y quiere una de las dos, la compra como complemento sin
-- cambiar de plan.
--
-- ── POR QUÉ ES UN INTERRUPTOR Y NO OTRA CUOTA ─────────────────────────────
--
-- ESTE PROYECTO YA TUVO UN CONTADOR DE MENSAJES DE IA Y LO QUITÓ A PROPÓSITO.
-- Está razonado en `src/lib/billing/usage.ts`: primero una respuesta de IA
-- costaba 3 mensajes y el paquete se vaciaba tres veces más rápido sin que
-- nadie entendiera por qué; después fueron dos contadores y se leía como cobro
-- doble. La cuenta decía que aunque un cliente gastara el 100% de su plan en
-- IA, el costo se queda entre el 14% y el 19% de lo que paga — el límite
-- protegía un margen que no estaba en riesgo.
--
-- Así que aquí NO vuelve ninguna cuota. Sigue habiendo UNA bolsa de mensajes.
-- Lo que se enciende y se apaga es la capacidad.
--
-- ── LA REGLA QUE EVITA EL INCENDIO ────────────────────────────────────────
--
-- `organizations.features_extra` ES LO QUE SALVA A LOS CLIENTES DE ANTES. El
-- día que un plan deja de incluir algo, a quien ya lo usaba NO se le puede
-- apagar: cambiaría su producto de un día para otro sin que él hiciera nada, y
-- eso es una baja garantizada. Con esta columna se le conserva, y se le quita a
-- mano cuando toque — nunca solo.
--
-- Sirve además para los regalos puntuales («te dejo la tienda un mes») sin
-- inventarle un plan a la medida a cada cliente.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.plans
  add column if not exists features text[] not null default '{}';

comment on column public.plans.features is
  'Capacidades que incluye este plan. Vacío = solo lo que tiene todo el mundo.';

alter table public.addons
  add column if not exists otorga text[] not null default '{}';

comment on column public.addons.otorga is
  'Capacidades que desbloquea este complemento mientras esté contratado.';

alter table public.organizations
  add column if not exists features_extra text[] not null default '{}';

comment on column public.organizations.features_extra is
  'Capacidades de ESTA cuenta por encima de su plan: clientes que conservan lo '
  'que tenían antes de un cambio de planes, y regalos puntuales. Se quita a mano.';

-- ── Qué incluye cada plan ──────────────────────────────────────────────────
--
-- EMPRENDE SE QUEDA SIN IA, y es el cambio con más consecuencias de esta
-- migración. Por eso existe `features_extra`: quien ya la usaba la conserva.
update public.plans set features = '{}'          where code = 'starter' and org_id is null;
update public.plans set features = '{ia}'        where code = 'growth'  and org_id is null;
update public.plans set features = '{ia,tienda}' where code = 'pro'     and org_id is null;
-- Empresa se negocia una por una, pero de fábrica lo trae todo: nadie paga un
-- plan a la medida para tener menos.
update public.plans set features = '{ia,tienda}' where code = 'scale'   and org_id is null;

-- LOS PLANES A LA MEDIDA TAMBIÉN LO TRAEN TODO. Se hicieron a mano para un
-- cliente concreto y ninguno se negoció «sin IA»: dejarlos vacíos les apagaría
-- funciones que ya usan.
update public.plans set features = '{ia,tienda}' where is_custom and org_id is not null;

-- ── Qué desbloquea cada complemento ───────────────────────────────────────
update public.addons set otorga = '{tienda}' where code = 'tienda';

insert into public.addons (code, name, description, unit, price, currency, recurring, sort, active, is_quote, otorga)
values (
  'ia',
  'Lana IA',
  'Enciende las respuestas con inteligencia artificial en tu plan. Usa los mismos mensajes de tu paquete: no se cobra aparte por respuesta.',
  'cuenta',
  29.00,
  'USD',
  true,
  1,
  true,
  false,
  '{ia}'
)
on conflict (code) do update set
  name = excluded.name, description = excluded.description, unit = excluded.unit,
  price = excluded.price, recurring = excluded.recurring, sort = excluded.sort,
  active = excluded.active, otorga = excluded.otorga;

-- ── Qué puede esta cuenta, de verdad ───────────────────────────────────────
--
-- VA EN LA BASE Y NO EN EL CÓDIGO. La pantalla puede pintar una función
-- apagada, pero si el freno viviera solo ahí, cualquiera llamaría la acción por
-- debajo y usaría la IA gratis. Esta función es la que consultan los dos
-- motores y las pantallas: una sola respuesta para todos.
create or replace function public.org_features(p_org_id uuid)
returns text[]
language sql
stable security definer
set search_path = public
as $fn$
  select coalesce(
    (
      select array_agg(distinct f)
        from (
          -- Lo que trae su plan.
          --
          -- SE ELIGE UNO SOLO, CON `limit 1`. Un cliente con plan a la medida
          -- puede tener DOS filas con el mismo código —el suyo y el público— y
          -- unir las dos le daría lo que incluye el público aunque el suyo se
          -- negociara distinto. Gana el suyo.
          select unnest(pl.features) as f
            from organizations o
            cross join lateral (
              select p.features
                from plans p
               where p.code = o.plan
                 and (p.org_id = o.id or p.org_id is null)
               order by (p.org_id is not null) desc
               limit 1
            ) pl
           where o.id = p_org_id

          union all

          -- Lo que le desbloquean sus complementos contratados.
          --
          -- `active` TAMBIÉN CUENTA, no solo la cantidad. Un complemento dado
          -- de baja que se quedara con su cantidad seguiría desbloqueando la
          -- función después de dejar de cobrarse.
          select unnest(a.otorga)
            from org_addons oa
            join addons a on a.code = oa.addon_code
           where oa.org_id = p_org_id
             and coalesce(oa.quantity, 0) > 0
             and coalesce(oa.active, true)

          union all

          -- Lo que conserva esta cuenta por encima de su plan.
          select unnest(o.features_extra)
            from organizations o
           where o.id = p_org_id
        ) t
       where f is not null and f <> ''
    ),
    '{}'::text[]
  );
$fn$;

comment on function public.org_features is
  'Todo lo que puede esta cuenta: su plan, sus complementos y lo que conserva aparte.';

create or replace function public.org_puede(p_org_id uuid, p_clave text)
returns boolean
language sql
stable security definer
set search_path = public
as $fn$
  select p_clave = any(public.org_features(p_org_id));
$fn$;

-- Lo mismo para quien está usando la plataforma ahora mismo.
create or replace function public.auth_tiene(p_clave text)
returns boolean
language sql
stable security definer
set search_path = public
as $fn$
  select exists (
    -- `auth_org_ids()` DEVUELVE UN CONJUNTO, no un arreglo: se llama como una
    -- tabla. Con `unnest()` esto no compila.
    select 1 from public.auth_org_ids() as o(id)
     where public.org_puede(o.id, p_clave)
  );
$fn$;

grant execute on function public.org_features(uuid)   to authenticated, service_role;
grant execute on function public.org_puede(uuid, text) to authenticated, service_role;
grant execute on function public.auth_tiene(text)      to authenticated, service_role;

-- ── Que nadie pierda lo que ya usaba ───────────────────────────────────────
--
-- SE MIRA EL USO REAL, no el plan. Quien pidió respuestas de IA en los últimos
-- dos meses la está usando de verdad, y apagársela por un cambio de empaque
-- sería quitarle algo que funcionaba ayer.
update public.organizations o
   set features_extra = array(select distinct unnest(o.features_extra || '{ia}'))
 where exists (
   select 1 from usage_events u
    where u.org_id = o.id
      and u.kind = 'ai_message'
      and u.created_at > now() - interval '60 days'
 )
   and not public.org_puede(o.id, 'ia');

-- ── Y quien YA TIENE UNA TIENDA MONTADA, también la conserva ───────────────
--
-- ESTO SE ENCONTRÓ PROBANDO CONTRA LOS DATOS REALES, no leyendo el código. La
-- primera versión de esta migración solo salvaba la IA, y la cuenta de Demandu
-- —plan Crece, con la tienda «Paws at Home» montada, con productos y con
-- pedidos— se habría quedado sin ella al aplicarla.
--
-- Es el mismo caso que la IA y merece la misma regla: MONTAR UNA TIENDA CUESTA
-- DÍAS de subir productos, fotos y precios. Apagarla por un cambio de empaque
-- es lo más caro que se le puede hacer a un cliente.
update public.organizations o
   set features_extra = array(select distinct unnest(o.features_extra || '{tienda}'))
 where exists (
   select 1 from tiendas t where t.org_id = o.id
 )
   and not public.org_puede(o.id, 'tienda');
