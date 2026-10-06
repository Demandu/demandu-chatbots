-- Una conversación que pide una persona SIEMPRE tiene dueño.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LO QUE PASABA. El reparto automático ya existía entero —`crm_repartir`,
-- `elegir_por_etiqueta`, `crm_elegir_agente`— y aun así las conversaciones
-- salían «Sin asignar». Dos motivos, y ninguno era un fallo de código:
--
--   1. `assignment_settings.enabled` estaba en FALSO en las tres cuentas. El
--      reparto nunca se encendió. (Se encendió aparte; es dato, no esquema.)
--
--   2. Aun encendido, `solo_en_linea` exigía que alguien hubiera tenido el
--      panel abierto en los últimos 5–10 minutos. Quien cierra la pestaña para
--      comer apaga el reparto sin saberlo, y el lead que pidió una persona se
--      queda sin dueño. Comprobado en producción: de tres cuentas con gente
--      marcada como disponible, DOS no elegían a nadie.
--
-- ── LA REGLA NUEVA ────────────────────────────────────────────────────────
--
-- «Debe asignarse a alguien y punto.» Preferir a quien está disponible y en
-- línea sigue siendo lo primero —es lo que el cliente configuró y es lo
-- sensato—, pero deja de ser un muro: si nadie pasa ese filtro, la
-- conversación se le da igualmente a alguien.
--
-- El orden queda así:
--
--   1. Disponible, en línea y por debajo de su tope  ← lo de siempre
--   2. Cualquiera del equipo elegido, aunque esté ausente
--   3. Cualquiera de la cuenta, si ese equipo está vacío
--
-- En los dos últimos escalones se reparte por MENOS CARGA: al que menos
-- conversaciones abiertas tenga.
--
-- ── POR QUÉ ASIGNAR A ALGUIEN AUSENTE ES MEJOR QUE NO ASIGNAR ────────────
--
-- Una conversación asignada a alguien que no está tiene un nombre, sale en su
-- lista, dispara su aviso y el dueño del negocio puede reasignarla de un clic.
-- Una conversación sin asignar no es de nadie: nadie la ve, nadie recibe aviso
-- y el cliente que pidió una persona espera para siempre. Un responsable
-- ausente es un problema visible; ningún responsable es un cliente perdido en
-- silencio.
--
-- ── LO QUE SIGUE PUDIENDO DEVOLVER NULO, A PROPÓSITO ─────────────────────
--
--   · `enabled = false`  → el cliente apagó el reparto. Es su decisión.
--   · `solo_horario` fuera de horario → también lo configuró él.
--   · una cuenta sin NINGÚN miembro de equipo → no hay a quién dárselo.
--
-- Esos tres no son el fallo: son elecciones. Lo que se arregla es el caso en
-- que hay gente y aun así nadie se quedaba con el chat.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.crm_elegir_agente(p_org uuid)
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

  -- Dónde se quedó la rueda la última vez.
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

  -- ESCALÓN 2: del equipo elegido, aunque esté ausente o lleve días sin entrar.
  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
       and (s.team_id is null or tm.team_id = s.team_id)
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  -- ESCALÓN 3: ese equipo está vacío. Cualquiera de la cuenta.
  if elegido is null then
    select tm.id into elegido
      from team_members tm
      left join conversations c
             on c.assignee_member_id = tm.id and c.status in ('open','pending','assigned')
     where tm.org_id = p_org
     group by tm.id, tm.created_at
     order by count(c.id), tm.created_at
     limit 1;
  end if;

  if elegido is not null then
    update assignment_settings set ultimo_member_id = elegido, updated_at = now() where org_id = p_org;
  end if;
  return elegido;
end $function$;
