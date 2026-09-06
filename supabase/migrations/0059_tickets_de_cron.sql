-- TAREAS PROGRAMADAS SIN SECRETO COMPARTIDO.
--
-- CÓMO SALIÓ ESTO. La tarea que vacía la cola de Google Sheets llevaba desde el
-- 22 de agosto ejecutándose cada 2 minutos —4.859 veces— y siendo rechazada
-- TODAS con un 401. El motivo: se registró con el secreto literal
-- «PEGA_AQUI_TU_SECRETO», y encima `CRON_SECRET` nunca llegó a existir en
-- Netlify, así que el endpoint devolvía 401 aunque el valor hubiera sido bueno.
--
-- Y LO PEOR ES CÓMO SE DISFRAZÓ: `cron.job_run_details` decía «succeeded» las
-- 4.859 veces. Claro — el SQL sí corrió. Lo que falló fue la petición HTTP, y
-- eso vive en otra tabla (`net._http_response`) que nadie mira. Una tarea que
-- se declara exitosa mientras no hace nada es peor que una que falla.
--
-- LA RAÍZ NO ERA EL VALOR MAL PEGADO, ERA EL DISEÑO. Un secreto que hay que
-- copiar a mano en dos sitios distintos —la definición del cron y las
-- variables de Netlify— es un secreto que un día está mal en uno de los dos. Y
-- guardado en `cron.job` lo lee cualquiera con acceso a la base.
--
-- EN SU LUGAR: la base emite un TICKET de un solo uso justo antes de cada
-- llamada. Vale cinco minutos, sirve para un único propósito y se consume al
-- usarlo. No hay nada que configurar, nada que copiar y nada que caduque en
-- silencio. Es el mismo patrón que ya usan las esperas programadas (0058).

create table if not exists public.tickets_de_cron (
  id uuid primary key default gen_random_uuid(),
  -- Para qué sirve. Un ticket de «sheets» no abre la puerta de «estado»: si un
  -- día uno de los endpoints se filtra, no se filtran todos.
  proposito text not null,
  creado_at timestamptz not null default now(),
  caduca_at timestamptz not null default now() + interval '5 minutes',
  usado_at timestamptz
);

create index if not exists tickets_de_cron_vivos on public.tickets_de_cron (caduca_at) where usado_at is null;

alter table public.tickets_de_cron enable row level security;
revoke all on public.tickets_de_cron from anon, authenticated;

/** Emite un ticket. Lo llama el propio cron, dentro de la base. */
create or replace function public.nuevo_ticket_de_cron(p_proposito text)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.tickets_de_cron (proposito) values (p_proposito) returning id;
$$;

revoke execute on function public.nuevo_ticket_de_cron(text) from public, anon, authenticated;

/**
 * Consume un ticket. Devuelve `true` solo la primera vez.
 *
 * Es UNA sola sentencia a propósito: comprobar y marcar en pasos separados deja
 * un hueco por el que dos peticiones simultáneas pasarían las dos.
 */
create or replace function public.usar_ticket_de_cron(p_id uuid, p_proposito text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update public.tickets_de_cron
     set usado_at = now()
   where id = p_id
     and proposito = p_proposito
     and usado_at is null
     and caduca_at > now()
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke execute on function public.usar_ticket_de_cron(uuid, text) from public, anon, authenticated;
grant execute on function public.usar_ticket_de_cron(uuid, text) to service_role;

/** Los tickets viejos no sirven de nada. Se van a los tres días. */
create or replace function public.limpiar_tickets_de_cron()
returns integer
language sql
security definer
set search_path = public
as $$
  with borrados as (
    delete from public.tickets_de_cron where creado_at < now() - interval '3 days' returning 1
  )
  select count(*)::int from borrados;
$$;

revoke execute on function public.limpiar_tickets_de_cron() from public, anon, authenticated;

-- ─── QUE UNA TAREA ROTA NO PUEDA VOLVER A PARECER SANA ───────────────────────
--
-- Esto es lo que de verdad evita que se repita. `cron.job_run_details` solo
-- sabe si el SQL corrió; el resultado HTTP está en `net._http_response`. Esta
-- vista los junta, para que mirar si las tareas funcionan sea una consulta y no
-- una investigación.
create or replace view public.salud_de_las_tareas as
  select
    r.id,
    r.created as cuando,
    r.status_code,
    r.status_code between 200 and 299 as ok,
    left(r.content, 200) as respuesta
  from net._http_response r
  order by r.created desc;

revoke all on public.salud_de_las_tareas from anon, authenticated;
