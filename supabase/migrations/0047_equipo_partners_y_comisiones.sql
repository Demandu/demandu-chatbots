-- Equipo de ventas de Demandu, partners externos y sus comisiones.
--
-- DOS POBLACIONES QUE NO SE MEZCLAN, aunque compartan la maquinaria:
--   · vendedor — es de Demandu. Puede tener alcance sobre todas las cuentas.
--   · partner  — es otra empresa. SOLO ve las cuentas que trajo o que se le
--                asignaron, y eso no es configurable (ver el CHECK de abajo).
--
-- La diferencia no es de permisos, es de confianza. Un permiso mal puesto a un
-- empleado es un problema interno; el mismo permiso mal puesto a una agencia
-- de fuera le abre la cartera de clientes de Demandu a un tercero.

create table if not exists public.equipo_demandu (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid unique references auth.users(id) on delete cascade,
  nombre      text not null,
  email       text not null,
  tipo        text not null check (tipo in ('vendedor','partner')),
  activo      boolean not null default true,

  -- 'todas' = ve la cartera entera · 'asignadas' = solo las suyas.
  alcance     text not null default 'asignadas' check (alcance in ('todas','asignadas')),

  -- Qué puede ver DENTRO de la cuenta de un cliente cuando entra a dar
  -- soporte. Mismo formato que `memberships.permisos`: solo la diferencia con
  -- lo de fábrica, no la lista entera.
  permisos    jsonb not null default '{}'::jsonb,

  -- Si está puesto, pisa la escala por defecto para TODOS sus clientes.
  -- Nulo es lo normal: se aplica la escala.
  comision_pct numeric,

  notas       text,
  creado_at   timestamptz not null default now(),

  -- UN PARTNER NUNCA VE TODAS LAS CUENTAS. No es una opción que se pueda
  -- marcar por error desde una pantalla: la base no lo admite.
  -- Comprobado: insertar un partner con alcance 'todas' es rechazado.
  constraint partner_solo_ve_las_suyas check (tipo <> 'partner' or alcance = 'asignadas')
);

comment on table public.equipo_demandu is
  'Vendedores internos y partners externos. NO son usuarios de ninguna '
  'organización cliente: son personal de la plataforma.';

create index if not exists equipo_demandu_user_idx on public.equipo_demandu (user_id);

-- Quién lleva la relación con este cliente. Aparte de `creado_por`, que es un
-- hecho histórico y no cambia: la cartera sí se reasigna.
alter table public.organizations
  add column if not exists atendido_por uuid references public.equipo_demandu(id) on delete set null;

create index if not exists organizations_atendido_por_idx
  on public.organizations (atendido_por) where atendido_por is not null;

-- ── La escala de comisión ────────────────────────────────────────────────
--
-- Vive en una función y no repartida por el código para que haya UN solo
-- sitio donde mirar cuando alguien pregunte «¿cuánto me toca?».
--
--   hasta 99 USD al mes ...... 15%
--   más de 99 USD al mes ..... 20%
--   complementos y pagos únicos ... 0%
--
-- Los complementos y los pagos únicos no pagan comisión por decisión de
-- negocio: son márgenes distintos y se venden solos una vez el cliente ya
-- está dentro.
create or replace function public.comision_de(p_precio numeric)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_precio, 0) <= 0 then 0
    when p_precio > 99 then 20
    else 15
  end::numeric;
$$;

revoke execute on function public.comision_de(numeric) from public, anon;
grant execute on function public.comision_de(numeric) to authenticated, service_role;

-- ── Comisiones devengadas ────────────────────────────────────────────────
--
-- UNA FILA POR FACTURA COBRADA, no por mes calculado al vuelo.
--
-- Por qué se congela en vez de recalcularse: si se recalculara hacia atrás,
-- un reembolso o un cambio de porcentaje cambiaría EN SILENCIO lo que ya se
-- le pagó a alguien el mes pasado. La primera vez que un vendedor vea que su
-- número de agosto ya no es el que cobró, se acabó la confianza.
create table if not exists public.comisiones (
  id                uuid primary key default gen_random_uuid(),
  miembro_id        uuid not null references public.equipo_demandu(id) on delete cascade,
  org_id            uuid references public.organizations(id) on delete set null,
  -- Día 1 del mes al que pertenece.
  periodo           date not null,
  stripe_invoice_id text unique,
  -- Lo que de verdad se cobró de PLAN en esa factura. Sin complementos.
  base              numeric not null default 0,
  pct               numeric not null default 0,
  monto             numeric not null default 0,
  estado            text not null default 'pendiente' check (estado in ('pendiente','pagada','anulada')),
  pagada_at         timestamptz,
  referencia        text,
  creado_at         timestamptz not null default now()
);

create index if not exists comisiones_miembro_periodo_idx on public.comisiones (miembro_id, periodo desc);
create index if not exists comisiones_estado_idx on public.comisiones (estado) where estado = 'pendiente';

alter table public.equipo_demandu enable row level security;
alter table public.comisiones     enable row level security;

revoke all on public.equipo_demandu from anon, authenticated;
revoke all on public.comisiones     from anon, authenticated;

-- Cada quien puede LEER su propia ficha y sus propias comisiones. Nada más:
-- ni la de al lado, ni escribir. Todo lo demás pasa por el superadmin con la
-- llave de servicio.
--
-- Ojo con la lección de la 0045: aquí se concede SELECT y nada más. Una
-- política de UPDATE sin permisos de columna volvería a abrir el mismo hueco.
grant select on public.equipo_demandu to authenticated;
grant select on public.comisiones     to authenticated;

drop policy if exists "ver mi ficha de equipo" on public.equipo_demandu;
create policy "ver mi ficha de equipo" on public.equipo_demandu
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "ver mis comisiones" on public.comisiones;
create policy "ver mis comisiones" on public.comisiones
  for select to authenticated
  using (miembro_id in (select id from public.equipo_demandu where user_id = auth.uid()));
