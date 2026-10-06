-- Un pedido que nunca se cobró es dinero que falta, no un caso normal.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA 0080 ASUMIÓ MAL. Dejó `pago = 'sin_cobro'` fuera de los impagos, tratándolo
-- como «esta tienda cobra al entregar». No existe esa tienda: en esta plataforma
-- SIEMPRE se cobra antes de procesar el pedido, y siempre por Yappy.
--
-- Así que `sin_cobro` no significa «no aplica», significa QUE EL COBRO NUNCA
-- LLEGÓ A CREARSE: o falló al iniciarse, o la tienda no tiene Yappy puesto. En
-- los dos casos hay un pedido que no debería prepararse y un dueño que tiene que
-- enterarse. Con el criterio anterior, esos pedidos no salían en ninguna cifra:
-- ni cobrados ni por cobrar. Simplemente no existían. Hay dos así ahora mismo,
-- por $32,50.
--
-- SE CUENTAN APARTE ADEMÁS DE SUMARSE, porque se arreglan distinto: un cobro que
-- nunca se creó es un problema de configuración —revisar Yappy— y uno rechazado
-- es un problema del cliente —reenviarle el enlace—. Meterlos en el mismo saco
-- haría que el negocio persiguiera clientes cuando el fallo es suyo.
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
  deudores as (
    select d.*, c.name, c.phone, c.wa_name
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
      'nuevos', coalesce((
        select jsonb_agg(x order by x.gastado desc) from (
          select g.contacto_id as id, c.name, c.wa_name, c.phone, c.tags,
                 g.pedidos, g.gastado, g.ultima
            from gente g join contacts c on c.id = g.contacto_id
           where g.primera_vez >= p_desde
           limit p_limite
        ) x), '[]'::jsonb),
      'repiten', coalesce((
        select jsonb_agg(x order by x.gastado desc) from (
          select g.contacto_id as id, c.name, c.wa_name, c.phone, c.tags,
                 g.pedidos, g.gastado, g.ultima
            from gente g join contacts c on c.id = g.contacto_id
           where g.primera_vez < p_desde
           limit p_limite
        ) x), '[]'::jsonb),
      'sin_pagar', coalesce((
        select jsonb_agg(x order by x.total desc) from (
          select d.contacto_id as id, d.name, d.wa_name, d.phone,
                 d.numero, d.codigo, d.total, d.pago, d.created_at
            from deudores d
           limit p_limite
        ) x), '[]'::jsonb),
      'leads', coalesce((
        select jsonb_agg(x order by x.created_at desc) from (
          select c.id, c.name, c.wa_name, c.phone, c.tags, c.created_at
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
  'Cifras de la tienda entre dos fechas, con la lista de personas detrás de cada una. Sin pagar es todo lo que no está pagado, incluido lo que nunca se cobró.';
