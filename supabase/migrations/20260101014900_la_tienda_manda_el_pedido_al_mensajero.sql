-- El pedido pagado se puede mandar a un mensajero.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE FALTABA NO ERA LA LLAMADA, ERAN LAS COORDENADAS.
--
-- ASAP no acepta un pedido sin `source_lat`/`source_long` y `desti_lat`/
-- `desti_long`. Y hoy la tienda guarda la entrega como TEXTO LIBRE: una
-- pregunta del formulario, «Dirección de entrega», tipo párrafo. «Casa azul
-- frente al parque, PH Pijao, apto 12B» es exactamente lo que un vecino
-- entiende y lo que ninguna API entiende.
--
-- Geocodificar ese texto no es una solución: en Panamá la mitad de las
-- direcciones no existen en ningún mapa, y una coordenada adivinada manda al
-- mensajero a otro barrio. La coordenada tiene que venir de quien sabe dónde
-- vive: el cliente, con el botón de ubicación de WhatsApp o con el pin del
-- mapa en la tienda.
--
-- Por eso esta migración añade DOS cosas y ninguna es la llamada a ASAP:
--
--   1. DÓNDE RECOGER Y CON QUÉ LLAVES  → `tienda_envios`, una por tienda.
--   2. DÓNDE ENTREGAR, EN NÚMEROS      → columnas nuevas en `pedidos`.
--
-- ── POR QUÉ COLUMNAS Y NO `metadatos` ─────────────────────────────────────
--
-- `pedidos.metadatos` existe justo para esto y aun así no vale aquí. Una
-- coordenada que falta no es un detalle de un módulo: es la diferencia entre un
-- pedido que se puede mandar y uno que no. En una columna se puede preguntar
-- «¿cuáles de los pedidos de hoy no tienen ubicación?» —que es la pantalla que
-- el negocio va a necesitar— y dentro de un `jsonb` eso se convierte en leerlos
-- todos y mirarlos uno a uno.
--
-- ── CADA NEGOCIO PONE SU CUENTA DE ASAP ───────────────────────────────────
--
-- Igual que Yappy: el negocio le paga al mensajero directamente, con su propio
-- contrato y su propia tarifa. Demandu no cobra el envío, no lo factura y no se
-- mete en medio — hacer de intermediario del dinero de otro es una
-- responsabilidad legal que no nos toca.
-- ─────────────────────────────────────────────────────────────────────────────

/* ── 1. Las llaves y el punto de recogida ─────────────────────────────────── */

create table if not exists public.tienda_envios (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  tienda_id   uuid not null references public.tiendas(id) on delete cascade,

  -- Hoy solo «asap». Texto, para que el segundo mensajero no sea una migración.
  proveedor   text not null default 'asap',

  -- Apagado por defecto. Una tienda que dice mandar a domicilio y no puede es
  -- peor que una que no lo ofrece: el cliente llega al final y se cae ahí.
  activo      boolean not null default false,

  -- El de pruebas (goasap.dev) existe para equivocarse sin sacar una moto a la
  -- calle. Mismo criterio que el ambiente de Yappy, y la misma trampa: llaves
  -- de un entorno contra el otro no fallan claro, fallan raro.
  ambiente    text not null default 'prueba' check (ambiente in ('prueba','produccion')),

  -- ── LOS TRES SECRETOS ───────────────────────────────────────────────────
  -- `api_key` va en la cabecera `x-api-key`; `user_token` y `shared_secret`,
  -- dentro del cuerpo. Los tres juntos son la cuenta del negocio en ASAP:
  -- quien los tenga puede pedir motos a su nombre y a su cuenta.
  api_key       text not null default '',
  user_token    text not null default '',
  shared_secret text not null default '',

  -- El teléfono de la cuenta de ASAP (`phone`). No es secreto: identifica al
  -- comercio, no autoriza nada por sí solo.
  telefono    text not null default '',

  -- ── DE DÓNDE SALE EL PAQUETE ────────────────────────────────────────────
  -- Es el local del negocio y casi nunca cambia, así que se pregunta una vez
  -- aquí y no en cada pedido. Sin esto no hay punto A y no hay recogida.
  origen_direccion text not null default '',
  origen_lat       double precision,
  origen_long      double precision,
  -- A quién buscar al llegar. ASAP lo enseña al mensajero.
  origen_nombre    text not null default '',
  origen_telefono  text not null default '',
  -- «Tocar el timbre del local, no el del edificio». Va en cada recogida.
  origen_nota      text not null default '',

  -- bike / car / truck. Se guarda como texto porque es de ASAP, no nuestro.
  vehiculo    text not null default 'bike',

  -- Cuándo se comprobó por última vez que las llaves sirven.
  validado_en timestamptz,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Dos filas activas para el mismo proveedor es una lotería sobre con cuál se
  -- manda el pedido.
  unique (tienda_id, proveedor)
);

alter table public.tienda_envios enable row level security;

create policy tienda_envios_org on public.tienda_envios
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- A PROPÓSITO NO HAY POLÍTICA PARA `anon`. El escaparate es público y nunca
-- necesita estas llaves: quien manda el pedido a ASAP es el servidor.

/* ── Los secretos no se leen por pertenecer a la cuenta ───────────────────── */
--
-- Misma regla que 0092, y por el mismo motivo: RLS es de FILAS y no sabe
-- distinguir «puedes ver la configuración de envíos» de «puedes ver sus
-- llaves». Un agente que solo atiende chats abría la consola del navegador y se
-- llevaba la cuenta de ASAP del negocio.
--
-- LA TRAMPA DE POSTGRES: el permiso de TABLA implica todas las columnas, y
-- revocar una sola mientras existe el de tabla no hace nada. Hay que quitar el
-- de tabla y conceder las columnas una por una.
--
-- EFECTO SECUNDARIO A PROPÓSITO: una columna nueva no queda concedida hasta que
-- alguien la añada a esta lista. Falla hacia el lado seguro.

revoke select on public.tienda_envios from authenticated, anon;
grant select (id, org_id, tienda_id, proveedor, activo, ambiente, telefono,
              origen_direccion, origen_lat, origen_long, origen_nombre,
              origen_telefono, origen_nota, vehiculo, validado_en,
              created_at, updated_at)
  on public.tienda_envios to authenticated;

comment on table public.tienda_envios is
  'Cuenta de mensajería por tienda. SIN lectura anónima y con las tres llaves ilegibles desde el navegador.';
comment on column public.tienda_envios.api_key is
  'Se escribe, nunca se lee desde el navegador. Guardar el formulario en blanco NO lo borra.';

/* ── 2. Dónde entregar, en números ────────────────────────────────────────── */

-- LA DIRECCIÓN ESCRITA SE GUARDA IGUAL, y no sobra. Es lo que el mensajero lee
-- cuando el pin cae en la acera de enfrente, y es lo que el negocio reconoce
-- cuando llama al cliente. La coordenada dice el punto; el texto dice la casa.
alter table public.pedidos add column if not exists entrega_direccion text;
alter table public.pedidos add column if not exists entrega_lat  double precision;
alter table public.pedidos add column if not exists entrega_long double precision;
-- «Portón verde, preguntar por Daniel». Va en `dest_special_inst`.
alter table public.pedidos add column if not exists entrega_nota text;

-- ── EL ENVÍO, UNA VEZ PEDIDO ────────────────────────────────────────────────
-- `envio_id` es el `delivery_id` de ASAP y es lo ÚNICO con lo que se puede
-- volver a preguntar por ese envío, cancelarlo o pedir su rastreo. ASAP lo da
-- una sola vez, al crear la orden: si no se guarda ahí mismo, el pedido queda
-- en la calle y sin forma de seguirlo.
alter table public.pedidos add column if not exists envio_proveedor text;
alter table public.pedidos add column if not exists envio_id        text;
alter table public.pedidos add column if not exists envio_estado    text;
-- El número crudo que manda ASAP (0, 6, 7, 100, 101, 2, 1…). Se guarda tal cual
-- ADEMÁS del estado traducido: el día que ASAP añada un código nuevo, el estado
-- se quedará corto y este número será la única forma de saber qué pasó.
alter table public.pedidos add column if not exists envio_codigo    integer;
alter table public.pedidos add column if not exists envio_rastreo   text;
alter table public.pedidos add column if not exists envio_pedido_en timestamptz;
-- El motivo del último intento fallido, para que «no se pudo mandar» tenga
-- respuesta cuando el negocio pregunte.
alter table public.pedidos add column if not exists envio_error     text;

-- El webhook de ASAP llega con el `delivery_id` y nada más nuestro: sin este
-- índice, cada aviso de cada moto recorrería la tabla entera de pedidos.
create index if not exists pedidos_envio_idx on public.pedidos (envio_id)
  where envio_id is not null;

comment on column public.pedidos.entrega_lat is
  'La ubicación que dio el cliente (WhatsApp o pin del mapa). NUNCA adivinada del texto.';
comment on column public.pedidos.envio_id is
  'El delivery_id de ASAP. Lo dan una sola vez, al crear la orden.';
