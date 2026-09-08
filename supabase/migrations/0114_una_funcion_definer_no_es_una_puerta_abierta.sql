-- ═══════════════════════════════════════════════════════════════════════════
-- CUATRO FUNCIONES QUE SE SALTAN EL RLS Y NO PREGUNTABAN DE QUIÉN ERAN LOS DATOS.
--
-- ── QUÉ ES UNA FUNCIÓN `security definer` ─────────────────────────────────
--
-- Una función normal corre con los permisos de quien la llama, así que el RLS
-- la sigue vigilando. Una `security definer` corre con los permisos de quien la
-- ESCRIBIÓ: el RLS no la toca. Es la forma de dejar hacer una cosa concreta que
-- de otro modo estaría prohibida —buscar en una tabla cerrada, poner una
-- etiqueta— y es la herramienta correcta para eso.
--
-- Pero al saltarse el RLS, la función se queda como ÚNICO guardia. Si además
-- recibe el `org_id` por parámetro y está concedida a `authenticated`, entonces
-- cualquiera con una cuenta —una prueba gratuita creada hace un minuto— puede
-- llamarla con el `org_id` de otro negocio. Y la base le contesta.
--
-- ── LO QUE PASABA CON `buscar_conocimiento` ───────────────────────────────
--
-- Es la peor de las cuatro. Devuelve el conocimiento cargado del negocio: sus
-- precios, sus políticas, sus guiones de venta. Es lo que un cliente escribe
-- para que su bot sepa contestar, y es literalmente su producto.
--
-- Estaba concedida a `authenticated`, es `security definer`, y su única
-- comprobación era que el `org_id` no viniera vacío. Desde la consola del
-- navegador, con la sesión de una cuenta cualquiera:
--
--     supabase.rpc('buscar_conocimiento', {
--       p_org_id: '<de otro negocio>', p_bot_id: '<su bot>',
--       p_pregunta: 'precio', p_limit: 20 })
--
-- Y los dos identificadores que hacen falta los reparte la propia tienda
-- pública: `tiendas` tiene política de FILAS pero no de COLUMNAS, así que `anon`
-- lee el `org_id` y el `bot_id` de todas las tiendas activas. Enumerar y vaciar.
--
-- Su hermana `match_bot_knowledge` (0095) nunca tuvo el agujero: no es definer y
-- comprueba que el bot sea de la organización. Se hizo bien una vez; ésta se
-- quedó atrás y nadie volvió.
--
-- ── EL CANDADO, Y POR QUÉ NO ROMPE NADA ───────────────────────────────────
--
-- Es el mismo de `org_en_horario` (0106), palabra por palabra:
--
--     if auth.uid() is not null and p_org not in (select auth_org_ids()) then
--       raise exception 'sin acceso a esa organización';
--     end if;
--
-- La clave es el `auth.uid() is not null`. Los dos motores llaman a
-- `buscar_conocimiento` con la llave de servicio (`answer.ts:113` y el motor de
-- Deno, `index.ts:735`), y una llave de servicio no tiene `sub`: `auth.uid()` es
-- nulo y la función pasa de largo, como debe. Las otras dos se llaman desde
-- disparadores de la propia base, donde el `org_id` es el de la fila que se está
-- tocando — o sea, el de quien la está tocando.
--
-- El candado solo muerde en un caso: alguien con SESIÓN pidiendo una
-- organización que no es la suya. Que es exactamente el ataque.
--
-- ── UN SEGUNDO CANDADO QUE SE ESCRIBIÓ Y SE QUITÓ ─────────────────────────
--
-- Iba a llevar también `exists (bots where id = p_bot_id and org_id = p_org_id)`,
-- pensando en el robo del `bot_id`: hoy `authenticated` conserva el UPDATE sobre
-- `whatsapp_channels.bot_id` y ninguna política mira esa columna, así que un
-- cliente puede apuntar su canal al chatbot de otro.
--
-- Se probó contra la base antes de escribirlo, y NO CAMBIA NADA: el
-- `where k.org_id = p_org_id and k.bot_id = p_bot_id` de abajo ya devuelve vacío
-- para cualquier par que no case. El candado habría pasado siempre, y una prueba
-- que lo vigilara habría estado verde antes y después.
--
-- Se queda fuera. Una comprobación que no puede fallar no comprueba nada y es
-- peor que no tenerla, porque da tranquilidad falsa y nadie vuelve a mirarla.
-- El robo del canal se arregla donde de verdad se arregla: con una clave foránea
-- compuesta `(org_id, bot_id)`, como ya tiene `agentes.tienda_id`. Va aparte.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. buscar_conocimiento ────────────────────────────────────────────────
create or replace function public.buscar_conocimiento(
  p_org_id uuid,
  p_bot_id uuid,
  p_pregunta text,
  p_limit int default 5
)
returns table (title text, content text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_or  tsquery;
  v_and tsquery;
begin
  -- AISLAMIENTO: sin organización Y chatbot no se busca nada. Nunca. El
  -- conocimiento de un cliente no puede rozar el de otro ni por accidente.
  if p_org_id is null or p_bot_id is null or coalesce(btrim(p_pregunta), '') = '' then
    return;
  end if;

  -- EL CANDADO — quién pregunta. Ver la cabecera: los motores entran con la
  -- llave de servicio (auth.uid() nulo) y pasan; una sesión solo puede pedir
  -- lo suyo.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  v_and := websearch_to_tsquery('spanish', p_pregunta);

  -- Los lexemas ya vienen normalizados por la configuración «spanish»; se
  -- vuelven a montar con 'simple' justamente para NO derivarlos dos veces.
  select to_tsquery('simple', string_agg(quote_literal(lexeme), ' | '))
    into v_or
    from unnest(to_tsvector('spanish', p_pregunta));

  if v_or is null then
    return;
  end if;

  return query
  select k.title, k.content
  from public.bot_knowledge k
  where k.org_id = p_org_id
    and k.bot_id = p_bot_id
    and k.enabled is true
    and k.search @@ v_or
  order by
    -- Primero lo que cumple la pregunta entera, luego lo más parecido.
    (case when v_and is not null and k.search @@ v_and then 0 else 1 end),
    ts_rank(k.search, v_or) desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
end;
$$;

comment on function public.buscar_conocimiento(uuid, uuid, text, int) is
  'Busca en el conocimiento de UN chatbot de UNA organización. Es security '
  'definer: el candado de auth_org_ids es lo único que impide leer el de otro.';


-- ── 2. calificar_contacto ─────────────────────────────────────────────────
--
-- Escribe: pone una etiqueta en el CRM. Sin candado, alguien con sesión podía
-- etiquetar contactos de otro negocio y, de paso, averiguar qué regla de
-- calificación se cumplió — que es inteligencia comercial ajena.
--
-- La llama el disparador de `contacts`: ahí el p_org_id es el de la fila que se
-- acaba de tocar, así que para el dueño de esa fila el candado siempre pasa.
create or replace function public.calificar_contacto(p_org_id uuid, p_contact_id uuid)
returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c public.contacts;
  r record;
begin
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select * into c from public.contacts where id = p_contact_id and org_id = p_org_id;
  if not found then return null; end if;

  for r in
    select rc.campo, rc.operador, rc.valor, t.name as etiqueta
      from public.reglas_de_calificacion rc
      join public.tags t on t.id = rc.etiqueta_id
     where rc.org_id = p_org_id and rc.activa
     order by rc.prioridad desc, rc.created_at
  loop
    if regla_se_cumple(valor_del_campo(c, r.campo), r.operador, r.valor) then
      perform poner_etiqueta(p_org_id, p_contact_id, r.etiqueta);
      return r.etiqueta;
    end if;
  end loop;
  return null;
end $$;


-- ── 3. elegir_por_etiqueta ────────────────────────────────────────────────
--
-- Devuelve a quién del equipo le toca un lead. Sin candado, enseña el reparto
-- interno de otro negocio y confirma que un contacto suyo existe.
create or replace function public.elegir_por_etiqueta(p_org uuid, p_contact_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tags   text[];
  v_member uuid;
  v_team   uuid;
begin
  if p_contact_id is null then return null; end if;

  if auth.uid() is not null and p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select coalesce(ct.tags, array[]::text[]) into v_tags
  from public.contacts ct where ct.id = p_contact_id and ct.org_id = p_org;
  if v_tags is null then return null; end if;

  -- La primera regla que encaje. Una regla CON etiqueta gana siempre a la de
  -- cajon aunque empaten en prioridad: lo concreto manda sobre lo general.
  select r.member_id, r.team_id into v_member, v_team
  from public.reglas_de_reparto r
  left join public.tags t on t.id = r.tag_id
  where r.org_id = p_org
    and r.activa
    and (r.tag_id is null or t.name = any (v_tags))
  order by (r.tag_id is not null) desc, r.prioridad desc, r.created_at
  limit 1;

  if v_member is not null then
    -- Solo si sigue disponible: mandarle un lead caliente a quien termino su
    -- turno es perderlo. Si no esta, se cae al reparto normal.
    select tm.id into v_member from public.team_members tm
    where tm.id = v_member and tm.org_id = p_org and coalesce(tm.available, true);
    return v_member;
  end if;

  if v_team is null then return null; end if;

  -- Un equipo: al que menos conversaciones abiertas tenga.
  select tm.id into v_member
  from public.team_members tm
  left join public.conversations c
         on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
  where tm.org_id = p_org and tm.team_id = v_team and coalesce(tm.available, true)
  group by tm.id, tm.created_at
  order by count(c.id), tm.created_at
  limit 1;

  return v_member;
end $$;


-- ── 4. puedo_llamar ───────────────────────────────────────────────────────
--
-- Devuelve un sí o un no: «¿este teléfono autorizó llamadas a esta
-- organización?». Sin candado es un oráculo: permite confirmar, número a
-- número, si alguien es lead de un competidor.
--
-- Era `language sql`, que no sabe lanzar un error. Pasa a plpgsql sin cambiar
-- lo que devuelve.
create or replace function public.puedo_llamar(p_org_id uuid, p_telefono text)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  return coalesce((
    select p.estado = 'concedido'
       and (p.permanente or (p.expira_at is not null and p.expira_at > now()))
    from public.permisos_de_llamada p
    where p.org_id = p_org_id and p.telefono = p_telefono
  ), false);
end $$;


-- Los permisos no cambian: siguen fuera del alcance de `anon` y concedidas a
-- `authenticated` y `service_role`. Se repiten porque un `create or replace`
-- sobre una función que cambia de lenguaje puede recrearla.
revoke execute on function public.buscar_conocimiento(uuid, uuid, text, int) from public, anon;
grant  execute on function public.buscar_conocimiento(uuid, uuid, text, int) to authenticated, service_role;
revoke execute on function public.calificar_contacto(uuid, uuid) from public, anon;
grant  execute on function public.calificar_contacto(uuid, uuid) to authenticated, service_role;
revoke execute on function public.elegir_por_etiqueta(uuid, uuid) from public, anon;
grant  execute on function public.elegir_por_etiqueta(uuid, uuid) to authenticated, service_role;
revoke execute on function public.puedo_llamar(uuid, text) from public, anon;
grant  execute on function public.puedo_llamar(uuid, text) to authenticated, service_role;
