-- Cambiar la dirección de una tienda sin romper lo que ya está repartido.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- UNA DIRECCIÓN DE TIENDA NO ES SOLO UNA DIRECCIÓN: está pegada en biografías
-- de Instagram, en estados de WhatsApp, en tarjetas impresas — y desde hoy
-- también DENTRO DE ENLACES DE COBRO que viven en el chat de cada cliente.
--
-- Cambiarla sin más convierte todo eso en un 404, y los cobros pendientes se
-- mueren en silencio: el cliente abre el enlace, no ve nada, y nadie se entera
-- de que ese dinero ya no va a entrar.
--
-- Por eso las direcciones viejas se guardan y siguen llevando a la tienda. La
-- dirección cambia; lo repartido sigue funcionando.
--
-- Y NADIE MÁS PUEDE RECLAMARLAS. Si una dirección abandonada quedara libre,
-- otro negocio podría quedarse con el tráfico —y con los enlaces de cobro— del
-- primero. Se comprueban las viejas igual que las actuales al crear o cambiar.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.tienda_direcciones_previas (
  slug       text primary key,
  tienda_id  uuid not null references public.tiendas(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists tienda_direcciones_previas_tienda_idx
  on public.tienda_direcciones_previas (tienda_id, created_at desc);

alter table public.tienda_direcciones_previas enable row level security;

-- Solo la organización dueña. El escaparate público resuelve la dirección vieja
-- en el servidor, igual que ya hace con los datos de cobro: no hace falta abrir
-- esta tabla a `anon` para que un enlace viejo siga funcionando.
create policy tienda_direcciones_previas_org on public.tienda_direcciones_previas
  for all to authenticated
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

comment on table public.tienda_direcciones_previas is
  'Direcciones que tuvo una tienda antes. Siguen llevando a ella y nadie más puede reclamarlas: dentro de cada enlace de cobro repartido va una de estas.';
