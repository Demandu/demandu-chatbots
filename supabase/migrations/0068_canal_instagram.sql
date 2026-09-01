-- ═══════════════════════════════════════════════════════════════════════════
-- 0068 · El canal de Instagram: la cuenta conectada y el candado de las
--        respuestas privadas.
--
-- Instagram no se parece a WhatsApp aunque los dos sean de Meta. En WhatsApp
-- todo llega por un sitio: un mensaje. En Instagram llegan CUATRO cosas por
-- DOS caminos distintos del mismo webhook (verificado contra la documentación
-- de Meta el 1 sep 2026):
--
--   entry[].messaging[]  → mensajes directos, respuestas a historias
--                          (`message.reply_to.story`) y adjuntos.
--   entry[].changes[]    → comentarios (`field: "comments"`), comentarios en
--                          vivo y menciones.
--
-- Esta migración solo guarda DOS cosas, y las dos existen por un motivo duro.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. La cuenta conectada ─────────────────────────────────────────────────
create table if not exists public.instagram_channels (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  bot_id      uuid references public.bots(id) on delete set null,

  -- El id de la cuenta profesional de Instagram (los que empiezan por 1784…).
  -- ES ÚNICO EN TODA LA PLATAFORMA, Y NO ES UN DETALLE: el webhook de Meta no
  -- dice de qué cliente es cada evento, solo trae este id. Si dos
  -- organizaciones pudieran declarar la misma cuenta, los mensajes de una
  -- acabarían en la bandeja de la otra. La unicidad ES la garantía de
  -- aislamiento, no un adorno de integridad.
  ig_user_id  text not null unique,
  username    text,

  -- La página de Facebook ligada. Instagram no da tokens propios en este
  -- camino: se manda como la página, con el token de la página.
  page_id     text not null,
  page_name   text,
  access_token text not null,
  -- Los tokens de página derivados de un token de usuario de larga duración no
  -- caducan, pero eso depende de cómo se pidió. Se guarda lo que Meta diga y,
  -- si no dice nada, queda nulo: preferimos no saber a inventarnos una fecha.
  token_caduca timestamptz,

  conectado_por uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A DIFERENCIA DE `whatsapp_channels`, AQUÍ NO HAY `unique (org_id)`.
-- En WhatsApp un cliente tiene un número y punto. En Instagram es normal que
-- un negocio tenga varias cuentas (la marca, la tienda, el restaurante), y el
-- webhook sabe enrutar porque `ig_user_id` es único. Limitar a una sería una
-- restricción inventada por parecernos a WhatsApp.
create index if not exists ig_channels_org_idx on public.instagram_channels (org_id);
create index if not exists ig_channels_bot_idx on public.instagram_channels (bot_id);

alter table public.instagram_channels enable row level security;

revoke all on public.instagram_channels from public, anon;
grant select, insert, update, delete on public.instagram_channels to authenticated;

drop policy if exists ig_channels_de_mi_org on public.instagram_channels;
create policy ig_channels_de_mi_org on public.instagram_channels
  for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── 2. El candado de la respuesta privada ──────────────────────────────────
--
-- LA REGLA DE META: a un comentario se le puede mandar UNA sola respuesta
-- privada, y dentro de los 7 días siguientes. El segundo intento lo rechaza.
--
-- POR QUÉ UNA TABLA Y NO UN `if` EN EL CÓDIGO. Meta reintenta los webhooks.
-- Dos entregas del mismo comentario con medio segundo de diferencia harían que
-- dos procesos leyeran «todavía no se respondió» a la vez y los dos enviaran:
-- uno se manda y el otro se estrella. Peor, si el flujo tiene un reintento,
-- podríamos quemar el único disparo que existe contra un error tonto.
--
-- La clave primaria sobre `comment_id` ES el candado: se INSERTA PRIMERO y
-- solo se envía si la inserción ganó. Dos procesos a la vez, uno inserta y el
-- otro choca contra la clave — sin transacciones explícitas y sin carreras.
create table if not exists public.ig_respuestas_privadas (
  comment_id   text primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  ig_user_id   text not null,
  -- Se apunta ANTES de enviar. Si el envío falla, queda la fila y no se
  -- reintenta: quemar el único disparo es peor que perder una respuesta, y
  -- `resultado` deja ver qué pasó en vez de esconderlo.
  resultado    text,
  enviado_at   timestamptz not null default now()
);

create index if not exists ig_resp_org_idx on public.ig_respuestas_privadas (org_id, enviado_at desc);

alter table public.ig_respuestas_privadas enable row level security;

revoke all on public.ig_respuestas_privadas from public, anon;
grant select on public.ig_respuestas_privadas to authenticated;

drop policy if exists ig_resp_de_mi_org on public.ig_respuestas_privadas;
create policy ig_resp_de_mi_org on public.ig_respuestas_privadas
  for select
  using (org_id in (select auth_org_ids()));

-- ── 3. Pedir el turno para responder en privado ────────────────────────────
--
-- Devuelve TRUE solo la primera vez que se pregunta por ese comentario. El
-- webhook llama a esto y únicamente envía si le dijeron que sí.
--
-- `security definer` aquí SÍ es correcto y no contradice lo de 0067: el
-- webhook de Meta no trae sesión de nadie —no hay `auth.uid()` que valga— y la
-- organización no llega por parámetro desde un navegador, sale de buscar el
-- `ig_user_id` en `instagram_channels`, que es único. No hay nada que un
-- usuario pueda falsificar aquí.
create or replace function public.tomar_turno_respuesta_privada(
  p_org_id     uuid,
  p_ig_user_id text,
  p_comment_id text
) returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  insert into public.ig_respuestas_privadas (comment_id, org_id, ig_user_id)
  values (p_comment_id, p_org_id, p_ig_user_id);
  return true;
exception when unique_violation then
  -- Ya se respondió (o alguien lo está haciendo ahora mismo). No es un error:
  -- es exactamente lo que esta tabla existe para evitar.
  return false;
end $$;

revoke all on function public.tomar_turno_respuesta_privada(uuid, text, text) from public, anon;
grant execute on function public.tomar_turno_respuesta_privada(uuid, text, text) to service_role;
