-- LAS CITAS SE GUARDAN AQUÍ, NO SOLO EN GOOGLE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ EXISTE ESTA TABLA
--
-- Hoy, cuando la plataforma agenda, guarda en las variables de la conversación
-- el enlace del evento y la hora — y NO el identificador del evento. Con eso se
-- puede escribir «tu cita quedó el jueves a las 10», y nada más.
--
-- No se puede MOVER ni CANCELAR, porque no se sabe cuál. Eso es lo que impide
-- que la IA haga lo que cualquiera espera de una asistente:
--
--   cliente → «oye, ¿podemos mover la cita del jueves?»
--   bot     → (no tiene ni idea de qué cita le hablan)
--
-- Y las variables de la conversación no sirven para esto aunque se les meta el
-- identificador: se pierden al cerrar la charla, viven en un solo canal —quien
-- agendó por Instagram y escribe por WhatsApp es otra conversación—, y solo
-- guardan la última.
--
-- ── LO QUE MANDA SIGUE SIENDO LA AGENDA DEL NEGOCIO ───────────────────────
--
-- Esto NO es una copia de Google Calendar ni intenta serlo. Si el dueño mueve
-- la cita desde su calendario, aquí se queda la hora vieja, y está bien: la
-- verdad de cuándo es la cita vive en su agenda, que es donde él la mira.
--
-- Esta tabla contesta una sola pregunta, la que Google no puede contestar:
-- ¿QUÉ CITA DE MI AGENDA ES DE ESTA PERSONA QUE ME ESTÁ ESCRIBIENDO? Por eso lo
-- que se guarda es el enganche —de quién es, dónde está, cómo se llama en el
-- proveedor— y no el contenido del evento.
--
-- ── EL ESTADO ES NUESTRO, EL BORRADO ES DE GOOGLE ─────────────────────────
--
-- Cancelar borra el evento en Google y aquí solo cambia `estado`. La fila se
-- queda: es lo que permite que el bot sepa después «esta persona canceló» en
-- vez de «esta persona nunca agendó», que no es lo mismo ni para el negocio ni
-- para el embudo. Y cuando alguien pregunte por qué su cliente no llegó, el
-- rastro existe.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.citas (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,

  -- ── DE QUIÉN ES ────────────────────────────────────────────────────────
  -- El contacto es lo que de verdad importa y por eso NO se borra en cascada:
  -- una cita sin ficha sigue siendo una cita que el negocio tiene mañana a las
  -- diez. La conversación es solo el sitio por donde entró.
  contact_id      uuid references public.contacts(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,

  -- ── DÓNDE ESTÁ ─────────────────────────────────────────────────────────
  -- `calendario` es imprescindible para poder tocarla: la API de Google pide
  -- el calendario Y el evento. Sin él solo se podrían mover las citas del
  -- calendario principal, que no es donde las tiene la mitad de la gente.
  proveedor       text not null check (proveedor in ('google', 'calendly')),
  evento_id       text not null,
  calendario      text,
  enlace          text,
  -- Calendly da DOS enlaces distintos —cambiar y cancelar— y no caben en uno.
  -- Con Google va vacío: allí se mueve y se borra por API.
  enlace_cancelar text,

  inicio          timestamptz not null,
  fin             timestamptz,
  titulo          text,

  -- Con quién quedó. Se copia a propósito en vez de leerlo del contacto: si
  -- mañana cambia su correo, la invitación de esta cita se mandó al de
  -- entonces, y para entender un «no me llegó nada» hay que saber a cuál.
  nombre          text,
  correo          text,

  estado          text not null default 'agendada'
                  check (estado in ('agendada', 'movida', 'cancelada')),

  creada_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── LA MISMA CITA NO SE APUNTA DOS VECES ─────────────────────────────────
-- Un reintento del motor, un webhook de Calendly que llega repetido, o el
-- mismo evento entrando por dos caminos. Sin esto, «tu próxima cita» sería
-- ambigua y mover una dejaría la otra viva.
create unique index if not exists citas_evento_unico
  on public.citas (org_id, proveedor, evento_id);

-- La consulta que se hace en cada mensaje: «¿esta persona tiene alguna cita
-- por delante?». Va por contacto y por fecha porque es exactamente así.
create index if not exists citas_de_la_persona_idx
  on public.citas (org_id, contact_id, estado, inicio);

create index if not exists citas_agenda_idx on public.citas (org_id, inicio);

alter table public.citas enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='citas' and policyname='citas_all') then
    create policy citas_all on public.citas
      for all
      using      (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

comment on table public.citas is
  'El enganche entre una cita de la agenda del negocio y la persona que escribe. NO es una copia del calendario: contesta «qué cita es de esta persona», que es lo único que Google no puede contestar.';

-- ── EL EMBUDO Y EL CRM SE ENTERAN ────────────────────────────────────────
--
-- `cita.agendada` ya se emitía desde el motor y desde el webhook de Calendly.
-- Faltaban las otras dos: un negocio cuyo cliente MUEVE la cita tres veces y
-- luego la cancela veía una tarjeta parada en «Cita agendada» para siempre.
--
-- Se emite desde el disparador y no desde el código que agenda, por lo mismo
-- que la etiqueta de etapa (ver la 0099): da igual quién la mueva —la IA, un
-- flujo, el webhook de Calendly o una consulta suelta—, el aviso sale del
-- mismo sitio que la verdad.
create or replace function public.cita_cuenta_lo_que_pasa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_evento text;
begin
  if tg_op = 'INSERT' then
    v_evento := 'cita.agendada';
  elsif new.estado is distinct from old.estado then
    v_evento := case new.estado
      when 'cancelada' then 'cita.cancelada'
      when 'movida'    then 'cita.movida'
      else null
    end;
  elsif new.inicio is distinct from old.inicio then
    -- Movida sin cambiar de estado: pasa cuando se reagenda una cita que ya
    -- estaba 'agendada' y se deja 'agendada'. Sigue siendo una cita movida.
    v_evento := 'cita.movida';
  end if;

  if v_evento is null then return null; end if;

  perform public.emitir_evento(new.org_id, v_evento, jsonb_build_object(
    'cita_id',        new.id,
    'contacto_id',    new.contact_id,
    'conversacion_id', new.conversation_id,
    'inicio',         new.inicio,
    'correo',         new.correo,
    'nombre',         new.nombre,
    'por',            new.proveedor
  ));
  return null;

exception when others then
  -- Contar lo que pasó es una comodidad; la cita es lo que el negocio pidió.
  -- Misma lección que la 0090 y la 0099: ningún añadido tumba lo de abajo.
  raise warning '[cita_cuenta_lo_que_pasa] (%): %', sqlstate, sqlerrm;
  return null;
end $$;

drop trigger if exists cita_cuenta_lo_que_pasa on public.citas;
create trigger cita_cuenta_lo_que_pasa
  after insert or update of estado, inicio on public.citas
  for each row execute function public.cita_cuenta_lo_que_pasa();

-- ── LAS HERRAMIENTAS QUE EL NEGOCIO APAGÓ A PROPÓSITO ────────────────────
--
-- A partir de ahora, conectar una agenda o encender una tienda ENCIENDE SOLO
-- las herramientas de la IA que van con ellas. Es lo que hace que un negocio
-- que no sabe qué es una integración acabe con una asistente que agenda.
--
-- Pero hay negocios que conectan su agenda solo para lo interno y NO quieren
-- que el bot toque citas. Para ellos hace falta poder decir que no — y tiene
-- que ser una lista de APAGADAS, no de encendidas:
--
-- Con una lista de encendidas, una herramienta nueva nace apagada para todo el
-- mundo y hay que ir a marcarla cuenta por cuenta. Es lo que ya pasó: tres
-- herramientas de la tienda funcionaban, estaban desplegadas, y no las tenía
-- nadie porque no había casilla donde marcarlas.
--
-- Con una lista de apagadas, lo nuevo llega encendido a quien tiene con qué
-- usarlo, y el que dijo que no sigue diciendo que no.
alter table public.agentes  add column if not exists herramientas_apagadas text[];

comment on column public.agentes.herramientas_apagadas is
  'Herramientas automáticas que este negocio apagó a propósito. Lista de APAGADAS, no de encendidas: así una herramienta nueva llega encendida a quien tiene con qué usarla.';
