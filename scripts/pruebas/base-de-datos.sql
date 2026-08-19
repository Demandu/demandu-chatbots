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

  -- ── 18. Borrar un cliente no deja restos ──────────────────────────────
  delete from organizations where id = org_a;
  select count(*) into n from bot_knowledge where org_id = org_a;
  select n + (select count(*) from messages where org_id = org_a)
           + (select count(*) from flow_runs where org_id = org_a) into n;
  r := r || E'\n18. Borrar un cliente no deja restos ........... ' || case when n=0 then 'OK' else 'FALLO('||n||')' end;

  -- ── 19-20. Proteccion general ─────────────────────────────────────────
  select coalesce(string_agg(c.relname, ', '), 'ninguna') into v
    from pg_class c
    join pg_namespace ns on ns.oid=c.relnamespace
    join pg_attribute a on a.attrelid=c.oid and a.attname='org_id' and a.attnum>0
   where ns.nspname='public' and c.relkind='r' and not c.relrowsecurity;
  r := r || E'\n19. Tablas de cliente sin proteccion ........... ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  select coalesce(string_agg(p.proname, ', '), 'ninguna') into v
    from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public'
     and p.proname in ('drip_tick','drip_dispatch','drip_enroll','drip_reconcile','bump_quick_reply',
                       'is_platform_admin','auth_org_ids','org_usage','org_storage_used_bytes',
                       'org_storage_limit_bytes','drip_interval','match_bot_knowledge','analytics_overview',
                       'crm_enganchar_conversacion','crm_estado_desde_etapa','crm_registrar_evento',
                       'crm_board','crm_mover_tarjeta','crm_etapa_a_conversacion')
     and has_function_privilege('anon', p.oid, 'execute');
  r := r || E'\n20. Funciones internas abiertas a visitantes ... ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  -- Limpieza y salida (el ERROR es a proposito: deshace todo)
  delete from memberships where user_id = usr_a;
  delete from auth.users where id = usr_a;
  delete from organizations where id in (org_a, org_b);
  raise exception E'\n===== RESULTADO =====%\n', r;
end $$;
