-- La tienda en línea, dentro de Demandu.
--
-- SUSTITUYE a las tiendas actuales, que viven fuera (enlaces creados en un
-- proveedor externo, contenido en un Google Sheet por tienda). Ese sistema
-- funciona, pero el cerebro es una hoja de cálculo: si alguien mueve una
-- columna la tienda se rompe, no hay permisos y no hay historial.
--
-- LO QUE SÍ SE CONSERVA es su modelo de producto, que está bien pensado y
-- probado con clientes reales. Las variedades con recargo (`Salmón {2.50}`) y
-- los modos de selección se copian tal cual: ver `variedades` más abajo.

create table if not exists public.tiendas (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,

  -- LA DIRECCIÓN PÚBLICA. Es lo que va detrás de eshop.demandu.tech/ y por eso
  -- es única en TODA la plataforma, no por organización: dos negocios no pueden
  -- reclamar el mismo enlace. Se conservan las direcciones que ya están
  -- impresas y en las biografías de Instagram de los clientes.
  slug        text not null unique
              check (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$'),

  nombre      text not null,
  activa      boolean not null default true,

  -- El chatbot al que llegan los pedidos. LA RAZÓN DE SER DE TODO ESTO: el
  -- pedido no acaba en un correo, entra en la Bandeja como conversación, con su
  -- contacto y su embudo. Es lo que ninguna tienda suelta puede hacer.
  bot_id      uuid references public.bots(id) on delete set null,

  -- Lo que en la hoja era la pestaña «configuracion»: teléfono de consultas,
  -- horario, redes, moneda, textos del pie. Va en jsonb a propósito — cada
  -- negocio enseña cosas distintas y no vamos a migrar la tabla por cada una.
  config      jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tienda_productos (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  tienda_id       uuid not null references public.tiendas(id) on delete cascade,

  nombre          text not null,
  descripcion     text,
  categoria       text,

  -- EN CENTAVOS Y ENTERO. Los precios en coma flotante se estropean al sumar
  -- (0.1 + 0.2 no da 0.3), y una tienda que cobra un centavo de más o de menos
  -- pierde la confianza del cliente antes que por cualquier otra cosa.
  precio          integer not null default 0 check (precio >= 0),
  -- El precio tachado. Nulo cuando no hay oferta.
  precio_anterior integer check (precio_anterior is null or precio_anterior >= 0),

  -- `Ocultar` de la hoja: sacarlo del escaparate sin perder el producto ni su
  -- historial. Borrar para esconder es como se pierden catálogos enteros.
  oculto          boolean not null default false,

  -- Sin control de existencias cuando es nulo. Cero significa agotado de
  -- verdad, que NO es lo mismo que «no lo llevo».
  stock           integer,

  orden           integer not null default 0,
  imagen_url      text,

  /*
   * LAS VARIEDADES, copiadas del modelo que ya funciona.
   *
   * En la hoja eran columnas sueltas (Variedades, Variedades2, su Modo y su
   * Cantidad, Variedades3) y el recargo iba escrito dentro del texto entre
   * llaves: `Pollo, Salmón {2.50}, Res {5}`. Aquí es una lista de grupos:
   *
   *   [{ "nombre": "Tamaño", "modo": "una", "opciones": [
   *        { "texto": "5 lbs.",  "recargo": 0 },
   *        { "texto": "15 lbs.", "recargo": 0 }]},
   *    { "nombre": "Sabor", "modo": "hasta_completar", "cantidad": 3,
   *      "opciones": [
   *        { "texto": "Pollo",  "recargo": 0 },
   *        { "texto": "Salmón", "recargo": 250 }]}]
   *
   * El recargo también en CENTAVOS, por lo mismo que el precio.
   */
  variedades      jsonb not null default '[]'::jsonb,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists tienda_productos_tienda_idx
  on public.tienda_productos (tienda_id, orden)
  where not oculto;

-- El escaparate busca por categoría constantemente.
create index if not exists tienda_productos_categoria_idx
  on public.tienda_productos (tienda_id, categoria);

alter table public.tiendas          enable row level security;
alter table public.tienda_productos enable row level security;

-- Quien administra: solo lo suyo. `select auth_org_ids()` va envuelto en un
-- SELECT a propósito — Postgres lo evalúa una vez en vez de por cada renglón.
create policy tiendas_org on public.tiendas
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

create policy tienda_productos_org on public.tienda_productos
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- LA TIENDA LA VE CUALQUIERA, Y ESO ES EL PUNTO: es un escaparate público. Se
-- concede SOLO lectura, SOLO de tiendas activas y SOLO de productos no
-- ocultos. Nada de precios de costo ni de productos en preparación: si está
-- oculto, para el público no existe.
create policy tiendas_publicas on public.tiendas
  for select to anon
  using (activa);

create policy tienda_productos_publicos on public.tienda_productos
  for select to anon
  using (
    not oculto
    and tienda_id in (select id from public.tiendas where activa)
  );

comment on table public.tiendas is
  'Tiendas públicas servidas en eshop.demandu.tech/<slug>. El pedido entra en la Bandeja del bot_id.';
comment on column public.tienda_productos.precio is
  'En centavos. Nunca coma flotante: 0.1+0.2 no da 0.3 y la tienda cobraría mal.';
