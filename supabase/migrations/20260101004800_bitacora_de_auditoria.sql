-- ── Bitácora de auditoría ────────────────────────────────────────────────
--
-- Quién hizo qué, cuándo y sobre la cuenta de quién.
--
-- ES SOLO DE AÑADIR. No hay UPDATE ni DELETE para nadie —tampoco para la llave
-- de servicio— porque una bitácora que se puede editar no sirve para lo único
-- que sirve una bitácora: responder «¿quién tocó esto?» cuando alguien lo
-- niega. Si mañana hace falta purgar por antigüedad, se hace con una función
-- aparte, deliberada y anotada; no con un DELETE suelto desde el código.
create table if not exists public.bitacora (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),

  -- Quién. Se guarda el nombre y el correo ADEMÁS del id: si esa persona se
  -- borra mañana, la bitácora tiene que seguir diciendo quién fue.
  actor_id     uuid,
  actor_nombre text,
  actor_email  text,
  actor_tipo   text not null check (actor_tipo in ('cliente','equipo','partner','sistema')),

  -- Sobre qué cuenta de cliente. Nulo cuando la acción no es de un cliente
  -- concreto (por ejemplo, dar de alta a un vendedor).
  org_id       uuid,

  accion       text not null,
  detalle      jsonb not null default '{}'::jsonb,

  -- Si el cliente puede ver esta línea en su propia cuenta. Los accesos de
  -- soporte SÍ: esconderle a alguien que entramos a su cuenta es lo que
  -- convierte una herramienta de soporte en un escándalo. La cocina interna
  -- (comisiones, altas de vendedores) no le incumbe.
  visible_para_el_cliente boolean not null default false
);

comment on table public.bitacora is
  'Registro de solo-añadir. Nadie tiene permiso de UPDATE ni DELETE, a '
  'propósito: una bitácora editable no prueba nada.';

create index if not exists bitacora_at_idx     on public.bitacora (at desc);
create index if not exists bitacora_org_idx    on public.bitacora (org_id, at desc) where org_id is not null;
create index if not exists bitacora_actor_idx  on public.bitacora (actor_id, at desc);
create index if not exists bitacora_accion_idx on public.bitacora (accion, at desc);

alter table public.bitacora enable row level security;

-- Ni escribir ni leer por la puerta de los clientes, salvo lo que se abre
-- expresamente abajo. Escribir es siempre con la llave de servicio.
revoke all on public.bitacora from anon, authenticated;
grant select on public.bitacora to authenticated;

-- Nadie edita ni borra. Ni siquiera el service_role.
revoke update, delete on public.bitacora from anon, authenticated, service_role;

-- El cliente ve los accesos a SU cuenta, y solo los marcados como visibles.
drop policy if exists "el cliente ve los accesos a su cuenta" on public.bitacora;
create policy "el cliente ve los accesos a su cuenta" on public.bitacora
  for select to authenticated
  using (visible_para_el_cliente and org_id in (select auth_org_ids()));

-- ── Rol «coordinador» ────────────────────────────────────────────────────
--
-- Acceso a todo MENOS lo de desarrollo: ni chatbots, ni Lana IA, ni
-- conexiones. Es el perfil de quien lleva la operación del día a día sin
-- tocar cómo está armado el bot.
--
-- Va en su propio bloque porque `alter type ... add value` no puede correr en
-- la misma transacción que un uso posterior del valor nuevo.
do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'member_role' and e.enumlabel = 'coordinador'
  ) then
    alter type member_role add value 'coordinador';
  end if;
end $$;
