-- Qué pasó en la tienda entre dos fechas, y a quién le pasó.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LOS NÚMEROS SOLOS NO SIRVEN DE NADA. «12 pedidos sin cobrar» es un dato que
-- se lee y se olvida; «12 pedidos sin cobrar, aquí están las 12 personas, y a
-- las 12 les mando la plantilla de cobro» es dinero que entra. Por eso esta
-- función devuelve las CIFRAS Y LAS LISTAS en la misma llamada: separarlas
-- obligaría a pedir dos veces lo mismo y a que las dos pudieran no coincidir.
--
-- VA EN LA BASE PORQUE ES UNA AGREGACIÓN. Mandarle al navegador todos los
-- pedidos de un año para que sume funciona con diez y revienta con diez mil, y
-- el día que reviente será el del cliente que más vende.
--
-- ── LAS DEFINICIONES, QUE ES LO QUE DE VERDAD HAY QUE ACERTAR ───────────────
--
-- SIN PAGAR NO ES LO MISMO QUE SIN COBRO. Un pedido de una tienda que cobra al
-- entregar tiene `pago = 'sin_cobro'` y NO es una deuda: es lo normal. Meterlo
-- en «sin pagar» inventaría una cartera vencida que no existe y haría que el
-- negocio persiguiera a gente que no le debe nada.
--
-- CLIENTE NUEVO ES QUIEN COMPRA POR PRIMERA VEZ, no quien se registró. Un
-- contacto puede llevar meses escribiendo; el día que compra es el día que se
-- convierte, y ese es el número que dice si el mes fue bueno.
--
-- LEAD ES QUIEN TODAVÍA NO HA COMPRADO. Contar como lead a alguien que ya
-- compró tres veces infla el embudo y esconde justo lo que hay que mirar.
--
-- LOS CANCELADOS NO CUENTAN EN NINGUNA CIFRA DE DINERO. Un pedido cancelado no
-- es una venta ni una deuda.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tienda_resumen(
  p_tienda uuid,
  p_desde  timestamptz,
  p_hasta  timestamptz,
  p_limite int default 500          -- cuánta gente se devuelve por lista
)
returns jsonb
language plpgsql
security invoker                    -- el RLS de siempre decide qué se ve
stable
set search_path = public
as $fn$
declare
  v_org      uuid;
  v_largo    interval;
  v_desde_a  timestamptz;           -- el periodo anterior, del mismo largo
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

  -- UN NÚMERO SIN COMPARACIÓN NO ES INFORMACIÓN. «$1.240» no dice si el mes fue
  -- bueno; «$1.240, +18% que el mes pasado» sí. El periodo anterior es del
  -- mismo largo, pegado por detrás.
  v_largo   := p_hasta - p_desde;
  v_desde_a := p_desde - v_largo;

  with
  -- Todo lo de esta tienda, una sola vez.
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
  -- La PRIMERA compra de cada persona en esta tienda. Es lo que separa a un
  -- cliente nuevo de uno que vuelve, y no se puede saber mirando solo el rango.
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
  -- Pedidos que intentaron cobrarse y no se completaron. `sin_cobro` queda
  -- fuera a propósito: no es una deuda, es una tienda que cobra al entregar.
  deudores as (
    select d.*, c.name, c.phone, c.wa_name
      from dentro d
      left join contacts c on c.id = d.contacto_id
     where d.pago in ('pendiente', 'rechazado', 'expirado', 'anulado')
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
      'sin_cobro_en_linea',(select count(*)       from dentro where pago = 'sin_cobro'),
      'ticket',   (select case when count(*) = 0 then 0
                              else round(coalesce(sum(total), 0)::numeric / count(*)) end
                     from dentro)
    ),

    -- El mismo cálculo sobre el periodo anterior, para poder comparar.
    'anterior', jsonb_build_object(
      'pedidos', (select count(*)                from antes),
      'monto',   (select coalesce(sum(total), 0) from antes),
      'cobrado', (select coalesce(sum(total), 0) from antes where pago = 'pagado')
    ),

    'gente', jsonb_build_object(
      'compradores', (select count(*) from gente),
      'nuevos',      (select count(*) from gente where primera_vez >= p_desde),
      'repiten',     (select count(*) from gente where primera_vez <  p_desde),
      -- Contactos que entraron en el rango y todavía no han comprado NADA.
      'leads',       (select count(*) from contacts c
                       where c.org_id = v_org
                         and c.created_at >= p_desde and c.created_at < p_hasta
                         and not exists (select 1 from todos t where t.contacto_id = c.id))
    ),

    -- ── Y AQUÍ LAS PERSONAS ─────────────────────────────────────────────────
    -- Con teléfono y nombre, que es lo que hace falta para escribirles o para
    -- bajarse la lista. Sin esto el panel sería una pantalla de presumir.
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
  'Cifras de la tienda entre dos fechas, con la lista de personas detrás de cada una.';
