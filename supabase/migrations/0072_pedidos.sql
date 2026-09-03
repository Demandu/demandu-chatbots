-- El pedido, como objeto.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASTA AHORA UN PEDIDO ERA UN TEXTO DE WHATSAPP. Cobrar con Yappy, empujarlo
-- al POS de un restaurante, mandarlo a un repartidor, contar cuánto compra un
-- cliente al mes: todo eso necesita lo mismo, un pedido con id, estado y total.
-- Sin esta tabla, cada una de esas cosas se construye leyendo un mensaje de
-- chat, y eso no se puede hacer bien.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.pedidos (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  tienda_id    uuid not null references public.tiendas(id) on delete cascade,

  -- EL NÚMERO QUE DICE EL CLIENTE POR TELÉFONO. Va por tienda y empieza en 1:
  -- «el pedido 1042» es una frase que alguien tiene que poder decir en voz alta,
  -- y un uuid no lo es.
  numero       integer not null,

  estado       text not null default 'recibido'
               check (estado in ('recibido','confirmado','preparando','en_camino','entregado','cancelado')),

  -- De dónde vino. Hoy siempre 'tienda'; mañana el bot creará pedidos también.
  canal        text not null default 'tienda',

  -- EN CENTAVOS Y CALCULADO EN EL SERVIDOR. Nunca lo que diga el navegador: si
  -- el total viniera del cliente, cualquiera podría pedir por un centavo.
  total        integer not null default 0 check (total >= 0),

  -- Lo que contestó en el formulario, con la etiqueta que vio. Se guarda el
  -- texto de la pregunta, no solo su id: si mañana el negocio la renombra, el
  -- pedido viejo tiene que seguir explicándose solo.
  respuestas   jsonb not null default '[]'::jsonb,

  -- Para engancharlo con la Bandeja y el Embudo cuando se identifique a quien
  -- pidió. Nulo mientras no se sepa.
  contacto_id      uuid references public.contacts(id) on delete set null,
  conversacion_id  uuid references public.conversations(id) on delete set null,

  -- Cada módulo (cobro, entrega, POS) guarda lo suyo aquí sin migrar la tabla.
  metadatos    jsonb not null default '{}'::jsonb,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  unique (tienda_id, numero)
);

create table if not exists public.pedido_lineas (
  id           uuid primary key default gen_random_uuid(),
  pedido_id    uuid not null references public.pedidos(id) on delete cascade,

  -- Se apunta al producto para poder analizar «lo más vendido», pero SOLO como
  -- referencia: si el producto se borra, la línea sobrevive.
  producto_id  uuid references public.tienda_productos(id) on delete set null,

  -- ───────────────────────────────────────────────────────────────────────────
  -- EL NOMBRE Y EL PRECIO SE CONGELAN AQUÍ, no se leen del producto.
  --
  -- Si la línea apuntara al producto para saber cuánto costó, mañana el negocio
  -- sube un precio y TODOS los pedidos viejos pasarían a decir el precio nuevo.
  -- Eso rompe la contabilidad, las devoluciones y cualquier reclamo, y no hay
  -- forma de recuperarlo. Es el error más común de los catálogos caseros y el
  -- más caro de deshacer.
  -- ───────────────────────────────────────────────────────────────────────────
  nombre       text not null,
  precio       integer not null check (precio >= 0),   -- unitario, con recargos
  cantidad     integer not null check (cantidad > 0),
  elegidas     jsonb not null default '[]'::jsonb,      -- [{grupo,texto,recargo}]
  nota         text,

  orden        integer not null default 0
);

-- La bitácora. Sin esto, el día que un pago no confirme o un repartidor no
-- reciba, no hay nada que mirar — que es exactamente lo que ya nos pasó con los
-- webhooks de Meta.
create table if not exists public.pedido_eventos (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references public.pedidos(id) on delete cascade,
  que        text not null,
  detalle    jsonb not null default '{}'::jsonb,
  quien      text,
  created_at timestamptz not null default now()
);

create index if not exists pedidos_tienda_idx on public.pedidos (tienda_id, created_at desc);
create index if not exists pedidos_estado_idx on public.pedidos (tienda_id, estado);
create index if not exists pedidos_contacto_idx on public.pedidos (contacto_id, created_at desc);
create index if not exists pedido_lineas_pedido_idx on public.pedido_lineas (pedido_id, orden);
create index if not exists pedido_eventos_pedido_idx on public.pedido_eventos (pedido_id, created_at);

-- El contador del número, atómico. Dos clientes pidiendo a la vez no pueden
-- llevarse el mismo número: `update … returning` bloquea la fila.
alter table public.tiendas add column if not exists ultimo_pedido integer not null default 0;

create or replace function public.siguiente_numero_pedido(p_tienda uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.tiendas
     set ultimo_pedido = ultimo_pedido + 1
   where id = p_tienda
  returning ultimo_pedido into n;
  return n;
end;
$$;

alter table public.pedidos        enable row level security;
alter table public.pedido_lineas  enable row level security;
alter table public.pedido_eventos enable row level security;

-- SOLO LA ORGANIZACIÓN DUEÑA. A propósito NO hay política para `anon`.
--
-- El escaparate es público, pero los pedidos NO se crean desde el navegador:
-- se crean en el servidor, que recalcula cada precio contra la base. Si el
-- navegador pudiera insertar, cualquiera podría pedir un saco de 60 dólares
-- por un centavo — y el negocio se enteraría al preparar el pedido.
create policy pedidos_org on public.pedidos
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy pedido_lineas_org on public.pedido_lineas
  for all to authenticated
  using (pedido_id in (select id from public.pedidos where org_id in (select auth_org_ids())))
  with check (pedido_id in (select id from public.pedidos where org_id in (select auth_org_ids())));

create policy pedido_eventos_org on public.pedido_eventos
  for all to authenticated
  using (pedido_id in (select id from public.pedidos where org_id in (select auth_org_ids())))
  with check (pedido_id in (select id from public.pedidos where org_id in (select auth_org_ids())));

comment on table public.pedidos is
  'El pedido como objeto: sobre esto se cuelgan cobros, entregas, POS y las métricas del embudo.';
comment on column public.pedido_lineas.precio is
  'Unitario y CONGELADO, con recargos incluidos. Nunca se lee del producto: un precio que cambia reescribiría el histórico.';
