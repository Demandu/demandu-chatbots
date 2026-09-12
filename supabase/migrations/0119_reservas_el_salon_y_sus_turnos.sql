-- ════════════════════════════════════════════════════════════════════════════
-- RESERVAS: EL SALÓN, SUS TURNOS Y SUS MESAS.
--
-- El complemento de reservas para restaurantes. Se vende aparte, como la
-- tienda.
--
-- ── LO QUE DECIDE SI ESTO VALE ALGO ─────────────────────────────────────────
--
-- No es el mapa. Es que NUNCA se entregue dos veces la misma mesa en el mismo
-- turno. Un mapa bonito con una sobreventa deja a un grupo de pie en la puerta
-- un sábado, delante de todo el restaurante, y ese cliente no vuelve.
--
-- Por eso el candado NO vive en la aplicación:
--
--     unique (mesa_id, fecha, turno_id)  en `reserva_mesas`
--
-- Dos reservas que llegan en el mismo segundo —una por WhatsApp y otra que el
-- encargado mete a mano— pasan las dos la comprobación de «¿está libre?», y la
-- base deja entrar UNA. Es la misma lección que `campaigns_idem_unico` (0117):
-- comprobar antes de escribir no es un candado, es una carrera.
--
-- La fila EXISTE = la mesa está tomada. Cancelar o rechazar BORRA la fila, así
-- que no hay que acordarse de filtrar por estado en ningún sitio. Un estado que
-- hay que recordar filtrar se olvida; una fila que no existe, no.
--
-- ── TURNOS FIJOS, NO HORA LIBRE ─────────────────────────────────────────────
--
-- El restaurante define sus turnos (7:00pm, 9:30pm) y la mesa se ocupa el turno
-- entero. Es como opera de verdad un restaurante de reserva en LATAM, y hace
-- que «¿está libre?» sea una pregunta con respuesta exacta en vez de un cálculo
-- sobre cuánto va a durar una cena — que nadie sabe.
--
-- ── QUÉ SE PUEDE JUNTAR CON QUÉ ─────────────────────────────────────────────
--
-- `reservas_uniones` guarda PARES, y la lógica exige que TODOS los pares de una
-- combinación estén marcados. Con cadenas (1-2 y 2-3 ⇒ 1-3) se juntarían dos
-- mesas en esquinas opuestas del salón con otra gente comiendo en medio. El
-- dueño marca pares porque es el único que sabe qué pares caben.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. Las mesas del salón ──────────────────────────────────────────────────
create table if not exists public.reservas_mesas (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  nombre       text not null,
  capacidad    int  not null check (capacidad between 1 and 40),
  zona         text,
  -- Dónde está dibujada. Solo la usa la pantalla del mapa; el cálculo de
  -- disponibilidad NUNCA mira coordenadas.
  x            int  not null default 0,
  y            int  not null default 0,
  ancho        int  not null default 80,
  alto         int  not null default 80,
  forma        text not null default 'redonda'
               check (forma in ('redonda','cuadrada','rectangular')),
  activa       boolean not null default true,
  creada_at    timestamptz not null default now(),
  -- Dos «Mesa 4» en el mismo salón es un fallo operativo: el mesero no sabe a
  -- cuál llevar al grupo.
  unique (org_id, nombre)
);

-- ── 2. Qué mesas se pueden juntar ───────────────────────────────────────────
--
-- Se guarda UNA fila por par, siempre con el id menor primero (`a < b`). Sin
-- esa regla la misma unión se podría guardar dos veces al revés y «¿están
-- unidas?» dependería de por dónde se preguntara.
create table if not exists public.reservas_uniones (
  org_id  uuid not null references public.organizations(id) on delete cascade,
  mesa_a  uuid not null references public.reservas_mesas(id) on delete cascade,
  mesa_b  uuid not null references public.reservas_mesas(id) on delete cascade,
  primary key (mesa_a, mesa_b),
  check (mesa_a < mesa_b)
);

-- ── 3. Los turnos ───────────────────────────────────────────────────────────
create table if not exists public.reservas_turnos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  nombre        text not null,
  hora          time not null,
  duracion_min  int  not null default 120 check (duracion_min between 15 and 480),
  -- Qué días de la semana existe este turno. 0 = domingo.
  dias          int[] not null default '{0,1,2,3,4,5,6}',
  /* CONFIRMA SOLA O NO.
   *
   * El turno del sábado a las 9 se confirma a mano; el del martes a las 7 lo
   * puede cerrar Lana sin despertar a nadie. Es por TURNO y no por restaurante
   * porque el riesgo no es del negocio: es de la hora pico. */
  confirma_sola boolean not null default false,
  activo        boolean not null default true,
  orden         int not null default 0,
  creado_at     timestamptz not null default now(),
  unique (org_id, nombre)
);

-- ── 4. Las reservas ─────────────────────────────────────────────────────────
create table if not exists public.reservas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  turno_id        uuid not null references public.reservas_turnos(id) on delete restrict,
  fecha           date not null,
  personas        int  not null check (personas between 1 and 100),
  nombre          text,
  telefono        text,
  notas           text,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente','confirmada','rechazada','cancelada','llego','no_llego')),
  -- Quién la creó: Lana o alguien del restaurante. Es lo que deja medir si el
  -- complemento sirve para algo.
  la_hizo         text not null default 'lana' check (la_hizo in ('lana','el negocio')),
  recordatorio_enviado_at timestamptz,
  respondio_at    timestamptz,
  respuesta       text,
  creada_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reservas_del_dia_idx on public.reservas (org_id, fecha, turno_id);
create index if not exists reservas_de_la_persona_idx on public.reservas (org_id, contact_id);

-- ── 5. Qué mesa tiene cada reserva ── AQUÍ ESTÁ EL CANDADO ──────────────────
create table if not exists public.reserva_mesas (
  reserva_id uuid not null references public.reservas(id) on delete cascade,
  mesa_id    uuid not null references public.reservas_mesas(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  -- `fecha` y `turno_id` se repiten aquí a propósito: sin ellos el índice único
  -- de abajo no se puede escribir, y ese índice es la razón de ser de la tabla.
  fecha      date not null,
  turno_id   uuid not null references public.reservas_turnos(id) on delete restrict,
  primary key (reserva_id, mesa_id)
);

-- LA MISMA MESA, EL MISMO DÍA, EL MISMO TURNO: UNA VEZ.
create unique index if not exists reserva_mesa_una_sola_vez
  on public.reserva_mesas (mesa_id, fecha, turno_id);

create index if not exists reserva_mesas_del_turno_idx
  on public.reserva_mesas (org_id, fecha, turno_id);

-- ── 6. Ajustes del complemento ──────────────────────────────────────────────
create table if not exists public.reservas_ajustes (
  org_id                 uuid primary key references public.organizations(id) on delete cascade,
  activo                 boolean not null default false,
  /* CUÁNTAS HORAS ANTES SALE EL RECORDATORIO. Lo elige el restaurante: una
   * pizzería avisa 3 horas antes y un restaurante de mantel largo, 24. */
  recordatorio_horas     int not null default 24 check (recordatorio_horas between 1 and 72),
  recordatorio_activo    boolean not null default true,
  /* Por encima de esto, Lana no decide: avisa y lo coordina una persona. */
  grupo_grande           int not null default 12 check (grupo_grande between 2 and 100),
  -- Hasta cuántas mesas se pueden juntar de una vez. Ver la cabecera.
  max_mesas_juntas       int not null default 3 check (max_mesas_juntas between 1 and 4),
  updated_at             timestamptz not null default now()
);

-- ── 7. Nadie ve el salón de otro ────────────────────────────────────────────
alter table public.reservas_mesas    enable row level security;
alter table public.reservas_uniones  enable row level security;
alter table public.reservas_turnos   enable row level security;
alter table public.reservas          enable row level security;
alter table public.reserva_mesas     enable row level security;
alter table public.reservas_ajustes  enable row level security;

-- `select auth_org_ids()` va envuelto en un SELECT a propósito: Postgres lo
-- evalúa una vez y no por cada renglón.
do $$
declare t text;
begin
  foreach t in array array[
    'reservas_mesas','reservas_uniones','reservas_turnos',
    'reservas','reserva_mesas','reservas_ajustes'
  ] loop
    execute format(
      'drop policy if exists %1$s_org on public.%1$s;
       create policy %1$s_org on public.%1$s for all to authenticated
         using (org_id in (select auth_org_ids()))
         with check (org_id in (select auth_org_ids()));', t);
  end loop;
end $$;

/* NADA DE ESTO ES PÚBLICO. La tienda sí lo es —es un escaparate— pero el mapa
 * del salón de un restaurante, con sus mesas y quién reservó, no. `anon` no
 * tiene ni una política aquí, y sin política no ve nada. */

comment on index public.reserva_mesa_una_sola_vez is
  'El candado del módulo: una mesa no se puede entregar dos veces en el mismo turno, pase lo que pase en la aplicación.';
comment on column public.reservas_turnos.confirma_sola is
  'Si Lana puede cerrar la reserva sin que la vea una persona. Falso en las horas pico.';
