-- ═══════════════════════════════════════════════════════════════════════════
-- 0064 · «Si el lead es alto, que le toque a Darwin.»
--
-- POR QUÉ ESTA MIGRACIÓN DESHACE PARTE DE LA ANTERIOR. La 0063 creó
-- `repartir_conversacion`, una función que elegía agente por su cuenta. Estaba
-- de más y no me di cuenta hasta después de escribirla: desde la 0016 ya
-- existe un reparto COMPLETO —rueda, menos carga, solo en línea, tope por
-- persona, horario laboral y cola de reintentos— que se dispara solo con un
-- trigger sobre `conversations`.
--
-- Tener dos repartos es peor que no tener ninguno: se pisan, y cuando una
-- conversación acaba en el buzón equivocado nadie sabe cuál de los dos la
-- mandó. Así que la regla por etiqueta se mete DENTRO del que ya funciona,
-- como un paso previo.
-- ═══════════════════════════════════════════════════════════════════════════

drop function if exists public.repartir_conversacion(uuid);

-- ── A quién le toca POR ETIQUETA ───────────────────────────────────────────
-- NULL = ninguna regla encaja, y entonces manda el reparto de siempre.
create or replace function public.elegir_por_etiqueta(
  p_org uuid,
  p_contact_id uuid
) returns uuid
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tags   text[];
  v_member uuid;
  v_team   uuid;
begin
  if p_contact_id is null then return null; end if;

  select coalesce(ct.tags, array[]::text[]) into v_tags
  from public.contacts ct where ct.id = p_contact_id and ct.org_id = p_org;
  if v_tags is null then return null; end if;

  -- La primera regla que encaje. Una regla CON etiqueta gana siempre a la de
  -- cajón aunque empaten en prioridad: lo concreto manda sobre lo general.
  select r.member_id, r.team_id into v_member, v_team
  from public.reglas_de_reparto r
  left join public.tags t on t.id = r.tag_id
  where r.org_id = p_org
    and r.activa
    and (r.tag_id is null or t.name = any (v_tags))
  order by (r.tag_id is not null) desc, r.prioridad desc, r.created_at
  limit 1;

  if v_member is not null then
    -- SOLO SI SIGUE DISPONIBLE. Mandarle el mejor lead del mes a quien terminó
    -- su turno es perderlo: si no está, se cae al reparto normal, que sabe a
    -- quién más dárselo.
    select tm.id into v_member from public.team_members tm
    where tm.id = v_member and tm.org_id = p_org and coalesce(tm.available, true);
    return v_member;
  end if;

  if v_team is null then return null; end if;

  -- Un equipo: al que menos conversaciones abiertas tenga. Un turno rotatorio
  -- le manda leads a quien lleva veinte encima igual que a quien no tiene
  -- ninguno.
  select tm.id into v_member
  from public.team_members tm
  left join public.conversations c
         on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
  where tm.org_id = p_org and tm.team_id = v_team and coalesce(tm.available, true)
  group by tm.id, tm.created_at
  order by count(c.id), tm.created_at
  limit 1;

  return v_member;
end $$;

revoke all on function public.elegir_por_etiqueta(uuid, uuid) from public, anon;
grant execute on function public.elegir_por_etiqueta(uuid, uuid) to service_role, authenticated;

-- ── El trigger de siempre, con el paso previo por etiqueta ─────────────────
--
-- Se dispara cuando la conversación pide humano —el lead escribió el atajo, el
-- flujo llegó a un bloque de pase, o la herramienta del agente de IA lo pidió—
-- y todavía no tiene dueño. Al vivir aquí, los CUATRO caminos reparten igual
-- sin que ningún motor tenga que acordarse de llamarlo.
create or replace function public.crm_repartir()
returns trigger language plpgsql security definer set search_path = public as $$
declare elegido uuid;
begin
  if new.assignee_member_id is not null then return new; end if;
  if not (new.status = 'assigned' or new.handoff_requested_at is not null) then return new; end if;

  -- PRIMERO LA REGLA POR ETIQUETA. «Si el lead es alto, que le toque a Darwin»
  -- tiene que ganarle a la rueda: para eso la escribió el cliente.
  elegido := elegir_por_etiqueta(new.org_id, new.contact_id);

  -- Sin regla que encaje, el reparto de siempre con todos sus modificadores.
  if elegido is null then
    elegido := crm_elegir_agente(new.org_id);
  end if;

  if elegido is not null then
    new.assignee_member_id := elegido;
    new.assigned_at := now();
  end if;
  -- Si nadie cumple, se queda sin dueño a propósito: mejor en la cola que
  -- asignada a alguien que no la va a ver. El reintento la recoge.
  return new;
end $$;
