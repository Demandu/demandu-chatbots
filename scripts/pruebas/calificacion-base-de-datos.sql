-- ════════════════════════════════════════════════════════════════════════════
-- LO QUE VIAJA AL CRM CUANDO EL LEAD QUEDA CALIFICADO — contra la base real.
--
-- Se pega entero en el editor SQL de Supabase. CORRIDO Y EN VERDE el 6 oct 2026.
--
-- Termina con `raise exception` a propósito: ese error ES el resultado, y
-- deshace la transacción entera. El contacto y la salida de mentira que crea no
-- quedan en producción — se comprueba después con la consulta del final.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_org uuid; v_cont uuid; v_salida uuid; v_n int; v_p jsonb; v_claves int;
begin
  select id into v_org from public.organizations where name = 'Casas Pacíficas';
  if v_org is null then raise exception 'No encuentro la cuenta de la prueba'; end if;

  -- Una salida de mentira, para que el evento tenga dónde encolarse pase lo que
  -- pase: si la cuenta no tuviera ninguna activa, el 0 significaría otra cosa.
  insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
  values (v_org, 'PRUEBA calificado', 'https://example.com/prueba', 'solo-para-la-prueba',
          array['lead.calificado'], true)
  returning id into v_salida;

  -- Un contacto con LAS CUATRO ETIQUETAS DEL CASO REAL del 30 de septiembre.
  insert into public.contacts (org_id, name, phone, channel, external_id, tags, attributes)
  values (v_org, 'Prueba Calificacion', '50700000001', 'whatsapp', '50700000001',
          array['Abierta','Lead Alto','Panamá Oeste','Torres de España'],
          jsonb_build_object('zona_interes','Panamá Este','proyecto_interes','SM1',
                             'ingreso','1350','ingreso_familiar',''))
  returning id into v_cont;

  -- ── 1) Con una calificación puesta, sale UN evento ────────────────────────
  v_n := public.avisar_lead_calificado(v_org, v_cont, 'Cumple el perfil',
                                       '["Dijo: Panama Oeste"]'::jsonb, 'agente_ia');
  if v_n <> 1 then raise exception 'FALLA 1: encolo % salidas, esperaba 1', v_n; end if;

  select payload into v_p from public.eventos_salientes
   where salida_id = v_salida and tipo = 'lead.calificado' order by created_at desc limit 1;

  -- ── 2) La calificación va en su propio campo, no dentro de una lista ──────
  if v_p->>'calificacion' <> 'Lead Alto' then
    raise exception 'FALLA 2: calificacion = %', coalesce(v_p->>'calificacion','(nada)');
  end if;

  -- ── 3) NO viajan las etiquetas internas de Etapa, Zona ni Proyecto ────────
  if v_p::text like '%Abierta%' then raise exception 'FALLA 3: viajo una etiqueta de Etapa'; end if;
  if v_p::text like '%Torres de España%' then raise exception 'FALLA 3: viajo una etiqueta de Proyecto'; end if;
  if v_p ? 'etiquetas' then raise exception 'FALLA 3: sigue mandando la lista de etiquetas entera'; end if;

  -- ── 4) Los atributos: TODOS los definidos, y los huecos en null ───────────
  select count(*) into v_claves from public.custom_attributes where org_id = v_org;
  if (select count(*) from jsonb_object_keys(v_p->'atributos')) <> v_claves then
    raise exception 'FALLA 4: viajaron % atributos de % definidos',
      (select count(*) from jsonb_object_keys(v_p->'atributos')), v_claves;
  end if;
  if v_p->'atributos'->>'zona_interes' <> 'Panamá Este' then
    raise exception 'FALLA 4: la zona no viajo';
  end if;
  if jsonb_typeof(v_p->'atributos'->'ingreso_familiar') <> 'null' then
    raise exception 'FALLA 4: la cadena vacia no se convirtio en null';
  end if;
  if jsonb_typeof(v_p->'atributos'->'tipo_empleo') <> 'null' then
    raise exception 'FALLA 4: un atributo nunca preguntado tiene que viajar en null, no desaparecer';
  end if;

  -- ── 5) De quién habla ─────────────────────────────────────────────────────
  if v_p->>'telefono' <> '50700000001' or v_p->>'contacto_id' <> v_cont::text then
    raise exception 'FALLA 5: el CRM no sabe de quien le hablan';
  end if;

  -- ── 6) Un lead sin calificar NO manda nada ────────────────────────────────
  update public.contacts set tags = array['Abierta','Panamá Oeste'] where id = v_cont;
  v_n := public.avisar_lead_calificado(v_org, v_cont);
  if v_n <> 0 then raise exception 'FALLA 6: mando algo con el lead sin calificar (%)', v_n; end if;

  -- ── 7) Con dos calificaciones a la vez, tampoco ───────────────────────────
  update public.contacts set tags = array['Lead Alto','Lead Revisar'] where id = v_cont;
  v_n := public.avisar_lead_calificado(v_org, v_cont);
  if v_n <> 0 then raise exception 'FALLA 7: mando una calificacion habiendo dos puestas'; end if;

  raise exception 'LOS 7 PUNTOS EN OK — y nada de esto queda guardado';
end $$;

-- Después del bloque de arriba, esta consulta tiene que devolver tres ceros.
-- Si no, algo quedó en producción y hay que limpiarlo a mano.
select (select count(*) from contacts where name = 'Prueba Calificacion') as contactos_basura,
       (select count(*) from salidas  where nombre = 'PRUEBA calificado')  as salidas_basura,
       (select count(*) from eventos_salientes where tipo = 'lead.calificado'
         and payload->>'nombre' = 'Prueba Calificacion')                   as eventos_basura;
