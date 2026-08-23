-- Tipo de cambio para MOSTRAR precios de referencia en moneda local.
--
-- NO ES UN PRECIO. El precio de Demandu es y sigue siendo en dólares: es lo
-- que se cobra, lo que dice la factura y lo que define el margen. Esta tabla
-- solo alimenta un "≈ $X MXN" al lado, para que un negocio en México sepa de
-- qué está hablando sin abrir la calculadora.
--
-- Por qué en la base y no una llamada al vuelo: pedirle el tipo de cambio a
-- un servicio de fuera en cada carga de la pantalla de planes es meter una
-- dependencia externa en el camino más importante que tiene el producto. Si
-- ese servicio tarda, la pantalla donde el cliente decide pagar tarda.
create table if not exists public.tipos_de_cambio (
  moneda text primary key,
  valor numeric not null check (valor > 0),
  fuente text,
  actualizado_at timestamptz not null default now()
);

comment on table public.tipos_de_cambio is
  'Cuántas unidades de esta moneda vale 1 USD. Solo para mostrar equivalencias; '
  'jamás para cobrar. El cobro siempre es en dólares.';

alter table public.tipos_de_cambio enable row level security;

-- Cualquiera que esté dentro de la plataforma puede leerlo: es información
-- pública (el tipo de cambio del día), no hay nada de nadie aquí.
drop policy if exists "leer tipo de cambio" on public.tipos_de_cambio;
create policy "leer tipo de cambio" on public.tipos_de_cambio
  for select to authenticated using (true);

-- Escribir solo el proceso que lo actualiza, con la llave de servicio.
revoke insert, update, delete on public.tipos_de_cambio from anon, authenticated;

-- Un valor de arranque para que la pantalla no nazca muda. Se reemplaza en
-- cuanto corra la actualización; si nunca corriera, el código lo considera
-- viejo y prefiere NO enseñar pesos antes que enseñar un número equivocado.
insert into public.tipos_de_cambio (moneda, valor, fuente, actualizado_at)
values ('MXN', 18.50, 'valor de arranque', now() - interval '30 days')
on conflict (moneda) do nothing;
