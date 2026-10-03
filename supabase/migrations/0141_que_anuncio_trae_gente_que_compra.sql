-- ═══════════════════════════════════════════════════════════════════════════
-- 0141 · Qué anuncio trae gente que COMPRA.
--
-- El informe de campañas ya existía («Leads que trajo la publicidad», en
-- Resultados) y contestaba dos preguntas: cuántos leads trajo cada anuncio y
-- cuántos de esos pidieron hablar con una persona. Le faltaba la única que de
-- verdad decide dónde va el presupuesto: CUÁNTO DINERO trajo cada uno.
--
-- Un anuncio que trae cien curiosos vale menos que uno que trae diez que
-- compran, y hasta hoy los dos salían iguales en la tabla.
--
-- Tres cosas más, todas medidas el 3 oct 2026:
--
--   · `leads_por_campana` (la vista de la 0065) CUENTA MAL. Hace `count(*)`
--     después de un `left join` con conversaciones, así que un contacto con
--     tres conversaciones cuenta como tres leads. No la lee nadie —la pantalla
--     usa la función— así que nunca hizo daño, pero estaba ahí esperando a que
--     alguien la leyera y tomara una decisión con ella.
--
--   · El informe solo miraba `contacts.origen` (el primer toque). Una persona
--     que vuelve meses después por otra campaña no se le contaba a la segunda,
--     que es justo la que pagó por traerla de vuelta.
--
--   · Ahora que el chat web captura los `utm_`, se puede desglosar por fuente,
--     medio y contenido. Antes no había nada que desglosar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Cómo se llama una campaña ──────────────────────────────────────────────
--
-- VIVE EN UNA FUNCIÓN porque la misma normalización hace falta en tres sitios
-- (el primer toque del contacto, el origen de la conversación y la vista) y
-- escrita tres veces se queda distinta en uno. Ya nos pasó con otras reglas.
--
-- No es `security definer` a propósito: no lee ninguna tabla, solo traduce un
-- jsonb que ya tiene en la mano quien la llama.
create or replace function public.campana_del_origen(p_origen jsonb)
returns table (campana text, titular text, plataforma text)
language sql
immutable
parallel safe
set search_path to 'pg_catalog', 'pg_temp'
as $$
  select
    -- Con qué se agrupa. El identificador del anuncio manda; si no hay, el
    -- titular; y si tampoco, se dice «sin identificar» en vez de agrupar todo
    -- lo que no se sabe en un hueco sin nombre.
    coalesce(
      nullif(p_origen->>'anuncio_id', ''),
      nullif(p_origen->>'titular', ''),
      'sin identificar'
    ),
    nullif(p_origen->>'titular', ''),
    -- Los orígenes viejos (antes de la 0141) no traen `plataforma`. Para esos
    -- se deduce de `tipo`, que es lo que había: un `ad` o un `post` solo podía
    -- venir de Meta, porque era el único canal que guardaba origen.
    coalesce(
      nullif(p_origen->>'plataforma', ''),
      case when p_origen->>'tipo' in ('ad', 'post') then 'meta' else 'enlace' end
    )
$$;

comment on function public.campana_del_origen(jsonb) is
  'Normaliza un origen de lead a (campana, titular, plataforma) para agrupar el informe.';

revoke all on function public.campana_del_origen(jsonb) from public;
grant execute on function public.campana_del_origen(jsonb) to authenticated, service_role;

-- ── La vista, esta vez contando bien ───────────────────────────────────────
--
-- `create or replace`, NO un `drop` y volver a crearla, y las ocho columnas de
-- la 0065 se quedan en su sitio y con su tipo. Añadir al final sí se puede.
--
-- Importa porque una vista la puede estar leyendo algo que no está en este
-- repositorio —una consulta guardada, un informe de Metabase, un script de
-- alguien— y un `drop` se lo rompe sin avisar. Reemplazarla en el sitio
-- arregla el conteo sin quitarle a nadie lo que ya usaba.
--
-- Lo que cambia: `count(distinct)` en vez de `count(*)`. Y las dos preguntas
-- separadas, que antes eran el mismo número inflado: cuántas PERSONAS trajo el
-- anuncio y cuántas CONVERSACIONES disparó.
create or replace view public.leads_por_campana
with (security_invoker = on)
as
select
  ct.org_id,
  c.campana                                  as anuncio_id,
  c.titular,
  ct.origen->>'tipo'                         as tipo,
  count(distinct ct.id)                      as leads,
  count(distinct cv.id) filter (where cv.handoff_requested_at is not null)
                                             as pasaron_a_persona,
  min(ct.created_at)                         as primero,
  max(ct.created_at)                         as ultimo,
  -- Nuevas, al final para no mover las de antes.
  count(distinct cv.id)                      as conversaciones,
  c.plataforma
from public.contacts ct
cross join lateral public.campana_del_origen(ct.origen) c
left join public.conversations cv on cv.contact_id = ct.id
where ct.origen is not null
group by ct.org_id, c.campana, c.titular, ct.origen->>'tipo', c.plataforma;

comment on view public.leads_por_campana is
  'Cuanto trae cada campana, por el PRIMER TOQUE del contacto. Cuenta personas distintas, no filas.';

revoke all on public.leads_por_campana from public, anon;
grant select on public.leads_por_campana to authenticated;

-- ── El informe de la pantalla ──────────────────────────────────────────────
--
-- ATRIBUCIÓN POR COHORTE, y hay que decirlo claro porque cambia cómo se lee
-- el número: se toman los leads que ENTRARON en el periodo del filtro y se
-- suma TODO lo que esas personas han comprado, aunque la compra sea posterior.
--
-- La alternativa —sumar las ventas del periodo— contestaría otra pregunta
-- («cuánto se vendió este mes») y haría que un anuncio de enero pareciera
-- inútil en el informe de marzo. Quien paga anuncios quiere saber qué pasó con
-- la gente que ese anuncio le trajo, y eso es la cohorte.
create or replace function public.analytics_campanas(
  p_org   uuid,
  p_desde timestamptz,
  p_hasta timestamptz
) returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
begin
if p_org is null or p_org not in (select auth_org_ids()) then
  raise exception 'sin acceso a esa organización';
end if;

return (
with
-- ── Cuánto ha dejado cada persona ────────────────────────────────────────
--
-- UN PEDIDO NO CANCELADO CUENTA, lo haya cobrado Stripe o no. En producción
-- hay 8 pedidos con `pago = 'sin_cobro'` —contra entrega, que en la región es
-- lo normal— y mirar solo `pago = 'pagado'` esconderia casi la mitad de las
-- ventas reales. Lo que no cuenta es lo cancelado, que no es una venta.
dinero_por_persona as (
  select contacto_id as persona, sum(total)::numeric as importe
    from public.pedidos
   where org_id = p_org and contacto_id is not null
     and estado::text <> 'cancelado'
   group by 1
  union all
  select contact_id, sum(value)::numeric
    from public.opportunities
   where org_id = p_org and contact_id is not null
     and status::text = 'ganada'
   group by 1
),
caja as (
  select persona, sum(importe) as importe from dinero_por_persona group by 1
),

-- ── El primer toque: qué anuncio trajo a cada PERSONA ────────────────────
leads as (
  select
    ct.id,
    c.campana, c.titular, c.plataforma,
    nullif(ct.origen->'utm'->>'utm_source', '')  as fuente,
    nullif(ct.origen->'utm'->>'utm_medium', '')  as medio,
    nullif(ct.origen->'utm'->>'utm_content', '') as contenido,
    coalesce(k.importe, 0)                       as importe,
    exists (
      select 1 from public.conversations cv
       where cv.contact_id = ct.id and cv.handoff_requested_at is not null
    ) as paso_a_persona
  from public.contacts ct
  cross join lateral public.campana_del_origen(ct.origen) c
  left join caja k on k.persona = ct.id
  where ct.org_id = p_org
    and ct.origen is not null
    and ct.created_at >= p_desde
    and ct.created_at <  p_hasta
),

-- ── Qué anuncio disparó cada CONVERSACIÓN ────────────────────────────────
--
-- Es OTRA pregunta, no un duplicado: un lead que vuelve seis meses después
-- por una campaña nueva le debe esa vuelta a la campaña nueva, no a la que lo
-- trajo la primera vez. Se cuenta aparte para que ningún número mezcle las
-- dos cosas.
charlas as (
  select
    cv.id,
    c.campana, c.titular, c.plataforma,
    cv.handoff_requested_at is not null as paso_a_persona
  from public.conversations cv
  cross join lateral public.campana_del_origen(cv.origen) c
  where cv.org_id = p_org
    and cv.origen is not null
    and cv.created_at >= p_desde
    and cv.created_at <  p_hasta
),

plataformas as (
  select
    l.plataforma,
    count(*)                               as leads,
    count(*) filter (where l.paso_a_persona) as pasaron,
    sum(l.importe)                         as importe,
    (select count(*) from charlas ch where ch.plataforma = l.plataforma) as conversaciones
  from leads l group by l.plataforma
),

campanas as (
  select
    l.campana,
    max(l.titular)                         as titular,
    max(l.plataforma)                      as plataforma,
    count(*)                               as leads,
    count(*) filter (where l.paso_a_persona) as pasaron,
    sum(l.importe)                         as importe,
    (select count(*) from charlas ch where ch.campana = l.campana) as conversaciones
  from leads l
  group by l.campana
  -- Se ordena por DINERO y los leads se quedan como desempate: es el orden que
  -- contesta la pregunta por la que alguien abre esta tabla.
  order by sum(l.importe) desc, count(*) desc
  limit 30
),

-- Las conversaciones cuya campaña NO trajo a nadie nuevo en el periodo: son
-- leads que volvieron. Sin esta fila desaparecerían del informe entero.
charlas_sueltas as (
  select ch.campana, max(ch.titular) as titular, max(ch.plataforma) as plataforma,
         count(*) as conversaciones
    from charlas ch
   where not exists (select 1 from leads l where l.campana = ch.campana)
   group by ch.campana
   order by count(*) desc
   limit 10
),

-- En qué moneda está la caja. Si el cliente usa más de una, el total se avisa
-- como aproximado en vez de sumar manzanas con naranjas en silencio.
monedas as (
  select currency as moneda, count(*) as n
    from public.products where org_id = p_org and currency is not null
   group by 1
  union all
  select currency, count(*)
    from public.opportunities where org_id = p_org and currency is not null
   group by 1
),
moneda_mandante as (
  select moneda, sum(n) as n from monedas group by 1 order by sum(n) desc limit 1
)

select jsonb_build_object(
  'total_con_campana', (select count(*) from leads),
  'total_leads', (
    select count(*) from public.contacts
     where org_id = p_org and created_at >= p_desde and created_at < p_hasta
  ),
  'charlas_con_campana', (select count(*) from charlas),
  'importe_total', coalesce((select sum(importe) from leads), 0),
  'moneda', coalesce((select moneda from moneda_mandante), 'MXN'),
  'monedas_mezcladas', (select count(distinct moneda) > 1 from monedas),
  'por_plataforma', coalesce((
    select jsonb_agg(jsonb_build_object(
             'plataforma', plataforma, 'leads', leads,
             'pasaron_a_persona', pasaron, 'conversaciones', conversaciones,
             'importe', importe) order by importe desc, leads desc)
      from plataformas), '[]'::jsonb),
  'por_campana', coalesce((
    select jsonb_agg(jsonb_build_object(
             'campana', campana, 'titular', titular, 'plataforma', plataforma,
             'leads', leads, 'pasaron_a_persona', pasaron,
             'conversaciones', conversaciones, 'importe', importe)
             order by importe desc, leads desc)
      from campanas), '[]'::jsonb),
  'volvieron', coalesce((
    select jsonb_agg(jsonb_build_object(
             'campana', campana, 'titular', titular,
             'plataforma', plataforma, 'conversaciones', conversaciones)
             order by conversaciones desc)
      from charlas_sueltas), '[]'::jsonb),
  'por_fuente', coalesce((
    select jsonb_agg(jsonb_build_object('valor', fuente, 'leads', n, 'importe', imp)
             order by imp desc, n desc)
      from (select fuente, count(*) n, sum(importe) imp from leads
             where fuente is not null group by 1 order by sum(importe) desc, count(*) desc limit 12) z
  ), '[]'::jsonb),
  'por_medio', coalesce((
    select jsonb_agg(jsonb_build_object('valor', medio, 'leads', n, 'importe', imp)
             order by imp desc, n desc)
      from (select medio, count(*) n, sum(importe) imp from leads
             where medio is not null group by 1 order by sum(importe) desc, count(*) desc limit 12) z
  ), '[]'::jsonb),
  'por_contenido', coalesce((
    select jsonb_agg(jsonb_build_object('valor', contenido, 'leads', n, 'importe', imp)
             order by imp desc, n desc)
      from (select contenido, count(*) n, sum(importe) imp from leads
             where contenido is not null group by 1 order by sum(importe) desc, count(*) desc limit 12) z
  ), '[]'::jsonb)
)
);
end $$;
