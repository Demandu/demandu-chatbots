-- Salud de la plataforma: los servicios de los que dependemos y la cuenta de
-- Meta de cada cliente.
--
-- POR QUÉ SE GUARDA Y NO SE MIDE AL ABRIR LA PANTALLA. Dos razones:
--
-- 1. Un tablero que mide al pintarse solo sabe cómo estaba todo en el segundo
--    en que alguien lo miró. Lo que hace falta es lo contrario: enterarse de
--    que algo se cayó a las 3 de la mañana, cuando nadie estaba mirando.
-- 2. Lo de Meta es una llamada a su API POR CLIENTE. Con cincuenta clientes,
--    medir al abrir serían cincuenta llamadas cada vez que alguien entra —
--    y Meta corta por exceso de peticiones.

create table if not exists public.estado_servicios (
  servicio     text primary key,
  ok           boolean,
  latencia_ms  integer,
  detalle      text,
  medido_at    timestamptz not null default now()
);

comment on table public.estado_servicios is
  'Última medición de cada servicio del que depende la plataforma. '
  'ok = null significa NO SE PUDO MEDIR, que no es lo mismo que "está bien".';

alter table public.estado_servicios enable row level security;
revoke all on public.estado_servicios from anon, authenticated;

-- ── Salud de la cuenta de Meta de cada cliente ───────────────────────────
create table if not exists public.meta_salud (
  org_id             uuid primary key references public.organizations(id) on delete cascade,
  waba_id            text,
  phone_number_id    text,
  numero             text,
  nombre_para_mostrar text,
  -- GREEN / YELLOW / RED, tal como lo llama Meta. Es LA señal: un número en
  -- rojo está a un paso de que Meta le baje el límite o lo bloquee.
  calidad            text,
  -- TIER_250, TIER_1K, TIER_10K, TIER_100K, UNLIMITED
  limite_envio       text,
  -- APPROVED / PENDING_REVIEW / DECLINED / NONE
  estado_numero      text,
  estado_revision    text,
  verificacion_negocio text,
  plantillas_total     integer,
  plantillas_rechazadas integer,
  -- 0 = sano, 100 = a punto de perder la cuenta. Lo calcula el código; se
  -- guarda para poder ordenar por él sin recalcular en cada carga.
  riesgo             integer,
  motivos            text[],
  crudo              jsonb,
  error              text,
  medido_at          timestamptz not null default now()
);

comment on table public.meta_salud is
  'Foto de la cuenta de Meta de cada cliente. La refresca una tarea; NUNCA se '
  'pide en vivo al pintar la pantalla, sería una llamada a Meta por cliente.';

comment on column public.meta_salud.error is
  'Si tiene algo, la medición FALLÓ y los demás campos son viejos. Sin esto, '
  'un token caducado se leería como "todo bien" hasta que un cliente reclame.';

create index if not exists meta_salud_riesgo_idx on public.meta_salud (riesgo desc nulls last);

alter table public.meta_salud enable row level security;
revoke all on public.meta_salud from anon, authenticated;

-- Nadie más que el service_role. Esto es la trastienda: un cliente no tiene
-- por qué ver la calificación de Meta de otro, ni la suya por esta vía.
