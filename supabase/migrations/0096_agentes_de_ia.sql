-- AGENTES DE IA: la configuración deja de vivir escondida dentro del bot.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA Y QUÉ NO
--
-- Hasta hoy la IA de un chatbot vivía en `bots.ai`, un JSONB sin forma
-- declarada. Funciona, pero tiene tres límites que ya se notan:
--
--   1. NO SE PUEDE REUTILIZAR. Un negocio con WhatsApp, Instagram y web tiene
--      tres bots y tiene que escribir el mismo prompt tres veces. Cuando
--      cambia el horario de atención, lo cambia en tres sitios o se le queda
--      uno viejo — y el que se queda viejo es el que nadie mira.
--   2. NO SE PUEDE MIRAR. Un JSONB no tiene columnas, así que no hay forma de
--      preguntar «¿qué agentes tienen la herramienta de agendar?» ni de que la
--      base impida una tontería.
--   3. NO SABE CON QUÉ TIENDA TRABAJA. Ese es el fallo que hay que arreglar y
--      la razón por la que esta tabla existe (ver `tienda_id`, abajo).
--
-- LO QUE NO CAMBIA: `bots.ai` SE QUEDA, con sus datos intactos. El motor lee
-- el agente si lo hay y cae a `bots.ai` si no. Esa caída no es provisional ni
-- es pereza: es lo que hace que un fallo en esto no deje sin chatbot a los
-- negocios que están vendiendo hoy. Se quita cuando lleve semanas en vivo.
--
-- ── POR QUÉ COLUMNAS Y NO OTRO JSONB ──────────────────────────────────────
--
-- Porque un JSONB no puede tener una clave foránea, y la pieza importante de
-- esta tabla —`tienda_id`— necesita justo eso: que la base garantice que la
-- tienda elegida es de este mismo cliente. Con un JSONB esa garantía sería «el
-- código lo comprueba», que es otra forma de decir «hasta que alguien se
-- olvide».
--
-- ── LAS COLUMNAS VAN NULAS A PROPÓSITO ────────────────────────────────────
--
-- Todo el código hace `{ ...AI_DEFAULTS, ...ai }`: lo que el cliente NO puso
-- lo rellena el valor por defecto que vive en el código. Si aquí se guardaran
-- los valores por defecto en vez de nulos, quedarían CONGELADOS: el día que se
-- mejore el texto de respaldo, los agentes de hoy seguirían con el viejo y
-- nadie sabría por qué.
--
-- Nulo significa «no lo puso», y eso es exactamente lo que hay que guardar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── La tienda tiene que ser del mismo cliente, y lo garantiza la base ─────
--
-- Sin esto, `tienda_id` sería una clave foránea a `tiendas(id)` a secas: un
-- formulario manipulado podría apuntar el agente de un cliente a la tienda de
-- OTRO, y a partir de ahí el bot serviría el catálogo, los precios y los
-- pedidos del vecino. La pantalla nunca ofrecería esa opción, pero la pantalla
-- no es el candado.
--
-- Con la clave foránea compuesta, Postgres lo rechaza aunque el código falle.
create unique index if not exists tiendas_org_id_idx on public.tiendas (org_id, id);

create table if not exists public.agentes (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  nombre     text not null,

  -- ── Lo que hasta hoy era `bots.ai` ─────────────────────────────────────
  -- Mismos significados, un nombre por columna. Nulo = «no lo puso».
  ia_encendida        boolean,   -- era `enabled`
  prompt              text,      -- era `persona`
  tono                text,      -- era `style`
  respaldo            text,      -- era `fallback`
  max_palabras        integer,   -- era `maxWords`
  herramientas        text[],    -- era `herramientas`
  criterios           text,      -- era `criterios`
  sistema_url         text,      -- era `sistemaUrl`
  sistema_descripcion text,      -- era `sistemaDescripcion`
  ia_de_respaldo      boolean,   -- era `fallback_flujo`

  -- ── LA PIEZA NUEVA ─────────────────────────────────────────────────────
  --
  -- CON QUÉ TIENDA TRABAJA ESTE AGENTE.
  --
  -- Hoy, cuando varias tiendas apuntan al mismo bot, el motor coge LA PRIMERA
  -- POR ORDEN ALFABÉTICO. El propio código lo admite: «no debería pasar, pero
  -- si pasa tiene que ser estable». Estable sí es; correcta no: un negocio con
  -- «Boutique» y «Zapatería» sirve siempre el catálogo de Boutique, y el
  -- síntoma —el bot enseña productos que no son— no se parece en nada a la
  -- causa.
  --
  -- Nulo sigue significando lo de siempre (la tienda enlazada al bot, y con
  -- empate la primera por nombre), así que esto no cambia el comportamiento de
  -- nadie hasta que alguien elija.
  --
  -- `on delete set null`: borrar una tienda no puede borrar el agente. Se
  -- queda sin tienda elegida y vuelve al comportamiento de antes.
  tienda_id  uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agentes_tienda_del_mismo_cliente
    foreign key (org_id, tienda_id) references public.tiendas (org_id, id) on delete set null,

  -- DOS AGENTES CON EL MISMO NOMBRE NO SIRVEN DE NADA. Es exactamente lo que
  -- hace ilegible la pantalla de la competencia, donde la misma herramienta
  -- aparece nueve veces sin forma de distinguirlas.
  constraint agentes_nombre_unico unique (org_id, nombre)
);

alter table public.agentes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='agentes' and policyname='agentes_all') then
    create policy agentes_all on public.agentes
      for all
      using      (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

create index if not exists agentes_org_idx on public.agentes (org_id);

-- ── Qué agente usa cada bot ───────────────────────────────────────────────
--
-- La dirección es bot → agente, y no al revés, porque UN AGENTE SIRVE A VARIOS
-- BOTS: ese es el motivo de existir de todo esto. El negocio escribe su
-- personalidad una vez y la usan WhatsApp, Instagram y la web.
--
-- `on delete set null`: borrar un agente deja los bots sin agente, y el motor
-- vuelve solo a `bots.ai`. Nunca deja un bot mudo.
alter table public.bots add column if not exists agente_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bots_agente_del_mismo_cliente'
  ) then
    alter table public.bots
      add constraint bots_agente_del_mismo_cliente
      foreign key (agente_id) references public.agentes(id) on delete set null;
  end if;
end $$;

create index if not exists bots_agente_idx on public.bots (agente_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- EL ARRASTRE: nadie pierde lo que ya había escrito
--
-- Cada bot se lleva su configuración a un agente propio. NO SE INVENTA NI UN
-- VALOR: lo que no estaba en `bots.ai` queda nulo, para que lo siga rellenando
-- el valor por defecto del código, como hasta hoy.
--
-- El nombre sale del bot. Si dos bots se llaman igual —posible— el segundo
-- lleva un sufijo, porque el nombre es único y una migración que revienta a
-- mitad es peor que un nombre feo.
--
-- `where not exists` hace que esta migración se pueda correr dos veces sin
-- duplicar nada, que es lo que hace falta cuando algo va mal a medias.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.agentes (
  org_id, nombre, ia_encendida, prompt, tono, respaldo, max_palabras,
  herramientas, criterios, sistema_url, sistema_descripcion, ia_de_respaldo
)
select
  b.org_id,
  case when b.rn = 1 then b.name else b.name || ' (' || b.rn || ')' end,
  case when b.ai ? 'enabled'            then (b.ai->>'enabled')::boolean        end,
  case when b.ai ? 'persona'            then  b.ai->>'persona'                  end,
  case when b.ai ? 'style'              then  b.ai->>'style'                    end,
  case when b.ai ? 'fallback'           then  b.ai->>'fallback'                 end,
  case when b.ai ? 'maxWords'           then (b.ai->>'maxWords')::integer        end,
  case when b.ai ? 'herramientas'
       then (select coalesce(array_agg(x), '{}') from jsonb_array_elements_text(b.ai->'herramientas') x)
  end,
  case when b.ai ? 'criterios'          then  b.ai->>'criterios'                end,
  case when b.ai ? 'sistemaUrl'         then  b.ai->>'sistemaUrl'               end,
  case when b.ai ? 'sistemaDescripcion' then  b.ai->>'sistemaDescripcion'       end,
  case when b.ai ? 'fallback_flujo'     then (b.ai->>'fallback_flujo')::boolean end
from (
  select id, org_id, name, ai,
         row_number() over (partition by org_id, name order by created_at, id) as rn
  from public.bots
) b
where not exists (
  select 1 from public.agentes a where a.org_id = b.org_id and a.nombre = b.name
);

-- Y se enlaza cada bot con el suyo. Se ata por nombre porque es lo que acaba
-- de crearse arriba con esa misma regla.
update public.bots b
   set agente_id = a.id
  from public.agentes a
 where a.org_id = b.org_id
   and a.nombre = b.name
   and b.agente_id is null;

comment on table public.agentes is
  'La personalidad, las herramientas y la tienda de un agente de IA. Un agente sirve a varios bots. `bots.ai` sigue siendo el respaldo mientras esto se asienta.';
comment on column public.agentes.tienda_id is
  'Con qué tienda trabaja. NULO = la enlazada al bot (y con empate, la primera por nombre), que es el comportamiento de siempre.';
