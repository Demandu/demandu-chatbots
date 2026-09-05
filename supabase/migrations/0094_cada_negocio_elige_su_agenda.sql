-- CADA NEGOCIO ELIGE CON QUÉ AGENDA TRABAJA SU CHATBOT.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Hasta ahora ganaba Calendly siempre que estuviera conectado. La razón era
-- buena —quien conecta Calendly es porque su disponibilidad de verdad vive ahí,
-- con sus reglas de antelación y sus topes por día— pero dejaba fuera un caso
-- normal: el negocio que usa Google para lo interno y Calendly para otra cosa,
-- o el que conecta Calendly solo para probarlo.
--
-- A ese negocio le cambiábamos la agenda del bot SIN AVISAR, con un clic dado
-- en otra pantalla, y para volver atrás tenía que desconectar Calendly entero.
--
-- ── POR QUÉ EN `organizations` Y NO EN EL BLOQUE ──────────────────────────
--
-- Porque es una propiedad del NEGOCIO, no de una conversación. Un negocio
-- trabaja con una agenda; que cada bloque «Agendar cita» eligiera la suya
-- añade una pregunta en cada bloque para un caso raro, y abre la puerta a que
-- un flujo de hace seis meses siga agendando en la agenda que dejaron de usar.
--
-- Lo que SÍ es por bloque, y ya funcionaba, es QUÉ TIPO DE CITA se agenda
-- («Consulta 30 min» o «Demo 60 min»): eso vive en el campo del bloque.
--
-- ── NULO SIGNIFICA «QUE DECIDA LA PLATAFORMA» ─────────────────────────────
--
-- Y es el valor con el que arrancan todas las cuentas que ya existen, así que
-- esta migración NO CAMBIA EL COMPORTAMIENTO DE NADIE. Quien tenga solo una
-- agenda conectada no verá ni el selector: no hay nada que elegir.
--
-- La restricción deja pasar el nulo a propósito. Un `check` que obligara a
-- 'auto' obligaría además a rellenar la columna en todas las filas y a que
-- cada sitio que lea sepa que 'auto' existe; con nulo, «no eligieron» se
-- escribe solo.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists agenda_preferida text;

alter table public.organizations
  drop constraint if exists organizations_agenda_preferida_valida;

alter table public.organizations
  add constraint organizations_agenda_preferida_valida
  check (agenda_preferida is null or agenda_preferida in ('google', 'calendly'));

comment on column public.organizations.agenda_preferida is
  'Con qué agenda trabaja el chatbot cuando hay más de una conectada. NULO = que decida la plataforma (gana Calendly, porque ahí viven las reglas de disponibilidad reales). Se borra sola al desconectar la agenda a la que apunta.';
