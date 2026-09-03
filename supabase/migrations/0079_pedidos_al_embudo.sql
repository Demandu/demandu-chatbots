-- El embudo deja de contar tarjetas y empieza a contar plata.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- HASTA AHORA EL IMPORTE LO TECLEABA ALGUIEN, y por eso casi siempre estaba
-- vacío. El tablero decía «12 oportunidades» y ninguna cifra debajo: la métrica
-- de arriba —«en juego», «ganado»— salía en cero para un negocio que ese mismo
-- día había vendido de verdad. La plataforma SABÍA el monto (está en el pedido)
-- y no lo usaba.
--
-- Y LA TARJETA HABÍA QUE ARRASTRARLA A MANO a Ganada, aunque el banco ya
-- hubiera confirmado el pago. Es el único momento del recorrido en el que no
-- hay ninguna duda de que la venta se cerró, y era justo el que exigía trabajo
-- manual.
--
-- VA EN LA BASE Y NO EN EL PANEL, por lo mismo que el reparto y el enlace del
-- pedido con la Bandeja: el pago lo confirma una ruta pública (el aviso de
-- Yappy) y el estado lo cambia otra pantalla. Una regla escrita en un solo
-- sitio vale para las dos; escrita en cada una, un día dejan de coincidir.
--
-- LA CADENA YA EXISTÍA ENTERA y esto solo la cierra:
--
--     pedido ──> conversación ──> oportunidad
--       (0078)        (0013)
--
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Dos interruptores, porque no todos venden igual ─────────────────────
-- ENCENDIDOS DE FÁBRICA. Quien vende por tienda —que es para quien se hizo
-- esto— quiere las dos cosas, y pedirle que las active es pedirle que adivine
-- que existen. Se apagan en la venta consultiva: ahí el importe es una
-- previsión que alguien calculó, y un pedido de $17 no puede pisar un
-- pronóstico de $5.000.
alter table public.pipelines
  add column if not exists pedidos_suman boolean not null default true,
  add column if not exists pedido_pagado_gana boolean not null default true;

comment on column public.pipelines.pedidos_suman is
  'El importe de la oportunidad sale de sus pedidos, en vez de teclearse.';
comment on column public.pipelines.pedido_pagado_gana is
  'Un pedido pagado mueve la tarjeta a la etapa de ganada.';

-- ── 2. Cada movimiento del pedido se refleja en su tarjeta ─────────────────
create or replace function public.crm_pedido_al_embudo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_op     uuid;
  v_pipe   uuid;
  v_status text;
  v_suman  boolean;
  v_gana   boolean;
  v_total  numeric;
  v_ganada uuid;
begin
  -- SIN CONVERSACIÓN NO HAY TARJETA. Un pedido que el cliente hizo pero nunca
  -- mandó por WhatsApp no está atado a nadie todavía; cuando lo mande, el
  -- enlace se crea (0078), esto se dispara con ese mismo cambio y la tarjeta
  -- se pone al día sola.
  if new.conversacion_id is null then return null; end if;

  select opportunity_id into v_op from conversations where id = new.conversacion_id;
  if v_op is null then return null; end if;

  select o.pipeline_id, o.status into v_pipe, v_status
    from opportunities o where o.id = v_op;
  if v_pipe is null then return null; end if;

  select coalesce(p.pedidos_suman, true), coalesce(p.pedido_pagado_gana, true)
    into v_suman, v_gana
    from pipelines p where p.id = v_pipe;

  -- ── El importe ───────────────────────────────────────────────────────────
  -- SE SUMAN TODOS LOS PEDIDOS DE LA TARJETA, no solo el que acaba de cambiar:
  -- un cliente que pide tres veces mientras su oportunidad sigue abierta vale
  -- las tres, y quedarse con la última haría que el embudo reportara MENOS
  -- según se vende más.
  --
  -- LOS CANCELADOS NO SUMAN, así que cancelar uno baja el importe solo. Es el
  -- comportamiento correcto y es también la razón de recalcular entero en vez
  -- de ir sumando: una resta olvidada deja el embudo inflado para siempre.
  --
  -- DE CENTAVOS A UNIDADES: el pedido guarda 1763 y el embudo muestra 17.63.
  -- Los dos números son correctos en su sitio; confundirlos multiplica por cien
  -- el reporte de ventas.
  if coalesce(v_suman, true) then
    select coalesce(sum(pe.total), 0) into v_total
      from pedidos pe
      join conversations c on c.id = pe.conversacion_id
     where c.opportunity_id = v_op
       and pe.estado <> 'cancelado';

    v_total := round(v_total / 100.0, 2);

    update opportunities
       set value = v_total, updated_at = now()
     where id = v_op
       and value is distinct from v_total;
  end if;

  -- ── Pagado gana ──────────────────────────────────────────────────────────
  -- SOLO EN EL INSTANTE EN QUE PASA A PAGADO. Si se mirara el estado a secas,
  -- cualquier cambio posterior sobre un pedido ya pagado —mover el estado,
  -- guardar una referencia— volvería a arrastrar la tarjeta a Ganada, incluso
  -- después de que el dueño la hubiera reabierto a propósito. Eso es un tablero
  -- que no obedece.
  --
  -- Y SOLO SI SIGUE ABIERTA: una tarjeta que alguien ya cerró es una decisión
  -- tomada, no un hueco que rellenar.
  if coalesce(v_gana, true)
     and new.pago = 'pagado'
     and (tg_op = 'INSERT' or old.pago is distinct from new.pago)
     and v_status = 'abierta'
  then
    select id into v_ganada
      from conversation_states
     where pipeline_id = v_pipe and outcome = 'ganado'
     order by sort limit 1;

    if v_ganada is not null then
      update opportunities set stage_id = v_ganada where id = v_op;

      -- El cambio de etapa ya lo apunta `crm_registrar_evento`. Esto apunta el
      -- MOTIVO, que es lo que no se puede reconstruir después: dentro de un mes
      -- nadie sabrá si esa tarjeta la movió una persona o un pago.
      insert into opportunity_events (org_id, opportunity_id, kind, to_stage_id, meta)
      values (new.org_id, v_op, 'pedido_pagado', v_ganada,
              jsonb_build_object('pedido', new.numero, 'total', new.total));
    end if;
  end if;

  -- ── UN PEDIDO CANCELADO NO PIERDE LA OPORTUNIDAD ─────────────────────────
  -- Y la ausencia de código aquí es la decisión, no un olvido. Un enlace de
  -- pago vencido se vuelve a pedir casi siempre; marcar «perdida» por eso
  -- llenaría el embudo de derrotas que no ocurrieron y envenenaría la única
  -- cifra que el dueño mira. Perder es una decisión suya.
  return null;
end $$;

drop trigger if exists pedidos_al_embudo on public.pedidos;
create trigger pedidos_al_embudo
  after insert or update of total, estado, pago, conversacion_id on public.pedidos
  for each row execute function public.crm_pedido_al_embudo();

revoke execute on function public.crm_pedido_al_embudo() from public, anon, authenticated;

comment on function public.crm_pedido_al_embudo is
  'Pone al día el importe de la oportunidad con sus pedidos, y mueve la tarjeta a ganada cuando uno se paga.';

-- ── 3. Estrenarlo con lo que ya hay ────────────────────────────────────────
-- SIN ESTO EL TABLERO SEGUIRÍA EN CERO hasta el siguiente pedido, y quien
-- publique esto abriría el embudo esperando ver sus ventas de esta semana.
update opportunities o
   set value = t.suma, updated_at = now()
  from (
    select c.opportunity_id, round(sum(pe.total) / 100.0, 2) as suma
      from pedidos pe
      join conversations c on c.id = pe.conversacion_id
     where c.opportunity_id is not null
       and pe.estado <> 'cancelado'
     group by c.opportunity_id
  ) t
 where o.id = t.opportunity_id
   and o.value is distinct from t.suma
   and exists (
     select 1 from pipelines p
      where p.id = o.pipeline_id and coalesce(p.pedidos_suman, true)
   );
