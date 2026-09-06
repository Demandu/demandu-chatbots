-- ===========================================================================
-- 0014 — El tablero del embudo en una sola consulta
--
-- Mismo criterio que analytics_overview: un viaje a la base devuelve las
-- columnas, sus totales y sus tarjetas. Arrastrar una tarjeta no vuelve a
-- pedir el tablero entero — eso lo resuelve la pantalla en el navegador.
--
-- Lo que hace especial a este tablero frente a Kommo o Leadsales es la
-- bandera `sin_proximo_paso`: la tarjeta que no tiene NINGUNA tarea pendiente.
-- Todos avisan de tareas vencidas; el lead que se pierde de verdad es el que
-- nunca tuvo una agendada, y nadie lo está mirando.
-- ===========================================================================

create or replace function crm_board(
  p_org      uuid,
  p_pipeline uuid default null,
  p_member   uuid default null,   -- filtrar por responsable
  p_bot      uuid default null,
  p_canal    text default null,
  p_buscar   text default null,   -- nombre, teléfono o correo
  p_limite   int  default 50      -- tarjetas por columna
)
returns jsonb
language plpgsql
security invoker
stable
set search_path = public
as $fn$
declare
  resultado jsonb;
  v_pipe uuid;
begin
  if p_org is null or p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  p_limite := least(greatest(coalesce(p_limite, 50), 1), 200);

  -- Sin embudo indicado, el que esté marcado por defecto.
  v_pipe := p_pipeline;
  if v_pipe is null then
    select id into v_pipe from pipelines where org_id = p_org and is_default order by sort limit 1;
  end if;
  if v_pipe is null then
    select id into v_pipe from pipelines where org_id = p_org order by sort limit 1;
  end if;

  with
  etapas as (
    select cs.id, cs.name, cs.color, cs.outcome, cs.sort
      from conversation_states cs
     where cs.org_id = p_org and cs.pipeline_id = v_pipe
  ),
  -- Tarjetas que pasan los filtros de la barra superior.
  ops as (
    select o.*,
           ct.name as contacto, ct.wa_name, ct.phone, ct.email, ct.country,
           tm.name as responsable
      from opportunities o
      left join contacts ct     on ct.id = o.contact_id
      left join team_members tm on tm.id = o.assignee_member_id
     where o.org_id = p_org and o.pipeline_id = v_pipe
       and (p_member is null or o.assignee_member_id = p_member)
       and (p_bot    is null or o.bot_id = p_bot)
       and (p_canal  is null or o.channel = p_canal)
       and (
         p_buscar is null or btrim(p_buscar) = '' or
         o.title      ilike '%' || btrim(p_buscar) || '%' or
         ct.name      ilike '%' || btrim(p_buscar) || '%' or
         ct.wa_name   ilike '%' || btrim(p_buscar) || '%' or
         ct.phone     ilike '%' || btrim(p_buscar) || '%' or
         ct.email     ilike '%' || btrim(p_buscar) || '%'
       )
  ),
  -- La tarea pendiente más próxima de cada tarjeta.
  proxima as (
    select distinct on (opportunity_id)
           opportunity_id, id as tarea_id, title as tarea, due_at
      from tasks
     where org_id = p_org and done_at is null and opportunity_id is not null
     order by opportunity_id, due_at asc nulls last
  ),
  -- La conversación más reciente, para el botón "Abrir chat".
  ultima_conv as (
    select distinct on (opportunity_id)
           opportunity_id, id as conversation_id, unread, last_message_at
      from conversations
     where org_id = p_org and opportunity_id is not null
     order by opportunity_id, last_message_at desc nulls last
  ),
  tarjetas as (
    select ops.*,
           proxima.tarea, proxima.due_at, proxima.tarea_id,
           ultima_conv.conversation_id, ultima_conv.unread, ultima_conv.last_message_at,
           (proxima.opportunity_id is null) as sin_proximo_paso,
           (proxima.due_at is not null and proxima.due_at < now()) as tarea_vencida,
           greatest(0, extract(day from (now() - ops.updated_at))::int) as dias_quieta
      from ops
      left join proxima     on proxima.opportunity_id = ops.id
      left join ultima_conv on ultima_conv.opportunity_id = ops.id
  )
  select jsonb_build_object(
    'pipeline_id', v_pipe,
    'embudos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'nombre', p.name, 'por_defecto', p.is_default, 'auto', p.auto_create
             ) order by p.sort, p.name)
        from pipelines p where p.org_id = p_org
    ), '[]'::jsonb),
    'columnas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'nombre', e.name, 'color', e.color, 'tipo', e.outcome, 'orden', e.sort,
        'total',  (select count(*)              from tarjetas t where t.stage_id = e.id),
        'importe',(select coalesce(sum(t.value), 0) from tarjetas t where t.stage_id = e.id),
        'tarjetas', coalesce((
          select jsonb_agg(x order by x.sort desc)
            from (
              select t.id, t.title as titulo, t.value as importe, t.currency as moneda,
                     t.sort, t.status, t.channel as canal, t.created_at, t.updated_at,
                     t.contacto, t.wa_name, t.phone as telefono, t.email, t.country as pais,
                     t.responsable, t.assignee_member_id,
                     t.tarea, t.due_at as tarea_para, t.tarea_id,
                     t.sin_proximo_paso, t.tarea_vencida, t.dias_quieta,
                     t.conversation_id, t.unread, t.contact_id
                from tarjetas t
               where t.stage_id = e.id
               order by t.sort desc
               limit p_limite
            ) x
        ), '[]'::jsonb)
      ) order by e.sort, e.name)
      from etapas e
    ), '[]'::jsonb),
    'resumen', (
      select jsonb_build_object(
        'abiertas',        count(*) filter (where status = 'abierta'),
        'importe_abierto', coalesce(sum(value) filter (where status = 'abierta'), 0),
        'ganadas',         count(*) filter (where status = 'ganada'),
        'importe_ganado',  coalesce(sum(value) filter (where status = 'ganada'), 0),
        'perdidas',        count(*) filter (where status = 'perdida'),
        'sin_proximo_paso',count(*) filter (where sin_proximo_paso and status = 'abierta'),
        'vencidas',        count(*) filter (where tarea_vencida and status = 'abierta')
      ) from tarjetas
    ),
    'responsables', coalesce((
      select jsonb_agg(jsonb_build_object('id', tm.id, 'nombre', tm.name) order by tm.name)
        from team_members tm where tm.org_id = p_org
    ), '[]'::jsonb)
  ) into resultado;

  return resultado;
end
$fn$;

revoke execute on function public.crm_board(uuid, uuid, uuid, uuid, text, text, int) from public, anon;
grant  execute on function public.crm_board(uuid, uuid, uuid, uuid, text, text, int) to authenticated, service_role;

-- ===========================================================================
-- Mover una tarjeta: cambia de etapa y se coloca ENTRE dos tarjetas.
--
-- Va en la base y no en la pantalla porque el orden se calcula a partir de
-- los vecinos, y hacerlo desde el navegador abre la puerta a que dos personas
-- arrastrando a la vez dejen el tablero inconsistente.
-- ===========================================================================
create or replace function crm_mover_tarjeta(
  p_op      uuid,
  p_stage   uuid,
  p_antes   uuid default null,   -- tarjeta que queda ARRIBA (o null: al tope)
  p_despues uuid default null    -- tarjeta que queda ABAJO  (o null: al fondo)
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = public
as $fn$
declare
  v_org uuid; v_arriba double precision; v_abajo double precision; v_nuevo double precision;
begin
  select org_id into v_org from opportunities where id = p_op;
  if v_org is null or v_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa oportunidad';
  end if;
  if not exists (select 1 from conversation_states where id = p_stage and org_id = v_org) then
    raise exception 'esa etapa no es de este cliente';
  end if;

  select sort into v_arriba from opportunities where id = p_antes   and org_id = v_org;
  select sort into v_abajo  from opportunities where id = p_despues and org_id = v_org;

  -- El tablero pinta de mayor a menor `sort`: arriba del todo = el más grande.
  if v_arriba is null and v_abajo is null then
    select coalesce(max(sort), 0) + 60 into v_nuevo
      from opportunities where stage_id = p_stage and org_id = v_org;
  elsif v_arriba is null then
    v_nuevo := v_abajo + 60;
  elsif v_abajo is null then
    v_nuevo := v_arriba - 60;
  else
    v_nuevo := (v_arriba + v_abajo) / 2;
  end if;

  update opportunities set stage_id = p_stage, sort = v_nuevo where id = p_op;

  return (select jsonb_build_object('id', id, 'stage_id', stage_id, 'status', status, 'sort', sort)
            from opportunities where id = p_op);
end
$fn$;

revoke execute on function public.crm_mover_tarjeta(uuid, uuid, uuid, uuid) from public, anon;
grant  execute on function public.crm_mover_tarjeta(uuid, uuid, uuid, uuid) to authenticated, service_role;
