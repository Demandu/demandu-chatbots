-- ===========================================================================
-- PRUEBAS DE LA BASE DE DATOS
--
-- Cubren lo que no se puede probar sin Postgres: el aislamiento entre
-- clientes y el conteo de consumos (lo que se le cobra a cada quien).
--
-- CÓMO SE CORRE: pégalo completo en el editor SQL de Supabase.
-- Crea datos de mentira, comprueba, los borra y termina con un ERROR a
-- propósito — ese error ES el resultado. No deja nada guardado.
-- ===========================================================================
do $$
declare
  org_a uuid; org_b uuid; bot_a uuid; bot_b uuid; cont uuid; conv uuid;
  usr_a uuid; n int; v text; u record; r text := '';
  flw uuid; st_gana uuid; st_pierde uuid; tm uuid; res jsonb;
  cont_b uuid; conv_b uuid;
  t0 timestamptz := now() - interval '3 hours';
  v_emb vector(1024) := array_fill(0.1::real, array[1024])::vector;
begin
  -- ── Dos clientes ficticios ────────────────────────────────────────────
  insert into organizations (name, slug) values ('ZZ_PRUEBA_A','zz-prueba-a') returning id into org_a;
  insert into organizations (name, slug) values ('ZZ_PRUEBA_B','zz-prueba-b') returning id into org_b;
  insert into bots (org_id, name, channel) values (org_a,'ZZ bot A','whatsapp') returning id into bot_a;
  insert into bots (org_id, name, channel) values (org_b,'ZZ bot B','whatsapp') returning id into bot_b;

  insert into bot_knowledge (org_id, bot_id, title, content, embedding)
    values (org_a, bot_a, 'Secreto A', 'el precio secreto de A es 999', v_emb);
  insert into bot_knowledge (org_id, bot_id, title, content, embedding)
    values (org_b, bot_b, 'Secreto B', 'el precio secreto de B es 111', v_emb);

  -- ── 1. El conocimiento no se puede colgar del chatbot de otro cliente ──
  begin
    insert into bot_knowledge (org_id, bot_id, title, content) values (org_a, bot_b, 'Intruso','no debe entrar');
    v := 'FALLO(se permitio)';
  exception when others then v := 'OK'; end;
  r := r || E'\n 1. Conocimiento cruzado entre chatbots ......... ' || v;

  -- ── 2. Buscar el conocimiento de otro cliente no devuelve nada ────────
  select count(*) into n from match_bot_knowledge(org_a, bot_b, v_emb, 5);
  r := r || E'\n 2. Buscar el RAG ajeno (A pidiendo el de B) .... ' || case when n=0 then 'OK' else 'FUGA('||n||')' end;

  select count(*) into n from match_bot_knowledge(org_b, bot_a, v_emb, 5);
  r := r || E'\n 3. Lo mismo al reves (B pidiendo el de A) ...... ' || case when n=0 then 'OK' else 'FUGA('||n||')' end;

  select count(*) into n from match_bot_knowledge(org_a, bot_a, v_emb, 5);
  r := r || E'\n 4. El RAG propio SI responde ................... ' || case when n=1 then 'OK' else 'FALLO('||n||')' end;

  -- ── 5. La busqueda por palabras clave tampoco cruza clientes ──────────
  select count(*) into n from bot_knowledge
   where org_id = org_a and bot_id = bot_b and enabled
     and search @@ websearch_to_tsquery('spanish','precio secreto');
  r := r || E'\n 5. Busqueda por palabras, del ajeno ............ ' || case when n=0 then 'OK' else 'FUGA('||n||')' end;

  -- ── 6-7. Los atajos de respuestas rapidas ─────────────────────────────
  insert into quick_replies (org_id, shortcut, title, body) values (org_a,'hola','A','x');
  begin
    insert into quick_replies (org_id, shortcut, title, body) values (org_a,'HOLA','A2','y');
    v := 'FALLO(permitio duplicado)';
  exception when others then v := 'OK'; end;
  r := r || E'\n 6. Atajo repetido en el mismo cliente .......... ' || v;

  begin
    insert into quick_replies (org_id, shortcut, title, body) values (org_b,'hola','B','z');
    v := 'OK';
  exception when others then v := 'FALLO(lo bloqueo)'; end;
  r := r || E'\n 7. Mismo atajo en OTRO cliente (debe poder) .... ' || v;

  -- ── 8. Un usuario no ve el consumo de otra organizacion ───────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'zz_prueba@demandu.test','x', now(), now(), now())
    returning id into usr_a;
  insert into memberships (user_id, org_id, role) values (usr_a, org_a, 'owner');

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);
  select count(*) into n from org_usage(org_b);
  perform set_config('role','postgres', true);
  r := r || E'\n 8. Ver el consumo de otro cliente .............. ' || case when n=0 then 'OK(vacio)' else 'FUGA' end;

  -- ── 8a-8d. buscar_conocimiento no se puede llamar por el de otro ──────
  --
  -- Es `security definer`, o sea que el RLS no la vigila: el candado de
  -- auth_org_ids es lo unico que hay. Y devuelve lo que el cliente cargo para
  -- que su bot sepa contestar — sus precios y sus guiones, su producto.
  --
  -- 8a es el ataque: una cuenta cualquiera pidiendo el conocimiento de otro.
  --    Comprobado contra la base ANTES de poner el candado: devolvia 1. Esta
  --    prueba se ha visto roja, que es la unica forma de saber que sirve.
  -- 8b comprueba que el candado no rompio lo bueno.
  -- 8c es como entran los dos motores (llave de servicio, sin auth.uid()): si
  --    el candado los cortara, el bot dejaria de saber contestar a todo el mundo.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);

  begin
    select count(*) into n from buscar_conocimiento(org_b, bot_b, 'precio', 5);
    v := 'FUGA(devolvio '||n||')';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n 8a. Sesion de A pidiendo el RAG de B ........... ' || v;

  begin
    select count(*) into n from buscar_conocimiento(org_a, bot_a, 'precio', 5);
    v := case when n=1 then 'OK' else 'FALLO(devolvio '||n||')' end;
  exception when others then v := 'FALLO(corto lo suyo)'; end;
  r := r || E'\n 8b. Sesion de A pidiendo LO SUYO (debe ir) ..... ' || v;

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);

  begin
    select count(*) into n from buscar_conocimiento(org_b, bot_b, 'precio', 5);
    v := case when n=1 then 'OK' else 'FALLO(devolvio '||n||')' end;
  exception when others then v := 'FALLO(corto al motor)'; end;
  r := r || E'\n 8c. El motor (sin sesion) SI puede buscar ...... ' || v;

  -- ── 9-10. Que se le cobra al cliente ──────────────────────────────────
  insert into contacts (org_id, name, phone, channel) values (org_a,'ZZ lead','5210000000009','whatsapp') returning id into cont;
  insert into conversations (org_id, contact_id, bot_id, channel, status) values (org_a, cont, bot_a,'whatsapp','open') returning id into conv;

  insert into messages (conversation_id, org_id, direction, sender, body, payload)
    select conv, org_a,'outbound','bot','ok '||g,'{}'::jsonb from generate_series(1,3) g;
  insert into messages (conversation_id, org_id, direction, sender, body, payload)  -- rechazados por Meta
    select conv, org_a,'outbound','bot','falla '||g,
           jsonb_build_object('no_entregado', jsonb_build_object('motivo','prueba','code',131037))
    from generate_series(1,2) g;
  insert into messages (conversation_id, org_id, direction, sender, body, payload)  -- entrantes, nunca se cobran
    select conv, org_a,'inbound','contact','in '||g,'{}'::jsonb from generate_series(1,4) g;

  select * into u from org_usage(org_a);
  r := r || E'\n 9. Solo se cobran los entregados (espera 3) .... ' || case when u.messages_used=3 then 'OK' else 'FALLO('||u.messages_used||')' end;

  insert into usage_events (org_id, bot_id, kind, quantity) values (org_a, bot_a,'ai_message',1);
  select * into u from org_usage(org_a);
  r := r || E'\n10. Una respuesta de IA pesa 3 (espera 5) ....... ' || case when u.messages_used=5 then 'OK' else 'FALLO('||u.messages_used||')' end;


  -- ── 11-16. La pantalla de Resultados ──────────────────────────────────
  insert into flows (org_id, bot_id, name, trigger_type, graph)
    values (org_a, bot_a, 'Bienvenida', 'welcome', '{}') returning id into flw;
  insert into conversation_states (org_id, name, color, sort, outcome)
    values (org_a, 'Ganada', '#3DDC97', 1, 'ganado') returning id into st_gana;
  insert into conversation_states (org_id, name, color, sort, outcome)
    values (org_a, 'Perdida', '#FF6B6B', 2, 'perdido') returning id into st_pierde;
  insert into teams (org_id, name) values (org_a, 'Ventas');
  insert into team_members (org_id, name, email) values (org_a, 'ZZ Ana', 'zz_ana@demandu.test') returning id into tm;
  update conversations set state_id = st_gana, assignee_member_id = tm where id = conv;

  -- Recorridos: uno completado, uno que se fue a una persona
  insert into flow_runs (org_id, conversation_id, bot_id, flow_id, flow_name, channel, ended_at, ended_reason, steps)
    values (org_a, conv, bot_a, flw, 'Bienvenida', 'whatsapp', now(), 'completado', 5);
  insert into flow_runs (org_id, conversation_id, bot_id, flow_id, flow_name, channel, ended_at, ended_reason, steps)
    values (org_a, conv, bot_a, flw, 'Bienvenida', 'whatsapp', now(), 'agente', 3);

  -- Conversación con el bot metido en medio: el tiempo de respuesta debe
  -- medir a la PERSONA, no al bot que contesta al instante.
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'inbound', 'contact', 'hola', t0);
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'outbound', 'bot', 'soy Lana', t0 + interval '1 second');
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'outbound', 'agent', 'te ayudo', t0 + interval '120 seconds');
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'inbound', 'contact', 'cuanto cuesta', t0 + interval '10 minutes');
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'outbound', 'agent', '1000', t0 + interval '15 minutes');
  insert into messages (conversation_id, org_id, direction, sender, body, created_at)
    values (conv, org_a, 'outbound', 'agent', 'mas IVA', t0 + interval '16 minutes');

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);

  res := analytics_overview(org_a, now() - interval '7 days', now() + interval '1 day', 'day', null, null, 'America/Mexico_City');
  r := r || E'\n11. Tiempo de respuesta: ignora al bot (210 s) ' || coalesce(res->'respuesta'->>'mediana_seg','null');
  r := r || E'\n12. Dos mensajes seguidos = 1 respuesta (2) .... ' || coalesce(res->'respuesta'->>'respuestas','null');
  r := r || E'\n13. Efectividad por flujo (espera 50) .......... ' || coalesce(res->'por_flujo'->0->>'efectividad','null');

  begin
    res := analytics_overview(org_b, now() - interval '7 days', now() + interval '1 day','day',null,null,'UTC');
    v := 'FUGA(devolvio datos ajenos)';
  exception when others then v := 'OK'; end;
  r := r || E'\n14. Pedir los numeros de OTRO cliente .......... ' || v;

  begin
    res := analytics_overview(org_a, now() - interval '7 days', now(), 'DROP TABLE', null, null, 'UTC');
    v := 'FALLO(acepto agrupacion inventada)';
  exception when others then v := 'OK'; end;
  r := r || E'\n15. Agrupacion inventada ...................... ' || v;

  begin
    res := analytics_overview(org_a, now() - interval '7 days', now() + interval '1 day','day',null,null,'Marte/Olympus');
    v := case when res->'meta'->>'tz' = 'UTC' then 'OK(cae a UTC)' else 'FALLO' end;
  exception when others then v := 'FALLO(se cayo la pantalla)'; end;
  r := r || E'\n16. Zona horaria inventada .................... ' || v;

  select count(*) into n from flow_runs where org_id = org_b;
  r := r || E'\n17. Recorridos de otro cliente visibles ....... ' || case when n=0 then 'OK' else 'FUGA('||n||')' end;
  perform set_config('role','postgres', true);

  -- ── 18-20. El contador de "sin leer" ──────────────────────────────────
  -- Es lo que dispara TODOS los avisos: si no sube, no hay tarjeta, ni sonido,
  -- ni contador en la pestaña, por muy bien que esté la parte visual.
  insert into messages (conversation_id, org_id, direction, sender, body)
    values (conv, org_a,'inbound','contact','oye, sigues ahi?');
  select unread into n from conversations where id = conv;
  r := r || E'\n18. Un entrante sube el contador .............. ' || case when n>0 then 'OK('||n||')' else 'FALLO(0)' end;

  insert into messages (conversation_id, org_id, direction, sender, body)
    values (conv, org_a,'outbound','bot','soy Lana');
  select unread into n from conversations where id = conv;
  r := r || E'\n19. Que conteste el BOT no lo marca leido ...... ' || case when n>0 then 'OK' else 'FALLO(se limpio)' end;

  insert into messages (conversation_id, org_id, direction, sender, body)
    values (conv, org_a,'outbound','agent','aqui estoy');
  select unread into n from conversations where id = conv;
  r := r || E'\n20. Que conteste una PERSONA si lo limpia ...... ' || case when n=0 then 'OK' else 'FALLO('||n||')' end;

  -- ── 21. Borrar un cliente no deja restos ──────────────────────────────
  delete from organizations where id = org_a;
  select count(*) into n from bot_knowledge where org_id = org_a;
  select n + (select count(*) from messages where org_id = org_a)
           + (select count(*) from flow_runs where org_id = org_a) into n;
  r := r || E'\n21. Borrar un cliente no deja restos ........... ' || case when n=0 then 'OK' else 'FALLO('||n||')' end;

  -- ── 22-23. Proteccion general ─────────────────────────────────────────
  select coalesce(string_agg(c.relname, ', '), 'ninguna') into v
    from pg_class c
    join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='org_id' and a.attnum>0
   where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  r := r || E'\n22. Tablas de cliente sin proteccion ........... ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  select coalesce(string_agg(p.proname, ', '), 'ninguna') into v
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public'
     and p.proname in ('drip_tick','drip_dispatch','drip_enroll','drip_reconcile','bump_quick_reply',
                       'is_platform_admin','auth_org_ids','org_usage','org_storage_used_bytes',
                       'org_storage_limit_bytes','drip_interval','match_bot_knowledge','analytics_overview',
                       'crm_enganchar_conversacion','crm_estado_desde_etapa','crm_registrar_evento',
                       'crm_board','crm_mover_tarjeta','crm_etapa_a_conversacion','conv_contar_no_leidos',
                       'conv_asignar_bot')
     and has_function_privilege('anon', p.oid, 'execute');
  r := r || E'\n23. Funciones internas abiertas a visitantes ... ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  -- ── 24. El candado de la 0130: siete funciones mas ───────────────────
  -- Las cuatro de la 0114 se prueban arriba (8a, 8e, 8f). Estas son las que
  -- se cerraron en la 0130. Cada una recibia un identificador y no miraba de
  -- quien era. Ver claude/candado-en-las-funciones-definer.md.
  insert into salidas (org_id, nombre, url, secreto) values (org_b,'ZZ salida B','https://b.test/h','s');
  insert into contacts (org_id, name, phone, channel) values (org_b,'ZZ de B','5210000000077','whatsapp') returning id into cont_b;
  insert into conversations (org_id, contact_id, bot_id, channel, status)
    values (org_b, cont_b, bot_b,'whatsapp','open') returning id into conv_b;
  insert into tags (org_id, name) values (org_b,'zz-vip-b');
  insert into esperas_pendientes (org_id, conversation_id, nodo_id, ejecutar_at)
    values (org_b, conv_b,'n1', now()+interval '1 hour');
  insert into team_members (org_id, name, email, available, last_seen_at)
    values (org_b,'ZZ Ag B','zz_ab@demandu.test', true, now());
  insert into assignment_settings (org_id, enabled, solo_en_linea) values (org_b, true, false);

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);

  begin perform emitir_evento(org_b,'pedido.pagado','{}'::jsonb); v := 'FUGA(encolo en el webhook de B)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24a. emitir_evento en la org ajena ............. ' || v;

  begin perform poner_etiqueta(org_b, cont_b,'zz-vip-b'); v := 'FUGA(etiqueto ajeno)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24b. poner_etiqueta en contacto ajeno .......... ' || v;

  begin perform guardar_origen(org_b, cont_b, conv_b,'{"utm_source":"zz"}'::jsonb); v := 'FUGA(escribio ajeno)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24c. guardar_origen en contacto ajeno .......... ' || v;

  begin perform crm_elegir_agente(org_b, null); v := 'FUGA(revelo agente de B)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24d. crm_elegir_agente de la org ajena ......... ' || v;

  begin perform cancelar_esperas_de(conv_b); v := 'FUGA(cancelo seguimientos de B)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24e. cancelar_esperas_de conversacion ajena .... ' || v;

  begin perform tomar_turno_respuesta_privada(org_b,'ig','zz-com-b'); v := 'FUGA(le robo el turno)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24f. tomar_turno_respuesta_privada ajeno ....... ' || v;

  begin perform anotar_paso_del_equipo(gen_random_uuid()); v := 'FUGA(anoto por otro)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n24g. anotar_paso_del_equipo de otro usuario .... ' || v;

  -- Y LO IMPORTANTE: que el motor siga pudiendo. Si el candado cortara a
  -- quien llama con la llave de servicio, el bot dejaria de funcionar para
  -- TODOS los clientes a la vez. Esa es la forma de romper esto.
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);

  begin
    select emitir_evento(org_b,'pedido.pagado','{}'::jsonb) into n;
    v := case when n=1 then 'OK' else 'FALLO(encolo '||n||')' end;
  exception when others then v := 'FALLO(corto al motor)'; end;
  r := r || E'\n24h. El motor SI puede emitir en cualquier org . ' || v;

  begin perform poner_etiqueta(org_b, cont_b,'zz-vip-b'); v := 'OK';
  exception when others then v := 'FALLO(corto al motor)'; end;
  r := r || E'\n24i. El motor SI puede etiquetar ............... ' || v;

  begin
    select cancelar_esperas_de(conv_b) into n;
    v := case when n=1 then 'OK' else 'FALLO(cancelo '||n||')' end;
  exception when others then v := 'FALLO(corto al motor)'; end;
  r := r || E'\n24j. El motor SI puede cancelar esperas ........ ' || v;

  -- ── 25. Y NINGUNA definer nueva se cuela sin comprobar ───────────────
  -- Es el trinquete de estatico.mjs, pero contra la base de verdad: una
  -- funcion que se salta el RLS, esta concedida a quien tiene cuenta, recibe
  -- parametros y no mira de quien son los datos. Asi nacieron las ocho.
  select coalesce(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', ', '), 'ninguna')
    into v
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public'
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and pg_get_function_identity_arguments(p.oid) <> ''
     and (has_function_privilege('anon', p.oid,'execute') or has_function_privilege('authenticated', p.oid,'execute'))
     and pg_get_functiondef(p.oid) !~* 'auth_org_ids|auth\.uid\s*\(|auth_puede\s*\(';
  r := r || E'\n25. Definer abiertas que no comprueban ........ ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  -- == 26. UN VISITANTE SIN CUENTA NO SE LLEVA IDENTIFICADORES ==========
  -- El escaparate publico es la unica superficie anonima del producto. Que
  -- exista no da derecho a repartir las llaves del negocio: con un `org_id` y
  -- un `bot_id` en la mano, varias funciones y tablas dejan de ser anonimas.
  --
  -- La regla no mira los GRANT por si solos: casi todas las tablas conceden
  -- columnas a `anon` por el reparto por defecto de Supabase, y lo que las
  -- protege es el RLS. Mira lo que importa: de lo que un visitante PUEDE
  -- LEER de verdad, que no salga ningun identificador.
  perform set_config('role','anon', true);
  perform set_config('request.jwt.claims','', true);
  declare
    tb record; cn bigint; fugas text := '';
  begin
    for tb in select c.relname from pg_class c
                join pg_namespace ns2 on ns2.oid = c.relnamespace
               where ns2.nspname = 'public' and c.relkind = 'r'
               order by c.relname
    loop
      begin
        execute format('select count(*) from public.%I', tb.relname) into cn;
        if cn > 0 then
          begin
            execute format('select org_id from public.%I limit 1', tb.relname);
            fugas := fugas || tb.relname || '.org_id ';
          exception when others then null; end;
          begin
            execute format('select bot_id from public.%I limit 1', tb.relname);
            fugas := fugas || tb.relname || '.bot_id ';
          exception when others then null; end;
        end if;
      exception when others then null;
      end;
    end loop;
    v := case when fugas = '' then 'OK' else 'FALLO: ' || fugas end;
  end;
  perform set_config('role','postgres', true);
  r := r || E'\n26. Un visitante no se lleva identificadores ... ' || v;

  -- == 27. UNA TABLA SIN POLITICAS TAMPOCO REPARTE PERMISOS ============
  -- Con RLS activo y cero politicas, Postgres deniega: los GRANT no sirven
  -- de nada... hasta el dia que alguien anade una politica «para probar» o
  -- apaga el RLS un momento. Entonces los permisos que quedaron sueltos
  -- deciden, y `correos_enviados` tenia DELETE y TRUNCATE para `anon`.
  --
  -- Las otras diez tablas iguales no tienen ningun GRANT. Esta regla exige
  -- que sigan siendo doce de doce.
  select coalesce(string_agg(distinct s.relname || '.' || tp.grantee, ', '), 'ninguna')
    into v
  from (
    select c.relname from pg_class c
      join pg_namespace ns3 on ns3.oid = c.relnamespace
     where ns3.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and not exists (
         select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname)
  ) s
  join information_schema.role_table_grants tp
    on tp.table_name = s.relname
   and tp.table_schema = 'public'
   and tp.grantee in ('anon','authenticated');
  r := r || E'\n27. Tabla sin politicas con permisos sueltos .. '
         || case when v = 'ninguna' then 'OK' else 'FALLO: ' || v end;

  -- == 28. CADA MIGRACION APLICADA VIVE EN EL REPOSITORIO ==============
  -- El 19 de septiembre se aplicaron cuatro migraciones a produccion desde
  -- la herramienta, sin archivo en `supabase/migrations/`. La base quedo
  -- bien y el repositorio quedo mintiendo: cualquiera que clonara y montara
  -- una base nueva tendria otra cosa. Eso es H-05 con cara de descuido.
  --
  -- El repositorio nombra sus archivos `NNNN_lo_que_hace.sql`, y la
  -- herramienta guarda como nombre el que se le pasa. Asi que una migracion
  -- aplicada SIN el numero delante es, casi siempre, una que se aplico a
  -- mano y nunca se escribio.
  --
  -- SE MIRA DESDE LA ULTIMA DEL INCIDENTE, no antes. Las cuatro de ese dia
  -- (20260919191951 a 20260919201842) tienen su archivo desde entonces
  -- —0133 a 0136— pero el nombre con que se aplicaron ya no se puede
  -- cambiar, y dejarlas dentro tendria esta regla roja para siempre. Una
  -- regla que siempre esta roja es una regla que nadie mira.
  select coalesce(string_agg(name, ', ' order by version), 'ninguna') into v
    from supabase_migrations.schema_migrations
   where version > '20260919201842'
     and name !~ '^[0-9]{4}_';
  r := r || E'\n28. Migracion aplicada sin su numero .......... '
         || case when v = 'ninguna' then 'OK'
                 else 'FALLO (aplicadas a mano, comprueba que tengan archivo): ' || v end;

  -- == 29. LINEA BASE DE PERMISOS DE LAS FUNCIONES PRIVILEGIADAS (H-09) =
  --
  -- El trinquete de `estatico.mjs` vigila el CODIGO de las 71 funciones
  -- `security definer`: que comprueben de que cuenta es quien llama. Lo que
  -- nadie vigilaba era la otra mitad, el GRANT — a quien se le deja
  -- ejecutarlas. Una funcion impecable concedida a `anon` sigue siendo una
  -- puerta.
  --
  -- MEDIDO HOY, y sale bien: de las 71, `anon` puede ejecutar 8. SEIS de esas
  -- ocho devuelven `trigger`, o sea que no se pueden llamar desde fuera
  -- (PostgREST no expone una funcion de disparador; Postgres tampoco exige el
  -- permiso para que un disparador se dispare). Las otras dos —`auth_tiene` y
  -- `org_features_mias`— SI se pueden llamar, y las dos comprueban quien
  -- llama: sin sesion devuelven falso o vacio.
  --
  -- Las ocho estan abiertas porque nadie revoco el permiso de PUBLIC, que es
  -- el que trae Postgres de serie. No se toca aqui: revocarselo a `auth_tiene`
  -- podria hacer que una politica de RLS falle con «permission denied» en vez
  -- de con «false», y eso tumbaria el escaparate publico. Queda propuesto,
  -- medido y con esta regla encima.
  --
  -- LO QUE ESTA REGLA IMPIDE: que manana nazca una funcion definer que
  -- devuelva datos y quede al alcance de un visitante sin que nadie lo note.
  declare
    n_anon int; abiertas text; sin_comprobar text;
  begin
    -- (a) Cuantas puede ejecutar un visitante. El numero no sube.
    select count(*) into n_anon
      from pg_proc p join pg_namespace ns4 on ns4.oid = p.pronamespace
     where ns4.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE');

    -- (b) Y de esas, cuales NO son de disparador: esas son las que de verdad
    --     se pueden llamar desde internet.
    select coalesce(string_agg(p.proname, ', ' order by p.proname), 'ninguna')
      into abiertas
      from pg_proc p join pg_namespace ns5 on ns5.oid = p.pronamespace
     where ns5.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and pg_get_function_result(p.oid) <> 'trigger';

    -- (c) Las dos que si se pueden llamar TIENEN que seguir comprobando.
    --     Quitarles la comprobacion sin tocar el grant es como se convierte
    --     una funcion segura en una fuga sin cambiar ni un permiso.
    select coalesce(string_agg(p.proname, ', ' order by p.proname), 'ninguna')
      into sin_comprobar
      from pg_proc p join pg_namespace ns6 on ns6.oid = p.pronamespace
     where ns6.nspname = 'public' and p.prosecdef
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and pg_get_function_result(p.oid) <> 'trigger'
       and pg_get_functiondef(p.oid) !~* 'auth_org_ids|auth\.uid|auth_puede|auth_tiene';

    r := r || E'\n29a. Definer al alcance de un visitante ........ '
           || case when n_anon <= 8 then 'OK (' || n_anon || ' de 71)'
                   else 'FALLO: subio a ' || n_anon || ', eran 8' end;
    r := r || E'\n29b. Y de esas, llamables de verdad ........... '
           || case when abiertas = 'auth_tiene, org_features_mias' then 'OK (las 2 de siempre)'
                   else 'FALLO: ' || abiertas end;
    r := r || E'\n29c. Las llamables siguen comprobando ......... '
           || case when sin_comprobar = 'ninguna' then 'OK'
                   else 'FALLO (ejecutables sin sesion y sin comprobar): ' || sin_comprobar end;
  end;

  -- == 30. UN CHATBOT NO SE PRESTA ENTRE CUENTAS (1.3) =================
  -- Un usuario con sesion de su cuenta podia apuntar SU canal al chatbot de
  -- otro negocio: la politica de RLS mira el `org_id` de la fila, y ese no
  -- cambia. Desde el siguiente mensaje, el motor ejecutaba los flujos del
  -- competidor por el numero de quien atacaba.
  --
  -- Lo cierra la migracion 0138 con claves foraneas COMPUESTAS
  -- `(org_id, bot_id) -> bots(org_id, id)`: el par tiene que existir, asi que
  -- un chatbot ajeno junto a tu organizacion no es una fila que exista.
  --
  -- SE VIGILA QUE SIGAN AHI, no que el codigo se acuerde de comprobar. Esa es
  -- toda la gracia de haberlo puesto en la base: el mismo descuido aparecio
  -- tres veces en sitios distintos.
  select coalesce(string_agg(t.tabla, ', ' order by t.tabla), 'ninguna') into v
    from (values ('whatsapp_channels'), ('instagram_channels'), ('flows'),
                 ('ai_configs'), ('bot_knowledge')) as t(tabla)
   where not exists (
     select 1 from pg_constraint c
     where c.conrelid = ('public.' || t.tabla)::regclass
       and c.contype = 'f'
       and c.confrelid = 'public.bots'::regclass
       and array_length(c.conkey, 1) = 2);
  r := r || E'\n30a. Claves compuestas org_id+bot_id ........... '
         || case when v = 'ninguna' then 'OK (las 5)'
                 else 'FALLO, les falta a: ' || v end;

  -- Y la unica que las hace posibles.
  select count(*) into n from pg_constraint
   where conrelid = 'public.bots'::regclass and contype = 'u'
     and array_length(conkey, 1) = 2;
  r := r || E'\n30b. Y el par unico en `bots` que las sostiene . '
         || case when n >= 1 then 'OK' else 'FALLO: sin el, las de arriba no existen' end;

  -- Limpieza y salida (el ERROR es a proposito: deshace todo)
  delete from memberships where user_id = usr_a;
  delete from auth.users where id = usr_a;
  delete from organizations where id in (org_a, org_b);
  raise exception E'\n===== RESULTADO =====%\n', r;
end $$;
