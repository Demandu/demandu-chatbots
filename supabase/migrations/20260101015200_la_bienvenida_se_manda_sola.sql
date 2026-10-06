-- La tarea que manda el correo de bienvenida.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA TAREA Y NO UN ENVÍO EN EL MOMENTO DEL ALTA.
--
-- Porque **el alta ocurre dentro de la base**. Un negocio nace en
-- `provisionar_negocio`, que la llama un disparador de Postgres cuando aparece
-- el usuario — y eso pasa igual si entró por Facebook, por Apple o por el
-- formulario. Postgres no manda correos.
--
-- Se podría enganchar en la pantalla de bienvenida, pero por ahí no pasan
-- todos: quien se registra escribiendo el nombre de su negocio va directo al
-- panel. Enganchar en dos sitios distintos es garantizar que un día uno de los
-- dos deje de mandarlo sin que nadie se entere — porque nadie echa de menos un
-- correo que no sabe que existe.
--
-- Una tarea que pregunta «quién nació y todavía no lo recibió» los coge a
-- TODOS, vengan por donde vengan, hoy y con las puertas que se añadan mañana.
--
-- ── CADA CINCO MINUTOS, NO CADA MINUTO ────────────────────────────────────
--
-- Es un correo que dice «conecta tu WhatsApp cuando puedas»: llegar cinco
-- minutos después de registrarse no cambia nada. Una tarea por minuto para algo
-- que ocurre unas pocas veces al día son mil llamadas diarias a cambio de nada.
--
-- (El de confirmar la cuenta sí tiene que ser instantáneo, y por eso lo manda
-- Supabase en el momento y no pasa por aquí.)
--
-- ── SIN SECRETO QUE CONFIGURAR ────────────────────────────────────────────
--
-- El ticket lo emite la propia base justo antes de llamar, vale cinco minutos y
-- se gasta al usarlo (0059). Es la lección de la tarea de Sheets, que estuvo
-- desde el 22 de agosto llamando 4.859 veces con el texto de ejemplo
-- «PEGA_AQUI_TU_SECRETO» — y el registro del cron decía «succeeded» cada vez,
-- porque el SQL sí corría; lo que fallaba era la petición HTTP.
-- ─────────────────────────────────────────────────────────────────────────────

select cron.schedule(
  'demandu-bienvenida',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url     := 'https://platform.demandu.tech/api/correos/bienvenida',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-demandu-ticket', public.nuevo_ticket_de_cron('correo_bienvenida')::text
    )
  );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'demandu-bienvenida');
