-- El pedido y la conversación son la misma cosa.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASTA AHORA SE CORTABA EL RECORRIDO. El cliente mandaba su pedido por
-- WhatsApp, el mensaje entraba a la Bandeja como texto cualquiera, y el pedido
-- vivía en otra pantalla sin relación con esa conversación. Nadie quedaba
-- encargado. El negocio tenía el dinero cobrado, un chat abierto y un pedido en
-- un tablero, y era cosa suya atar los tres a mano.
--
-- ES JUSTO LO QUE NINGUNA TIENDA SUELTA PUEDE HACER, y era la tesis de meter la
-- tienda dentro de la plataforma. Estaba a medio construir.
--
-- VA EN LA BASE Y NO EN EL MOTOR, por la misma razón que el reparto: así vale
-- igual para WhatsApp, para el widget web y para el canal que venga después,
-- sin repetir la regla en cada uno.
--
-- EL CÓDIGO ES LO QUE LOS UNE. Viaja dentro del mensaje que el cliente manda, y
-- se comprueba contra la tabla: un texto de doce caracteres solo cuenta si es
-- un pedido de verdad de esa organización. Así no hace falta adivinar por el
-- contenido ni pedirle al cliente que escriba nada especial.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Quién atiende los pedidos de esta tienda ────────────────────────────
-- POR TIENDA, no por organización: un cliente con dos negocios tiene dos
-- encargados, y el reparto general no sabe distinguirlos. Si está vacío, el
-- pedido cae en el reparto automático de siempre en vez de quedarse huérfano.
alter table public.tiendas
  add column if not exists atiende_id uuid references public.team_members(id) on delete set null;

comment on column public.tiendas.atiende_id is
  'Quién se encarga de los pedidos de esta tienda. Vacío = reparto automático.';

-- ── 2. Al entrar un mensaje, ¿trae un pedido dentro? ───────────────────────
create or replace function public.tienda_enlazar_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  conv      record;
  ped       record;
  encargado uuid;
  candidato text;
begin
  -- Solo lo que ESCRIBE el cliente. Lo que manda el negocio lleva el mismo
  -- código muchas veces (al reenviar el enlace de cobro) y volvería a disparar
  -- todo esto sin motivo.
  if new.direction <> 'inbound' then return new; end if;
  if coalesce(new.body, '') = '' then return new; end if;

  select id, org_id, contact_id, assignee_member_id
    into conv
    from conversations
   where id = new.conversation_id;

  if conv.id is null then return new; end if;

  -- Se prueban todos los trozos con forma de código y gana el que exista de
  -- verdad. Comprobar contra la tabla es lo que hace innecesario adivinar: un
  -- código inventado simplemente no encuentra nada.
  for candidato in
    select distinct (regexp_matches(upper(new.body), '[A-Z0-9]{12}', 'g'))[1]
  loop
    select p.id, p.tienda_id, p.numero, p.conversacion_id, p.contacto_id, t.atiende_id
      into ped
      from pedidos p
      join tiendas t on t.id = p.tienda_id
     where p.codigo = candidato
       and p.org_id = conv.org_id
     limit 1;

    exit when ped.id is not null;
  end loop;

  if ped.id is null then return new; end if;

  -- YA ESTABA ENLAZADO: no se vuelve a asignar. El cliente escribe varias veces
  -- sobre el mismo pedido, y cada mensaje no puede reabrir la asignación ni
  -- llenar la bitácora de ruido.
  if ped.conversacion_id is not null then return new; end if;

  update pedidos
     set conversacion_id = conv.id,
         contacto_id     = coalesce(contacto_id, conv.contact_id),
         updated_at      = now()
   where id = ped.id;

  -- ── 3. Y alguien se hace cargo ───────────────────────────────────────────
  -- Un pedido que llega y no tiene dueño es un pedido que nadie mira. Se pide
  -- persona SIEMPRE; a quién le toca lo decide el encargado de la tienda o, si
  -- no hay, el reparto automático (el trigger de conversations respeta al que
  -- ya tenga dueño y elige solo cuando está vacío).
  encargado := ped.atiende_id;

  update conversations
     set assignee_member_id   = coalesce(assignee_member_id, encargado),
         assigned_at          = case
                                  when assignee_member_id is null and encargado is not null
                                  then now() else assigned_at
                                end,
         handoff_requested_at = coalesce(handoff_requested_at, now()),
         status               = case when status = 'closed' then 'open' else status end
   where id = conv.id;

  insert into pedido_eventos (pedido_id, que, quien, detalle)
  values (
    ped.id,
    'entro_a_la_bandeja',
    'tienda',
    jsonb_build_object(
      'conversacion_id', conv.id,
      'encargado', encargado,
      'por_reparto', encargado is null
    )
  );

  return new;
end $$;

drop trigger if exists messages_enlazan_pedido on public.messages;
create trigger messages_enlazan_pedido
  after insert on public.messages
  for each row execute function public.tienda_enlazar_pedido();

comment on function public.tienda_enlazar_pedido is
  'Cuando entra un mensaje con el código de un pedido, lo ata a esa conversación y se lo asigna a quien atiende esa tienda.';
