-- LLAMADAS DE WHATSAPP: permiso y registro.
--
-- QUÉ CUBRE ESTO Y QUÉ NO. Meta entrega el AUDIO por WebRTC, y eso necesita un
-- servicio de medios que ni Netlify ni las Edge Functions pueden sostener. Así
-- que aquí NO se contesta ninguna llamada. Lo que sí se hace —y es la parte que
-- de verdad se usa a diario— es:
--
--   · pedirle permiso al cliente para llamarlo, que es obligatorio antes de
--     cualquier llamada saliente y hoy no se puede hacer desde la plataforma;
--   · llevar la cuenta de ese permiso, que caduca; y
--   · dejar cada llamada apuntada en la conversación, con su duración y cómo
--     terminó, para que el agente vea en la Bandeja «llamada de 3:12» junto a
--     los mensajes en vez de un hueco.
--
-- El día que se conteste audio, estas dos tablas ya son la base: lo que falta
-- es el medio, no el registro.

-- ─── Registro de llamadas ────────────────────────────────────────────────────
create table if not exists public.llamadas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  -- El identificador que da Meta. Único para que un webhook repetido —Meta los
  -- reintenta -- no cuente la misma llamada dos veces.
  wa_call_id text not null,
  telefono text not null,
  direccion text not null check (direccion in ('entrante', 'saliente')),
  estado text not null default 'sonando'
    check (estado in ('sonando', 'conectada', 'completada', 'rechazada', 'fallida', 'perdida')),
  inicio timestamptz not null default now(),
  fin timestamptz,
  duracion_seg integer,
  crudo jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (org_id, wa_call_id)
);

create index if not exists llamadas_por_org_y_fecha on public.llamadas (org_id, inicio desc);
create index if not exists llamadas_por_conversacion on public.llamadas (conversation_id, inicio desc);

alter table public.llamadas enable row level security;
drop policy if exists llamadas_all on public.llamadas;
create policy llamadas_all on public.llamadas
  for all using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

-- ─── Permiso para llamar ─────────────────────────────────────────────────────
--
-- POR QUÉ ES UNA TABLA Y NO UNA COLUMNA EN `contacts`. Porque el permiso tiene
-- historia: se pide, se concede, caduca, se vuelve a pedir. Y Meta limita
-- cuántas veces se puede pedir (una cada 24 h, dos por semana). Sin guardar
-- cuándo se pidió la última vez, la plataforma acabaría pidiendo de más y Meta
-- empezaría a rechazar — o peor, el cliente recibiría la misma petición todos
-- los días y bloquearía el número.
create table if not exists public.permisos_de_llamada (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  telefono text not null,
  estado text not null default 'pedido'
    check (estado in ('pedido', 'concedido', 'rechazado', 'caducado')),
  permanente boolean not null default false,
  pedido_at timestamptz not null default now(),
  respondido_at timestamptz,
  -- NULL con estado 'concedido' y permanente = true significa «no caduca».
  expira_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, telefono)
);

create index if not exists permisos_de_llamada_por_org on public.permisos_de_llamada (org_id, estado);

alter table public.permisos_de_llamada enable row level security;
drop policy if exists permisos_de_llamada_all on public.permisos_de_llamada;
create policy permisos_de_llamada_all on public.permisos_de_llamada
  for all using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()));

-- ─── ¿Se le puede llamar a esta persona ahora mismo? ─────────────────────────
--
-- Una sola respuesta, en la base, para que la plataforma y el motor no puedan
-- contestar cosas distintas. Contesta que NO ante la duda: llamar sin permiso
-- es lo que hace que Meta suspenda un número.
create or replace function public.puedo_llamar(p_org_id uuid, p_telefono text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select p.estado = 'concedido'
       and (p.permanente or (p.expira_at is not null and p.expira_at > now()))
    from public.permisos_de_llamada p
    where p.org_id = p_org_id and p.telefono = p_telefono
  ), false);
$$;

revoke execute on function public.puedo_llamar(uuid, text) from public, anon;
grant execute on function public.puedo_llamar(uuid, text) to authenticated, service_role;

-- ─── Ajustes de llamadas del número ──────────────────────────────────────────
-- Se guardan aquí para poder pintarlos en la plataforma sin preguntarle a Meta
-- en cada carga. Meta sigue siendo la fuente de verdad; esto es la copia.
alter table public.whatsapp_channels
  add column if not exists llamadas jsonb not null default '{}'::jsonb;
