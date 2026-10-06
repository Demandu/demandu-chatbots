-- ════════════════════════════════════════════════════════════════════════════
-- UN LEAD ES NUEVO UNA SOLA VEZ — contra la base real.
--
-- Se pega entero en el editor SQL de Supabase. CORRIDO Y EN VERDE el 6 oct 2026.
--
-- Termina con `raise exception` a propósito: ese error ES el resultado, y
-- deshace la transacción entera. La ficha y la salida de mentira no quedan.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_org uuid; v_cont uuid; v_salida uuid; v_n int; v_eventos int;
begin
  select id into v_org from public.organizations where name = 'Demandu LLC';
  if v_org is null then raise exception 'No encuentro la cuenta de la prueba'; end if;

  insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
  values (v_org, 'PRUEBA lead nuevo', 'https://example.com/prueba', 'solo-para-la-prueba',
          array['lead.nuevo'], true)
  returning id into v_salida;

  insert into public.contacts (org_id, name, phone, channel, external_id)
  values (v_org, 'Prueba Lead Nuevo', '50700000002', 'whatsapp', '50700000002')
  returning id into v_cont;

  -- ── 1) Una ficha recién nacida no trae la marca puesta ─────────────────────
  if (select lead_nuevo_avisado_at from public.contacts where id = v_cont) is not null then
    raise exception 'FALLA 1: la ficha nace ya marcada y entonces nunca avisaria';
  end if;

  -- ── 2) El primer «Hola» avisa ──────────────────────────────────────────────
  v_n := public.emitir_evento(v_org, 'lead.nuevo',
           jsonb_build_object('contacto_id', v_cont, 'telefono', '50700000002', 'nombre', 'Prueba Lead Nuevo'));
  if v_n <> 1 then raise exception 'FALLA 2: el primer aviso encolo % salidas, esperaba 1', v_n; end if;

  -- ── 3) El segundo mensaje, seis segundos después, NO vuelve a avisar ───────
  v_n := public.emitir_evento(v_org, 'lead.nuevo',
           jsonb_build_object('contacto_id', v_cont, 'telefono', '50700000002', 'nombre', 'Prueba Lead Nuevo'));
  if v_n <> 0 then raise exception 'FALLA 3: el segundo mensaje volvio a presentar al lead como nuevo (%)', v_n; end if;

  select count(*) into v_eventos from public.eventos_salientes
   where salida_id = v_salida and tipo = 'lead.nuevo';
  if v_eventos <> 1 then raise exception 'FALLA 3: hay % eventos lead.nuevo en la cola, esperaba 1', v_eventos; end if;

  -- ── 4) La marca quedó puesta en la ficha ───────────────────────────────────
  if (select lead_nuevo_avisado_at from public.contacts where id = v_cont) is null then
    raise exception 'FALLA 4: aviso pero no dejo la marca; el siguiente motor volveria a avisar';
  end if;

  -- ── 5) Los demás eventos del mismo contacto siguen saliendo con normalidad ─
  update public.salidas set eventos = array['lead.nuevo', 'lead.datos'] where id = v_salida;
  v_n := public.emitir_evento(v_org, 'lead.datos',
           jsonb_build_object('contacto_id', v_cont, 'campo', 'ciudad', 'valor', 'Panamá'));
  if v_n <> 1 then raise exception 'FALLA 5: la marca de lead.nuevo frena otros eventos (%)', v_n; end if;

  -- ── 6) Las fichas que ya existían NO pueden volver a presentarse como nuevas
  if exists (select 1 from public.contacts
              where lead_nuevo_avisado_at is null and created_at < now() - interval '1 minute'
                and id <> v_cont) then
    raise exception 'FALLA 6: hay fichas viejas sin marca; un cambio de heuristica las avisaria como nuevas';
  end if;

  raise exception 'LOS 6 PUNTOS EN OK — y nada de esto queda guardado';
end $$;

-- Después del bloque de arriba, esta consulta tiene que devolver dos ceros.
select (select count(*) from contacts where name = 'Prueba Lead Nuevo')   as contactos_basura,
       (select count(*) from salidas  where nombre = 'PRUEBA lead nuevo') as salidas_basura;
