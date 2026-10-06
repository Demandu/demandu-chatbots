-- SALIDA DE EVENTOS: que lo que pasa en Demandu llegue al CRM del cliente.
--
-- POR QUÉ ESTO Y NO TRES CONECTORES. HubSpot, Salesforce y Zoho no se conectan
-- «igual pero cambiando la URL»: cada uno exige su propia app OAuth por
-- proveedor, y en el caso de HubSpot un «private app» sirve para UNA cuenta —
-- inútil para una plataforma con muchos clientes. Son tres proyectos, no uno.
--
-- Los tres, en cambio, SÍ aceptan webhooks de entrada. Y también Zapier, Make y
-- n8n. Un solo motor de salida cubre a los tres hoy, y el día que un cliente
-- pague por el conector nativo de uno, solo cambia el último tramo: el resto
-- —qué eventos existen, cómo se reintenta, dónde se ve lo que falló— ya está.
--
-- LO QUE DIFERENCIA ESTO DEL BLOQUE «ACCIÓN / WEBHOOK» que ya existe:
--   · el bloque solo dispara donde alguien lo puso dentro de un flujo; esto
--     manda también lo que pasa FUERA de un flujo (una conversación que se
--     cierra, un pase a un humano, una cita);
--   · el bloque no reintenta y no deja rastro; esto sí;
--   · el bloque hay que pegarlo en cada flujo; esto se configura una vez.

-- ─── A dónde manda cada cliente ──────────────────────────────────────────────
create table if not exists public.salidas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  nombre text not null,
  url text not null,
  -- Con esto el que recibe puede comprobar que el aviso viene de nosotros y que
  -- nadie lo manipuló por el camino. Lo generamos nosotros y se lo enseñamos al
  -- cliente una vez, como las llaves de API.
  secreto text not null,
  -- Qué eventos quiere. Vacío = todos: quien acaba de conectar su CRM casi
  -- siempre quiere todo, y filtrar es una decisión posterior.
  eventos text[] not null default '{}',
  activa boolean not null default true,
  -- Para la pantalla: qué pasó la última vez, sin tener que abrir el registro.
  ultimo_intento_at timestamptz,
  ultimo_estado integer,
  ultimo_error text,
  created_at timestamptz not null default now()
);

create index if not exists salidas_por_org on public.salidas (org_id) where activa;

alter table public.salidas enable row level security;
drop policy if exists salidas_lectura on public.salidas;
create policy salidas_lectura on public.salidas
  for select using (org_id in (select auth_org_ids()));
-- Crear y borrar salidas pasa por el servidor: el secreto se genera allí y no
-- puede venir del navegador.
revoke insert, update, delete on public.salidas from anon, authenticated;

-- ─── La cola ─────────────────────────────────────────────────────────────────
--
-- UNA FILA POR EVENTO Y POR DESTINO, no una por evento. Si un cliente manda lo
-- mismo a su CRM y a un Make, y el CRM está caído, el Make no tiene por qué
-- esperar ni reintentarse.
create table if not exists public.eventos_salientes (
  id bigserial primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  salida_id uuid not null references public.salidas(id) on delete cascade,
  tipo text not null,
  payload jsonb not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'enviado', 'fallido', 'descartado')),
  intentos integer not null default 0,
  -- Cuándo toca el siguiente intento. Con esto la espera entre reintentos vive
  -- en la fila y no hace falta ningún temporizador en memoria.
  proximo_at timestamptz not null default now(),
  ultimo_estado integer,
  ultimo_error text,
  created_at timestamptz not null default now(),
  enviado_at timestamptz
);

create index if not exists eventos_salientes_por_enviar
  on public.eventos_salientes (proximo_at) where estado = 'pendiente';
create index if not exists eventos_salientes_por_org on public.eventos_salientes (org_id, created_at desc);

alter table public.eventos_salientes enable row level security;
drop policy if exists eventos_salientes_lectura on public.eventos_salientes;
create policy eventos_salientes_lectura on public.eventos_salientes
  for select using (org_id in (select auth_org_ids()));
revoke insert, update, delete on public.eventos_salientes from anon, authenticated;

-- ─── Emitir ──────────────────────────────────────────────────────────────────
--
-- Se llama desde donde PASAN las cosas. Encola una copia por cada destino
-- suscrito y no hace nada más: mandar es cosa del reloj.
--
-- SI NO HAY DESTINOS, NO HACE NADA Y NO CUESTA NADA. Eso importa: esto se va a
-- llamar en el camino de cada mensaje, y la inmensa mayoría de los clientes no
-- tendrá ninguna salida configurada.
create or replace function public.emitir_evento(
  p_org_id uuid,
  p_tipo text,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuantos int := 0;
begin
  if p_org_id is null or coalesce(btrim(p_tipo), '') = '' then
    return 0;
  end if;

  insert into public.eventos_salientes (org_id, salida_id, tipo, payload)
  select p_org_id, s.id, p_tipo, coalesce(p_payload, '{}'::jsonb)
    from public.salidas s
   where s.org_id = p_org_id
     and s.activa
     -- Sin lista de eventos, le llega todo.
     and (cardinality(s.eventos) = 0 or p_tipo = any (s.eventos));

  get diagnostics v_cuantos = row_count;
  return v_cuantos;
end;
$$;

revoke execute on function public.emitir_evento(uuid, text, jsonb) from public, anon;
grant execute on function public.emitir_evento(uuid, text, jsonb) to service_role;

-- ─── Limpieza ────────────────────────────────────────────────────────────────
--
-- Los eventos entregados no hacen falta pasados 30 días; los fallidos se
-- guardan 90, porque son los que alguien va a querer mirar cuando pregunte
-- «¿por qué no me llegó?».
create or replace function public.limpiar_eventos_salientes()
returns integer
language sql
security definer
set search_path = public
as $$
  with borrados as (
    delete from public.eventos_salientes
     where (estado = 'enviado'  and created_at < now() - interval '30 days')
        or (estado <> 'enviado' and created_at < now() - interval '90 days')
    returning 1
  )
  select count(*)::int from borrados;
$$;

revoke execute on function public.limpiar_eventos_salientes() from public, anon, authenticated;
