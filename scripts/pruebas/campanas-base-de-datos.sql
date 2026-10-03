-- ===========================================================================
-- PRUEBAS DEL INFORME DE CAMPAÑAS (migración 0141)
--
-- Cubren lo que no se puede probar sin Postgres: que el informe cuente
-- PERSONAS y no filas, que el dinero de cada anuncio sea el que es, y que una
-- cuenta no pueda pedir el informe de otra.
--
-- CÓMO SE CORRE: pégalo completo en el editor SQL de Supabase.
-- Crea datos de mentira, comprueba, los borra y termina con un ERROR a
-- propósito — ese error ES el resultado. No deja nada guardado.
-- ===========================================================================
do $$
declare
  org_a uuid; org_b uuid; usr_a uuid; tienda uuid; tubo uuid;
  p1 uuid; p2 uuid; p3 uuid;
  res jsonb; fila jsonb; n int; v text; r text := '';
  hoy  timestamptz := now();
  ini  timestamptz := now() - interval '7 days';
  fin  timestamptz := now() + interval '1 day';
begin
  insert into organizations (name, slug) values ('ZZ_CAMP_A','zz-camp-a') returning id into org_a;
  insert into organizations (name, slug) values ('ZZ_CAMP_B','zz-camp-b') returning id into org_b;
  insert into tiendas (org_id, slug, nombre) values (org_a,'zz-camp-tienda','ZZ Tienda') returning id into tienda;
  insert into pipelines (org_id, name) values (org_a,'ZZ Tubo') returning id into tubo;

  -- ── PERSONA 1: llegó por el anuncio «VERANO», tiene TRES conversaciones ──
  --
  -- Es el caso que destapó el error de la vista vieja: `count(*)` después del
  -- `left join` la contaba tres veces. Una persona es una persona.
  insert into contacts (org_id, channel, name, origen)
    values (org_a,'whatsapp','ZZ Uno',
            '{"tipo":"ad","anuncio_id":"VERANO","titular":"Promo de verano","plataforma":"meta"}'::jsonb)
    returning id into p1;
  insert into conversations (org_id, contact_id, channel, status) values (org_a,p1,'whatsapp','open');
  insert into conversations (org_id, contact_id, channel, status) values (org_a,p1,'whatsapp','closed');
  insert into conversations (org_id, contact_id, channel, status, handoff_requested_at)
    values (org_a,p1,'whatsapp','pending', hoy);

  -- Compró 1400 (entregado y cobrado) y 600 contra entrega, y canceló 9000.
  insert into pedidos (org_id, tienda_id, numero, contacto_id, total, estado, pago)
    values (org_a, tienda, 9001, p1, 1400, 'entregado', 'pagado'),
           (org_a, tienda, 9002, p1,  600, 'recibido',  'sin_cobro'),
           (org_a, tienda, 9003, p1, 9000, 'cancelado', 'expirado');

  -- ── PERSONA 2: llegó por una campaña de Google con UTMs, no compró nada ──
  insert into contacts (org_id, channel, name, origen)
    values (org_a,'webchat','ZZ Dos',
            '{"tipo":"ad","anuncio_id":"GOOGLE-CASAS","titular":"Casas en venta","plataforma":"google",
              "utm":{"utm_source":"google","utm_medium":"cpc","utm_content":"anuncio-a"}}'::jsonb)
    returning id into p2;
  insert into conversations (org_id, contact_id, channel, status) values (org_a,p2,'webchat','open');

  -- ── PERSONA 3: mismo anuncio de Google, y SÍ cerró una oportunidad ──────
  insert into contacts (org_id, channel, name, origen)
    values (org_a,'webchat','ZZ Tres',
            '{"tipo":"ad","anuncio_id":"GOOGLE-CASAS","titular":"Casas en venta","plataforma":"google",
              "utm":{"utm_source":"google","utm_medium":"cpc","utm_content":"anuncio-b"}}'::jsonb)
    returning id into p3;
  insert into opportunities (org_id, pipeline_id, contact_id, title, value, status)
    values (org_a, tubo, p3, 'ZZ Casa', 50000, 'ganada'),
           (org_a, tubo, p3, 'ZZ Otra', 70000, 'abierta');

  -- ── UNA CONVERSACIÓN DE UN LEAD QUE VOLVIÓ POR OTRA CAMPAÑA ─────────────
  --
  -- Su contacto llegó por «VERANO», pero ESTA charla la disparó «NAVIDAD». Es
  -- la segunda campaña la que pagó por traerlo de vuelta.
  insert into conversations (org_id, contact_id, channel, status, origen)
    values (org_a, p1, 'whatsapp', 'open',
            '{"tipo":"ad","anuncio_id":"NAVIDAD","titular":"Promo navidad","plataforma":"meta"}'::jsonb);

  -- ── Quien mira el informe ──────────────────────────────────────────────
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
    values (gen_random_uuid(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated',
            'zz_camp@demandu.test','x', now(), now(), now())
    returning id into usr_a;
  insert into memberships (user_id, org_id, role) values (usr_a, org_a, 'owner');

  perform set_config('role','authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', usr_a, 'role','authenticated')::text, true);

  -- ── 1. Una cuenta NO puede pedir el informe de otra ────────────────────
  begin
    res := analytics_campanas(org_b, ini, fin);
    v := 'FUGA(se lo dio)';
  exception when others then v := 'OK(lo corto)'; end;
  r := r || E'\n 1. Pedir el informe de otro cliente ............ ' || v;

  res := analytics_campanas(org_a, ini, fin);
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims','', true);

  -- ── 2. Tres personas, tres leads (no cinco conversaciones) ─────────────
  n := (res->>'total_con_campana')::int;
  r := r || E'\n 2. Cuenta PERSONAS, no conversaciones ......... '
         || case when n = 3 then 'OK (3)' else 'FALLO(dijo '||n||', debían ser 3)' end;

  -- ── 3. El dinero de «VERANO»: 1400 + 600. Lo cancelado NO cuenta ───────
  --
  -- Y el de 600 es `sin_cobro` —contra entrega—: si solo contara lo que cobró
  -- Stripe, en esta región se escondería casi la mitad de las ventas.
  select x into fila from jsonb_array_elements(res->'por_campana') x
   where x->>'campana' = 'VERANO';
  r := r || E'\n 3. «VERANO»: suma lo vendido, no lo cancelado .. '
         || case when (fila->>'importe')::numeric = 2000
                 then 'OK (2000)'
                 else 'FALLO(dijo '||coalesce(fila->>'importe','nada')||', debían ser 2000)' end;

  -- ── 4. Y sus conversaciones son cuatro, su lead sigue siendo uno ───────
  r := r || E'\n 4. «VERANO»: 1 lead y sus conversaciones ...... '
         || case when (fila->>'leads')::int = 1
                 then 'OK (1 lead)'
                 else 'FALLO(dijo '||coalesce(fila->>'leads','nada')||' leads)' end;

  -- ── 5. «GOOGLE-CASAS»: dos leads y la oportunidad GANADA ───────────────
  --
  -- La abierta de 70000 no cuenta: todavía no es dinero.
  select x into fila from jsonb_array_elements(res->'por_campana') x
   where x->>'campana' = 'GOOGLE-CASAS';
  r := r || E'\n 5. «GOOGLE-CASAS»: 2 leads, solo lo ganado .... '
         || case when (fila->>'leads')::int = 2 and (fila->>'importe')::numeric = 50000
                 then 'OK (2 leads, 50000)'
                 else 'FALLO(dijo '||coalesce(fila->>'leads','?')||' leads y '
                      ||coalesce(fila->>'importe','?')||')' end;

  -- ── 6. Manda el dinero en el orden de la tabla ─────────────────────────
  r := r || E'\n 6. La tabla ordena por dinero ................. '
         || case when res->'por_campana'->0->>'campana' = 'GOOGLE-CASAS'
                 then 'OK' else 'FALLO(arriba salió '
                      ||coalesce(res->'por_campana'->0->>'campana','nada')||')' end;

  -- ── 7. La campaña que hizo VOLVER a alguien no desaparece ──────────────
  select count(*) into n from jsonb_array_elements(res->'volvieron') x
   where x->>'campana' = 'NAVIDAD';
  r := r || E'\n 7. La campaña del que volvió sale aparte ...... '
         || case when n = 1 then 'OK' else 'FALLO(se perdió NAVIDAD)' end;

  -- ── 8. El desglose por UTM ─────────────────────────────────────────────
  select count(*) into n from jsonb_array_elements(res->'por_medio') x
   where x->>'valor' = 'cpc' and (x->>'leads')::int = 2;
  r := r || E'\n 8. Desglosa por medio (cpc, 2 leads) .......... '
         || case when n = 1 then 'OK' else 'FALLO' end;

  select count(*) into n from jsonb_array_elements(res->'por_contenido') x;
  r := r || E'\n 9. Y separa los dos anuncios de la campaña .... '
         || case when n = 2 then 'OK (anuncio-a y anuncio-b)' else 'FALLO(dijo '||n||')' end;

  -- ── 10. La vista cuenta igual que el informe ───────────────────────────
  --
  -- ESTE es el error de la 0065: aquí decía 3 leads donde hay 1.
  select leads, conversaciones into n, v
    from leads_por_campana where org_id = org_a and anuncio_id = 'VERANO';
  r := r || E'\n10. La vista: 1 lead y 4 conversaciones ........ '
         || case when n = 1 and v = '4' then 'OK'
                 else 'FALLO(dijo '||n||' leads y '||coalesce(v,'?')||' conversaciones)' end;

  -- Limpieza y salida (el ERROR es a proposito: deshace todo)
  delete from memberships where user_id = usr_a;
  delete from auth.users where id = usr_a;
  delete from organizations where id in (org_a, org_b);
  raise exception E'\n===== RESULTADO =====%\n', r;
end $$;
