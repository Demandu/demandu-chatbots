-- EL RESTO DE LO QUE NUNCA SE ESCRIBIÓ.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTA MIGRACIÓN NO CAMBIA NADA EN PRODUCCIÓN. Todo va con `if not exists`,
-- `or replace` y `on conflict do nothing`. Su valor entero está en el otro
-- escenario: el día que haya que levantar la plataforma desde cero.
--
-- ── QUÉ SE ENCONTRÓ, Y CÓMO ───────────────────────────────────────────────
--
-- Se le preguntó a la base de producción qué tablas, funciones, columnas y
-- disparadores tiene, y se buscó cada uno en `supabase/migrations/`. Lo que no
-- aparecía en ningún archivo está aquí abajo. No es una lista escrita de
-- memoria ni deducida del código: es la diferencia real entre lo que hay y lo
-- que está escrito.
--
-- El resultado fue mucho peor de lo que la 0095 hacía pensar. Aquella rescató
-- tres columnas de `bots` y una tabla. Faltaban DIECINUEVE TABLAS, ONCE
-- FUNCIONES, UN DISPARADOR Y CINCO COLUMNAS.
--
-- ── POR QUÉ ESTO IMPORTA AUNQUE HOY TODO FUNCIONE ─────────────────────────
--
-- Reconstruir el proyecto desde las migraciones daba, hasta hoy, una
-- plataforma que arranca, deja entrar y enseña la Bandeja — y en la que:
--
--   · NO SE PUEDE COBRAR. Sin `plans` ni `addons`, `organizations.plan`
--     apunta a una fila que no existe. `org_features` no encuentra el plan, y
--     una cuenta con plan «Crece» pagado sale sin IA, sin tienda y con cero
--     de almacenamiento. Sin `usage_events` ni `org_addons`, el consumo no se
--     cuenta y `org_usage` ni siquiera existe.
--
--   · NADIE ES ADMINISTRADOR. Sin `platform_admins` no hay
--     `is_platform_admin()`, y las políticas que la usan —las de `plans` y
--     `addons`— no se pueden ni crear. El panel de superadmin queda cerrado
--     para todo el mundo, incluido el dueño.
--
--   · INSTAGRAM NO DISPARA. `flows.keywords` y `flows.priority` son las dos
--     columnas con las que `reglaQueAplica` decide qué flujo atiende un
--     comentario o un mensaje directo. Sin ellas, ningún flujo coincide nunca
--     con nada.
--
--   · LOS FORMULARIOS DE WHATSAPP DESAPARECEN. `whatsapp_forms` es donde vive
--     el estado (BORRADOR / PUBLICADO) de cada formulario, que es justo lo que
--     decide si se puede mandar. Y `whatsapp_templates`, las plantillas.
--
--   · LA BANDEJA PIERDE LA MITAD DE SU TRABAJO: sin `quick_replies` no hay
--     respuestas rápidas, sin `contact_notes` no hay notas del equipo, y sin
--     `conversations.handoff_reason` no se sabe POR QUÉ una conversación pasó
--     a una persona — que es exactamente el dato con el que se diagnosticó el
--     fallo de Lana del 6 de septiembre.
--
-- ── LA LECCIÓN, QUE ES LA MISMA DE LA 0095 ────────────────────────────────
--
-- Todo esto se creó a mano en el panel de Supabase. Ninguna de las veces se
-- notó nada, porque producción SÍ tenía la tabla. El repo se fue quedando
-- atrás en silencio durante meses, y el día que se note va a ser el peor día
-- posible para notarlo.
--
-- Las definiciones de aquí abajo NO SE ESCRIBIERON DE CABEZA: salen de
-- `information_schema.columns`, `pg_constraint`, `pg_indexes`, `pg_policies` y
-- `pg_get_functiondef`, copiadas tal cual. Una migración de puesta al día que
-- reconstruya algo PARECIDO es peor que no tenerla: hace creer que el repo
-- está completo cuando lo que levanta es otra cosa.
-- ─────────────────────────────────────────────────────────────────────────────


-- ═══ 1. QUIÉN MANDA EN LA PLATAFORMA ═══════════════════════════════════════
--
-- Va primero porque `is_platform_admin()` la consulta, y las políticas de
-- `plans` y `addons` consultan esa función. Sin esto, ninguna de las tres
-- cosas siguientes se puede crear.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- CADA UNO SOLO SE VE A SÍ MISMO. La lista de quién es administrador de la
-- plataforma no es asunto de los clientes; lo único que necesita el navegador
-- es saber si el que ha entrado lo es.
do $$ begin
  if not exists (
    select 1 from pg_policies
     where schemaname='public' and tablename='platform_admins' and policyname='platform_admins_self'
  ) then
    create policy platform_admins_self on public.platform_admins
      for select using (user_id = auth.uid());
  end if;
end $$;

create or replace function public.is_platform_admin()
returns boolean language sql stable set search_path to 'public', 'pg_temp' as $$
  select exists (select 1 from public.platform_admins a where a.user_id = auth.uid())
$$;


-- ═══ 2. EL CATÁLOGO: PLANES Y COMPLEMENTOS ═════════════════════════════════
--
-- `plans.code` es a lo que apunta `organizations.plan`. Sin estas filas, una
-- cuenta con plan «growth» no tiene plan: `org_features` no encuentra nada y
-- la cuenta sale sin IA, sin tienda y sin almacenamiento — pagando.

create table if not exists public.plans (
  code                    text primary key,
  name                    text not null,
  sort                    integer not null default 0,
  price_monthly           numeric(10,2) not null default 0,
  currency                text not null default 'MXN',
  storage_mb              integer not null default 50,
  bots_limit              integer not null default 1,
  conversations_month     integer not null default 500,
  active                  boolean not null default true,
  messages_month          integer not null default 1000,
  ai_messages_month       integer not null default 500,
  agents_included         integer not null default 1,
  extra_1k_messages_price numeric(10,2) not null default 20,
  is_featured             boolean not null default false,
  ai_message_weight       integer not null default 3,
  org_id                  uuid references organizations(id) on delete cascade,
  is_custom               boolean not null default false,
  stripe_product_id       text,
  stripe_price_id         text,
  stripe_synced_at        timestamptz,
  stripe_error            text,
  integrations            text[],
  channels                text[],
  notes                   text,
  features                text[] not null default '{}'::text[]
);

create index if not exists plans_org_idx on public.plans (org_id) where org_id is not null;

alter table public.plans enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plans' and policyname='plans_read') then
    -- El catálogo público lo ve cualquiera que haya entrado; los planes a la
    -- medida SOLO el cliente para el que se hicieron.
    create policy plans_read on public.plans for select to authenticated
      using (org_id is null or org_id in (select auth_org_ids()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plans' and policyname='plans_admin_write') then
    create policy plans_admin_write on public.plans for all to authenticated
      using (public.is_platform_admin()) with check (public.is_platform_admin());
  end if;
end $$;

create table if not exists public.addons (
  code              text primary key,
  name              text not null,
  description       text,
  unit              text not null,
  price             numeric(10,2) not null,
  currency          text not null default 'USD',
  recurring         boolean not null default true,
  sort              integer not null default 0,
  active            boolean not null default true,
  is_quote          boolean not null default false,
  stripe_product_id text,
  stripe_price_id   text,
  stripe_synced_at  timestamptz,
  stripe_error      text,
  otorga            text[] not null default '{}'::text[]
);

alter table public.addons enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='addons' and policyname='addons_read') then
    create policy addons_read on public.addons for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='addons' and policyname='addons_solo_demandu_escribe') then
    create policy addons_solo_demandu_escribe on public.addons for all
      using (public.is_platform_admin()) with check (public.is_platform_admin());
  end if;
end $$;

-- Qué complementos tiene contratados cada cuenta.
create table if not exists public.org_addons (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  addon_code text not null references addons(code),
  quantity   integer not null default 1,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists org_addons_org_idx on public.org_addons (org_id) where active;

alter table public.org_addons enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='org_addons' and policyname='org_addons_read') then
    -- Solo lectura a propósito: lo que un cliente tiene contratado lo escribe
    -- el cobro (Stripe) o Demandu, nunca el propio cliente.
    create policy org_addons_read on public.org_addons for select
      using (org_id in (select auth_org_ids()));
  end if;
end $$;

-- Lo que consume: cada respuesta de IA, y lo que venga después.
create table if not exists public.usage_events (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  bot_id     uuid references bots(id) on delete set null,
  kind       text not null,
  quantity   integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_org_period_idx on public.usage_events (org_id, kind, created_at);

alter table public.usage_events enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='usage_events' and policyname='usage_events_read') then
    create policy usage_events_read on public.usage_events for select
      using (org_id in (select auth_org_ids()));
  end if;
end $$;


-- ═══ 3. LAS CINCO COLUMNAS QUE FALTABAN ════════════════════════════════════

-- `extra_storage_mb` la lee `org_storage_limit_bytes` y `branding` la usa el
-- chat de la web. Las dos van antes de las funciones de más abajo, que las
-- consultan.
alter table public.organizations add column if not exists extra_storage_mb integer not null default 0;
alter table public.organizations add column if not exists branding jsonb not null default '{}'::jsonb;

comment on column public.organizations.extra_storage_mb is
  'Espacio adicional contratado como add-on, en MB. Se suma al del plan.';
comment on column public.organizations.branding is
  'Personalización visual del cliente: {"bubble_out":"#6E42FF","bubble_in":"#FFFFFF"}';

-- POR QUÉ ACABÓ LA CONVERSACIÓN CON UNA PERSONA. Es el campo con el que se
-- distinguió, el 6 de septiembre, un pase a humano DECIDIDO por la IA de una
-- avería de la IA. Sin él, las dos cosas se ven exactamente igual en la
-- Bandeja, y una agenda rota parece una conversación normal.
alter table public.conversations add column if not exists handoff_reason text;

-- LAS DOS COLUMNAS CON LAS QUE UN FLUJO SE DISPARA. `keywords` es lo que se
-- compara con lo que escribió la persona (o con el comentario en Instagram), y
-- `priority` es lo que desempata cuando coinciden dos. Sin ellas ningún flujo
-- atiende nada: no es que fallen, es que nunca coinciden.
alter table public.flows add column if not exists keywords text[] not null default '{}'::text[];
alter table public.flows add column if not exists priority integer not null default 0;


-- ═══ 4. LA BANDEJA: RESPUESTAS RÁPIDAS Y NOTAS ═════════════════════════════

create table if not exists public.quick_replies (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations(id) on delete cascade,
  shortcut   text not null,
  title      text not null,
  body       text not null,
  category   text,
  sort       integer not null default 0,
  uses       integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

-- EL ATAJO ES ÚNICO SIN IMPORTAR MAYÚSCULAS. Quien escribe `/precio` en el
-- chat no piensa en cómo lo guardó, y dos atajos que solo se diferencian en
-- una mayúscula son un atajo roto.
create unique index if not exists quick_replies_atajo_unico on public.quick_replies (org_id, lower(shortcut));
create index if not exists quick_replies_orden_idx on public.quick_replies (org_id, sort, created_at);

alter table public.quick_replies enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='quick_replies' and policyname='quick_replies_all') then
    create policy quick_replies_all on public.quick_replies for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

comment on table public.quick_replies is
  'Mensajes prediseñados del equipo para el chat en vivo. Admiten {{nombre}}, {{telefono}}, etc.';

create or replace function public.bump_quick_reply(p_id uuid)
returns void language sql set search_path to 'public' as $$
  update public.quick_replies set uses = uses + 1 where id = p_id;
$$;

create table if not exists public.contact_notes (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  contact_id  uuid not null references contacts(id) on delete cascade,
  body        text not null,
  author_id   uuid references auth.users(id) on delete set null,
  author_name text,
  color       text not null default 'amarillo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz
);

create index if not exists contact_notes_contacto_idx on public.contact_notes (contact_id, created_at desc);

alter table public.contact_notes enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='contact_notes' and policyname='contact_notes_all') then
    create policy contact_notes_all on public.contact_notes for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

comment on table public.contact_notes is
  'Notas internas del equipo sobre un lead. Nunca las ve el cliente final.';


-- ═══ 5. WHATSAPP: PLANTILLAS Y FORMULARIOS ═════════════════════════════════

create table if not exists public.whatsapp_templates (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  waba_id         text,
  meta_id         text,
  name            text not null,
  language        text not null default 'es',
  category        text,
  status          text default 'PENDING',
  body            text,
  components      jsonb,
  variables       integer not null default 0,
  updated_at      timestamptz not null default now(),
  bot_id          uuid,
  rejected_reason text,
  quality         text,
  creada_aqui     boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint whatsapp_templates_bot_name_lang_key unique (bot_id, name, language)
);

create index if not exists idx_templates_org on public.whatsapp_templates (org_id);
create index if not exists idx_templates_bot on public.whatsapp_templates (bot_id);

alter table public.whatsapp_templates enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='whatsapp_templates' and policyname='templates_all') then
    create policy templates_all on public.whatsapp_templates for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

-- DÓNDE VIVE SI UN FORMULARIO SE PUEDE MANDAR O NO. Meta rechaza con un
-- `(#131009)` mudo los formularios en BORRADOR mandados como publicados; esta
-- tabla es lo único que sabe en qué estado está cada uno.
create table if not exists public.whatsapp_forms (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  bot_id       uuid references bots(id) on delete cascade,
  waba_id      text,
  meta_flow_id text not null,
  name         text not null,
  status       text default 'DRAFT',
  categories   text[],
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create index if not exists wa_forms_bot_idx on public.whatsapp_forms (bot_id);
create unique index if not exists wa_forms_bot_flow_uidx on public.whatsapp_forms (bot_id, meta_flow_id);

alter table public.whatsapp_forms enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='whatsapp_forms' and policyname='whatsapp_forms_all') then
    create policy whatsapp_forms_all on public.whatsapp_forms for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;


-- ═══ 6. DIFUSIONES ═════════════════════════════════════════════════════════

create table if not exists public.campaigns (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  name              text not null,
  template_name     text,
  template_language text default 'es',
  status            text not null default 'draft',
  audience_count    integer not null default 0,
  created_at        timestamptz not null default now(),
  bot_id            uuid
);

create index if not exists idx_campaigns_org on public.campaigns (org_id);
create index if not exists idx_campaigns_bot on public.campaigns (bot_id);

alter table public.campaigns enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaigns' and policyname='campaigns_all') then
    create policy campaigns_all on public.campaigns for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

create table if not exists public.campaign_recipients (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  org_id        uuid not null,
  contact_id    uuid,
  phone         text,
  name          text,
  wa_message_id text,
  status        text not null default 'queued',
  error         text,
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  replied_at    timestamptz,
  created_at    timestamptz not null default now(),
  intentos      integer not null default 0,
  tomado_en     timestamptz
);

create index if not exists idx_campaign_recipients_org on public.campaign_recipients (org_id);
create index if not exists idx_campaign_recipients_campaign on public.campaign_recipients (campaign_id);
create index if not exists idx_campaign_recipients_wamid on public.campaign_recipients (wa_message_id);
create index if not exists campaign_recipients_campana_idx on public.campaign_recipients (campaign_id, status);
-- La cola de la difusión: solo lo que está por salir o saliendo.
create index if not exists campaign_recipients_cola_idx on public.campaign_recipients (status, created_at)
  where status = any (array['pendiente'::text, 'enviando'::text]);

alter table public.campaign_recipients enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='campaign_recipients' and policyname='campaign_recipients_all') then
    create policy campaign_recipients_all on public.campaign_recipients for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

comment on column public.campaign_recipients.intentos is
  'Cuántas veces se ha intentado enviar. Tope bajo: un número que rebota no mejora insistiendo.';
comment on column public.campaign_recipients.tomado_en is
  'Cuándo se lo llevó una tanda. Sirve para rescatar lo que quedó a medias.';


-- ═══ 7. SECUENCIAS (DRIPS) ═════════════════════════════════════════════════

create table if not exists public.drips (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  bot_id       uuid not null references bots(id) on delete cascade,
  name         text not null,
  enabled      boolean not null default true,
  trigger_type text not null default 'new_contact',
  tag_name     text,
  created_at   timestamptz not null default now()
);

create index if not exists drips_bot_idx on public.drips (bot_id);

create table if not exists public.drip_steps (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  drip_id           uuid not null references drips(id) on delete cascade,
  position          integer not null default 1,
  delay_value       integer not null default 1,
  delay_unit        text not null default 'days',
  template_name     text,
  template_language text default 'es',
  body              text,
  created_at        timestamptz not null default now()
);

create index if not exists drip_steps_drip_idx on public.drip_steps (drip_id, "position");

create table if not exists public.drip_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  drip_id       uuid not null references drips(id) on delete cascade,
  contact_id    uuid references contacts(id) on delete cascade,
  phone         text,
  name          text,
  step_position integer not null default 0,
  next_run_at   timestamptz,
  status        text not null default 'active',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint drip_subscriptions_drip_id_contact_id_key unique (drip_id, contact_id)
);

create index if not exists drip_subs_drip_idx on public.drip_subscriptions (drip_id);
create index if not exists drip_subs_due_idx on public.drip_subscriptions (status, next_run_at);

create table if not exists public.drip_sends (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  drip_id         uuid not null references drips(id) on delete cascade,
  subscription_id uuid references drip_subscriptions(id) on delete cascade,
  step_id         uuid references drip_steps(id) on delete set null,
  contact_id      uuid,
  phone           text,
  request_id      bigint,
  wa_message_id   text,
  status          text not null default 'sending',
  error           text,
  sent_at         timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  replied_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists drip_sends_drip_idx on public.drip_sends (drip_id);
create index if not exists drip_sends_pending_idx on public.drip_sends (status, request_id);
create index if not exists drip_sends_wamid_idx on public.drip_sends (wa_message_id);

alter table public.drips              enable row level security;
alter table public.drip_steps         enable row level security;
alter table public.drip_subscriptions enable row level security;
alter table public.drip_sends         enable row level security;

do $$
declare t text;
begin
  foreach t in array array['drips','drip_steps','drip_subscriptions','drip_sends'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t||'_all') then
      execute format(
        'create policy %I on public.%I for all using (org_id in (select auth_org_ids())) with check (org_id in (select auth_org_ids()))',
        t||'_all', t);
    end if;
  end loop;
end $$;

create or replace function public.drip_interval(v integer, u text)
returns interval language sql immutable set search_path to 'pg_catalog', 'pg_temp' as $$
  select case u
    when 'minutes' then make_interval(mins => coalesce(v,0))
    when 'hours'   then make_interval(hours => coalesce(v,0))
    else                make_interval(days => coalesce(v,0))
  end
$$;

create or replace function public.drip_enroll()
returns integer language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare n int;
begin
  with ins as (
    insert into public.drip_subscriptions (org_id, drip_id, contact_id, phone, name, step_position, next_run_at, status)
    select d.org_id, d.id, c.id, c.phone, c.name, 0,
           now() + public.drip_interval(s1.delay_value, s1.delay_unit), 'active'
    from public.drips d
    join public.bots b on b.id = d.bot_id and b.channel = 'whatsapp'
    join public.contacts c
      on c.org_id = d.org_id
     and c.channel = 'whatsapp'
     and coalesce(c.opted_out, false) = false
     and c.phone is not null
    join lateral (
      select st.delay_value, st.delay_unit
      from public.drip_steps st
      where st.drip_id = d.id
      order by st.position
      limit 1
    ) s1 on true
    where d.enabled
      and (
        (d.trigger_type = 'new_contact' and c.created_at >= d.created_at)
        or (d.trigger_type = 'tag_added' and d.tag_name is not null and c.tags @> array[d.tag_name]::text[])
      )
      and not exists (
        select 1 from public.drip_subscriptions s
        where s.drip_id = d.id and s.contact_id = c.id
      )
    on conflict (drip_id, contact_id) do nothing
    returning 1
  )
  select count(*) into n from ins;
  return coalesce(n, 0);
end;
$$;

create or replace function public.drip_dispatch()
returns integer language plpgsql security definer set search_path to 'public', 'net', 'pg_temp' as $$
declare
  r record; st record; nxt record; cfg record;
  req bigint; n int := 0;
begin
  for r in
    select s.id, s.drip_id, s.org_id, s.contact_id, s.phone, s.step_position, d.bot_id
    from public.drip_subscriptions s
    join public.drips d on d.id = s.drip_id and d.enabled
    where s.status = 'active'
      and s.next_run_at is not null
      and s.next_run_at <= now()
    order by s.next_run_at
    limit 200
  loop
    select st2.id, st2.position, st2.template_name, st2.template_language
      into st
    from public.drip_steps st2
    where st2.drip_id = r.drip_id and st2.position > r.step_position
    order by st2.position
    limit 1;

    if not found then
      update public.drip_subscriptions
        set status = 'done', next_run_at = null, updated_at = now()
      where id = r.id;
      continue;
    end if;

    -- Falta la plantilla: error de configuración → sí falla
    if st.template_name is null then
      update public.drip_subscriptions
        set status = 'failed', next_run_at = null, updated_at = now()
      where id = r.id;
      continue;
    end if;

    select w.phone_number_id, w.access_token into cfg
    from public.whatsapp_channels w where w.bot_id = r.bot_id limit 1;

    -- Aún sin WhatsApp conectado: reintentar más tarde, sin perder al contacto
    if not found or cfg.access_token is null or cfg.phone_number_id is null then
      update public.drip_subscriptions
        set next_run_at = now() + interval '30 minutes', updated_at = now()
      where id = r.id;
      continue;
    end if;

    select net.http_post(
      url := 'https://graph.facebook.com/v20.0/' || cfg.phone_number_id || '/messages',
      body := jsonb_build_object(
        'messaging_product', 'whatsapp',
        'to', r.phone,
        'type', 'template',
        'template', jsonb_build_object(
          'name', st.template_name,
          'language', jsonb_build_object('code', coalesce(st.template_language, 'es'))
        )
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || cfg.access_token
      )
    ) into req;

    insert into public.drip_sends (org_id, drip_id, subscription_id, step_id, contact_id, phone, request_id, status, sent_at)
    values (r.org_id, r.drip_id, r.id, st.id, r.contact_id, r.phone, req, 'sending', now());

    select st3.delay_value, st3.delay_unit into nxt
    from public.drip_steps st3
    where st3.drip_id = r.drip_id and st3.position > st.position
    order by st3.position
    limit 1;

    if found then
      update public.drip_subscriptions
        set step_position = st.position,
            next_run_at = now() + public.drip_interval(nxt.delay_value, nxt.delay_unit),
            updated_at = now()
      where id = r.id;
    else
      update public.drip_subscriptions
        set step_position = st.position, next_run_at = null, status = 'done', updated_at = now()
      where id = r.id;
    end if;

    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.drip_reconcile()
returns integer language plpgsql security definer set search_path to 'public', 'net', 'pg_temp' as $$
declare r record; n int := 0; j jsonb; wamid text;
begin
  for r in
    select ds.id as send_id, resp.status_code, resp.content, resp.error_msg
    from public.drip_sends ds
    join net._http_response resp on resp.id = ds.request_id
    where ds.status = 'sending'
    limit 500
  loop
    begin
      j := r.content::jsonb;
    exception when others then
      j := null;
    end;

    wamid := j #>> '{messages,0,id}';

    if r.status_code between 200 and 299 and wamid is not null then
      update public.drip_sends set status = 'sent', wa_message_id = wamid where id = r.send_id;
    else
      update public.drip_sends
        set status = 'failed',
            error = coalesce(j #>> '{error,message}', r.error_msg, 'error ' || coalesce(r.status_code::text, '?'))
      where id = r.send_id;
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.drip_tick()
returns text language plpgsql security definer set search_path to 'public', 'net', 'pg_temp' as $$
declare a int; b int; c int;
begin
  a := public.drip_enroll();
  b := public.drip_dispatch();
  c := public.drip_reconcile();
  return format('enrolled=%s sent=%s reconciled=%s', a, b, c);
end;
$$;


-- ═══ 8. ARCHIVOS DE ENTRENAMIENTO Y CATÁLOGO VIEJO ═════════════════════════

-- Lo que el cliente sube para entrenar al bot. `org_storage_used_bytes` suma
-- sus bytes junto con los de `bot_knowledge`; sin esta tabla, esa función no
-- se puede ni crear.
create table if not exists public.knowledge_files (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  bot_id       uuid not null references bots(id) on delete cascade,
  file_name    text not null,
  mime_type    text,
  bytes        bigint not null default 0,
  storage_path text,
  source_id    uuid,
  status       text not null default 'ready',
  error        text,
  created_at   timestamptz not null default now()
);

create index if not exists knowledge_files_org_idx on public.knowledge_files (org_id);
create index if not exists knowledge_files_bot_idx on public.knowledge_files (bot_id);

alter table public.knowledge_files enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='knowledge_files' and policyname='knowledge_files_all') then
    create policy knowledge_files_all on public.knowledge_files for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

-- OJO: `products` NO es la tienda. La tienda de Demandu vive en
-- `tienda_productos` (ver la 0075 en adelante). Esta es el catálogo anterior,
-- que sigue existiendo en producción y por eso se escribe aquí.
create table if not exists public.products (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  bot_id      uuid references bots(id) on delete cascade,
  sku         text,
  name        text not null,
  description text,
  price       numeric(12,2),
  currency    text not null default 'MXN',
  image_url   text,
  available   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists products_bot_idx on public.products (bot_id);
create unique index if not exists products_bot_sku_uidx on public.products (bot_id, sku) where sku is not null;

alter table public.products enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='products' and policyname='products_all') then
    create policy products_all on public.products for all
      using (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;


-- ═══ 9. RASTROS: CONEXIONES FALLIDAS Y RESPALDO DE FLUJOS ══════════════════

create table if not exists public.conexiones_fallidas (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references organizations(id) on delete cascade,
  canal      text not null,
  paso       text not null,
  detalle    text,
  created_at timestamptz not null default now()
);

create index if not exists conex_fallidas_idx on public.conexiones_fallidas (canal, created_at desc);

alter table public.conexiones_fallidas enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='conexiones_fallidas' and policyname='conex_fallidas_de_mi_org') then
    create policy conex_fallidas_de_mi_org on public.conexiones_fallidas for select
      using (org_id in (select auth_org_ids()));
  end if;
end $$;

comment on table public.conexiones_fallidas is
  'Por que fallo un intento de conectar un canal. Existe porque los registros de Netlify solo transmiten en vivo: cuando un cliente dice "no me conecta", sin esto no queda ningun rastro de que paso.';

-- CERRADA A PROPÓSITO: RLS encendida y NINGUNA política, así que solo la llave
-- de servicio la ve. Es un respaldo manual, no una tabla de la aplicación.
create table if not exists public.respaldo_flujos (
  id          uuid,
  guardado_at timestamptz default now(),
  graph       jsonb
);

alter table public.respaldo_flujos enable row level security;

comment on table public.respaldo_flujos is
  'Respaldo manual de un flujo. Cerrado: sin políticas y sin permisos, solo la llave de servicio. No lo usa ningún código.';


-- ═══ 10. LAS FUNCIONES DE CONSUMO ══════════════════════════════════════════
--
-- Van al final porque consultan casi todo lo de arriba: `plans`, `org_addons`,
-- `usage_events`, `knowledge_files` y `organizations.extra_storage_mb`.

create or replace function public.org_storage_used_bytes(p_org uuid)
returns bigint language sql stable set search_path to 'public', 'pg_temp' as $$
  select coalesce((select sum(k.bytes) from public.bot_knowledge k where k.org_id = p_org), 0)
       + coalesce((select sum(f.bytes) from public.knowledge_files f where f.org_id = p_org), 0)
$$;

create or replace function public.org_storage_limit_bytes(p_org uuid)
returns bigint language sql stable set search_path to 'public', 'pg_temp' as $$
  select (coalesce(p.storage_mb, 50) + coalesce(o.extra_storage_mb, 0))::bigint * 1024 * 1024
  from public.organizations o
  left join public.plans p on p.code = o.plan
  where o.id = p_org
$$;

create or replace function public.org_usage(p_org uuid)
returns table(
  period_start timestamptz, period_end timestamptz,
  messages_used bigint, messages_limit bigint,
  ai_used bigint, ai_limit bigint,
  storage_used bigint, storage_limit bigint,
  agents_used bigint, agents_limit bigint,
  bots_used bigint, bots_limit bigint,
  plan_code text, plan_name text
) language sql stable set search_path to 'public', 'pg_temp' as $$
  with per as (
    select date_trunc('month', now()) as ini,
           (date_trunc('month', now()) + interval '1 month') as fin
  ),
  org as (
    select o.id, o.plan, coalesce(o.extra_storage_mb,0) as extra_mb
    from public.organizations o where o.id = p_org
  ),
  pl as (select p.* from public.plans p join org on p.code = org.plan),
  ad as (
    select
      coalesce(sum(case when oa.addon_code = 'msgs_1k'   then oa.quantity end), 0) * 1000 as extra_msgs,
      coalesce(sum(case when oa.addon_code = 'ai_1k'     then oa.quantity end), 0) * 1000 as extra_ia,
      coalesce(sum(case when oa.addon_code = 'agent'     then oa.quantity end), 0) as extra_agents,
      coalesce(sum(case when oa.addon_code = 'bot_extra' then oa.quantity end), 0) as extra_bots,
      coalesce(sum(case when oa.addon_code = 'gb_1'      then oa.quantity end), 0) * 1024
        + coalesce(sum(case when oa.addon_code = 'gb_5'  then oa.quantity end), 0) * 5120 as extra_gb_mb
    from public.org_addons oa where oa.org_id = p_org and oa.active
  ),
  cnt as (
    select
      (select count(*) from public.messages m, per
        where m.org_id = p_org and m.direction = 'outbound'
          and m.created_at >= per.ini and m.created_at < per.fin
          and not (m.payload ? 'no_entregado')) as salientes,
      (select coalesce(sum(u.quantity),0) from public.usage_events u, per
        where u.org_id = p_org and u.kind = 'ai_message'
          and u.created_at >= per.ini and u.created_at < per.fin) as ia
  )
  select
    per.ini, per.fin,
    -- DOS CONTADORES HONESTOS, sin multiplicador escondido.
    -- Un mensaje saliente cuenta 1. Punto.
    cnt.salientes::bigint,
    (coalesce(pl.messages_month,0) + ad.extra_msgs)::bigint,
    -- Y si además lo escribió la IA, cuenta 1 respuesta de Lana. Una respuesta
    -- de IA consume 1 y 1: es un mensaje (lo es) y costó dinero (también).
    -- Antes se cobraba como 3 mensajes y el cliente veía su paquete vaciarse
    -- sin entender por qué. Lo opaco no se puede vender.
    cnt.ia::bigint,
    (coalesce(pl.ai_messages_month,0) + ad.extra_ia)::bigint,
    public.org_storage_used_bytes(p_org),
    ((coalesce(pl.storage_mb,0) + org.extra_mb + ad.extra_gb_mb)::bigint * 1024 * 1024),
    (select count(*) from public.team_members t where t.org_id = p_org)::bigint,
    (coalesce(pl.agents_included,0) + ad.extra_agents)::bigint,
    (select count(*) from public.bots b where b.org_id = p_org)::bigint,
    (coalesce(pl.bots_limit,0) + ad.extra_bots)::bigint,
    pl.code, pl.name
  from per, org, pl, ad, cnt;
$$;


-- ═══ 11. EL DISPARADOR QUE FALTABA ═════════════════════════════════════════
--
-- `bot_knowledge` tiene `org_id` Y `bot_id`. Sin este candado, una fila con el
-- `org_id` de un cliente y el `bot_id` de otro se guarda sin protestar — y a
-- partir de ahí el bot del segundo contesta con el conocimiento del primero.
-- Es el peor fallo posible en una plataforma multicliente y no lo detecta
-- ninguna política: las dos columnas son, cada una por su lado, correctas.

create or replace function public.bot_knowledge_guard()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $$
declare owner_org uuid;
begin
  select b.org_id into owner_org from public.bots b where b.id = new.bot_id;
  if owner_org is null then
    raise exception 'El chatbot % no existe', new.bot_id;
  end if;
  if new.org_id is distinct from owner_org then
    raise exception 'El conocimiento no coincide con la organización dueña del chatbot';
  end if;
  return new;
end;
$$;

drop trigger if exists bot_knowledge_guard_trg on public.bot_knowledge;
create trigger bot_knowledge_guard_trg
  before insert or update of org_id, bot_id on public.bot_knowledge
  for each row execute function public.bot_knowledge_guard();


-- ═══ 12. EL CATÁLOGO DE VERDAD ═════════════════════════════════════════════
--
-- SIN FILAS, `plans` ES UNA TABLA VACÍA Y NADIE TIENE PLAN. Estas son las de
-- producción, con una diferencia deliberada: NO llevan los identificadores de
-- Stripe. Esos son de la cuenta de Stripe de producción y meterlos en una base
-- nueva haría que el cobro apuntara a productos que no le corresponden. Los
-- rellena la sincronización desde el panel, que es su sitio.
--
-- Todo con `on conflict do nothing`: en producción no toca ni una fila.

insert into public.plans
  (code, name, sort, price_monthly, currency, storage_mb, bots_limit, conversations_month,
   messages_month, ai_messages_month, agents_included, extra_1k_messages_price,
   is_featured, ai_message_weight, features)
values
  ('starter','Emprende',    1,  59,'USD',   200,  2,  3000,  3000,  500, 2, 20, false, 1, '{}'),
  ('growth', 'Crece',       2,  99,'USD',  1024,  5,  6000,  6000, 2000, 3, 18, true,  1, '{ia}'),
  ('pro',    'Profesional', 3, 179,'USD',  5120,999, 12000, 12000, 5000, 5, 15, false, 1, '{ia,tienda}'),
  -- «Empresa» va a cero y con todo en cero a propósito: es el plan que se
  -- cotiza. Los límites los pone el contrato, no la tabla.
  ('scale',  'Empresa',     4,   0,'USD', 20480,999,     0,     0,    0, 0, 12, false, 1, '{ia,tienda}')
on conflict (code) do nothing;

insert into public.addons
  (code, name, description, unit, price, currency, recurring, sort, active, is_quote, otorga)
values
  ('tienda','Tienda en WhatsApp',
   'Tu catálogo, tus pedidos y tu cobro por Yappy dentro de WhatsApp. Sin comisión por venta. Se cobra por cada tienda activa.',
   'tienda', 59,'USD', true, 0, true, false, '{tienda}'),
  ('ia','Lana IA',
   'Enciende las respuestas con inteligencia artificial en tu plan. Usa los mismos mensajes de tu paquete: no se cobra aparte por respuesta.',
   'cuenta', 29,'USD', true, 1, true, false, '{ia}'),
  ('msgs_1k','1,000 mensajes adicionales',
   'Se suman a los de tu plan. Sirven para todo: respuestas normales y con IA.',
   '1000_mensajes', 20,'USD', true, 1, true, false, '{}'),
  ('ai_1k','1,000 respuestas de Lana',
   'Para cuando se te acaban las respuestas con inteligencia artificial de tu plan.',
   '1000_ia', 20,'USD', true, 2, false, false, '{}'),
  ('bot_extra','Chatbot adicional',
   'Cada chatbot atiende un canal. Si quieres conectar otro número de WhatsApp, necesitas otro chatbot.',
   'bot', 20,'USD', true, 3, true, false, '{}'),
  ('agent','Licencia de agente',
   'Un asiento más para tu equipo en la Bandeja.',
   'agente', 20,'USD', true, 3, true, false, '{}'),
  ('ai_5k','5,000 mensajes de IA',
   'Paquete con descuento por volumen.',
   '1000_ia', 60,'USD', true, 4, false, false, '{}'),
  ('gb_1','1 GB de entrenamiento',
   'Más espacio para documentos e información del negocio.',
   'gb', 20,'USD', true, 5, true, false, '{}'),
  ('gb_5','5 GB de entrenamiento',
   'Paquete con descuento por volumen.',
   'gb', 45,'USD', true, 6, false, false, '{}'),
  ('whitelabel','Marca blanca',
   'Quita la marca Demandu del chat. Precio por chatbot.',
   'bot', 20,'USD', true, 7, false, false, '{}'),
  ('wa_number','Número de WhatsApp extra',
   'Conecta otro número al mismo plan.',
   'numero', 20,'USD', true, 8, false, false, '{}'),
  ('setup_wa','Instalación asistida',
   'Configuramos todo por ti. El precio final depende de lo que haya que desarrollar; esto es el punto de partida.',
   'unico', 179,'USD', false, 9, true, true, '{}')
on conflict (code) do nothing;

comment on column public.plans.org_id is
  'NULL = plan público del catálogo. Con valor = plan hecho a la medida para ese cliente.';
comment on column public.plans.ai_message_weight is
  'Cuántos mensajes consume una respuesta con IA. Permite proteger el margen sin confundir al cliente con dos monedas.';
comment on column public.plans.stripe_price_id is
  'Precio en Stripe. Los precios de Stripe son inmutables: al cambiar el monto se crea uno nuevo.';
comment on column public.addons.stripe_price_id is
  'Precio en Stripe. Mientras sea nulo, el cobro arma el precio al vuelo como antes.';
comment on column public.addons.stripe_error is
  'Por que fallo la ultima sincronizacion. Nulo = todo bien.';
