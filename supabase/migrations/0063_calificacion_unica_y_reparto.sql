-- ═══════════════════════════════════════════════════════════════════════════
-- 0063 · Que la calificación sea UNA, y que el pase a una persona reparta.
--
-- Dos cosas que se vieron el 31 ago con un lead de prueba:
--
--   1. El mismo contacto quedó como «lead-alto» Y «lead-medio» a la vez. La
--      herramienta de la IA solo AÑADE etiquetas, y nada en la base decía que
--      esas tres son la misma pregunta con tres respuestas. Un embudo donde un
--      lead está en dos niveles no significa nada.
--
--   2. «Si el lead es alto, avísale a este agente» no se podía configurar en
--      ningún sitio — porque el bloque de reparto no repartía: marcaba la
--      conversación como asignada y no escribía a QUIÉN.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Las etiquetas pueden pertenecer a un grupo ──────────────────────────
--
-- Un grupo es «una pregunta»: Calificación, Temperatura, Etapa… Dentro de un
-- grupo solo puede haber UNA etiqueta puesta a la vez. Las etiquetas sueltas
-- (sin grupo) siguen funcionando como siempre: se acumulan, que es lo correcto
-- para «vip», «moroso» o «habla inglés».
--
-- El grupo es TEXTO LIBRE y lo escribe el cliente, no nosotros. Una clínica
-- dental y una inmobiliaria no califican igual y ninguna necesita que le
-- programemos sus niveles.
alter table public.tags add column if not exists grupo text;

comment on column public.tags.grupo is
  'Etiquetas del mismo grupo son excluyentes: poner una quita las demás. NULL = etiqueta suelta, se acumula.';

create index if not exists tags_org_grupo_idx on public.tags (org_id, grupo) where grupo is not null;

-- ── 2. Reglas de reparto ───────────────────────────────────────────────────
--
-- «Cuando alguien con esta etiqueta pida una persona, que le toque a X.»
--
-- POR QUÉ UNA TABLA Y NO UN CAMPO EN EL BLOQUE DEL FLUJO: el pase a una
-- persona ocurre por CUATRO caminos distintos —el bloque del flujo, el atajo
-- «1», la herramienta del agente de IA, y el botón de la Bandeja—. Si la regla
-- viviera en el bloque, los otros tres seguirían repartiendo a nadie. Aquí
-- vive una sola vez y los cuatro la consultan.
create table if not exists public.reglas_de_reparto (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- Con qué etiqueta se dispara. NULL = la regla de cajón, la que se aplica
  -- cuando ninguna otra encaja.
  tag_id      uuid references public.tags(id) on delete cascade,
  -- A dónde va. Uno de los dos, no los dos.
  member_id   uuid references public.team_members(id) on delete cascade,
  team_id     uuid references public.teams(id) on delete cascade,
  prioridad   integer not null default 0,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint reparto_un_destino check (
    (member_id is not null and team_id is null) or
    (member_id is null and team_id is not null)
  )
);

create index if not exists reglas_reparto_org_idx on public.reglas_de_reparto (org_id, activa, prioridad desc);

alter table public.reglas_de_reparto enable row level security;

-- Postgres da EXECUTE/acceso a PUBLIC por defecto y `anon` hereda de PUBLIC.
-- Ya nos ha mordido varias veces: se revoca y se concede a mano.
revoke all on public.reglas_de_reparto from public, anon;
grant select, insert, update, delete on public.reglas_de_reparto to authenticated;

drop policy if exists reglas_reparto_de_mi_org on public.reglas_de_reparto;
create policy reglas_reparto_de_mi_org on public.reglas_de_reparto
  for all
  -- `auth_org_ids()` devuelve un CONJUNTO: en una política hay que envolverlo
  -- en un `select`, o Postgres rechaza la política entera (0A000). Igual que
  -- en el resto de tablas de la plataforma.
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 3. Poner una etiqueta respetando su grupo ──────────────────────────────
--
-- VIVE EN LA BASE, NO EN EL MOTOR, y esto es a propósito. Hay DOS motores —el
-- de WhatsApp en Deno y el del canal web en Node— y en este proyecto ya se han
-- desincronizado dos veces, las dos descubiertas en producción. La base es una
-- sola: la regla de «solo una del grupo» no puede divergir si vive aquí.
create or replace function public.poner_etiqueta(
  p_org_id     uuid,
  p_contact_id uuid,
  p_etiqueta   text
) returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_grupo     text;
  v_hermanas  text[];
  v_tags      text[];
begin
  -- La etiqueta tiene que existir EN ESA ORGANIZACIÓN. El modelo propone; la
  -- base decide. Sin esto, cada cliente acabaría con etiquetas fantasma.
  select t.grupo into v_grupo
  from public.tags t
  where t.org_id = p_org_id and t.name = p_etiqueta;

  if not found then
    raise exception 'La etiqueta % no existe en esta organización', p_etiqueta
      using errcode = 'no_data_found';
  end if;

  -- Las hermanas de grupo: las que hay que quitar al poner esta.
  if v_grupo is null then
    v_hermanas := array[]::text[];
  else
    select coalesce(array_agg(t.name), array[]::text[]) into v_hermanas
    from public.tags t
    where t.org_id = p_org_id and t.grupo = v_grupo and t.name <> p_etiqueta;
  end if;

  update public.contacts c
     set tags = (
       select array_agg(distinct x)
       from unnest(
         array_append(
           -- fuera las hermanas del grupo…
           array(select y from unnest(coalesce(c.tags, array[]::text[])) y
                 where y <> all (v_hermanas)),
           -- …y dentro la nueva.
           p_etiqueta
         )
       ) x
     )
   where c.id = p_contact_id and c.org_id = p_org_id
  returning c.tags into v_tags;

  if not found then
    raise exception 'No encuentro esa ficha en esta organización'
      using errcode = 'no_data_found';
  end if;

  return v_tags;
end;
$$;

revoke all on function public.poner_etiqueta(uuid, uuid, text) from public, anon;
grant execute on function public.poner_etiqueta(uuid, uuid, text) to service_role;

-- ── 4. A quién le toca ────────────────────────────────────────────────────
--
-- NO SE ESCRIBE AQUÍ. La primera versión de esta migración traía su propia
-- función de reparto, y estaba de más: desde la 0016 ya existe un reparto
-- completo —rueda, menos carga, solo en línea, tope por persona, horario y
-- cola de reintentos— que se dispara solo con un trigger sobre
-- `conversations`.
--
-- Tener DOS repartos es peor que no tener ninguno: se pisan y nadie sabe cuál
-- decidió. La regla por etiqueta se engancha dentro del que ya funciona, como
-- un paso previo. Ver `0064_reparto_por_etiqueta.sql`.
