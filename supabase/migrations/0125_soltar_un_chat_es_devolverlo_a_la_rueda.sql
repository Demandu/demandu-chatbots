-- Soltar un chat es devolverlo a la rueda, no dejarlo huérfano.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL AGUJERO QUE QUEDABA. La 0124 hizo que el reparto SIEMPRE elija a alguien.
-- Pero en la Bandeja, el selector de responsable tiene una opción «Sin
-- asignar», y cualquier agente podía elegirla: la conversación volvía a no ser
-- de nadie y se deshacía a mano lo que la 0124 acababa de garantizar.
--
-- ── POR QUÉ NO SE QUITÓ LA OPCIÓN ─────────────────────────────────────────
--
-- Soltar un chat es legítimo: no es mi tema, me voy, se lo paso al equipo. Lo
-- que no es legítimo es soltarlo AL VACÍO. Así que «Sin asignar» deja de
-- significar «de nadie» y pasa a significar «devuélvelo a la rueda»: en el
-- mismo instante, el reparto elige a otro.
--
-- ── Y A OTRO, NO AL MISMO ─────────────────────────────────────────────────
--
-- Con la estrategia «menos carga», quien acaba de soltar un chat tiene una
-- conversación MENOS que antes — así que sería el primer candidato y el chat le
-- volvería al segundo. Soltarlo y que rebote es peor que no poder soltarlo.
-- Por eso `crm_elegir_agente` acepta a quién excluir.
--
-- La única excepción: si el equipo es de una sola persona y es justo la que lo
-- soltó, se le devuelve. Un chat con dueño repetido es mejor que un chat de
-- nadie — es la misma regla de la 0124.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_elegir_agente(p_org uuid, p_excluir uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  s assignment_settings%rowtype;
  elegido uuid;
  u_creado timestamptz;
  u_id uuid;
begin
  select * into s from assignment_settings where org_id = p_org;
  if s.org_id is null or not s.enabled then return null; end if;
  if s.solo_horario and not org_en_horario(p_org) then return null; end if;

  select created_at, id into u_creado, u_id from team_members where id = s.ultimo_member_id;
  u_creado := coalesce(u_creado, '-infinity'::timestamptz);
  u_id := coalesce(u_id, '00000000-0000-0000-0000-000000000000'::uuid);

  with candidatos as (
    select tm.id, tm.created_at,
           (select count(*) from conversations c
             where c.assignee_member_id = tm.id
               and c.status in ('open','pending','assigned')) as abiertas
      from team_members tm
     where tm.org_id = p_org
       and tm.available
       and (p_excluir is null or tm.id <> p_excluir)
       and (s.team_id is null or tm.team_id = s.team_id)
       and (
         not s.solo_en_linea
         or (tm.last_seen_at is not null
             and tm.last_seen_at > now() - make_interval(mins => greatest(1, s.minutos_en_linea)))
       )
  ),
  libres as (
    select * from candidatos
     where s.max_abiertas is null or abiertas < s.max_abiertas
  )
  select id into elegido from libres
   order by
     case when s.strategy = 'menos_carga' then abiertas else 0 end asc,
     case when s.strategy = 'rueda' and (created_at, id) > (u_creado, u_id) then 0 else 1 end asc,
     created_at asc, id asc
   limit 1;

  -- ESCALÓN 2: del equipo elegido, aunque esté ausente (ver 0124).
  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
       and (p_excluir is null or tm.id <> p_excluir)
       and (s.team_id is null or tm.team_id = s.team_id)
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  -- ESCALÓN 3: cualquiera de la cuenta.
  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
       and (p_excluir is null or tm.id <> p_excluir)
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  -- Equipo de una sola persona: se le devuelve a quien lo soltó.
  if elegido is null and p_excluir is not null then
    select tm.id into elegido from team_members tm
     where tm.id = p_excluir and tm.org_id = p_org;
  end if;

  if elegido is not null then
    update assignment_settings set ultimo_member_id = elegido, updated_at = now() where org_id = p_org;
  end if;
  return elegido;
end $function$;

-- La de un argumento se queda: la llaman el reparto normal y la cola de
-- reintentos, donde no hay a nadie que excluir.
create or replace function public.crm_elegir_agente(p_org uuid)
returns uuid
language sql
security definer
set search_path to 'public'
as $function$
  select public.crm_elegir_agente(p_org, null::uuid);
$function$;


-- ── EL REPARTO SE ENTERA DE QUE LA SOLTARON ───────────────────────────────
--
-- Antes solo actuaba cuando la conversación pedía humano (`status = assigned`
-- o `handoff_requested_at`). Una conversación ABIERTA que alguien soltaba a
-- mano no cumplía ninguna de las dos y se quedaba sin dueño.
--
-- Ahora se reparte también cuando la fila TENÍA dueño y deja de tenerlo, sea
-- cual sea su estado: si un humano estuvo dentro, tiene que seguir habiendo un
-- responsable. Lo que NO se toca es la conversación que el bot atiende sola y
-- nunca tuvo dueño: asignarle una persona a cada charla automática inundaría
-- al equipo con trabajo que no existe.
create or replace function public.crm_repartir()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  elegido uuid;
  soltada boolean := false;
  quien_la_solto uuid := null;
begin
  if new.assignee_member_id is not null then return new; end if;

  if tg_op = 'UPDATE' and old.assignee_member_id is not null then
    soltada := true;
    quien_la_solto := old.assignee_member_id;
  end if;

  if not (soltada or new.status = 'assigned' or new.handoff_requested_at is not null) then
    return new;
  end if;

  -- PRIMERO LA REGLA POR ETIQUETA, salvo que mande al mismo que la soltó.
  elegido := elegir_por_etiqueta(new.org_id, new.contact_id);
  if elegido is not null and quien_la_solto is not null and elegido = quien_la_solto then
    elegido := null;
  end if;

  if elegido is null then
    elegido := crm_elegir_agente(new.org_id, quien_la_solto);
  end if;

  if elegido is not null then
    new.assignee_member_id := elegido;
    new.assigned_at := now();
  end if;
  return new;
end $$;
