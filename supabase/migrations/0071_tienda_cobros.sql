-- Las llaves de cobro de cada tienda.
--
-- ESTÁN EN SU PROPIA TABLA Y NO EN `tiendas.config`, Y ESA ES TODA LA RAZÓN DE
-- QUE ESTA MIGRACIÓN EXISTA. `config` tiene un permiso de lectura ANÓNIMA —hace
-- falta, porque es lo que pinta el escaparate público— así que un secreto de
-- comercio guardado ahí estaría publicado en internet. Aquí NO hay política
-- para `anon`: solo la organización dueña puede leerlo, y el escaparate público
-- nunca necesita el secreto, solo el servidor al cobrar.
--
-- CADA NEGOCIO USA SU PROPIA CUENTA. El dinero va directo de su cliente a su
-- banco, sin pasar por Demandu: así no hacemos de intermediario financiero de
-- nadie, que es una responsabilidad legal que no queremos y no nos toca.

create table if not exists public.tienda_cobros (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  tienda_id   uuid not null references public.tiendas(id) on delete cascade,

  -- Hoy solo «yappy». Se guarda como texto para que añadir otro no sea una
  -- migración de esquema.
  proveedor   text not null default 'yappy',

  -- El número de comercio. No es secreto: viaja en la petición de pago.
  comercio    text not null default '',

  -- El secreto con el que se firma. NUNCA sale a la pantalla: una vez guardado
  -- solo se puede reemplazar, no leer.
  secreto     text not null default '',

  -- Apagado por defecto. Una tienda que dice cobrar y no puede es peor que una
  -- que no lo ofrece: el cliente llega hasta el final y se cae ahí.
  activo      boolean not null default false,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- Una sola configuración por proveedor y tienda: dos filas activas para lo
  -- mismo es una lotería sobre con cuál se cobra.
  unique (tienda_id, proveedor)
);

alter table public.tienda_cobros enable row level security;

create policy tienda_cobros_org on public.tienda_cobros
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- A PROPÓSITO NO HAY POLÍTICA PARA `anon`. Si algún día alguien añade una,
-- estaría publicando el secreto de cobro de todos los clientes.

comment on table public.tienda_cobros is
  'Llaves de cobro por tienda. SIN lectura anónima: el secreto no puede salir al escaparate.';
comment on column public.tienda_cobros.secreto is
  'Se escribe, nunca se lee desde el navegador. Guardar el formulario en blanco NO lo borra.';
