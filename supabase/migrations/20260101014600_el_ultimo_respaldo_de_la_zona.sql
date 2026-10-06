-- EL ÚLTIMO RESPALDO DE LA ZONA HORARIA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- La 0102 quitó el `not null default 'America/Mexico_City'` de
-- `organizations.timezone` y arregló los diez sitios del código que adivinaban.
-- QUEDABA UNO, y estaba dentro de la base: `org_en_horario`, en la 0016.
--
--     select coalesce(timezone, 'America/Mexico_City'), business_hours ...
--
-- ── POR QUÉ ESTE ERA EL PEOR DE LOS ONCE ──────────────────────────────────
--
-- Porque no ofrece horas: DECIDE SI TU NEGOCIO ESTÁ ABIERTO. La usa
-- `crm_elegir_agente` cuando el reparto tiene puesto «solo en horario». Con la
-- zona adivinada, un negocio de Panamá que abre a las 8 salía como CERRADO
-- hasta las 9 de la mañana — y lo único que se veía era que las conversaciones
-- de primera hora se quedaban sin asignar, sin error, sin aviso.
--
-- Es también el mismo negocio en dos estados a la vez: la agenda, ya arreglada,
-- decía «no sé tu zona, dímela»; el reparto, aquí, seguía dando por hecho que
-- era México. Según por dónde entrara, la misma cuenta se comportaba distinto.
--
-- ── QUÉ HACE AHORA CUANDO NO SE SABE LA ZONA ──────────────────────────────
--
-- Devuelve TRUE, que es lo mismo que ya hacía cuando no hay horario guardado
-- (`if horario is null then return true`). O sea: sin dato, el horario deja de
-- usarse como filtro y la conversación se reparte igual.
--
-- La otra opción —devolver false— es peor de una forma concreta: dejaría a un
-- negocio sin repartir NINGUNA conversación, todo el día, sin decir por qué.
-- Un agente que recibe una conversación fuera de hora la ve y la atiende
-- cuando puede; una conversación que nunca se asigna no la ve nadie.
--
-- La pantalla de Ajustes → Horario ya obliga a elegir zona antes de guardar
-- (ver `settings/hours`), así que esto es un respaldo, no el camino normal.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.org_en_horario(p_org uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  tz text; horario jsonb; dia text; ahora time; abre time; cierra time; d jsonb;
begin
  -- Es SECURITY DEFINER y recibe un org_id: sin este candado cualquiera con
  -- sesión podría preguntar el horario de otro cliente. El reparto la llama
  -- desde dentro de la base (donde auth.uid() es null), por eso ese caso pasa.
  if auth.uid() is not null and p_org not in (select auth_org_ids()) then
    raise exception 'sin acceso a esa organización';
  end if;

  select timezone, business_hours into tz, horario from organizations where id = p_org;

  -- SIN ZONA NO SE INVENTA UNA. Ver la nota de arriba: se deja de usar el
  -- horario como filtro, igual que cuando no hay horario guardado.
  if tz is null or btrim(tz) = '' then return true; end if;
  if horario is null then return true; end if;

  -- El día y la hora, en la zona del cliente (no en la del servidor).
  dia := lower(to_char(now() at time zone tz, 'dy'));
  ahora := (now() at time zone tz)::time;
  d := horario -> dia;

  if d is null or coalesce((d->>'enabled')::boolean, false) = false then return false; end if;

  abre := coalesce(nullif(d->>'open', ''), '00:00')::time;
  cierra := coalesce(nullif(d->>'close', ''), '23:59')::time;

  -- Turno que cruza la medianoche (20:00 a 02:00), que es donde todos fallan.
  if cierra <= abre then
    return ahora >= abre or ahora < cierra;
  end if;
  return ahora >= abre and ahora < cierra;
end $$;

comment on function public.org_en_horario is
  'Si el negocio está abierto AHORA, en SU zona horaria. Sin zona guardada devuelve true: no se adivina, y dejar a una cuenta sin repartir en silencio es peor que repartir fuera de hora. Antes tenía coalesce(timezone, America/Mexico_City) y era el último de los once respaldos que la 0102 quitó.';
