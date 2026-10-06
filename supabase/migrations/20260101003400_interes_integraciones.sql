-- 0034 · Quién pidió qué integración
--
-- El catálogo enseña integraciones que todavía no existen. Eso solo es honesto
-- si dicen la verdad ("Próximamente") Y si pedirlas sirve para algo.
--
-- ESTA TABLA ES LA LISTA DE ESPERA REAL. Sin ella, el orden en que se
-- construyen las integraciones lo decide una corazonada; con ella lo decide
-- cuántos clientes la pidieron. Es el dato más barato de recoger y el más caro
-- de no tener.
create table if not exists interes_integraciones (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  proveedor  text not null,
  user_id    uuid,
  created_at timestamptz not null default now()
);

-- Un cliente pide una integración una vez. Sin esto, darle dos veces al botón
-- contaría como dos clientes interesados y la lista mentiría.
create unique index if not exists interes_una_vez_por_org
  on interes_integraciones (org_id, proveedor);

alter table interes_integraciones enable row level security;

drop policy if exists interes_ver    on interes_integraciones;
drop policy if exists interes_crear  on interes_integraciones;
drop policy if exists interes_quitar on interes_integraciones;

create policy interes_ver on interes_integraciones for select
  using (org_id in (select auth_org_ids()));
create policy interes_crear on interes_integraciones for insert
  with check (org_id in (select auth_org_ids()));
create policy interes_quitar on interes_integraciones for delete
  using (org_id in (select auth_org_ids()));

comment on table interes_integraciones is
  'Qué integración pidió cada cliente. Es la lista de espera real: dice qué construir primero en vez de adivinarlo.';
