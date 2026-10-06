-- Baja de un cliente: exportar, borrar, y dejar constancia.
--
-- LO QUE SE LE PROMETE AL CLIENTE, PALABRA POR PALABRA:
--   «Borramos todos tus datos de operación. Conservamos únicamente tus
--    registros de facturación, porque la ley nos obliga.»
--
-- Este archivo tiene que hacer que esa frase sea CIERTA. Si borra de menos,
-- le mentimos. Si borra de más, nos quedamos sin poder facturar ni declarar.

/* ─────────────────────────────────────────────────────────────────────────────
 * El registro de bajas (churn)
 *
 * GUARDA DATOS DEL CLIENTE, NUNCA DATOS DE SUS CLIENTES. Los teléfonos de los
 * leads de una tienda no dicen nada sobre por qué esa tienda se fue, y
 * conservarlos después de prometer que se borran sería exactamente la mentira
 * que este archivo existe para evitar.
 * ───────────────────────────────────────────────────────────────────────────── */
create table if not exists bajas (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete set null,
  -- Copiados aquí a propósito: si algún día se borra la organización, el
  -- registro de la baja tiene que seguir contando la historia por sí solo.
  negocio text,
  correo_facturacion text,
  plan_code text,
  precio_mensual numeric,
  alta_at timestamptz,
  cancelacion_at timestamptz not null default now(),
  meses_activo integer,
  motivo text,
  comentario text,
  -- Si además pidió borrar todo, y cuándo.
  borro_datos boolean not null default false,
  borrado_at timestamptz,
  -- El texto EXACTO que aceptó, guardado tal cual. Si algún día hay una
  -- discusión, lo que vale es lo que él leyó, no lo que hoy dice la pantalla.
  consentimiento_texto text,
  consentimiento_por text,
  consentimiento_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bajas_fecha on bajas (cancelacion_at desc);

alter table bajas enable row level security;
-- Solo el equipo de Demandu. Un cliente no tiene por qué leer el registro de
-- bajas de nadie, ni el suyo.
revoke all on bajas from public, anon, authenticated;
grant select, insert, update on bajas to service_role;

alter table organizations
  add column if not exists datos_borrados_at timestamptz,
  -- Cuándo se purga sola si nunca aprieta el botón. Se fija al terminar el
  -- periodo pagado, no al cancelar: mientras pagó, sus datos son suyos.
  add column if not exists purga_programada_at timestamptz,
  add column if not exists motivo_cancelacion text;

/* ─────────────────────────────────────────────────────────────────────────────
 * El borrado
 *
 * SE DESCUBRE SOLO CUÁLES SON LAS TABLAS. Recorre `information_schema` buscando
 * todo lo que tenga `org_id` en vez de llevar una lista escrita a mano.
 *
 * Es la diferencia entre una promesa que se cumple sola y una que caduca: con
 * una lista fija, la primera tabla nueva que alguien agregue queda fuera del
 * borrado y nadie se entera hasta que es un problema. Así, una tabla nueva
 * queda cubierta el día que nace.
 *
 * EL ORDEN LO RESUELVE A EMPUJONES, no adivinando dependencias: intenta borrar
 * todas, y las que fallen por tener hijos las reintenta en la vuelta siguiente.
 * Cuando una vuelta entera no logra borrar nada, se detiene. Es simple y no hay
 * que mantener un mapa de llaves foráneas que se desactualiza.
 * ───────────────────────────────────────────────────────────────────────────── */
create or replace function purgar_datos_de_org(p_org_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Lo que NO se toca, y por qué cada uno:
  --   billing_events, usage_events → son la base de lo que se le cobró.
  --   org_addons                   → qué contrató. Registro de facturación.
  --   memberships                  → para que pueda seguir entrando a su cuenta
  --                                   vacía, ver sus facturas y volver si quiere.
  --   plans                        → su plan a la medida se desactiva más abajo,
  --                                   no se borra: tiene un producto en Stripe.
  conservar text[] := array['billing_events','usage_events','org_addons','memberships','plans'];
  pendientes text[];
  restantes text[];
  t text;
  borradas jsonb := '{}'::jsonb;
  n bigint;
  vuelta int := 0;
  avanzo boolean;
begin
  select array_agg(c.table_name::text order by c.table_name)
    into pendientes
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
   where c.table_schema = 'public'
     and c.column_name = 'org_id'
     and tb.table_type = 'BASE TABLE'
     and not (c.table_name = any(conservar));

  if pendientes is null then
    return jsonb_build_object('ok', true, 'tablas', 0);
  end if;

  -- Como mucho tantas vueltas como tablas: con eso cualquier cadena de
  -- dependencias razonable queda resuelta, y no puede quedarse en bucle.
  while array_length(pendientes, 1) > 0 and vuelta < 20 loop
    vuelta := vuelta + 1;
    avanzo := false;
    restantes := array[]::text[];

    foreach t in array pendientes loop
      begin
        execute format('delete from public.%I where org_id = $1', t) using p_org_id;
        get diagnostics n = row_count;
        borradas := borradas || jsonb_build_object(t, n);
        avanzo := true;
      exception
        when foreign_key_violation then
          -- Tiene hijos que aún no se han borrado. A la siguiente vuelta.
          restantes := restantes || t;
      end;
    end loop;

    pendientes := restantes;
    -- Una vuelta entera sin borrar nada significa que lo que queda no se puede
    -- borrar por dependencias. Mejor parar y avisar que girar para siempre.
    exit when not avanzo;
  end loop;

  -- Su plan a la medida se apaga. No se borra: tiene un producto vivo en
  -- Stripe y borrar la fila dejaría ese producto huérfano.
  update plans set active = false where org_id = p_org_id;

  update organizations
     set datos_borrados_at = now(),
         purga_programada_at = null,
         estado_cobro = 'cancelada'
   where id = p_org_id;

  return jsonb_build_object(
    'ok', array_length(pendientes, 1) is null or array_length(pendientes, 1) = 0,
    'borradas', borradas,
    'no_se_pudo', coalesce(to_jsonb(pendientes), '[]'::jsonb)
  );
end;
$$;

-- Esto lo llama el servidor y nadie más. Un cliente NO puede dispararlo
-- directamente: pasa por una acción que primero comprueba quién es, que tenga
-- permiso de plan, y que haya escrito el nombre de su negocio.
revoke execute on function purgar_datos_de_org(uuid) from public, anon, authenticated;
grant execute on function purgar_datos_de_org(uuid) to service_role;
