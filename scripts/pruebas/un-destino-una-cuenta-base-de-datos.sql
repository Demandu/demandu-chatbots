-- ════════════════════════════════════════════════════════════════════════════
-- UN DESTINO RECIBE LOS AVISOS DE UNA SOLA CUENTA — contra la base real.
--
-- Se pega entero en el editor SQL de Supabase. CORRIDO Y EN VERDE el 6 oct 2026.
--
-- Termina con `raise exception` a propósito: ese error ES el resultado, y
-- deshace la transacción entera. Las salidas de mentira no quedan.
-- ════════════════════════════════════════════════════════════════════════════

do $$
declare
  v_a uuid; v_b uuid; v_s1 uuid; v_s2 uuid; v_choco boolean;
begin
  select id into v_a from public.organizations where name = 'Casas Pacíficas';
  select id into v_b from public.organizations where name = 'Demandu LLC';
  if v_a is null or v_b is null then raise exception 'No encuentro las dos cuentas de la prueba'; end if;

  -- La cuenta A conecta su CRM.
  insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
  values (v_a, 'PRUEBA destino A', 'https://example.com/prueba-destino-unico', 'solo-para-la-prueba',
          array['lead.nuevo'], true)
  returning id into v_s1;

  -- ── 1) OTRA cuenta no puede apuntar al mismo destino ──────────────────────
  v_choco := false;
  begin
    insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
    values (v_b, 'PRUEBA destino B', 'https://example.com/prueba-destino-unico', 'solo-para-la-prueba',
            array['lead.nuevo'], true);
  exception when unique_violation then
    v_choco := true;
  end;
  if not v_choco then
    raise exception 'FALLA 1: dos cuentas distintas pueden mandar al mismo destino — asi acabo un lead de Demandu en el CRM de Casas Pacificas';
  end if;

  -- ── 2) Ni la MISMA cuenta dos veces: seria entregar cada aviso por duplicado
  v_choco := false;
  begin
    insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
    values (v_a, 'PRUEBA destino A bis', 'https://example.com/prueba-destino-unico', 'solo-para-la-prueba',
            array['lead.datos'], true);
  exception when unique_violation then
    v_choco := true;
  end;
  if not v_choco then
    raise exception 'FALLA 2: la misma cuenta puede tener dos salidas activas al mismo destino';
  end if;

  -- ── 3) Apagada sí puede existir: una salida apagada no manda nada ─────────
  insert into public.salidas (org_id, nombre, url, secreto, eventos, activa)
  values (v_b, 'PRUEBA destino B apagada', 'https://example.com/prueba-destino-unico', 'solo-para-la-prueba',
          array['lead.nuevo'], false)
  returning id into v_s2;

  -- ── 4) …pero encenderla con el destino ocupado falla, y ese fallo es el aviso
  v_choco := false;
  begin
    update public.salidas set activa = true where id = v_s2;
  exception when unique_violation then
    v_choco := true;
  end;
  if not v_choco then
    raise exception 'FALLA 4: se pudo encender una salida apagada cuyo destino ya esta en uso';
  end if;

  -- ── 5) Si la primera se apaga, el destino queda libre para la otra ────────
  update public.salidas set activa = false where id = v_s1;
  update public.salidas set activa = true  where id = v_s2;

  raise exception 'LOS 5 PUNTOS EN OK — y nada de esto queda guardado';
end $$;

-- Después del bloque de arriba, esta consulta tiene que devolver cero.
select count(*) as salidas_basura from salidas where nombre like 'PRUEBA destino%';
