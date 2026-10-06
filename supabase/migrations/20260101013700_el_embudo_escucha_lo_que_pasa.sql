-- EL EMBUDO SE MUEVE SOLO CON LO QUE PASA, USE EL CLIENTE LO QUE USE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DE DÓNDE SALE ESTO
--
-- La 0079 ató la tienda al embudo: el importe sale de los pedidos y un pago
-- confirmado gana la tarjeta. Funciona, pero es UN cable soldado entre DOS
-- módulos concretos. El cliente que no vende productos —el que usa Demandu
-- para agendar citas— tiene un embudo que no se mueve nunca.
--
-- Y ya existía la pieza que faltaba: el CATÁLOGO DE EVENTOS (`lead.nuevo`,
-- `cita.agendada`, `pase.a.humano`…), que hoy solo sirve para mandarle webhooks
-- al CRM del cliente. El embudo no los escuchaba.
--
-- Así que un solo catálogo de cosas que pasan y DOS consumidores: el webhook de
-- fuera y el embudo de dentro. Cada sitio que ya emite un evento mueve la
-- tarjeta sin cambiar una línea de código.
--
-- ── POR QUÉ NO UN CONSTRUCTOR DE REGLAS ───────────────────────────────────
--
-- Por dentro esto es genérico —evento → etapa— porque escribirlo a medida para
-- la tienda y luego otra vez para las citas es escribirlo dos veces mal. Pero
-- POR FUERA no habrá ningún constructor de reglas: son cuatro interruptores en
-- español, encendidos de fábrica. Un dueño de panadería no va a armar reglas, y
-- una función que hay que configurar para que sirva es una función que nadie
-- usa.
--
-- ── LAS ETAPAS QUE YA TIENEN, POR FIN SIGNIFICAN ALGO ─────────────────────
--
-- Las etapas de fábrica son «Abierta · Pendiente · En proceso · En atención ·
-- Cerrada · Ganada». Las tres del medio son hoy tres formas de decir «todavía
-- nada» — nadie sabe cuándo mover una tarjeta de una a otra, así que no se
-- mueven.
--
-- No se reestructura el tablero de nadie: se les da sentido.
--
--     Pendiente    → pidió y falta cobrarle
--     En proceso   → agendó una cita
--     En atención  → pidió hablar con una persona
--
-- Quien quiera otras las cambia; quien no toque nada se encuentra un embudo que
-- se mueve solo, que es justo lo que nadie tiene tiempo de configurar.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.reglas_de_embudo (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  pipeline_id uuid not null references public.pipelines(id) on delete cascade,
  evento      text not null,
  -- A qué etapa se mueve. NULO = la regla existe pero no mueve nada; sirve para
  -- que el interruptor pueda estar apagado sin perder a dónde apuntaba.
  etapa_id    uuid references public.conversation_states(id) on delete set null,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint reglas_de_embudo_una_por_evento unique (pipeline_id, evento)
);

alter table public.reglas_de_embudo enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='reglas_de_embudo' and policyname='reglas_de_embudo_all') then
    create policy reglas_de_embudo_all on public.reglas_de_embudo
      for all
      using      (org_id in (select auth_org_ids()))
      with check (org_id in (select auth_org_ids()));
  end if;
end $$;

create index if not exists reglas_de_embudo_org_idx on public.reglas_de_embudo (org_id) where activa;

-- ─────────────────────────────────────────────────────────────────────────────
-- MOVER LA TARJETA
--
-- Se llama desde `emitir_evento`, o sea desde TODOS los sitios que ya cuentan
-- algo hacia fuera. Ninguno cambia.
--
-- ── LAS TRES CONTENCIONES, Y SON LO IMPORTANTE ────────────────────────────
--
-- 1. SOLO TARJETAS ABIERTAS. Una ganada o perdida no se toca: el dueño la
--    cerró, y un cliente que escribe otra vez no puede reabrirle una venta que
--    dio por hecha.
--
-- 2. NUNCA HACIA ATRÁS. Si la tarjeta ya está más adelante, se queda. Sin esto,
--    un cliente que agenda una cita después de haber pedido volvería de «falta
--    cobrarle» a «agendó», y el dueño vería su embudo retroceder solo — que es
--    exactamente la razón por la que la gente deja de confiar en un tablero
--    automático y vuelve al cuaderno.
--
-- 3. SI YA ESTÁ AHÍ, NO SE ESCRIBE. Ni fila en la bitácora ni `updated_at`
--    nuevo: cinco mensajes seguidos no pueden llenar el historial de «se movió
--    a Pendiente» cinco veces.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.crm_evento_mueve_tarjeta(
  p_org_id uuid,
  p_tipo   text,
  p_payload jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conv   uuid;
  v_op     uuid;
  v_pipe   uuid;
  v_status text;
  v_actual uuid;
  v_destino uuid;
  v_orden_actual int;
  v_orden_destino int;
begin
  if p_org_id is null or coalesce(btrim(p_tipo), '') = '' then return; end if;

  -- SALIDA BARATA PARA QUIEN NO TIENE REGLAS DE ESTE EVENTO. Esto corre en el
  -- camino de cosas que pasan a menudo; que cueste una consulta con índice y
  -- nada más es la diferencia entre poder llamarlo desde todas partes o no.
  if not exists (
    select 1 from reglas_de_embudo r
     where r.org_id = p_org_id and r.activa and r.evento = p_tipo and r.etapa_id is not null
  ) then
    return;
  end if;

  -- ── CON QUIÉN ES ─────────────────────────────────────────────────────────
  -- Los eventos no traen todos lo mismo: unos la conversación, otros el
  -- contacto, otros solo el teléfono. Se prueba en ese orden porque es de más
  -- exacto a menos.
  v_conv := nullif(p_payload->>'conversacion_id', '')::uuid;

  if v_conv is null and nullif(p_payload->>'contacto_id','') is not null then
    select c.id into v_conv
      from conversations c
     where c.org_id = p_org_id
       and c.contact_id = (p_payload->>'contacto_id')::uuid
       and c.status <> 'closed'
     order by c.last_message_at desc nulls last
     limit 1;
  end if;

  if v_conv is null and nullif(p_payload->>'telefono','') is not null then
    select c.id into v_conv
      from conversations c
      join contacts ct on ct.id = c.contact_id
     where c.org_id = p_org_id
       and ct.external_id = regexp_replace(p_payload->>'telefono', '\D', '', 'g')
       and c.status <> 'closed'
     order by c.last_message_at desc nulls last
     limit 1;
  end if;

  if v_conv is null then return; end if;

  select opportunity_id into v_op from conversations where id = v_conv;
  if v_op is null then return; end if;

  select o.pipeline_id, o.status, o.stage_id into v_pipe, v_status, v_actual
    from opportunities o where o.id = v_op;

  -- CONTENCIÓN 1: la tarjeta cerrada no se toca.
  if v_pipe is null or v_status is distinct from 'abierta' then return; end if;

  select r.etapa_id into v_destino
    from reglas_de_embudo r
   where r.pipeline_id = v_pipe and r.evento = p_tipo and r.activa
   limit 1;

  if v_destino is null then return; end if;

  -- CONTENCIÓN 3: ya está ahí.
  if v_actual is not distinct from v_destino then return; end if;

  -- CONTENCIÓN 2: nunca hacia atrás.
  select sort into v_orden_actual  from conversation_states where id = v_actual;
  select sort into v_orden_destino from conversation_states where id = v_destino;
  if coalesce(v_orden_actual, -1) > coalesce(v_orden_destino, -1) then return; end if;

  update opportunities
     set stage_id = v_destino, updated_at = now()
   where id = v_op;

  insert into opportunity_events (org_id, opportunity_id, kind, from_stage_id, to_stage_id, meta)
  values (p_org_id, v_op, 'evento_' || replace(p_tipo, '.', '_'), v_actual, v_destino,
          jsonb_build_object('evento', p_tipo));

exception when others then
  -- ── NUNCA PUEDE TUMBAR LO QUE LO LLAMÓ ──────────────────────────────────
  -- `emitir_evento` corre dentro del guardado de un mensaje o de un pedido.
  -- Mover una tarjeta es una comodidad; guardar el mensaje del cliente es la
  -- razón de existir del producto. Es la misma lección de la 0090.
  raise warning '[crm_evento_mueve_tarjeta] no pude mover la tarjeta (%): %', sqlstate, sqlerrm;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- El catálogo de eventos, ahora con dos consumidores.
--
-- Se conserva TODO lo de antes —encolar para las salidas— y se añade la
-- llamada al embudo. Los sitios que emiten no cambian: es exactamente por eso
-- que el cambio va aquí y no en veinte llamadas repartidas.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.emitir_evento(
  p_org_id uuid,
  p_tipo text,
  p_payload jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cuantos int := 0;
begin
  if p_org_id is null or coalesce(btrim(p_tipo), '') = '' then
    return 0;
  end if;

  insert into public.eventos_salientes (org_id, salida_id, tipo, payload)
  select p_org_id, s.id, p_tipo, coalesce(p_payload, '{}'::jsonb)
    from public.salidas s
   where s.org_id = p_org_id
     and s.activa
     and (cardinality(s.eventos) = 0 or p_tipo = any (s.eventos));

  get diagnostics v_cuantos = row_count;

  -- EL EMBUDO ESCUCHA LO MISMO. Va después de encolar a propósito: si esto
  -- fallara, el webhook del cliente ya está a salvo.
  perform public.crm_evento_mueve_tarjeta(p_org_id, p_tipo, coalesce(p_payload, '{}'::jsonb));

  return v_cuantos;
end;
$$;

revoke execute on function public.emitir_evento(uuid, text, jsonb) from public, anon;
grant  execute on function public.emitir_evento(uuid, text, jsonb) to service_role;
revoke execute on function public.crm_evento_mueve_tarjeta(uuid, text, jsonb) from public, anon, authenticated;
grant  execute on function public.crm_evento_mueve_tarjeta(uuid, text, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- LAS REGLAS DE FÁBRICA
--
-- Se apuntan a las etapas que el cliente YA TIENE, buscándolas por nombre. Si
-- no encuentra una parecida, la regla no se crea: inventar una etapa nueva en
-- el tablero de alguien que está trabajando es peor que no automatizar nada.
--
-- `on conflict do nothing` para que esta migración se pueda repetir sin pisar
-- lo que el cliente haya cambiado a mano.
-- ─────────────────────────────────────────────────────────────────────────────
insert into public.reglas_de_embudo (org_id, pipeline_id, evento, etapa_id)
select p.org_id, p.id, x.evento, x.etapa
from public.pipelines p
cross join lateral (
  values
    ('pedido.creado',       (select id from conversation_states where pipeline_id = p.id and lower(name) like '%pendiente%' order by sort limit 1)),
    ('pedido.pago_vencido', (select id from conversation_states where pipeline_id = p.id and lower(name) like '%pendiente%' order by sort limit 1)),
    ('cita.agendada',       (select id from conversation_states where pipeline_id = p.id and lower(name) like '%proceso%'   order by sort limit 1)),
    ('pase.a.humano',       (select id from conversation_states where pipeline_id = p.id and lower(name) like '%atenci%'    order by sort limit 1))
) as x(evento, etapa)
where x.etapa is not null
on conflict (pipeline_id, evento) do nothing;

comment on table public.reglas_de_embudo is
  'Qué etapa toca cuando pasa algo. Un solo catálogo de eventos con dos consumidores: los webhooks del cliente y el embudo.';
