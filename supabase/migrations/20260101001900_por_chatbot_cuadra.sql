-- 0019 - El panel "Por chatbot" tiene que cuadrar
--
-- QUE PASABA: `por_bot` salia de `bots b left join conversations`, asi que toda
-- conversacion sin `bot_id` desaparecia del panel. En la cuenta real eran 5 de
-- 8: el cliente veia "3 conversaciones" donde habian entrado 8.
--
-- Se agrega un renglon "Sin chatbot asignado" para que los numeros sumen. No se
-- inventa a que chatbot pertenecen: se dice que no se sabe, que es la verdad.
--
-- El resto de la funcion es identico a 0015 (Postgres obliga a reemplazarla
-- entera).

-- ===========================================================================
-- 0015 — Resultados leen el EMBUDO
--
-- El cierre y las ventas por persona pasan a salir de `opportunities` en vez
-- del estado de la conversación. Si no, Resultados y Embudo contestarían
-- distinto a la misma pregunta ("¿cuántas ganamos?") y una de las dos estaría
-- mintiendo.
--
-- Se agrega además el bloque `seguimiento`: cuántas tarjetas abiertas no
-- tienen NINGÚN próximo paso agendado. Es la alerta que ninguna plataforma de
-- la competencia da, y la que de verdad explica los leads que se pierden.
-- ===========================================================================

create or replace function analytics_overview(
  p_org     uuid,
  p_desde   timestamptz,
  p_hasta   timestamptz,
  p_bucket  text default 'day',      -- day | week | month | quarter | year
  p_bot     uuid default null,
  p_channel text default null,
  p_tz      text default 'UTC'
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $fn$
declare
  resultado jsonb;
begin
  -- Nadie pide los números de otra organización.
  if p_org is null or p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  if p_bucket not in ('day','week','month','quarter','year') then
    raise exception 'agrupación no válida: %', p_bucket;
  end if;

  -- Zona horaria inválida = se cae la consulta entera. Mejor caer a UTC.
  begin
    perform now() at time zone p_tz;
  exception when others then
    p_tz := 'UTC';
  end;

  with
  -- ── Conversaciones abiertas dentro del periodo ────────────────────────────
  conv as (
    select c.id, c.contact_id, c.bot_id, c.channel::text as canal, c.status::text as estado,
           c.assignee_member_id, c.state_id, c.created_at, c.handoff_requested_at
      from conversations c
     where c.org_id = p_org
       and c.created_at >= p_desde and c.created_at < p_hasta
       and (p_bot is null or c.bot_id = p_bot)
       and (p_channel is null or c.channel::text = p_channel)
  ),
  -- Primera conversación de cada contacto: sirve para separar quién es nuevo
  -- y quién ya nos había escrito antes.
  primera as (
    select contact_id, min(created_at) as en
      from conversations where org_id = p_org and contact_id is not null
     group by contact_id
  ),
  convx as (
    select conv.*,
           coalesce(conv.created_at <= primera.en, true) as es_nuevo,
           (conv.handoff_requested_at is not null
            or conv.assignee_member_id is not null
            or conv.estado = 'assigned') as llego_a_humano
      from conv left join primera on primera.contact_id = conv.contact_id
  ),
  -- ── Mensajes del periodo ──────────────────────────────────────────────────
  -- Se filtran por SU fecha, no por la de la conversación: un chat de la semana
  -- pasada que sigue vivo cuenta sus mensajes en el día que ocurrieron.
  -- Los que Meta rechazó no cuentan: nunca llegaron a nadie.
  msg as (
    select m.conversation_id, m.direction::text as dir, m.sender::text as quien, m.created_at,
           c.bot_id, c.channel::text as canal, c.assignee_member_id
      from messages m
      join conversations c on c.id = m.conversation_id
     where m.org_id = p_org
       and m.created_at >= p_desde and m.created_at < p_hasta
       and not (m.payload ? 'no_entregado')
       and (p_bot is null or c.bot_id = p_bot)
       and (p_channel is null or c.channel::text = p_channel)
  ),
  -- ── Cuánto tarda una PERSONA en contestar ────────────────────────────────
  -- Se mide desde el último mensaje del lead hasta la primera respuesta humana.
  -- Los mensajes del bot que caen en medio se ignoran a propósito: el bot
  -- contesta al instante y taparía por completo el dato del equipo.
  -- Cada pregunta del lead se cuenta una sola vez (solo la PRIMERA respuesta):
  -- si el agente manda tres mensajes seguidos, eso es una respuesta, no tres.
  ventana as (
    select m.conversation_id, m.created_at, m.sender::text as quien,
           max(case when m.direction::text = 'inbound' then m.created_at end)
             over (partition by m.conversation_id order by m.created_at, m.id
                   rows between unbounded preceding and 1 preceding) as ultimo_del_lead,
           max(case when m.sender::text = 'agent' then m.created_at end)
             over (partition by m.conversation_id order by m.created_at, m.id
                   rows between unbounded preceding and 1 preceding) as ultima_del_agente
      from messages m
     where m.org_id = p_org
       and m.created_at >= p_desde - interval '2 days' and m.created_at < p_hasta
  ),
  resp as (
    select v.conversation_id, c.assignee_member_id,
           extract(epoch from (v.created_at - v.ultimo_del_lead)) as segs
      from ventana v
      join conversations c on c.id = v.conversation_id
     where v.quien = 'agent'
       and v.ultimo_del_lead is not null
       and (v.ultima_del_agente is null or v.ultima_del_agente < v.ultimo_del_lead)
       and v.created_at >= p_desde
       and (p_bot is null or c.bot_id = p_bot)
       and (p_channel is null or c.channel::text = p_channel)
  ),
  -- ── Recorridos de flujo ───────────────────────────────────────────────────
  fr as (
    select r.flow_id, r.flow_name, r.ended_reason, r.steps,
           (r.ended_at is null and r.updated_at < now() - interval '12 hours') as abandonado
      from flow_runs r
     where r.org_id = p_org
       and r.started_at >= p_desde and r.started_at < p_hasta
       and (p_bot is null or r.bot_id = p_bot)
       and (p_channel is null or r.channel = p_channel)
  ),
  -- ── Cierre: sale del EMBUDO, no de la conversación ────────────────────────
  -- Desde que existe el embudo, la venta vive en la oportunidad. Si esto
  -- siguiera leyendo el estado de la conversación, Resultados y Embudo darían
  -- números distintos para la misma pregunta.
  cierre as (
    select o.id, o.assignee_member_id, o.status, o.value, o.stage_id
      from opportunities o
     where o.org_id = p_org
       and o.created_at >= p_desde and o.created_at < p_hasta
       and (p_bot is null or o.bot_id = p_bot)
       and (p_channel is null or o.channel = p_channel)
  ),
  -- ── Seguimiento: el lead que se pierde es el que no tiene próximo paso ────
  seguimiento as (
    select o.id,
           (select count(*) from tasks t
             where t.opportunity_id = o.id and t.done_at is null) as pendientes,
           (select count(*) from tasks t
             where t.opportunity_id = o.id and t.done_at is null and t.due_at < now()) as vencidas
      from opportunities o
     where o.org_id = p_org and o.status = 'abierta'
       and (p_bot is null or o.bot_id = p_bot)
       and (p_channel is null or o.channel = p_channel)
  )
  select jsonb_build_object(

    'totales', (
      select jsonb_build_object(
        'conversaciones', count(*),
        'nuevos',        count(*) filter (where es_nuevo),
        'recurrentes',   count(*) filter (where not es_nuevo),
        'contactos',     count(distinct contact_id),
        'a_humano',      count(*) filter (where llego_a_humano),
        'a_humano_pct',  case when count(*) = 0 then 0
                              else round(100.0 * count(*) filter (where llego_a_humano) / count(*), 1) end
      ) from convx
    ),

    'mensajes', (
      select jsonb_build_object(
        'total',    count(*),
        'entrantes',count(*) filter (where dir = 'inbound'),
        'salientes',count(*) filter (where dir = 'outbound'),
        'del_bot',  count(*) filter (where quien = 'bot'),
        'de_persona', count(*) filter (where quien = 'agent'),
        'por_conversacion', case when count(distinct conversation_id) = 0 then 0
             else round(count(*)::numeric / count(distinct conversation_id), 1) end,
        'por_dia', case when greatest(1, extract(day from (p_hasta - p_desde))::int) = 0 then count(*)
             else round(count(*)::numeric / greatest(1, extract(day from (p_hasta - p_desde))::int), 1) end
      ) from msg
    ),

    -- null (no 0) cuando todavía nadie contestó: un 0 se leería como "al instante".
    'respuesta', (
      select jsonb_build_object(
        'mediana_seg',  case when count(*) = 0 then null
                             else round(percentile_cont(0.5) within group (order by segs)::numeric) end,
        'promedio_seg', case when count(*) = 0 then null else round(avg(segs)::numeric) end,
        'respuestas',   count(*)
      ) from resp
    ),

    'serie', coalesce((
      select jsonb_agg(x order by x.periodo)
        from (
          select to_char(date_trunc(p_bucket, cx.created_at at time zone p_tz), 'YYYY-MM-DD') as periodo,
                 count(*) as conversaciones,
                 count(*) filter (where cx.es_nuevo) as nuevos,
                 count(*) filter (where not cx.es_nuevo) as recurrentes,
                 count(*) filter (where cx.llego_a_humano) as a_humano
            from convx cx
           group by 1
        ) x
    ), '[]'::jsonb),

    'serie_mensajes', coalesce((
      select jsonb_agg(x order by x.periodo)
        from (
          select to_char(date_trunc(p_bucket, m.created_at at time zone p_tz), 'YYYY-MM-DD') as periodo,
                 count(*) filter (where m.dir = 'inbound')  as entrantes,
                 count(*) filter (where m.dir = 'outbound') as salientes
            from msg m group by 1
        ) x
    ), '[]'::jsonb),

    'por_canal', coalesce((
      select jsonb_agg(x order by x.conversaciones desc)
        from (
          select cx.canal,
                 count(*) as conversaciones,
                 count(*) filter (where cx.llego_a_humano) as a_humano,
                 (select count(*) from msg where msg.canal = cx.canal) as mensajes
            from convx cx group by cx.canal
        ) x
    ), '[]'::jsonb),

    'por_bot', coalesce((
      select jsonb_agg(x order by x.conversaciones desc)
        from (
          select b.id::text as id, b.name as nombre, b.channel as canal,
                 count(cx.id) as conversaciones,
                 count(cx.id) filter (where cx.llego_a_humano) as a_humano,
                 (select count(*) from msg where msg.bot_id = b.id) as mensajes
            from bots b left join convx cx on cx.bot_id = b.id
           where b.org_id = p_org and (p_bot is null or b.id = p_bot)
           group by b.id, b.name, b.channel

          union all

          -- Conversaciones que no quedaron ligadas a ningun chatbot. Antes se
          -- caian del panel en silencio y los numeros no sumaban: se veian 3
          -- conversaciones donde habian entrado 8. Un panel que no cuadra hace
          -- dudar de TODO lo demas, aunque el resto este bien.
          select 'sin-chatbot' as id, 'Sin chatbot asignado' as nombre,
                 '' as canal,
                 count(cx.id) as conversaciones,
                 count(cx.id) filter (where cx.llego_a_humano) as a_humano,
                 (select count(*) from msg where msg.bot_id is null) as mensajes
            from convx cx
           where cx.bot_id is null and p_bot is null
          having count(cx.id) > 0
        ) x
    ), '[]'::jsonb),

    'por_flujo', coalesce((
      select jsonb_agg(x order by x.entradas desc)
        from (
          select coalesce(fr.flow_id::text, 'sin-id') as id,
                 coalesce(max(fr.flow_name), 'Flujo sin nombre') as nombre,
                 count(*) as entradas,
                 count(*) filter (where fr.ended_reason = 'completado') as completadas,
                 count(*) filter (where fr.ended_reason = 'agente')     as a_humano,
                 count(*) filter (where fr.ended_reason = 'reiniciado') as reiniciadas,
                 count(*) filter (where fr.abandonado)                  as abandonadas,
                 round(avg(fr.steps)::numeric, 1) as pasos_promedio,
                 round(100.0 * count(*) filter (where fr.ended_reason = 'completado') / nullif(count(*), 0), 1) as efectividad
            from fr group by coalesce(fr.flow_id::text, 'sin-id')
        ) x
    ), '[]'::jsonb),

    'por_agente', coalesce((
      select jsonb_agg(x order by x.conversaciones desc)
        from (
          select tm.id::text as id, tm.name as nombre,
                 (select count(*) from convx where convx.assignee_member_id = tm.id) as conversaciones,
                 (select count(*) from msg where msg.assignee_member_id = tm.id and msg.quien = 'agent') as mensajes,
                 (select case when count(*) = 0 then null
                              else round(percentile_cont(0.5) within group (order by segs)::numeric) end
                    from resp where resp.assignee_member_id = tm.id) as respuesta_mediana_seg,
                 (select count(*) from cierre where cierre.assignee_member_id = tm.id and cierre.status = 'ganada') as ganadas,
                 (select count(*) from cierre where cierre.assignee_member_id = tm.id and cierre.status = 'perdida') as perdidas,
                 (select coalesce(sum(value), 0) from cierre where cierre.assignee_member_id = tm.id and cierre.status = 'ganada') as importe_ganado
            from team_members tm where tm.org_id = p_org
        ) x
       -- Un vendedor que cerró ventas pero al que nunca se le asignó la
       -- conversación también tiene que salir en la tabla del equipo.
       where x.conversaciones > 0 or x.mensajes > 0 or x.ganadas > 0 or x.perdidas > 0
    ), '[]'::jsonb),

    'cierre', (
      select jsonb_build_object(
        'ganadas',  count(*) filter (where status = 'ganada'),
        'perdidas', count(*) filter (where status = 'perdida'),
        'abiertas', count(*) filter (where status = 'abierta'),
        'importe_ganado',  coalesce(sum(value) filter (where status = 'ganada'), 0),
        'importe_abierto', coalesce(sum(value) filter (where status = 'abierta'), 0),
        'efectividad', round(100.0 * count(*) filter (where status = 'ganada')
                       / nullif(count(*) filter (where status in ('ganada','perdida')), 0), 1)
      ) from cierre
    ),

    -- Lo que ningún competidor mira: las tarjetas SIN próximo paso agendado.
    -- Todos avisan de tareas vencidas; el lead que se pierde de verdad es el
    -- que nunca tuvo una siguiente acción y nadie se dio cuenta.
    'seguimiento', (
      select jsonb_build_object(
        'abiertas',         count(*),
        'sin_proximo_paso', count(*) filter (where pendientes = 0),
        'con_vencida',      count(*) filter (where vencidas > 0)
      ) from seguimiento
    ),

    'por_estado', coalesce((
      select jsonb_agg(x order by x.orden)
        from (
          select cs.name as nombre, cs.color, cs.outcome, cs.sort as orden,
                 count(ci.id) as conversaciones,
                 coalesce(sum(ci.value), 0) as importe
            from conversation_states cs
            left join cierre ci on ci.stage_id = cs.id
           where cs.org_id = p_org
           group by cs.name, cs.color, cs.outcome, cs.sort
        ) x
    ), '[]'::jsonb),

    'por_hora', coalesce((
      select jsonb_agg(x order by x.hora)
        from (
          select extract(hour from (m.created_at at time zone p_tz))::int as hora,
                 count(*) filter (where m.dir = 'inbound') as entrantes
            from msg m group by 1
        ) x
    ), '[]'::jsonb),

    'meta', jsonb_build_object(
      'desde', p_desde, 'hasta', p_hasta, 'agrupacion', p_bucket, 'tz', p_tz,
      -- Si nunca se han registrado recorridos, la pantalla lo dice en vez de
      -- pintar una gráfica vacía que parece un error.
      'hay_flujos', (select count(*) > 0 from flow_runs where org_id = p_org),
      'hay_cierre', (select count(*) > 0 from conversation_states
                      where org_id = p_org and outcome in ('ganado','perdido')),
      'hay_embudo', (select count(*) > 0 from opportunities where org_id = p_org)
    )
  ) into resultado;

  return resultado;
end;
$fn$;

revoke execute on function public.analytics_overview(uuid, timestamptz, timestamptz, text, uuid, text, text) from public, anon;
grant  execute on function public.analytics_overview(uuid, timestamptz, timestamptz, text, uuid, text, text) to authenticated, service_role;
