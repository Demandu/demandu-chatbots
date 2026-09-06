-- EL MENSAJE DEL CLIENTE NUNCA SE PIERDE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL FALLO MÁS CARO QUE HA TENIDO ESTA PLATAFORMA, y estuvo en producción sin
-- un solo error a la vista.
--
-- `tienda_enlazar_pedido` —el disparador que ata un pedido con su conversación
-- cuando el cliente manda su código— REVENTABA con cualquier mensaje normal, y
-- al reventar tumbaba el `insert` entero. Resultado: el mensaje del cliente NO
-- SE GUARDABA. En ningún canal: ni WhatsApp, ni Instagram, ni el widget.
--
-- Lo que se veía desde fuera: el bot contestaba perfecto —el flujo corre aunque
-- el mensaje no se guarde— pero en la Bandeja solo salían las respuestas del
-- bot. Parecía que el bot hablaba solo. Nadie podía ver qué le habían escrito.
--
-- ── POR QUÉ REVENTABA ─────────────────────────────────────────────────────
--
--     for candidato in select ...códigos del mensaje... loop
--       select ... into ped ...;
--       exit when ped.id is not null;
--     end loop;
--
--     if ped.id is null then return new; end if;   ← aquí
--
-- Si el mensaje NO TRAE ningún trozo de doce caracteres —o sea, casi cualquier
-- mensaje: «hola», «cuánto cuesta»— el cuerpo del bucle no corre ni una vez y
-- `ped` NUNCA SE ASIGNA. En PL/pgSQL, leer un campo de un `record` sin asignar
-- no da nulo: lanza el error 55000 «record "ped" is not assigned yet». El
-- disparador aborta, y con él el `insert` del mensaje.
--
-- El código pasó las pruebas porque se probó con mensajes QUE SÍ traían código
-- —que es el caso para el que se escribió— y ese es justo el único camino en el
-- que el bucle corre y `ped` queda asignado.
--
-- ── LOS DOS ARREGLOS, Y EL SEGUNDO IMPORTA MÁS ────────────────────────────
--
-- 1. Se lleva la cuenta con un booleano en vez de leer un `record` que puede no
--    existir. Eso arregla ESTE fallo.
--
-- 2. TODO EL DISPARADOR QUEDA ENVUELTO: si algo aquí dentro falla, se apunta y
--    el mensaje SE GUARDA IGUAL. Eso arregla la CLASE de fallo.
--
--    Atar un pedido con su conversación es una comodidad. Guardar lo que un
--    cliente escribió es la razón de existir del producto. Que lo primero pueda
--    tumbar lo segundo es un error de diseño, no un descuido: ningún añadido
--    puede tener permiso para hacer desaparecer el mensaje de una persona.
--
--    Se paga una subtransacción por mensaje entrante. Es barato comparado con
--    perder la conversación de un cliente.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tienda_enlazar_pedido()
returns trigger language plpgsql security definer set search_path = public as $fn$
declare
  conv      record;
  ped       record;
  encargado uuid;
  candidato text;
  -- LA CUENTA VA APARTE. Preguntarle `ped.id` a un record que quizá no se
  -- asignó es exactamente lo que reventaba: en PL/pgSQL eso no da nulo, lanza.
  hay       boolean := false;
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

  if not found then return new; end if;

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

    if ped.id is not null then
      hay := true;
      exit;
    end if;
  end loop;

  -- Un mensaje sin código de pedido es lo NORMAL: no hay nada que atar.
  if not hay then return new; end if;

  -- YA ESTABA ENLAZADO: no se vuelve a asignar. El cliente escribe varias veces
  -- sobre el mismo pedido, y cada mensaje no puede reabrir la asignación ni
  -- llenar la bitácora de ruido.
  if ped.conversacion_id is not null then return new; end if;

  update pedidos
     set conversacion_id = conv.id,
         contacto_id     = coalesce(contacto_id, conv.contact_id),
         updated_at      = now()
   where id = ped.id;

  -- Un pedido que llega y no tiene dueño es un pedido que nadie mira. Se pide
  -- persona SIEMPRE; a quién le toca lo decide el encargado de la tienda o, si
  -- no hay, el reparto automático.
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

exception when others then
  -- ── LA RED QUE FALTABA ──────────────────────────────────────────────────
  -- Pase lo que pase aquí dentro, el mensaje del cliente se guarda. Se apunta
  -- el motivo para poder arreglarlo, pero NO se le hace pagar a la persona que
  -- escribió el fallo de una función de conveniencia.
  raise warning '[tienda_enlazar_pedido] no pude atar el pedido (%): %', sqlstate, sqlerrm;
  return new;
end $fn$;

comment on function public.tienda_enlazar_pedido is
  'Ata un mensaje con su pedido cuando trae el código. NUNCA puede impedir que el mensaje se guarde.';
