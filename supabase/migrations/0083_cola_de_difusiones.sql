-- Las difusiones dejan de enviarse dentro de la petición.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE HABÍA NO AGUANTABA. `sendCampaign` recorría la audiencia con un `for`
-- DENTRO de un server action: una llamada HTTP a Meta por contacto, todas
-- seguidas, mientras el navegador esperaba. Con cuarenta contactos pasaba; con
-- mil, la función se corta a mitad —Netlify no espera un minuto— y el resultado
-- es lo peor posible: unos recibieron, otros no, NADIE SABE QUIÉNES, y volver a
-- pulsar «enviar» se lo manda otra vez a los que ya lo tenían.
--
-- Hay clientes que van a mandar más de mil.
--
-- AHORA LA PANTALLA SOLO ENCOLA. Escribe la lista de destinatarios y contesta.
-- Un reloj de la base va sacando lotes y enviando, y cada intento queda escrito
-- en su fila. Si algo se cae, se ve exactamente dónde se quedó.
--
-- ── LO ÚNICO DIFÍCIL: QUE NADIE RECIBA DOS VECES ────────────────────────────
--
-- Dos ejecuciones solapadas —el reloj dispara cada minuto y una tanda tarda
-- más— leerían los mismos pendientes y mandarían el mensaje por duplicado. Eso
-- no se arregla mirando después: se arregla al tomar el lote.
--
-- `for update skip locked` es lo que lo impide. Quien llega primero bloquea las
-- filas y se las lleva marcadas como «enviando»; el segundo NO espera —que
-- sería igual de malo, acabaría mandándolas él— sino que las salta y se lleva
-- otras. Es el patrón de cola de toda la vida y es la razón de que esto sea una
-- función de base y no una consulta desde el panel.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.campaign_recipients
  add column if not exists intentos  integer not null default 0,
  add column if not exists tomado_en timestamptz;

comment on column public.campaign_recipients.intentos is
  'Cuántas veces se ha intentado enviar. Tope bajo: un número que rebota no mejora insistiendo.';
comment on column public.campaign_recipients.tomado_en is
  'Cuándo se lo llevó una tanda. Sirve para rescatar lo que quedó a medias.';

-- El índice de la cola. Sin él, cada tanda recorre la tabla entera de envíos
-- históricos para encontrar los pendientes de hoy.
create index if not exists campaign_recipients_cola_idx
  on public.campaign_recipients (status, created_at)
  where status in ('pendiente', 'enviando');

create index if not exists campaign_recipients_campana_idx
  on public.campaign_recipients (campaign_id, status);

-- ── Tomar un lote, sin que dos tandas se pisen ─────────────────────────────
create or replace function public.campanas_tomar_lote(p_limite int default 50)
returns table (
  id           uuid,
  campaign_id  uuid,
  org_id       uuid,
  contact_id   uuid,
  phone        text,
  nombre       text,
  plantilla    text,
  idioma       text,
  variables    int,
  pnid         text,
  token        text
)
language plpgsql
security definer
volatile
set search_path = public
as $fn$
begin
  return query
  with tomadas as (
    update campaign_recipients r
       set status    = 'enviando',
           tomado_en = now(),
           intentos  = r.intentos + 1
     where r.id in (
       select x.id
         from campaign_recipients x
         join campaigns c on c.id = x.campaign_id
        where c.status in ('encolada', 'enviando')
          and (
            x.status = 'pendiente'
            -- RESCATE DE LO QUE QUEDÓ A MEDIAS, y con dos condiciones que no
            -- son opcionales: solo si NO hay ni identificador de Meta ni error
            -- apuntado —es decir, no llegó a saberse nada de ese envío— y solo
            -- un par de veces. Reintentar un mensaje que quizá sí salió es
            -- mandárselo dos veces a alguien, y eso cuesta el cliente.
            or (
              x.status = 'enviando'
              and x.tomado_en < now() - interval '15 minutes'
              and x.wa_message_id is null
              and x.error is null
              and x.intentos < 3
            )
          )
        order by x.created_at
        limit greatest(1, least(coalesce(p_limite, 50), 500))
        -- LO QUE EVITA EL ENVÍO DOBLE. El segundo en llegar no espera: salta
        -- estas filas y se lleva otras.
        for update skip locked
     )
     returning r.id, r.campaign_id, r.org_id, r.contact_id, r.phone, r.name
  )
  select t.id, t.campaign_id, t.org_id, t.contact_id, t.phone, t.name,
         c.template_name, c.template_language,
         coalesce(w.variables, 0)::int,
         ch.phone_number_id, ch.access_token
    from tomadas t
    join campaigns c on c.id = t.campaign_id
    left join whatsapp_channels ch on ch.bot_id = c.bot_id
    left join whatsapp_templates w
           on w.org_id = c.org_id
          and w.name = c.template_name
          and w.language = c.template_language;
end $fn$;

-- Solo la tarea programada la usa, con la llave de servicio. Nadie más.
revoke execute on function public.campanas_tomar_lote(int) from public, anon, authenticated;

comment on function public.campanas_tomar_lote is
  'Toma un lote de destinatarios pendientes y los marca como enviando, sin que dos tandas se pisen.';

-- ── Cerrar la campaña cuando ya no queda nadie ─────────────────────────────
-- VA EN LA BASE Y NO EN EL PANEL porque quien tiene que darse cuenta es quien
-- acaba de enviar el último, y ese es el reloj. Si lo decidiera la pantalla,
-- una campaña terminada seguiría diciendo «enviando» hasta que alguien la
-- abriera.
create or replace function public.campanas_cerrar_terminadas()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare n integer;
begin
  with listas as (
    update campaigns c
       set status = 'enviada'
     where c.status in ('encolada', 'enviando')
       and not exists (
         select 1 from campaign_recipients r
          where r.campaign_id = c.id
            and r.status in ('pendiente', 'enviando')
       )
    returning 1
  )
  select count(*) into n from listas;
  return coalesce(n, 0);
end $fn$;

revoke execute on function public.campanas_cerrar_terminadas() from public, anon, authenticated;

-- ── El reloj ───────────────────────────────────────────────────────────────
-- CADA MINUTO, como las salidas. Una tanda manda en paralelo dentro de su
-- minuto, así que mil destinatarios salen en un rato y no en un día.
select cron.schedule(
  'demandu-difusiones',
  '* * * * *',
  $cron$
  select net.http_post(
    url     := 'https://platform.demandu.tech/api/campanas/enviar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-demandu-ticket', public.nuevo_ticket_de_cron('difusiones')::text
    )
  );
  $cron$
)
where not exists (select 1 from cron.job where jobname = 'demandu-difusiones');
