-- ESPERAS DE VERDAD: minutos y horas.
--
-- EL PROBLEMA. El bloque «Espera» del constructor deja elegir segundos, minutos
-- u horas. El motor solo puede dormir unos segundos: corre dentro de la
-- petición del webhook de Meta, y si tarda más, Meta reenvía el mensaje y —peor—
-- la función se corta sola. Así que una espera de dos horas se ejecutaba en
-- cero segundos. El cliente configuraba «recuérdaselo en 2 h» y el recordatorio
-- salía disparado en el mismo instante.
--
-- LA SOLUCIÓN. Se apunta dónde se quedó la conversación y se retoma después.
-- El reloj vive en Postgres (pg_cron) y el aviso viaja por pg_net: no depende
-- de Netlify, ni de un servicio externo, ni de que alguien se acuerde de
-- configurar una variable de entorno.
--
-- SIN SECRETOS COMPARTIDOS. Cada espera lleva SU PROPIO testigo de un solo uso,
-- generado por la base. El aviso lo lleva consigo y el motor lo compara con el
-- de la fila. No hay ninguna llave guardada en la definición del cron —que
-- cualquiera con acceso a `cron.job` podría leer— ni nada que configurar a mano.

create table if not exists public.esperas_pendientes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  bot_id uuid,
  flow_id uuid,
  -- El bloque por el que hay que SEGUIR (el siguiente al de la espera).
  nodo_id text not null,
  -- Las variables tal como estaban. Si se recalcularan al retomar, el mensaje
  -- diría cosas distintas a las que el cliente vio antes de la pausa.
  vars jsonb not null default '{}'::jsonb,
  ejecutar_at timestamptz not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviada', 'hecha', 'caducada', 'cancelada', 'fallida')),
  -- De un solo uso: se compara al retomar y la fila pasa a 'hecha'.
  testigo uuid not null default gen_random_uuid(),
  intentos integer not null default 0,
  detalle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists esperas_por_vencer on public.esperas_pendientes (estado, ejecutar_at);
create index if not exists esperas_por_conversacion on public.esperas_pendientes (conversation_id);

alter table public.esperas_pendientes enable row level security;
drop policy if exists esperas_pendientes_lectura on public.esperas_pendientes;
-- El cliente puede VER sus esperas (para entender por qué su bot va a escribir
-- más tarde), pero no tocarlas: quien las crea y las cierra es el motor.
create policy esperas_pendientes_lectura on public.esperas_pendientes
  for select using (org_id in (select auth_org_ids()));
revoke insert, update, delete on public.esperas_pendientes from anon, authenticated;

-- ─── Una conversación, una espera ────────────────────────────────────────────
--
-- Si el lead escribe durante la pausa, la conversación siguió por otro lado y
-- retomar donde se quedó sería hablarle de algo que ya pasó. Se cancela.
create or replace function public.cancelar_esperas_de(p_conversation_id uuid)
returns integer
language sql
security definer
set search_path = public
as $$
  with tocadas as (
    update public.esperas_pendientes
       set estado = 'cancelada', updated_at = now(),
           detalle = 'el lead escribió antes de que venciera la espera'
     where conversation_id = p_conversation_id and estado in ('pendiente', 'enviada')
    returning 1
  )
  select count(*)::int from tocadas;
$$;

revoke execute on function public.cancelar_esperas_de(uuid) from public, anon;
grant execute on function public.cancelar_esperas_de(uuid) to service_role;

-- ─── El reloj ────────────────────────────────────────────────────────────────
--
-- Toma las esperas vencidas y avisa al motor. El `update ... returning` hace de
-- candado: la fila sale de 'pendiente' en la MISMA sentencia que la selecciona,
-- así que dos ejecuciones del cron a la vez no pueden despachar la misma dos
-- veces.
--
-- Se limita a 50 por vuelta a propósito. Si un día se acumulan miles, es mejor
-- que salgan en tandas de 50 cada minuto que reventar la base intentando
-- despacharlas todas de golpe.
create or replace function public.despachar_esperas()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- La dirección del motor. Está aquí y en un solo sitio: el día que el
  -- proyecto de Supabase cambie, se cambia esta línea y ya.
  v_url constant text := 'https://stgedtcsuyypzjbxcpoe.supabase.co/functions/v1/whatsapp?continuar=1';
  v_fila record;
  v_cuantas int := 0;
begin

  for v_fila in
    update public.esperas_pendientes e
       set estado = 'enviada', intentos = e.intentos + 1, updated_at = now()
     where e.id in (
       select id from public.esperas_pendientes
        where estado = 'pendiente' and ejecutar_at <= now()
        order by ejecutar_at
        limit 50
        for update skip locked
     )
    returning e.id, e.testigo
  loop
    perform net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object('espera', v_fila.id, 'testigo', v_fila.testigo)
    );
    v_cuantas := v_cuantas + 1;
  end loop;

  return v_cuantas;
end;
$$;

revoke execute on function public.despachar_esperas() from public, anon, authenticated;

-- ─── Red de seguridad del propio reloj ───────────────────────────────────────
--
-- Si el motor no contesta, la fila se queda en 'enviada' para siempre y esa
-- conversación no se retoma nunca. A los 10 minutos se devuelve a la cola; a
-- los 5 intentos se da por perdida, para no reintentar hasta el fin de los
-- tiempos algo que está roto.
create or replace function public.rescatar_esperas_colgadas()
returns integer
language sql
security definer
set search_path = public
as $$
  with rescatadas as (
    update public.esperas_pendientes
       set estado = case when intentos >= 5 then 'fallida' else 'pendiente' end,
           detalle = case when intentos >= 5 then 'el motor no la retomó tras 5 intentos' else detalle end,
           updated_at = now()
     where estado = 'enviada' and updated_at < now() - interval '10 minutes'
    returning 1
  )
  select count(*)::int from rescatadas;
$$;

revoke execute on function public.rescatar_esperas_colgadas() from public, anon, authenticated;
