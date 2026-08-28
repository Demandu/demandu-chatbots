-- QUE UN MENSAJE NO SE PROCESE DOS VECES.
--
-- CÓMO SALIÓ ESTO. Probando el bloque de «Acción / Webhook» vi llegar el mismo
-- mensaje dos veces seguidas, y el flujo se ejecutó las dos: el webhook se
-- disparó dos veces. No era el bloque: era que el motor no tiene ni idea de si
-- ya vio ese mensaje.
--
-- POR QUÉ IMPORTA MUCHO MÁS DE LO QUE PARECE. Meta REENVÍA el webhook cuando no
-- recibe un 200 rápido. Cada reenvío vuelve a correr el flujo entero: el
-- cliente recibe los mensajes repetidos, la cita se agenda dos veces, el
-- webhook al CRM del negocio se dispara dos veces, y la bolsa de mensajes se
-- cobra dos veces. Y esto empeoró justo ahora, porque el bloque de espera puede
-- retener la respuesta varios segundos — que es exactamente cuando Meta
-- reintenta.
--
-- La clave primaria hace el trabajo: dos peticiones a la vez no pueden insertar
-- la misma fila, así que el que pierde sabe que llegó tarde. No hace falta
-- ningún candado ni ninguna consulta previa que se pueda colar por en medio.

create table if not exists public.mensajes_vistos (
  wa_message_id text primary key,
  visto_at timestamptz not null default now()
);

create index if not exists mensajes_vistos_por_fecha on public.mensajes_vistos (visto_at);

-- Nadie de fuera tiene por qué leer esto: es fontanería del motor.
alter table public.mensajes_vistos enable row level security;
revoke all on public.mensajes_vistos from anon, authenticated;

-- Se limpia sola. Guardar los ids de siempre no sirve de nada: Meta no
-- reintenta un mensaje de hace tres días.
create or replace function public.limpiar_mensajes_vistos()
returns integer
language sql
security definer
set search_path = public
as $$
  with borrados as (
    delete from public.mensajes_vistos where visto_at < now() - interval '3 days' returning 1
  )
  select count(*)::int from borrados;
$$;

revoke execute on function public.limpiar_mensajes_vistos() from public, anon;
grant execute on function public.limpiar_mensajes_vistos() to service_role;
