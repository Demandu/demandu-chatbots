-- LA TIENDA CUENTA LO QUE PASA, y lo escuchan los dos.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- Complemento de la 0097. Allí el embudo aprendió a escuchar eventos; aquí la
-- tienda aprende a contarlos.
--
-- ── POR QUÉ EN UN DISPARADOR DE LA BASE Y NO EN EL CÓDIGO ─────────────────
--
-- Hay TRES caminos que crean pedidos —el escaparate, el pedido por chat y el
-- alta a mano en el panel— y un cuarto que los paga: la conciliación de Yappy,
-- que corre desde un reloj y no pasa por ninguna pantalla.
--
-- Emitir desde cada uno es garantizar que el que se añada mañana se olvide, y
-- un evento que a veces se emite y a veces no es peor que no tenerlo: el
-- cliente configura su CRM confiando en que le llega todo.
--
-- Va SEPARADO de `crm_pedido_al_embudo` (0079) a propósito: aquel funciona y no
-- hay ninguna razón para tocarlo al añadir esto.
-- ─────────────────────────────────────────────────────────────────────────────

-- Pone una etiqueta creándola si no existe. Solo para las automáticas.
create or replace function public.etiqueta_automatica(
  p_org_id uuid, p_contacto uuid, p_nombre text, p_color text default '#6E42FF'
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_org_id is null or p_contacto is null or coalesce(btrim(p_nombre),'') = '' then return; end if;

  -- `poner_etiqueta` EXIGE que la etiqueta exista, y con razón: es lo que
  -- impide que la IA se invente etiquetas. Pero una que pone la plataforma sola
  -- no se le puede pedir al cliente que la cree a mano antes de su primera
  -- venta — y si no existe, la etiqueta no se pone y nadie se entera.
  insert into public.tags (org_id, name, color)
  values (p_org_id, p_nombre, p_color)
  on conflict (org_id, name) do nothing;

  perform public.poner_etiqueta(p_org_id, p_contacto, p_nombre);
exception when others then
  raise warning '[etiqueta_automatica] no pude poner %: %', p_nombre, sqlerrm;
end $$;

revoke execute on function public.etiqueta_automatica(uuid, uuid, text, text) from public, anon, authenticated;
grant  execute on function public.etiqueta_automatica(uuid, uuid, text, text) to service_role;

create or replace function public.tienda_cuenta_lo_que_pasa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quien jsonb;
  v_pagados int;
begin
  -- CON QUIÉN ES. Se manda todo lo que se sepa y el que escucha ya elige: el
  -- webhook del cliente quiere el número y el total, el embudo quiere la
  -- conversación.
  v_quien := jsonb_strip_nulls(jsonb_build_object(
    'conversacion_id', new.conversacion_id,
    'contacto_id',     new.contacto_id,
    'numero',          new.numero,
    'codigo',          new.codigo,
    'total',           new.total,
    'estado',          new.estado,
    'pago',            new.pago
  ));

  -- ── PEDIDO NUEVO SIN PAGAR ───────────────────────────────────────────────
  -- Es trabajo de ventas: alguien tiene que cobrarlo. Un pedido que nace ya
  -- pagado —efectivo, transferencia confirmada— no necesita que nadie persiga
  -- nada, así que no manda la tarjeta a «falta cobrar».
  if tg_op = 'INSERT' and new.pago is distinct from 'pagado' and new.estado <> 'cancelado' then
    perform public.emitir_evento(new.org_id, 'pedido.creado', v_quien);
  end if;

  if tg_op = 'UPDATE' and old.pago is distinct from new.pago then
    if new.pago = 'pagado' then
      perform public.emitir_evento(new.org_id, 'pedido.pagado', v_quien);

      -- ── YA ES CLIENTE ──────────────────────────────────────────────────
      -- NO ES UNA ETAPA: es una propiedad de la persona. Quien compró en marzo
      -- y escribe hoy es cliente Y está en «Abierta» — las dos cosas son
      -- verdad a la vez, y una etapa obliga a elegir una de las dos.
      --
      -- Como etiqueta funciona además con los segmentos y las campañas que ya
      -- existen: «mándale la promoción a mis clientes» pasa a ser una consulta.
      if new.contacto_id is not null then
        perform public.etiqueta_automatica(new.org_id, new.contacto_id, 'cliente', '#16A34A');

        select count(*) into v_pagados from pedidos
         where contacto_id = new.contacto_id and org_id = new.org_id and pago = 'pagado';

        if v_pagados >= 2 then
          perform public.etiqueta_automatica(new.org_id, new.contacto_id, 'cliente-recurrente', '#0EA5E9');
        end if;
      end if;

    elsif new.pago = 'expirado' then
      -- HOY ESTO NO HACÍA ABSOLUTAMENTE NADA, y es donde más falta hace: un
      -- enlace de pago vencido es una venta que se cae sola si nadie la
      -- persigue, y nadie la persigue si nadie se entera.
      perform public.emitir_evento(new.org_id, 'pedido.pago_vencido', v_quien);
    end if;
  end if;

  return null;

exception when others then
  -- CONTAR LO QUE PASA NUNCA PUEDE IMPEDIR QUE SE GUARDE EL PEDIDO. Misma
  -- lección que la 0090: ningún añadido puede tumbar la razón de existir del
  -- producto.
  raise warning '[tienda_cuenta_lo_que_pasa] (%): %', sqlstate, sqlerrm;
  return null;
end $$;

drop trigger if exists tienda_cuenta on public.pedidos;
create trigger tienda_cuenta
  after insert or update of pago, estado on public.pedidos
  for each row execute function public.tienda_cuenta_lo_que_pasa();
