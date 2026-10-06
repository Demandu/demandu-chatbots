-- La lista de los que SÍ pagaron, que es a quienes se les puede escribir.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- FALTABA LA MITAD ÚTIL. El panel enseñaba a quién perseguir —los que deben— y
-- no a quién cuidar. Una encuesta de satisfacción, un agradecimiento, una
-- promoción para que vuelvan: todo eso va a quien PAGÓ, y esa lista no se podía
-- sacar de ninguna parte.
--
-- ES UNA LISTA DE PERSONAS, NO DE PEDIDOS. Quien pagó tres veces este mes recibe
-- UNA encuesta, no tres. Agrupar aquí y no en el navegador es lo que evita que
-- un cliente bueno reciba el mismo mensaje tres veces y silencie el chat — y ese
-- es justo el cliente que no te puedes permitir perder.
--
-- SE LLEVA CUÁNTOS YA RECIBIÓ (`entregados`). Preguntarle «¿qué tal tu pedido?»
-- a alguien que todavía lo está esperando es el error clásico de las encuestas
-- automáticas, y deja peor imagen que no preguntar nada.
--
-- Y SE LLEVA `opted_out` EN TODAS LAS LISTAS. Quien pidió no recibir mensajes no
-- puede acabar en una difusión: es la regla de Meta y también la decencia
-- mínima. Antes solo se miraba al enviar, así que la lista decía 40 y salían 31
-- sin que nadie entendiera la diferencia.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tienda_resumen(
  p_tienda uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz,
  p_limite int default 500
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $fn$
declare
  v_org      uuid;
  v_largo    interval;
  v_desde_a  timestamptz;
  resultado  jsonb;
begin
  select org_id into v_org from tiendas where id = p_tienda;
  if v_org is null or v_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa tienda';
  end if;

  if p_desde is null or p_hasta is null or p_hasta <= p_desde then
    raise exception 'el rango de fechas no es válido';
  end if;

  p_limite := least(greatest(coalesce(p_limite, 500), 1), 5000);

  v_largo   := p_hasta - p_desde;
  v_desde_a := p_desde - v_largo;

  with
  todos as (
    select p.id, p.numero, p.codigo, p.total, p.pago, p.estado,
           p.contacto_id, p.created_at
      from pedidos p
     where p.tienda_id = p_tienda
       and p.estado <> 'cancelado'
  ),
  dentro as (
    select * from todos where created_at >= p_desde and created_at < p_hasta
  ),
  antes as (
    select * from todos where created_at >= v_desde_a and created_at < p_desde
  ),
  primera as (
    select contacto_id, min(created_at) as primera_vez
      from todos
     where contacto_id is not null
     group by contacto_id
  ),
  gente as (
    select d.contacto_id,
           count(*)            as pedidos,
           sum(d.total)        as gastado,
           max(d.created_at)   as ultima,
           pr.primera_vez
      from dentro d
      join primera pr on pr.contacto_id = d.contacto_id
     where d.contacto_id is not null
     group by d.contacto_id, pr.primera_vez
  ),
  -- TODO LO QUE NO ESTÁ PAGADO ES DEUDA, incluido lo que nunca se intentó
  -- cobrar. Es la corrección de esta migración.
  -- Quien PAGÓ, agrupado por persona: una encuesta por cliente, no por pedido.
  pagadores as (
    select d.contacto_id,
           count(*)          as pedidos,
           sum(d.total)      as gastado,
           max(d.created_at) as ultima,
           count(*) filter (where d.estado = 'entregado') as entregados
      from dentro d
     where d.contacto_id is not null
       and d.pago = 'pagado'
     group by d.contacto_id
  ),
  deudores as (
    select d.*, c.name, c.phone, c.wa_name, c.opted_out
      from dentro d
      left join contacts c on c.id = d.contacto_id
     where d.pago <> 'pagado'
  )
  select jsonb_build_object(
    'desde', p_desde,
    'hasta', p_hasta,
    'ventas', jsonb_build_object(
      'pedidos',  (select count(*)                from dentro),
      'monto',    (select coalesce(sum(total), 0) from dentro),
      'cobrado',  (select coalesce(sum(total), 0) from dentro where pago = 'pagado'),
      'sin_pagar',(select coalesce(sum(total), 0) from deudores),
      'cuantos_sin_pagar', (select count(*)       from deudores),
      -- Los que ni siquiera llegaron a tener un cobro: eso es configuración,
      -- no es el cliente.
      'nunca_cobrados',    (select count(*)       from dentro where pago = 'sin_cobro'),
      'cuantos_pagaron',   (select count(*)       from pagadores),
      'ticket',   (select case when count(*) = 0 then 0
                              else round(coalesce(sum(total), 0)::numeric / count(*)) end
                     from dentro)
    ),
    'anterior', jsonb_build_object(
      'pedidos', (select count(*)                from antes),
      'monto',   (select coalesce(sum(total), 0) from antes),
      'cobrado', (select coalesce(sum(total), 0) from antes where pago = 'pagado')
    ),
    'gente', jsonb_build_object(
      'compradores', (select count(*) from gente),
      'nuevos',      (select count(*) from gente where primera_vez >= p_desde),
      'repiten',     (select count(*) from gente where primera_vez <  p_desde),
      'leads',       (select count(*) from contacts c
                       where c.org_id = v_org
                         and c.created_at >= p_desde and c.created_at < p_hasta
                         and not exists (select 1 from todos t where t.contacto_id = c.id))
    ),
    'listas', jsonb_build_object(
      'pagaron', coalesce((
        select jsonb_agg(x order by x.gastado desc) from (
          select pa.contacto_id as id, c.name, c.wa_name, c.phone, c.tags, c.opted_out,
                 pa.pedidos, pa.gastado, pa.ultima, pa.entregados
            from pagadores pa join contacts c on c.id = pa.contacto_id
           limit p_limite
        ) x), '[]'::jsonb),
      'nuevos', coalesce((
        select jsonb_agg(x order by x.gastado desc) from (
          select g.contacto_id as id, c.name, c.wa_name, c.phone, c.tags, c.opted_out,
                 g.pedidos, g.gastado, g.ultima
            from gente g join contacts c on c.id = g.contacto_id
           where g.primera_vez >= p_desde
           limit p_limite
        ) x), '[]'::jsonb),
      'repiten', coalesce((
        select jsonb_agg(x order by x.gastado desc) from (
          select g.contacto_id as id, c.name, c.wa_name, c.phone, c.tags, c.opted_out,
                 g.pedidos, g.gastado, g.ultima
            from gente g join contacts c on c.id = g.contacto_id
           where g.primera_vez < p_desde
           limit p_limite
        ) x), '[]'::jsonb),
      'sin_pagar', coalesce((
        select jsonb_agg(x order by x.total desc) from (
          select d.contacto_id as id, d.name, d.wa_name, d.phone, d.opted_out,
                 d.numero, d.codigo, d.total, d.pago, d.created_at
            from deudores d
           limit p_limite
        ) x), '[]'::jsonb),
      'leads', coalesce((
        select jsonb_agg(x order by x.created_at desc) from (
          select c.id, c.name, c.wa_name, c.phone, c.tags, c.opted_out, c.created_at
            from contacts c
           where c.org_id = v_org
             and c.created_at >= p_desde and c.created_at < p_hasta
             and not exists (select 1 from todos t where t.contacto_id = c.id)
           limit p_limite
        ) x), '[]'::jsonb)
    )
  ) into resultado;

  return resultado;
end $fn$;

comment on function public.tienda_resumen is
  'Cifras de la tienda entre dos fechas, con la lista de personas detrás de cada una: quién pagó, quién debe, quién es nuevo, quién volvió y quién todavía no compra.';
