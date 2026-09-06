-- ===========================================================================
-- PRUEBAS DEL REPARTO AUTOMÁTICO CONTRA LA BASE REAL
--
-- Lo que se comprueba no es "que reparta" — eso es lo fácil — sino los tres
-- modificadores que lo hacen servir en la vida diaria:
--   · que NO le llegue a quien no está en línea o se marcó ausente,
--   · que elija al que menos carga trae, no al que le toca,
--   · que si nadie cumple espere en la cola en vez de asignar mal.
--
-- Y el caso que ya rompió la rueda una vez: varias personas dadas de alta en
-- la misma operación quedan con la MISMA fecha, y sin desempate por id la
-- rueda le daba siempre el chat a la misma.
--
-- CÓMO SE CORRE: pégalo completo en el editor SQL de Supabase.
-- Crea datos de mentira, comprueba, los borra y termina con un ERROR a
-- propósito — ese error ES el resultado. No deja nada guardado.
-- ===========================================================================
do $$
declare
  org_a uuid; org_b uuid; bot_a uuid; cont uuid; conv uuid; pipe uuid; st uuid;
  ana uuid; beto uuid; caro uuid; ajeno uuid;
  quien uuid; n int; v text := ''; r text := '';
begin
  insert into organizations (name, slug) values ('ZZ_REP_A','zz-rep-a') returning id into org_a;
  insert into organizations (name, slug) values ('ZZ_REP_B','zz-rep-b') returning id into org_b;
  insert into bots (org_id, name, channel) values (org_a,'Bot','whatsapp') returning id into bot_a;
  insert into pipelines (org_id, name, is_default) values (org_a,'V',true) returning id into pipe;
  insert into conversation_states (org_id, pipeline_id, name, color, sort, outcome)
    values (org_a, pipe,'Nuevo','#3A85FF',1,'abierto') returning id into st;

  -- Las tres en la MISMA operación: created_at idéntico, que es el caso difícil.
  insert into team_members (org_id, name, email, available, last_seen_at)
    values (org_a,'Ana','zz_a@demandu.test', true, now()) returning id into ana;
  insert into team_members (org_id, name, email, available, last_seen_at)
    values (org_a,'Beto','zz_b@demandu.test', true, now()) returning id into beto;
  insert into team_members (org_id, name, email, available, last_seen_at)
    values (org_a,'Caro','zz_c@demandu.test', true, now()) returning id into caro;
  insert into team_members (org_id, name, email, available, last_seen_at)
    values (org_b,'Ajeno','zz_x@demandu.test', true, now()) returning id into ajeno;

  insert into contacts (org_id, name, phone, channel)
    values (org_a,'Lead','5210000099','whatsapp') returning id into cont;

  -- ── 1. Apagado, no se toca nada ───────────────────────────────────────
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 1. Con el reparto apagado no asigna ........... ' || case when quien is null then 'OK' else 'FALLO' end;

  insert into assignment_settings (org_id, enabled, strategy, solo_en_linea, minutos_en_linea)
    values (org_a, true, 'menos_carga', true, 5);

  -- ── 2. Encendido, y nunca con gente de otro cliente ───────────────────
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning id, assignee_member_id into conv, quien;
  r := r || E'\n 2. Encendido si asigna, y del mismo cliente ... ' ||
       case when quien = ajeno then 'FUGA(agente de otro cliente)'
            when quien in (ana,beto,caro) then 'OK' else 'FALLO' end;

  -- ── 3. Al que MENOS carga trae ────────────────────────────────────────
  update conversations set assignee_member_id = ana where id = conv;
  insert into conversations (org_id, contact_id, bot_id, channel, status, assignee_member_id)
    select org_a, cont, bot_a,'whatsapp','open', ana from generate_series(1,3);
  insert into conversations (org_id, contact_id, bot_id, channel, status, assignee_member_id)
    select org_a, cont, bot_a,'whatsapp','open', beto from generate_series(1,2);
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 3. Elige al de menos carga (Caro) ............. ' || case when quien = caro then 'OK' else 'FALLO' end;

  -- ── 4. Fuera de línea no recibe ───────────────────────────────────────
  update team_members set last_seen_at = now() - interval '30 minutes' where org_id = org_a;
  update team_members set last_seen_at = now() where id = beto;
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 4. Solo al que esta en linea (Beto) ........... ' || case when quien = beto then 'OK' else 'FALLO' end;

  -- ── 5. Marcado como ausente tampoco ───────────────────────────────────
  update team_members set available = false where id = beto;
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 5. Si se marca ausente, no le llega ........... ' || case when quien is null then 'OK(a la cola)' else 'FALLO' end;

  -- ── 6. La cola se reparte sola al volver alguien ──────────────────────
  update team_members set available = true, last_seen_at = now() where id = caro;
  perform crm_repartir_pendientes();
  select count(*) into n from conversations
   where org_id = org_a and assignee_member_id is null and handoff_requested_at is not null;
  r := r || E'\n 6. La cola se reparte al volver alguien ....... ' || case when n = 0 then 'OK' else 'FALLO('||n||' sin dueno)' end;

  -- ── 7. Tope por persona ───────────────────────────────────────────────
  update team_members set available = true, last_seen_at = now() where org_id = org_a;
  update assignment_settings set max_abiertas = 1 where org_id = org_a;
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 7. Nadie por debajo del tope: a la cola ....... ' || case when quien is null then 'OK' else 'FALLO' end;
  update assignment_settings set max_abiertas = null where org_id = org_a;

  -- ── 8. No le quita el chat a quien ya lo tiene ────────────────────────
  update conversations set status = 'assigned' where id = conv;
  select assignee_member_id into quien from conversations where id = conv;
  r := r || E'\n 8. No reasigna lo que ya tiene dueno .......... ' || case when quien = ana then 'OK' else 'FALLO' end;

  -- ── 9. Fuera de horario espera ────────────────────────────────────────
  update assignment_settings set solo_horario = true where org_id = org_a;
  update organizations set business_hours = '{"mon":{"enabled":false},"tue":{"enabled":false},
    "wed":{"enabled":false},"thu":{"enabled":false},"fri":{"enabled":false},
    "sat":{"enabled":false},"sun":{"enabled":false}}'::jsonb where id = org_a;
  insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
    values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
  r := r || E'\n 9. Fuera de horario no asigna ................. ' || case when quien is null then 'OK' else 'FALLO' end;
  update assignment_settings set solo_horario = false where org_id = org_a;

  -- ── 10. La rueda rota aunque las fechas de alta sean iguales ──────────
  update assignment_settings set strategy = 'rueda', ultimo_member_id = null where org_id = org_a;
  delete from conversations where org_id = org_a;   -- para contar limpio
  for n in 1..7 loop
    insert into conversations (org_id, contact_id, bot_id, channel, status, handoff_requested_at)
      values (org_a, cont, bot_a,'whatsapp','open', now()) returning assignee_member_id into quien;
    v := v || case quien when ana then 'A' when beto then 'B' when caro then 'C' else '?' end;
  end loop;
  r := r || E'\n10. La rueda rota sin repetir .................. ' || v ||
       case when v in ('ABCABCA','ACBACBA','BACBACB','BCABCAB','CABCABC','CBACBAC') then ' OK' else ' FALLO' end;

  select max(c) into n from (
    select count(*) c from conversations
     where org_id = org_a and assignee_member_id is not null group by assignee_member_id) x;
  r := r || E'\n11. Nadie acapara (max 3 de 7) ................ ' || n || case when n <= 3 then ' OK' else ' FALLO' end;

  -- ── 12. Nada de esto se puede llamar desde fuera ──────────────────────
  select coalesce(string_agg(p.proname, ', '), 'ninguna') into v
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('crm_repartir','crm_elegir_agente','crm_repartir_pendientes')
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute'));
  r := r || E'\n12. Funciones del reparto abiertas ............ ' || case when v='ninguna' then 'OK' else 'FALLO: '||v end;

  delete from organizations where id in (org_a, org_b);
  raise exception E'\n===== REPARTO AUTOMATICO =====%\n', r;
end $$;
