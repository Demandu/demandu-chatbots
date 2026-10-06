-- ─────────────────────────────────────────────────────────────────────────────
-- LOS RECORDATORIOS DE CITA LOS MANDA ALGUIEN
--
-- Toda la máquina existía: la plantilla que se envía sola a Meta cuando el
-- cliente conecta su agenda, el envío con sus comprobaciones, y la lectura de
-- «Confirmo» y «Necesito cambiarla». Lo único que faltaba era QUIÉN la dispara.
--
-- Había doce tareas programadas y NINGUNA miraba `citas`. Así que el
-- recordatorio solo salía si alguien del negocio entraba al calendario y
-- pulsaba un botón — o sea, casi nunca.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Cuántas veces se ha intentado ───────────────────────────────────────
--
-- NO es un contador para curiosear. Hace dos trabajos, y los dos importan:
--
-- EL TOPE. Si la plantilla no está aprobada en la cuenta de Meta de ese
-- negocio, todos sus envíos fallan igual. Sin tope, una tarea cada diez minutos
-- convierte eso en una tormenta de rechazos, y Meta le baja la calidad al
-- número — lo que afecta a TODOS los mensajes del negocio, no solo a estos.
--
-- EL CANDADO. Subirlo es lo que reclama una cita para una ejecución concreta:
-- el código lo escribe comparando contra el valor que acaba de leer, así que de
-- dos ejecuciones solapadas solo una se la lleva. Sin eso, la misma persona
-- recibe dos recordatorios, que es la forma más rápida de que silencie el
-- número del negocio.
alter table public.citas
  add column if not exists recordatorio_intentos smallint not null default 0;

alter table public.citas
  drop constraint if exists citas_recordatorio_intentos_positivo;
alter table public.citas
  add constraint citas_recordatorio_intentos_positivo
  check (recordatorio_intentos >= 0);

-- ── 2. El índice que hace barata la pregunta ───────────────────────────────
--
-- La tarea pregunta cada diez minutos «¿cuáles empiezan pronto y no se han
-- recordado?». Es PARCIAL a propósito: las citas ya recordadas y las canceladas
-- son la mayoría con el tiempo, y no tiene sentido cargar con ellas en un
-- índice que existe justo para no mirarlas.
create index if not exists citas_por_recordar_idx
  on public.citas (inicio)
  where recordatorio_enviado_at is null and estado <> 'cancelada';

-- ── 3. La tarea ────────────────────────────────────────────────────────────
--
-- CADA DIEZ MINUTOS, no cada minuto. Un recordatorio que sale a las 10:07 en
-- vez de a las 10:00 no le cambia el día a nadie, y cada vuelta es una consulta
-- a la base que no hace falta pagar seis veces por hora.
--
-- El aviso sale 24 horas antes. Para una cita agendada con menos margen, sale
-- en cuanto pasa una hora desde que se agendó: recordarle a alguien a los dos
-- minutos de reservar la cita que reservó se lee como un error del sistema.
-- Esos números viven en `src/lib/agenda/cuandoRecordar.ts` — aquí no se repiten
-- para que no puedan discrepar.
--
-- Sin secreto que configurar: la base emite un ticket de un solo uso justo
-- antes de llamar. Ver `src/lib/cron.ts`, y la historia de los 4.859 rechazos
-- de la tarea de Sheets que le dio origen.
select cron.schedule(
  'demandu-recordatorios',
  '*/10 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://platform.demandu.tech/api/citas/recordar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-demandu-ticket', public.nuevo_ticket_de_cron('recordatorios_cita')::text
    )
  );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'demandu-recordatorios');
