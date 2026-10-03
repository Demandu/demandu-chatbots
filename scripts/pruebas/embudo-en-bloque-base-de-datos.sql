-- ===========================================================================
-- PRUEBAS DE MOVER VARIAS TARJETAS DEL EMBUDO A LA VEZ
--
-- Cubren lo que no se puede probar sin Postgres: que la etapa se escriba en la
-- tarjeta Y en su conversación, que a la que ya estaba en esa etapa no se le
-- escriba, que «Ganada» cierre la venta de verdad, que las movidas caigan al
-- final de la columna, y que no se toque ni una fila de otra cuenta.
--
-- SE CORRE COMO LA PERSONA, NO COMO EL SERVIDOR: se ponen las credenciales de
-- sesión de un usuario real para que el RLS vigile igual que en la pantalla.
--
-- CÓMO SE CORRE: pégalo completo en el editor SQL de Supabase.
-- Crea datos de mentira, comprueba y termina con un ERROR a propósito — ese
-- error ES el resultado. No deja nada guardado.
--
-- Los identificadores de abajo son de Demandu LLC y de CertifiedPrime. Si se
-- cambian las cuentas de prueba, hay que cambiarlos aquí.
-- ===========================================================================
do $prueba$
declare
  org   uuid := '8237d99a-054b-4a75-bd4a-a0e978a9f017';  -- Demandu LLC
  usr   uuid := 'a2c6371d-d872-44cf-b42c-4032478dfe8e';  -- su dueño
  otra  uuid := '332d0ac2-183f-48d8-8ba3-60c3d84e85ce';  -- CertifiedPrime
  tubo  uuid := 'd3df52e1-c6c5-4dc5-acc8-8785bf9ddb08';
  e_abierta uuid := 'c9fae881-7617-42e8-a46f-1f43476564e8';
  e_proceso uuid := '2fd906ea-2bd0-43b3-b82f-9601f4dbd328';
  e_ganada  uuid := '68cb9182-f184-445c-9dea-05352d77073f';
  c1 uuid; c2 uuid; c3 uuid; c4 uuid;
  o1 uuid; o2 uuid; o3 uuid; o4 uuid;
  tubo_otra uuid; etapa_otra uuid; c_otra uuid; o_otra uuid; etapa_otra_antes uuid;
  n int; m int; v text; r text := '';
  sort_max double precision; sort_min_movidas double precision;
  eventos_despues int;
begin
  -- Cuatro tarjetas nuestras: tres en «Abierta» y una YA en «En proceso».
  insert into contacts (org_id, channel, name) values (org,'whatsapp','ZZ Uno')   returning id into c1;
  insert into contacts (org_id, channel, name) values (org,'whatsapp','ZZ Dos')   returning id into c2;
  insert into contacts (org_id, channel, name) values (org,'whatsapp','ZZ Tres')  returning id into c3;
  insert into contacts (org_id, channel, name) values (org,'whatsapp','ZZ Cuatro') returning id into c4;

  insert into opportunities (org_id, pipeline_id, stage_id, contact_id, title, sort)
    values (org, tubo, e_abierta, c1, 'ZZ 1', 10) returning id into o1;
  insert into opportunities (org_id, pipeline_id, stage_id, contact_id, title, sort)
    values (org, tubo, e_abierta, c2, 'ZZ 2', 11) returning id into o2;
  insert into opportunities (org_id, pipeline_id, stage_id, contact_id, title, sort)
    values (org, tubo, e_abierta, c3, 'ZZ 3', 12) returning id into o3;
  insert into opportunities (org_id, pipeline_id, stage_id, contact_id, title, sort)
    values (org, tubo, e_proceso, c4, 'ZZ 4', 13) returning id into o4;

  insert into conversations (org_id, contact_id, channel, status, state_id, opportunity_id)
    values (org,c1,'whatsapp','open',e_abierta,o1),
           (org,c2,'whatsapp','open',e_abierta,o2),
           (org,c3,'whatsapp','open',e_abierta,o3),
           (org,c4,'whatsapp','open',e_proceso,o4);

  -- Y una tarjeta de OTRA cuenta, que no se puede tocar.
  insert into pipelines (org_id, name, is_default) values (otra,'ZZ Tubo otro', false) returning id into tubo_otra;
  insert into conversation_states (org_id, pipeline_id, name, color, sort, outcome)
    values (otra, tubo_otra, 'ZZ Etapa otra', '#888', 1, 'abierto') returning id into etapa_otra;
  insert into contacts (org_id, channel, name) values (otra,'whatsapp','ZZ Ajeno') returning id into c_otra;
  insert into opportunities (org_id, pipeline_id, stage_id, contact_id, title)
    values (otra, tubo_otra, etapa_otra, c_otra, 'ZZ ajena') returning id into o_otra;
  etapa_otra_antes := etapa_otra;

  select max(sort) into sort_max from opportunities where org_id = org and stage_id = e_proceso;

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);

  -- Lo que hace `etapaEnBloque`: solo las que CAMBIAN, y al final de la columna.
  update conversations set state_id = e_proceso
   where org_id = org and opportunity_id in (o1,o2,o3,o4)
     and coalesce(state_id::text,'') <> e_proceso::text;
  select count(*) into n from conversations where opportunity_id in (o1,o2,o3) and state_id = e_proceso;

  update opportunities set stage_id = e_proceso, pipeline_id = tubo, sort = coalesce(sort_max,0) + 1
   where org_id = org and id in (o1,o2,o3,o4) and coalesce(stage_id::text,'') <> e_proceso::text;
  select count(*) into m from opportunities where id in (o1,o2,o3) and stage_id = e_proceso;

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);

  r := r || E'\n 1. 3 tarjetas movidas (la 4a ya estaba) ....... '
         || case when m = 3 then 'OK' else 'FALLO (dijo '||m||')' end;
  r := r || E'\n 2. y sus 3 conversaciones ..................... '
         || case when n = 3 then 'OK' else 'FALLO (dijo '||n||')' end;

  -- A la que ya estaba no se le escribió: su historial no creció. Si creciera,
  -- cada movida en bloque ensuciaría la medición de cuánto dura cada etapa.
  select count(*) into eventos_despues from opportunity_events
   where opportunity_id = o4 and kind = 'cambio_etapa';
  r := r || E'\n 3. a la que ya estaba NO se le escribió ....... '
         || case when eventos_despues = 0 then 'OK' else 'FALLO ('||eventos_despues||' eventos)' end;

  select min(sort) into sort_min_movidas from opportunities where id in (o1,o2,o3);
  r := r || E'\n 4. van al FINAL de la columna ................. '
         || case when sort_min_movidas > coalesce(sort_max,0) then 'OK'
                 else 'FALLO ('||sort_min_movidas||' <= '||coalesce(sort_max,0)||')' end;

  -- Mover a «Ganada» no es cambiar de columna: CIERRA la venta.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  update opportunities set stage_id = e_ganada, pipeline_id = tubo
   where org_id = org and id in (o1,o2) and coalesce(stage_id::text,'') <> e_ganada::text;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);

  select count(*) into n from opportunities
   where id in (o1,o2) and status = 'ganada' and closed_at is not null;
  r := r || E'\n 5. «Ganada» pone estado y fecha de cierre ..... '
         || case when n = 2 then 'OK' else 'FALLO (dijo '||n||')' end;

  select count(*) into n from opportunity_events
   where opportunity_id in (o1,o2) and kind = 'cambio_etapa';
  r := r || E'\n 6. y queda en el historial .................... '
         || case when n >= 2 then 'OK ('||n||')' else 'FALLO (dijo '||n||')' end;

  select stage_id::text into v from opportunities where id = o_otra;
  r := r || E'\n 7. 0 filas de otra cuenta tocadas ............. '
         || case when v = etapa_otra_antes::text then 'OK' else 'FUGA (quedó en '||v||')' end;

  -- Y que el RLS corta de verdad si alguien lo intenta a mano, sin el filtro
  -- de `org_id` de la acción.
  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr, 'role','authenticated')::text, true);
  update opportunities set stage_id = e_proceso where id = o_otra;
  get diagnostics n = row_count;
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);
  r := r || E'\n 8. RLS corta el intento a mano sobre la ajena .. '
         || case when n = 0 then 'OK' else 'FUGA (actualizó '||n||')' end;

  -- El ERROR es a proposito: deshace todo.
  raise exception E'\n===== RESULTADO =====%\n', r;
end $prueba$;
