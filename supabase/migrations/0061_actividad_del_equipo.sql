-- QUIÉN DEL EQUIPO ESTÁ TRABAJANDO DE VERDAD.
--
-- POR QUÉ HAY QUE GUARDARLO NOSOTROS. Supabase tiene su propio registro de
-- inicios de sesión (`auth.audit_log_entries`) y está VACÍO: lo poda solo. Lo
-- único que sobrevive es `last_sign_in_at`, una sola marca de tiempo — el
-- último acceso y nada más. Si no lo apuntamos aquí, el historial no existe y
-- no hay forma de recuperarlo después.
--
-- POR QUÉ POR DÍA Y NO POR VISITA. Una fila por carga de página serían millones
-- de filas para responder una pregunta que es de días: «¿este vendedor trabajó
-- esta semana?». Por día se responde igual de bien, ocupa nada y no hace falta
-- purgarlo nunca.
--
-- QUÉ NO ES ESTO. No es vigilancia de lo que alguien hace dentro: no se guarda
-- qué miró ni cuánto tiempo estuvo. Se guarda que entró, y qué HIZO se ve en la
-- bitácora, que ya existía y apunta las acciones de verdad — entrar a la cuenta
-- de un cliente, dar de alta a otro. Un login no es trabajo; una hora dentro de
-- la cuenta de un cliente sí.

create table if not exists public.accesos_del_equipo (
  user_id uuid not null references auth.users(id) on delete cascade,
  dia date not null,
  primera_at timestamptz not null default now(),
  ultima_at timestamptz not null default now(),
  visitas integer not null default 1,
  primary key (user_id, dia)
);

create index if not exists accesos_del_equipo_por_dia on public.accesos_del_equipo (dia desc);

alter table public.accesos_del_equipo enable row level security;
revoke all on public.accesos_del_equipo from anon, authenticated;

/**
 * Apunta que esta persona pasó por aquí. Una fila por día.
 *
 * Es `on conflict` a propósito: dos pestañas abiertas a la vez son dos
 * llamadas simultáneas, y sin esto una de las dos reventaría por clave
 * duplicada — en medio de la carga del panel, que es lo último que uno quiere
 * que falle.
 *
 * SOLO APUNTA AL EQUIPO DE DEMANDU. A los clientes no se les lleva un registro
 * de asistencia: no trabajan para nosotros.
 */
create or replace function public.anotar_paso_del_equipo(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then return; end if;
  if not exists (select 1 from public.equipo_demandu where user_id = p_user_id) then
    return;
  end if;

  insert into public.accesos_del_equipo (user_id, dia)
  values (p_user_id, (now() at time zone 'utc')::date)
  on conflict (user_id, dia) do update
    set ultima_at = now(),
        visitas = public.accesos_del_equipo.visitas + 1;
end;
$$;

revoke execute on function public.anotar_paso_del_equipo(uuid) from public, anon;
grant execute on function public.anotar_paso_del_equipo(uuid) to authenticated, service_role;

-- ─── Lo que se mira de verdad ────────────────────────────────────────────────
--
-- Junta las tres fuentes en una sola respuesta: cuándo entró por última vez,
-- cuántos días distintos trabajó el último mes, a cuántas cuentas entró a dar
-- soporte y cuántos clientes dio de alta.
--
-- El último acceso sale de `accesos_del_equipo` y, si aún no hay ninguno
-- —porque la persona es de antes de esta tabla—, cae a `last_sign_in_at`. Así
-- la columna no sale vacía el primer mes y luego mejora sola.
create or replace view public.actividad_del_equipo as
  select
    e.id            as miembro_id,
    e.user_id,
    e.nombre,
    e.email,
    e.tipo,
    e.activo,
    coalesce(
      (select max(a.ultima_at) from public.accesos_del_equipo a where a.user_id = e.user_id),
      u.last_sign_in_at
    ) as ultimo_acceso,
    (select count(*) from public.accesos_del_equipo a
      where a.user_id = e.user_id and a.dia >= (now() at time zone 'utc')::date - 29) as dias_activos_30,
    (select count(*) from public.bitacora b
      where b.actor_id = e.user_id
        and b.accion = 'entró a la cuenta para dar soporte'
        and b.at >= now() - interval '30 days') as soportes_30,
    (select max(b.at) from public.bitacora b
      where b.actor_id = e.user_id and b.accion = 'entró a la cuenta para dar soporte') as ultimo_soporte,
    (select count(*) from public.organizations o where o.creado_por = e.user_id) as clientes_dados_de_alta,
    (select count(*) from public.organizations o where o.atendido_por = e.id) as clientes_en_cartera
  from public.equipo_demandu e
  left join auth.users u on u.id = e.user_id;

revoke all on public.actividad_del_equipo from anon, authenticated;
