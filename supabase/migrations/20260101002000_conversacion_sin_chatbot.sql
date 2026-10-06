-- 0020 · Red de seguridad: que una conversación no se quede sin chatbot
--
-- QUÉ PASÓ: 5 de 8 conversaciones tenían `bot_id` nulo y desaparecían del panel
-- "Por chatbot" (ver 0019). Investigado a fondo, no era un fallo del código: las
-- TRES rutas que crean conversaciones —canal web, webhook de WhatsApp y la edge
-- function— siempre mandan `bot_id`, y así ha sido en cada commit desde el 16 de
-- agosto. Lo que fallaba era el DESPLIEGUE: el sitio publicado iba detrás del
-- repo, así que durante días corrió una versión vieja que aún no lo mandaba.
-- La prueba está en las fechas: las conversaciones creadas después del
-- despliegue del 20 de agosto sí traen `bot_id`; las de antes, no.
--
-- POR QUÉ ESTA MIGRACIÓN IGUAL: que hoy no haya fuga no significa que no la
-- vuelva a haber. Basta con un canal nuevo, un despliegue a medias o un `insert`
-- desde el editor SQL. Y el modo de fallar es silencioso: nadie ve un error,
-- solo un panel que reporta de menos. Esta regla vive en la base, así que
-- protege a TODOS los canales a la vez, incluidos los que aún no existen.
--
-- LO QUE NO HACE: inventar. Si la organización tiene dos chatbots en ese canal
-- no hay forma de saber cuál atendió, y se deja en nulo — el renglón "Sin
-- chatbot asignado" de 0019 lo muestra con honestidad. Solo rellena cuando la
-- respuesta es única y por lo tanto segura.

create or replace function conv_asignar_bot()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare v_bot uuid; v_cuantos int;
begin
  if new.bot_id is not null or new.org_id is null or new.channel is null then
    return new;
  end if;

  -- Solo si hay EXACTAMENTE uno: con dos, cualquier elección sería un invento.
  -- `conversations.channel` es un enum y `bots.channel` es texto: sin el cast
  -- Postgres rechaza la comparación.
  select count(*), min(id) into v_cuantos, v_bot
    from bots
   where org_id = new.org_id and channel = new.channel::text;

  if v_cuantos = 1 then
    new.bot_id := v_bot;
  end if;

  return new;
end $fn$;

drop trigger if exists conversations_asignar_bot on conversations;

-- BEFORE INSERT y ANTES que el resto: `conversations_crm` copia `new.bot_id` a
-- la tarjeta del embudo, así que si corriera primero la copiaría todavía nula.
-- Postgres dispara los BEFORE por orden alfabético del nombre, y
-- "conversations_asignar_bot" va antes que "conversations_crm" y que
-- "conversations_reparto".
create trigger conversations_asignar_bot
  before insert on conversations
  for each row execute function conv_asignar_bot();

-- Igual que las demás funciones internas: EXECUTE se concede a PUBLIC por
-- defecto y `anon` hereda de PUBLIC, así que revocar solo de `anon` no sirve.
revoke execute on function public.conv_asignar_bot() from public, anon, authenticated;

-- Relleno de lo viejo, con la misma regla conservadora del disparador.
update conversations c
   set bot_id = b.id
  from bots b
 where c.bot_id is null
   and b.org_id = c.org_id
   and b.channel = c.channel::text
   and (select count(*) from bots b2
         where b2.org_id = c.org_id and b2.channel = c.channel::text) = 1;
