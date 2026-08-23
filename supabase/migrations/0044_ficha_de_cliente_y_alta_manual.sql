-- Ficha del cliente y alta manual por el equipo de Demandu.
--
-- Hasta ahora `organizations.name` era todo lo que sabíamos de un cliente. Al
-- vender por teléfono hace falta saber CON QUIÉN se habla, no solo cómo se
-- llama la empresa.

alter table public.organizations
  add column if not exists contacto_nombre   text,
  add column if not exists contacto_email    text,
  add column if not exists contacto_telefono text,
  add column if not exists notas_internas    text,
  -- Quién dio de alta a este cliente. Es la base de la comisión del vendedor:
  -- sin esto, saber quién trajo a quién depende de que alguien se acuerde.
  add column if not exists creado_por uuid references auth.users(id) on delete set null;

comment on column public.organizations.notas_internas is
  'Notas del equipo de Demandu. EL CLIENTE NO LAS VE: solo se leen desde /superadmin.';

create index if not exists organizations_creado_por_idx
  on public.organizations (creado_por) where creado_por is not null;

-- ── Contraseña temporal ──────────────────────────────────────────────────
--
-- POR QUÉ NO GUARDAMOS LA CONTRASEÑA DEL CLIENTE. El día que Demandu conozca
-- la clave con la que un cliente entra, nada de lo que ocurra dentro de esa
-- cuenta es demostrablemente suyo — y ahí dentro están las conversaciones de
-- WhatsApp de SUS clientes.
--
-- Así que al crear la cuenta se genera una clave de un solo uso, se enseña
-- UNA vez a quien la creó, y esta bandera obliga a cambiarla al entrar. A
-- partir de ese momento nadie en Demandu la sabe. Para el «se me olvidó» se
-- genera otra temporal: mismo camino, mismo rastro.
alter table public.memberships
  add column if not exists debe_cambiar_contrasena boolean not null default false;

comment on column public.memberships.debe_cambiar_contrasena is
  'La cuenta entró con una clave temporal y tiene que cambiarla. Lo pone el alta '
  'manual y el restablecimiento; lo quita el propio usuario al elegir su clave.';

-- La quita el propio usuario, sobre SU fila y solo para apagarla. Que un
-- cliente pueda encenderle la bandera a otro no tendría sentido, y que pudiera
-- apagarla sin cambiar la clave se lo saltaría todo — por eso el `with check`
-- exige que quede en false.
drop policy if exists "apagar mi cambio de contrasena" on public.memberships;
create policy "apagar mi cambio de contrasena" on public.memberships
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and debe_cambiar_contrasena = false);
