-- ===========================================================================
-- 0017 — El contador de mensajes sin leer
--
-- POR QUÉ NO SE VEÍAN LAS NOTIFICACIONES: el vigilante de avisos busca
-- conversaciones con `unread > 0`. Nadie estaba subiendo ese contador. Lo
-- único que lo tocaba era el atajo de "quiero una persona" (unread := 1) y el
-- botón de "marcar como no leído" de la Bandeja. Resultado: una conversación
-- con 16 mensajes entrantes seguía marcando 0, la consulta del vigilante
-- volvía vacía, y no había ni tarjeta, ni sonido, ni contador en la pestaña.
--
-- El fallo estaba una capa MÁS ABAJO de lo que parecía: la parte visual de los
-- avisos funcionaba; lo que faltaba era el dato que la dispara.
--
-- Se resuelve en la base y no en los motores: así vale para WhatsApp, el
-- widget web y cualquier canal que venga después, sin tocar ni desplegar nada.
-- ===========================================================================
create or replace function conv_contar_no_leidos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'inbound' then
    -- Llegó algo del cliente: sube el contador.
    update conversations
       set unread = coalesce(unread, 0) + 1,
           last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
     where id = new.conversation_id;

  elsif new.sender = 'agent' then
    -- Contestó una PERSONA del equipo: si respondió, es que lo leyó.
    -- Ojo: que conteste el bot NO significa que alguien lo haya visto, por eso
    -- solo cuenta 'agent' y no 'bot'.
    update conversations
       set unread = 0,
           last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
     where id = new.conversation_id;

  else
    update conversations
       set last_message_at = greatest(coalesce(last_message_at, new.created_at), new.created_at)
     where id = new.conversation_id;
  end if;
  return null;
end $$;

drop trigger if exists messages_no_leidos on messages;
create trigger messages_no_leidos after insert on messages
  for each row execute function conv_contar_no_leidos();

revoke execute on function public.conv_contar_no_leidos() from public, anon, authenticated;

-- Poner al día lo que quedó atrás: cuántos entrantes hay después de la última
-- respuesta de una persona (o desde el principio, si nunca contestó nadie).
update conversations c
   set unread = sub.pendientes
  from (
    select cv.id,
           (select count(*) from messages m
             where m.conversation_id = cv.id
               and m.direction = 'inbound'
               and m.created_at > coalesce(
                     (select max(m2.created_at) from messages m2
                       where m2.conversation_id = cv.id and m2.sender = 'agent'),
                     '-infinity'::timestamptz)) as pendientes
      from conversations cv
  ) sub
 where c.id = sub.id
   and c.status <> 'closed'
   and coalesce(c.unread, 0) <> sub.pendientes;
