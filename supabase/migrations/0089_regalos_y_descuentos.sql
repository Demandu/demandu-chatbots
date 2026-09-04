-- Regalar tiempo y funciones, con fecha de caducidad.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE FALTABA. `organizations.features_extra` deja darle una función a una
-- cuenta, pero PARA SIEMPRE: no hay dónde apuntar «hasta cuándo». Y el trato
-- real casi nunca es para siempre — es «te dejo la tienda un mes a ver si te
-- sirve». Sin fecha, ese mes se convierte en gratis de por vida en cuanto a
-- alguien se le olvida quitarlo, que es siempre.
--
-- ── LAS DOS COSAS SE SEPARAN A PROPÓSITO ──────────────────────────────────
--
-- `features_extra` SE QUEDA para lo permanente: quien conserva algo porque su
-- plan dejó de incluirlo. Eso no caduca nunca y quitarlo es una decisión, no un
-- vencimiento.
--
-- `org_regalos` es para lo TEMPORAL, y caduca solo. Si el reloj falla, el
-- regalo se acaba igual: la vigencia se calcula al preguntar, no con una tarea
-- programada que un día no corre.
--
-- ── LO QUE ESTA TABLA NO HACE ─────────────────────────────────────────────
--
-- NO REGALA DINERO. Un descuento o un mes gratis a quien YA PAGA no se apunta
-- aquí: vive en Stripe, como cupón sobre su suscripción. Si el descuento se
-- guardara solo de nuestro lado, la pantalla diría una cosa y la tarjeta del
-- cliente cobraría otra — y de esa discusión no se sale bien.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.org_regalos (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,

  -- Hoy solo 'feature'. Se guarda como texto para que añadir otro tipo no sea
  -- una migración de esquema.
  tipo       text not null default 'feature',
  -- Qué se regala: 'ia', 'tienda'…
  clave      text not null,

  -- HASTA CUÁNDO. Nulo sería «para siempre», y para eso ya está
  -- `features_extra`: aquí se exige fecha para que no haya regalos eternos por
  -- despiste.
  hasta      timestamptz not null,

  -- POR QUÉ SE REGALÓ Y QUIÉN LO REGALÓ. Sin esto, dentro de tres meses nadie
  -- sabe si ese cliente tiene la tienda gratis por una promesa comercial o por
  -- un dedazo — y nadie se atreve a quitárselo.
  motivo     text,
  quien      uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

-- Un regalo por función y cuenta: renovar es correr la fecha, no acumular
-- filas. Con varias, «hasta cuándo lo tiene» dejaría de tener una respuesta.
create unique index if not exists org_regalos_uno_por_clave
  on public.org_regalos (org_id, clave);

create index if not exists org_regalos_vigentes
  on public.org_regalos (hasta) where hasta > now();

alter table public.org_regalos enable row level security;

-- SOLO DEMANDU. Es una tabla de trastienda: el cliente ve el efecto —su función
-- encendida— no el trato ni quién se lo dio.
create policy org_regalos_solo_demandu on public.org_regalos
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

comment on table public.org_regalos is
  'Funciones regaladas a una cuenta CON FECHA. Lo permanente va en organizations.features_extra.';

-- ── Qué puede esta cuenta, ahora con los regalos ───────────────────────────
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
          -- Lo que trae su plan. Uno solo: el suyo gana sobre el público.
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
          select unnest(a.otorga)
            from org_addons oa
            join addons a on a.code = oa.addon_code
           where oa.org_id = p_org_id
             and coalesce(oa.quantity, 0) > 0
             and coalesce(oa.active, true)

          union all

          -- Lo que conserva por encima de su plan, para siempre.
          select unnest(o.features_extra)
            from organizations o
           where o.id = p_org_id

          union all

          -- Y lo que le regalamos, MIENTRAS ESTÉ VIGENTE.
          --
          -- LA VIGENCIA SE CALCULA AQUÍ, no con una tarea que apague regalos
          -- vencidos. Una tarea que un día no corre deja regalos vivos para
          -- siempre y nadie se entera; esto caduca solo aunque se caiga todo.
          select r.clave
            from org_regalos r
           where r.org_id = p_org_id
             and r.tipo = 'feature'
             and r.hasta > now()
        ) t
       where f is not null and f <> ''
    ),
    '{}'::text[]
  );
$fn$;

comment on function public.org_features is
  'Todo lo que puede esta cuenta: su plan, sus complementos, lo que conserva y lo regalado vigente.';
