-- ===========================================================================
-- PRUEBAS DEL EMBUDO (CRM) CONTRA LA BASE REAL
--
-- Comprueban las tres reglas que sostienen todo el modelo:
--   1. La primera conversación de un contacto le crea su tarjeta.
--   2. Las siguientes NO la duplican.
--   3. Solo nace una tarjeta nueva cuando la anterior ya se ganó o se perdió.
-- Más el aislamiento entre clientes y que borrar no deje restos.
--
-- CÓMO SE CORRE: pégalo completo en el editor SQL de Supabase.
-- Crea datos de mentira, comprueba, los borra y termina con un ERROR a
-- propósito — ese error ES el resultado. No deja nada guardado.
-- ===========================================================================
do $$
declare
  org_a uuid; org_b uuid; bot_a uuid; usr_a uuid; cont uuid;
  conv1 uuid; conv2 uuid; op1 uuid; op2 uuid; pipe uuid;
  st_nuevo uuid; st_gana uuid; n int; v text; r text := ''; res jsonb;
begin
  -- ── Dos clientes ficticios ────────────────────────────────────────────
  insert into organizations (name, slug) values ('ZZ_CRM_A','zz-crm-a') returning id into org_a;
  insert into organizations (name, slug) values ('ZZ_CRM_B','zz-crm-b') returning id into org_b;
  insert into bots (org_id, name, channel) values (org_a,'Bot','whatsapp') returning id into bot_a;
  insert into pipelines (org_id, name, is_default) values (org_a,'Ventas',true) returning id into pipe;
  insert into pipelines (org_id, name, is_default) values (org_b,'Ventas',true);
  insert into conversation_states (org_id, pipeline_id, name, color, sort, outcome)
    values (org_a, pipe,'Nuevo','#3A85FF',1,'abierto') returning id into st_nuevo;
  insert into conversation_states (org_id, pipeline_id, name, color, sort, outcome)
    values (org_a, pipe,'Ganada','#3DDC97',9,'ganado') returning id into st_gana;

  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'zz_crm@demandu.test','x', now(), now(), now()) returning id into usr_a;
  insert into memberships (user_id, org_id, role) values (usr_a, org_a, 'owner');

  insert into contacts (org_id, name, phone, channel)
    values (org_a,'Lead Uno','5210000011','whatsapp') returning id into cont;

  -- ── 1-2. Las dos primeras reglas del modelo ───────────────────────────
  insert into conversations (org_id, contact_id, bot_id, channel, status)
    values (org_a, cont, bot_a,'whatsapp','open') returning id, opportunity_id into conv1, op1;
  r := r || E'\n 1. La 1a conversacion crea tarjeta ............ ' || case when op1 is not null then 'OK' else 'FALLO' end;

  insert into conversations (org_id, contact_id, bot_id, channel, status)
    values (org_a, cont, bot_a,'whatsapp','open') returning id, opportunity_id into conv2, op2;
  select count(*) into n from opportunities where org_id = org_a and contact_id = cont;
  r := r || E'\n 2. La 2a NO duplica la tarjeta (espera 1) ..... ' || n
         || case when op2 = op1 then ' OK' else ' FALLO(creo otra)' end;

  -- ── 3. El estado se deriva de la etapa, no se escribe a mano ──────────
  update opportunities set stage_id = st_gana where id = op1;
  select status into v from opportunities where id = op1;
  select count(*) into n from opportunities where id = op1 and closed_at is not null;
  r := r || E'\n 3. Mover a "Ganada" cierra la tarjeta ......... ' || v
         || case when n=1 then ' (con fecha) OK' else ' FALLO(sin fecha)' end;

  -- ── 4. Cerrar el chat NO cierra la venta ──────────────────────────────
  -- El agente cierra la conversacion cuando termino de atender; el dueno
  -- cierra la venta cuando cobro. Son cosas distintas.
  update conversations set status = 'closed' where id = conv1;
  select status into v from opportunities where id = op1;
  r := r || E'\n 4. Cerrar el chat no toca la tarjeta .......... ' || case when v='ganada' then 'OK' else 'FALLO' end;

  -- ── 5. Tercera regla: el cliente que vuelve SI genera tarjeta nueva ───
  insert into conversations (org_id, contact_id, bot_id, channel, status)
    values (org_a, cont, bot_a,'whatsapp','open') returning opportunity_id into op2;
  select count(*) into n from opportunities where org_id = org_a and contact_id = cont;
  r := r || E'\n 5. Cliente que vuelve = tarjeta nueva (2) ..... ' || n
         || case when op2 <> op1 then ' OK' else ' FALLO' end;

  -- ── 6. Historial de la tarjeta ────────────────────────────────────────
  select count(*) into n from opportunity_events where opportunity_id = op1;
  r := r || E'\n 6. Queda historial de la tarjeta (>=2) ........ ' || n || case when n>=2 then ' OK' else ' FALLO' end;

  -- ── 7-11. El tablero ──────────────────────────────────────────────────
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);

  res := crm_board(org_a);
  r := r || E'\n 7. Columnas del tablero (espera 2) ............ ' || jsonb_array_length(res->'columnas');
  r := r || E'\n 8. Tarjetas sin proximo paso (espera 1) ....... ' || (res->'resumen'->>'sin_proximo_paso');
  r := r || E'\n 9. Ganadas en el resumen (espera 1) ........... ' || (res->'resumen'->>'ganadas');

  insert into tasks (org_id, opportunity_id, title, due_at) values (org_a, op2,'Llamar', now() + interval '1 day');
  res := crm_board(org_a);
  r := r || E'\n10. Con tarea agendada, ya no alerta (0) ....... ' || (res->'resumen'->>'sin_proximo_paso');

  res := crm_mover_tarjeta(op2, st_gana);
  r := r || E'\n11. Arrastrar a "Ganada" la marca ganada ....... ' || (res->>'status');

  -- ── 12-14. Aislamiento entre clientes ─────────────────────────────────
  begin
    res := crm_mover_tarjeta(op2, (select id from conversation_states where org_id = org_b limit 1));
    v := 'FALLO(permitio)';
  exception when others then v := 'OK'; end;
  r := r || E'\n12. Mover a etapa de otro cliente .............. ' || v;

  begin
    res := crm_board(org_b);
    v := 'FUGA';
  exception when others then v := 'OK'; end;
  r := r || E'\n13. Pedir el tablero de otro cliente ........... ' || v;

  select count(*) into n from opportunities where org_id = org_b;
  r := r || E'\n14. Ver tarjetas de otro cliente ............... ' || case when n=0 then 'OK' else 'FUGA' end;
  perform set_config('role','postgres', true);

  -- ── 15. Borrar un cliente no deja restos ──────────────────────────────
  delete from organizations where id = org_a;
  select (select count(*) from opportunities where org_id = org_a)
       + (select count(*) from tasks where org_id = org_a)
       + (select count(*) from opportunity_events where org_id = org_a)
       + (select count(*) from pipelines where org_id = org_a) into n;
  r := r || E'\n15. Borrar el cliente no deja restos ........... ' || case when n=0 then 'OK' else 'FALLO('||n||')' end;

  -- Limpieza y salida (el ERROR es a proposito: deshace todo)
  delete from memberships where user_id = usr_a;
  delete from auth.users where id = usr_a;
  delete from organizations where id in (org_a, org_b);
  raise exception E'\n===== EMBUDO (CRM) =====%\n', r;
end $$;
