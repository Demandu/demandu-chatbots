-- ─────────────────────────────────────────────────────────────────────────────
-- LAS PLANTILLAS DE LA CASA SE ASEGURAN SOLAS
--
-- La plantilla del recordatorio se mandaba a Meta en UN momento concreto: al
-- terminar de conectar Google o Calendly. Eso deja tres huecos que nadie ve:
--
--   · Quien conecta la agenda ANTES que WhatsApp recibe un «sin WhatsApp» y
--     nadie lo reintenta nunca. Se queda sin recordatorios para siempre.
--   · La agenda propia que viene no tiene vuelta de OAuth donde engancharse.
--   · Y el estado guardado era una foto del día que alguien abrió la pantalla
--     de plantillas: medido el 17 sep 2026, una cuenta tenía SIETE plantillas
--     guardadas como PENDING desde hacía seis días que en Meta llevaban seis
--     días aprobadas.
--
-- Esta tarea mira el ESTADO, no el evento. Es el mismo razonamiento que ya está
-- escrito en la de los correos de bienvenida: enganchar en el momento de la
-- acción obliga a que cada puerta nueva se acuerde de enganchar también, y un
-- día una no se acuerda.
--
-- Va junto con el aviso que el motor ya escucha desde la v46
-- (`message_template_status_update`), que es el camino rápido. Esto es la red
-- debajo: un aviso perdido, una app reconectada, una cuenta que ya tenía
-- plantillas antes de que existiera el aviso.
-- ─────────────────────────────────────────────────────────────────────────────

-- CADA CUARTO DE HORA. Una plantilla tarda de minutos a un día en aprobarse, y
-- el aviso del motor ya trae los cambios al instante: esto solo tiene que ser
-- lo bastante seguido para que un cliente que acaba de conectar WhatsApp no
-- espere una hora, y lo bastante espaciado para no llamar a Meta en balde.
select cron.schedule(
  'demandu-plantillas',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://platform.demandu.tech/api/plantillas/asegurar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-demandu-ticket', public.nuevo_ticket_de_cron('plantillas_de_la_casa')::text
    )
  );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'demandu-plantillas');
