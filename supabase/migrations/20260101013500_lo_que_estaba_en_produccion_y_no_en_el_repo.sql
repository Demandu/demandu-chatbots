-- PUESTA AL DÍA: lo que existe en producción y no estaba escrito en ningún sitio.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTA MIGRACIÓN NO CAMBIA NADA. Si se ejecuta contra la base de producción, no
-- toca un solo dato: todo va con `if not exists` / `or replace`. Su valor está
-- entero en el otro escenario — el día que haya que levantar la plataforma
-- desde cero.
--
-- ── QUÉ FALTABA, Y POR QUÉ IMPORTA ────────────────────────────────────────
--
-- La columna `bots.ai` y la tabla `bot_knowledge` se crearon A MANO en el panel
-- de Supabase, sin migración. Son, respectivamente, DÓNDE VIVE LA
-- CONFIGURACIÓN DE LA IA de cada bot y DÓNDE VIVE TODO LO QUE EL CLIENTE LE HA
-- ENSEÑADO. Sin ellas la IA no arranca: `answer.ts` lee `bots.ai` en cada
-- mensaje y `match_bot_knowledge` consulta `bot_knowledge`.
--
-- O sea: reconstruir el proyecto desde `supabase/migrations/` daba una
-- plataforma que compila, que deja entrar, que enseña la Bandeja — y cuyos
-- chatbots no contestan. Y el motivo no se ve en ninguna pantalla ni en ningún
-- error: `bots.ai` simplemente no existiría, y `select ... ai` fallaría en un
-- sitio que nadie mira.
--
-- Lo mismo con `bots.widget` (la apariencia del chat en la web del cliente) y
-- `bots.shortcuts` (los atajos del agente). Mismo origen, mismo silencio.
--
-- ── DE DÓNDE SALEN ESTAS DEFINICIONES ─────────────────────────────────────
--
-- NO DE LEER EL CÓDIGO NI DE ADIVINAR: de preguntarle a la base de producción
-- —`information_schema.columns`, `pg_indexes`, `pg_policies`,
-- `pg_get_functiondef`— y copiar lo que respondió. Una migración de puesta al
-- día que reconstruya algo PARECIDO es peor que no tenerla: hace creer que el
-- repo está completo cuando lo que levanta es otra cosa.
--
-- Por eso el índice del embedding es `hnsw` y no `ivfflat`, y por eso `search`
-- es una columna generada con el diccionario `spanish` — que es lo que hay
-- ahí, no lo que uno habría escrito.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Las tres columnas de `bots` ────────────────────────────────────────
--
-- `not null default '{}'` es importante y no es decoración: el código hace
-- `bot.ai?.enabled !== false` en todas partes, así que un nulo aquí no rompe
-- nada visible — pero `armarHerramientas` recorre `ai.herramientas` y un nulo
-- ahí sí. Con `'{}'` el bot nuevo nace sin IA configurada, que es lo correcto.

alter table public.bots add column if not exists ai        jsonb not null default '{}'::jsonb;
alter table public.bots add column if not exists widget    jsonb not null default '{}'::jsonb;
alter table public.bots add column if not exists shortcuts jsonb not null default '{}'::jsonb;

comment on column public.bots.ai is
  'Configuración de la IA del bot: persona, tono, fallback, herramientas[], criterios. Ver AiSettings en src/lib/ai/answer.ts.';

-- ── 2. Lo que el cliente le ha enseñado al bot ────────────────────────────
--
-- `pgvector` hace falta para la columna `embedding`. Se pide aquí porque esta
-- migración tiene que poder correr sola contra una base recién creada.
create extension if not exists vector;

create table if not exists public.bot_knowledge (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  bot_id      uuid not null,
  title       text not null,
  content     text not null,
  source_type text not null default 'text',
  source_url  text,
  source_id   uuid,
  source_name text,
  chunk_index integer not null default 0,
  bytes       integer,
  embedding   vector(1024),
  -- ── LA BÚSQUEDA POR PALABRAS VA GENERADA, NO POR DISPARADOR ────────────
  -- Es lo que impide que exista una fila cuyo texto y cuyo índice no cuadren:
  -- con un disparador, cualquier `update` que se olvide de recalcular deja
  -- conocimiento que el bot ya no encuentra. Aquí no hay forma de olvidarse.
  --
  -- El diccionario es `spanish` a propósito: es lo que hablan los clientes, y
  -- con `english` «envíos» y «envío» serían dos palabras distintas.
  search      tsvector generated always as (
                to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(content, ''))
              ) stored,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists bot_knowledge_bot_idx    on public.bot_knowledge using btree (bot_id);
create index if not exists bot_knowledge_source_idx on public.bot_knowledge using btree (source_id);
create index if not exists bot_knowledge_search_idx on public.bot_knowledge using gin (search);

-- HNSW y no IVFFlat, que es lo que hay en producción. IVFFlat necesita que la
-- tabla YA tenga datos para que las listas signifiquen algo; creado sobre una
-- tabla vacía —que es justo lo que pasa al reconstruir— busca mal y nadie se
-- entera, porque devolver conocimiento poco parecido no parece un error.
create index if not exists bot_knowledge_embedding_idx
  on public.bot_knowledge using hnsw (embedding vector_cosine_ops);

alter table public.bot_knowledge enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='bot_knowledge' and policyname='bot_knowledge_all'
  ) then
    create policy bot_knowledge_all on public.bot_knowledge
      for all
      using      (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

-- ── 3. La búsqueda por parecido ───────────────────────────────────────────
--
-- El `exists` sobre `bots` no es redundante aunque ya se filtre por `org_id`:
-- la función es `stable` y la llama el motor con la llave de servicio, que se
-- salta RLS. Sin esa comprobación, pasar el `bot_id` de otra organización
-- devolvería su conocimiento. Es el candado que queda cuando RLS no está.
create or replace function public.match_bot_knowledge(
  p_org_id uuid, p_bot_id uuid, p_embedding vector, p_limit integer default 5
)
returns table(title text, content text, similarity double precision)
language sql stable set search_path to 'public', 'pg_temp' as $fn$
  select k.title, k.content, (1 - (k.embedding <=> p_embedding))::double precision as similarity
  from public.bot_knowledge k
  where k.org_id = p_org_id
    and k.bot_id = p_bot_id
    and k.enabled
    and k.embedding is not null
    and exists (select 1 from public.bots b where b.id = p_bot_id and b.org_id = p_org_id)
  order by k.embedding <=> p_embedding
  limit greatest(1, least(p_limit, 20))
$fn$;
