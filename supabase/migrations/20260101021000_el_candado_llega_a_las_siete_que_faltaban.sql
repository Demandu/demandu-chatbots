-- ═══════════════════════════════════════════════════════════════════════════
-- SIETE FUNCIONES MÁS QUE SE SALTAN EL RLS Y NO PREGUNTABAN DE QUIÉN ERAN.
--
-- Continuación directa de la 0114. Allí se cerraron cuatro (`buscar_conocimiento`,
-- `calificar_contacto`, `elegir_por_etiqueta`, `puedo_llamar`). Esta cierra las
-- siete que quedaban, encontradas al revisar las 71 funciones `security definer`
-- del esquema `public` una por una.
--
-- El recuento de la revisión completa: 71 funciones, 35 alcanzables solo con la
-- llave de servicio (no se pueden llamar desde el navegador), 20 que ya
-- comprobaban, 9 de disparador (Postgres se niega a llamarlas por RPC — está
-- probado abajo), y estas 7 abiertas.
--
-- ── LO QUE DEJABA CADA UNA ────────────────────────────────────────────────
--
-- `emitir_evento`      — meter eventos FALSOS en los webhooks de otro negocio.
--                        Su Zoho, su CRM, su hoja de cálculo reciben "pedido
--                        pagado" de un pedido que no existe.
-- `poner_etiqueta`     — etiquetar los contactos de otro negocio. Y como las
--                        etiquetas mueven el embudo y disparan automatismos, es
--                        mover su operación desde fuera.
-- `guardar_origen`     — escribir el origen (utm) en los contactos Y en las
--                        conversaciones de otro negocio: falsear de dónde le
--                        vienen sus clientes.
-- `crm_elegir_agente`  — la peor de las siete, porque estaba concedida a
--                        `anon`: SIN INICIAR SESIÓN devolvía el identificador
--                        de un agente del equipo de cualquier negocio y, de
--                        paso, movía su turno de reparto (`ultimo_member_id`),
--                        descuadrando a quién le toca el siguiente chat.
-- `cancelar_esperas_de`— cancelar los seguimientos programados de una
--                        conversación ajena: los mensajes de "¿sigues ahí?" y
--                        los recordatorios dejan de salir y nadie se entera.
-- `tomar_turno_...`    — apropiarse del turno de respuesta privada de un
--                        comentario de Instagram ajeno. El motor del dueño ve
--                        que "ya está tomado" y NO contesta: su lead se pierde
--                        en silencio.
-- `anotar_paso_...`    — falsificar el registro de asistencia del equipo de
--                        Demandu. No cruza datos de clientes, pero es una
--                        escritura con un identificador que nadie comprobaba.
--
-- ── EL CANDADO ES EL MISMO DE LA 0114 ─────────────────────────────────────
--
--     if auth.uid() is not null and p_org not in (select auth_org_ids()) then
--       raise exception 'sin acceso a esa organización';
--     end if;
--
-- La clave sigue siendo `auth.uid() is not null`. TODOS los que llaman de
-- verdad a estas siete lo hacen con la llave de servicio —se comprobó uno por
-- uno en `src/` y en `supabase/functions/`: `createAdminClient()` en
-- `src/lib/salidas.ts`, `src/lib/ai/herramientas.ts`, `src/lib/flow/webRuntime.ts`,
-- `src/lib/equipo/asistencia.ts`, `src/app/api/webhooks/instagram/route.ts`, y
-- `ctx.db` en `supabase/functions/whatsapp/index.ts`— o desde disparadores de la
-- propia base, donde el `org_id` es el de la fila que se está tocando. En todos
-- esos casos `auth.uid()` es nulo y el candado no se entera.
--
-- Muerde en un solo caso: alguien CON SESIÓN pidiendo una organización que no es
-- la suya. Que es exactamente el ataque.
--
-- ── DOS QUE NO LLEVAN CANDADO SINO REVOCACIÓN ─────────────────────────────
--
-- `cancelar_esperas_de` no recibe `org_id`: recibe la conversación. El candado
-- no puede comparar contra nada, así que DERIVA la organización de la
-- conversación y la compara. Es el patrón correcto cuando el identificador que
-- llega no es el de la organización.
--
-- `limpiar_mensajes_vistos` no tiene a quien comprobar —no recibe nada— pero
-- estaba concedida a `authenticated` sin que la llame NADIE: ni el código, ni
-- `cron.job`. La 0056 la revocó de `public` y `anon` y se dejó a `authenticated`
-- por descuido. Superficie que no sirve para nada: se quita.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. emitir_evento ──────────────────────────────────────────────────────
create or replace function public.emitir_evento(p_org_id uuid, p_tipo text, p_payload jsonb)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cuantos int := 0;
begin
  if p_org_id is null or coalesce(btrim(p_tipo), '') = '' then return 0; end if;

  -- EL CANDADO — quién llama. Ver la cabecera de esta migración y la 0114.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  insert into public.eventos_salientes (org_id, salida_id, tipo, payload)
  select p_org_id, s.id, p_tipo, coalesce(p_payload, '{}'::jsonb)
    from public.salidas s
   where s.org_id = p_org_id and s.activa
     and (cardinality(s.eventos) = 0 or p_tipo = any (s.eventos));

  get diagnostics v_cuantos = row_count;

  perform public.crm_evento_mueve_tarjeta(p_org_id, p_tipo, coalesce(p_payload, '{}'::jsonb));

  return v_cuantos;
end;
$function$;

-- ── 2. poner_etiqueta ─────────────────────────────────────────────────────
create or replace function public.poner_etiqueta(p_org_id uuid, p_contact_id uuid, p_etiqueta text)
returns text[]
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_grupo     text;
  v_hermanas  text[];
  v_tags      text[];
begin
  -- EL CANDADO — quién llama.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select t.grupo into v_grupo
  from public.tags t
  where t.org_id = p_org_id and t.name = p_etiqueta;

  if not found then
    raise exception 'La etiqueta % no existe en esta organizacion', p_etiqueta
      using errcode = 'no_data_found';
  end if;

  if v_grupo is null then
    v_hermanas := array[]::text[];
  else
    select coalesce(array_agg(t.name), array[]::text[]) into v_hermanas
    from public.tags t
    where t.org_id = p_org_id and t.grupo = v_grupo and t.name <> p_etiqueta;
  end if;

  update public.contacts c
     set tags = (
       select array_agg(distinct x)
       from unnest(
         array_append(
           array(select y from unnest(coalesce(c.tags, array[]::text[])) y
                 where y <> all (v_hermanas)),
           p_etiqueta
         )
       ) x
     )
   where c.id = p_contact_id and c.org_id = p_org_id
  returning c.tags into v_tags;

  if not found then
    raise exception 'No encuentro esa ficha en esta organizacion'
      using errcode = 'no_data_found';
  end if;

  return v_tags;
end;
$function$;

-- ── 3. guardar_origen ─────────────────────────────────────────────────────
create or replace function public.guardar_origen(p_org_id uuid, p_contact_id uuid, p_conversation_id uuid, p_origen jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_primero jsonb;
begin
  if p_origen is null or p_origen = 'null'::jsonb then return null; end if;

  -- EL CANDADO — quién llama.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  update public.contacts c
     set origen = coalesce(c.origen, p_origen)
   where c.id = p_contact_id and c.org_id = p_org_id
  returning c.origen into v_primero;

  if p_conversation_id is not null then
    update public.conversations
       set origen = p_origen
     where id = p_conversation_id and org_id = p_org_id;
  end if;

  return v_primero;
end
$function$;

-- ── 4. crm_elegir_agente ──────────────────────────────────────────────────
-- Además del candado: se le quita el EXECUTE a PUBLIC y a `anon`. Era la única
-- de las siete que se podía llamar SIN INICIAR SESIÓN.
--
-- Quitárselo a `anon` y a `authenticated` no rompe el reparto: quien la llama
-- de verdad es el disparador `crm_repartir`, que es `security definer` de
-- `postgres` — dentro de él el usuario efectivo es `postgres`, que conserva el
-- permiso. Y `crm_repartir_pendientes` (el reloj) corre con la llave de servicio.
create or replace function public.crm_elegir_agente(p_org uuid, p_excluir uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s assignment_settings%rowtype;
  elegido uuid;
  u_creado timestamptz;
  u_id uuid;
begin
  -- EL CANDADO — quién llama.
  if auth.uid() is not null and p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select * into s from assignment_settings where org_id = p_org;
  if s.org_id is null or not s.enabled then return null; end if;
  if s.solo_horario and not org_en_horario(p_org) then return null; end if;

  select created_at, id into u_creado, u_id from team_members where id = s.ultimo_member_id;
  u_creado := coalesce(u_creado, '-infinity'::timestamptz);
  u_id := coalesce(u_id, '00000000-0000-0000-0000-000000000000'::uuid);

  with candidatos as (
    select tm.id, tm.created_at,
           (select count(*) from conversations c
             where c.assignee_member_id = tm.id
               and c.status in ('open','pending','assigned')) as abiertas
      from team_members tm
     where tm.org_id = p_org
       and tm.available
       and (p_excluir is null or tm.id <> p_excluir)
       and (s.team_id is null or tm.team_id = s.team_id)
       and (
         not s.solo_en_linea
         or (tm.last_seen_at is not null
             and tm.last_seen_at > now() - make_interval(mins => greatest(1, s.minutos_en_linea)))
       )
  ),
  libres as (
    select * from candidatos
     where s.max_abiertas is null or abiertas < s.max_abiertas
  )
  select id into elegido from libres
   order by
     case when s.strategy = 'menos_carga' then abiertas else 0 end asc,
     case when s.strategy = 'rueda' and (created_at, id) > (u_creado, u_id) then 0 else 1 end asc,
     created_at asc, id asc
   limit 1;

  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
       and (p_excluir is null or tm.id <> p_excluir)
       and (s.team_id is null or tm.team_id = s.team_id)
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
       and (p_excluir is null or tm.id <> p_excluir)
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  -- Si el UNICO del equipo es el que la soltaba, se la devolvemos: un chat con
  -- dueno repetido es mejor que un chat de nadie.
  if elegido is null and p_excluir is not null then
    select tm.id into elegido from team_members tm
     where tm.id = p_excluir and tm.org_id = p_org;
  end if;

  if elegido is not null then
    update assignment_settings set ultimo_member_id = elegido, updated_at = now() where org_id = p_org;
  end if;
  return elegido;
end $function$;

revoke execute on function public.crm_elegir_agente(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.crm_elegir_agente(uuid, uuid) to service_role;

-- ── 5. cancelar_esperas_de ────────────────────────────────────────────────
-- NO recibe `org_id`, así que el candado no tiene contra qué comparar: DERIVA
-- la organización de la conversación. Pasa de `sql` a `plpgsql` para poder
-- lanzar la excepción.
create or replace function public.cancelar_esperas_de(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_cuantas int := 0;
begin
  if p_conversation_id is null then return 0; end if;

  -- EL CANDADO — quién llama. Aquí la organización se saca de la conversación.
  if auth.uid() is not null and not exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and c.org_id in (select auth_org_ids())
  ) then
    raise exception 'sin acceso a esa conversación';
  end if;

  with tocadas as (
    update public.esperas_pendientes
       set estado = 'cancelada', updated_at = now(),
           detalle = 'el lead escribio antes de que venciera la espera'
     where conversation_id = p_conversation_id and estado in ('pendiente', 'enviada')
    returning 1
  )
  select count(*)::int into v_cuantas from tocadas;

  return v_cuantas;
end
$function$;

-- ── 6. tomar_turno_respuesta_privada ──────────────────────────────────────
create or replace function public.tomar_turno_respuesta_privada(p_org_id uuid, p_ig_user_id text, p_comment_id text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  -- EL CANDADO — quién llama. Sin esto se le podía robar el turno a otro
  -- negocio y su respuesta privada de Instagram no salía nunca.
  if auth.uid() is not null and p_org_id not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  insert into public.ig_respuestas_privadas (comment_id, org_id, ig_user_id)
  values (p_comment_id, p_org_id, p_ig_user_id);
  return true;
exception when unique_violation then
  return false;
end $function$;

-- ── 7. anotar_paso_del_equipo ─────────────────────────────────────────────
-- Aquí el identificador no es una organización sino una persona, así que el
-- candado compara contra `auth.uid()` directamente: con sesión, solo puedes
-- anotar tu propio paso.
create or replace function public.anotar_paso_del_equipo(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if p_user_id is null then return; end if;

  -- EL CANDADO — quién llama.
  if auth.uid() is not null and p_user_id is distinct from auth.uid() then
    raise exception 'solo puedes anotar tu propio paso';
  end if;

  if not exists (select 1 from public.equipo_demandu where user_id = p_user_id) then
    return;
  end if;

  insert into public.accesos_del_equipo (user_id, dia)
  values (p_user_id, (now() at time zone 'utc')::date)
  on conflict (user_id, dia) do update
    set ultima_at = now(),
        visitas = public.accesos_del_equipo.visitas + 1;
end;
$function$;

-- ── 8. limpiar_mensajes_vistos: superficie que no usa nadie ───────────────
-- No la llama ni el código ni `cron.job`. La 0056 la revocó de `public` y
-- `anon` y se dejó a `authenticated` por descuido.
revoke execute on function public.limpiar_mensajes_vistos() from public, anon, authenticated;
grant  execute on function public.limpiar_mensajes_vistos() to service_role;

