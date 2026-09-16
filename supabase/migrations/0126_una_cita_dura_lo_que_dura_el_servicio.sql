-- ════════════════════════════════════════════════════════════════════════════
-- UNA CITA DURA LO QUE DURA EL SERVICIO
--
-- Hasta hoy TODAS las citas duraban 30 minutos, escrito a fuego en
-- `src/lib/ai/herramientas.ts` (`durationMin: 30`). Para todos los negocios,
-- para siempre. Una clínica fetal no puede dar 30 minutos a un ultrasonido de
-- tercer trimestre y 30 a un embarazo gemelar, que necesita dos horas.
--
-- Y el daño no era solo la duración: los huecos se ofrecían en rejilla de 30,
-- así que el bot ofrecía las 12:00 y las 12:30 de una cita que iba a durar dos
-- horas. El segundo hueco no existía.
--
-- ── ESTA TABLA ES EL PASO 1 DEL MOTOR DE AGENDA ────────────────────────────
--
-- La forma sale tal cual de `claude/agenda-propia-por-rubro.md`. NO es un
-- parche pegado al flujo de citas: es el cimiento sobre el que después van
-- `recursos`, `prestadores` y `huecosDisponibles`, y sobre el que Reservas de
-- restaurante tiene que mudarse antes de que alguien la estrene (hoy: 0
-- reservas, 0 turnos — la ventana sigue abierta).
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists public.servicios (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  nombre              text not null,
  descripcion         text,

  -- Entre 5 minutos y un día. El tope no es capricho: una duración disparatada
  -- vacía la agenda entera sin que nadie entienda por qué no hay huecos.
  duracion_min        int  not null default 60 check (duracion_min between 5 and 1440),

  -- Limpiar la sala, preparar el equipo. Ocupan agenda pero no son la cita, y
  -- sin ellos el negocio acaba poniendo servicios de 40 minutos que duran 30.
  buffer_antes_min    int  not null default 0 check (buffer_antes_min between 0 and 240),
  buffer_despues_min  int  not null default 0 check (buffer_despues_min between 0 and 240),

  precio_centavos     int  check (precio_centavos is null or precio_centavos >= 0),
  moneda              text check (moneda is null or char_length(moneda) = 3),

  activo              boolean not null default true,
  orden               int not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Dos servicios con el mismo nombre en la misma cuenta es un error de dedo que
-- después nadie distingue en la conversación: el bot no sabría cuál ofrecer.
create unique index if not exists servicios_nombre_unico
  on public.servicios (org_id, lower(btrim(nombre)));

create index if not exists servicios_de_la_cuenta
  on public.servicios (org_id, activo, orden);

alter table public.servicios enable row level security;

drop policy if exists servicios_org on public.servicios;
create policy servicios_org on public.servicios
  for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── LA CITA CONGELA LO QUE PASÓ ────────────────────────────────────────────
--
-- Es la misma lección que ya costó dinero en `pedido_lineas`: si la cita solo
-- apuntara al servicio y mañana sube el precio o cambia la duración, EL
-- REPORTE DEL MES PASADO CAMBIA SOLO. «Cuánto facturó María en agosto» tiene
-- que dar lo mismo hoy que en diciembre.
--
-- Por eso se guardan aquí el nombre, la duración y el precio: el servicio se
-- puede renombrar, encarecer o borrar, y la cita de ayer sigue contando lo que
-- de verdad pasó ayer.
alter table public.citas
  add column if not exists servicio_id      uuid references public.servicios(id) on delete set null,
  add column if not exists servicio_nombre  text,
  add column if not exists duracion_min     int check (duracion_min is null or duracion_min between 5 and 1440),
  add column if not exists precio_centavos  int check (precio_centavos is null or precio_centavos >= 0);

create index if not exists citas_por_servicio on public.citas (org_id, servicio_id);

-- ── LO QUE DURA UNA CITA CUANDO EL NEGOCIO NO DEFINIÓ SERVICIOS ────────────
--
-- Antes eran 30 minutos decididos por el código. Ahora son del negocio, y de
-- fábrica **60**: una hora es lo que dura una cita en casi cualquier oficio, y
-- media hora era un valor que nadie eligió.
alter table public.organizations
  add column if not exists duracion_cita_min int not null default 60
    check (duracion_cita_min between 5 and 1440);

-- Las citas que YA existen se quedan con lo que de verdad duraron, no con el
-- valor nuevo: reescribirlas sería inventarse el pasado.
update public.citas
   set duracion_min = greatest(5, round(extract(epoch from (fin - inicio)) / 60)::int)
 where duracion_min is null
   and fin is not null and inicio is not null
   and extract(epoch from (fin - inicio)) between 300 and 86400;

comment on table public.servicios is
  'Qué se agenda y cuánto dura. Paso 1 del motor de agenda (ver agenda-propia-por-rubro.md).';
