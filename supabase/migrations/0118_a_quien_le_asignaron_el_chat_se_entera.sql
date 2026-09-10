-- ────────────────────────────────────────────────────────────────────────────
-- A QUIEN LE ASIGNAN UN CHAT, SE ENTERA.
--
-- 9 SEP 2026. «Cuando yo se lo asigno manualmente debería recibir su
-- notificación.» No la recibía, y no era un fallo: no existía. La plataforma
-- avisa de mensajes nuevos y de solicitudes de persona, y de nada más. Que a
-- alguien le pongan un chat encima no avisaba a nadie, ni con la pestaña
-- abierta.
--
-- ── POR QUÉ HACE FALTA UNA COLUMNA Y NO SOLO CÓDIGO ────────────────────────
--
-- Para avisar hay que saber CUÁNDO se asignó y QUIÉN la asignó:
--
--   · `assigned_at` ya existía, pero solo lo escribía el reparto automático.
--     La bandeja cambiaba el responsable con un UPDATE pelado y la fecha se
--     quedaba como estaba, así que no había forma de distinguir «me la acaban
--     de pasar» de «la tengo desde el martes».
--
--   · `asignada_por` es nueva. Sin ella, quien se asigna una conversación a sí
--     mismo se lleva un aviso de su propio clic — y un aviso que salta por lo
--     que uno mismo acaba de hacer es la forma más rápida de que la gente
--     apague los avisos.
--
-- Va en un TRIGGER y no en la pantalla a propósito. El responsable se cambia
-- desde la bandeja, desde el reparto automático, desde la regla por etiqueta y
-- desde la cola de reintentos. Ponerlo en la bandeja sería acordarse en un
-- sitio y olvidarlo en los otros tres — que es exactamente por qué `assigned_at`
-- llevaba meses mintiendo.
--
-- NULO EN `asignada_por` QUIERE DECIR «LA REPARTIÓ LA PLATAFORMA»: el motor y
-- la cola corren con la llave de servicio, donde `auth.uid()` no existe. Eso es
-- justo lo que se quiere avisar siempre.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.conversations
  add column if not exists asignada_por uuid references auth.users(id) on delete set null;

comment on column public.conversations.asignada_por is
  'Quién puso al responsable actual. Nulo = lo puso la plataforma (reparto '
  'automático, regla por etiqueta o cola de reintentos).';

create or replace function public.conversacion_marca_asignacion()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Solo cuando el responsable CAMBIA. Sin esto, cualquier UPDATE de la
  -- conversación —cerrarla, cambiarle el estado, marcarla leída— refrescaría la
  -- fecha y le volvería a saltar el aviso a la misma persona cada vez.
  if new.assignee_member_id is distinct from old.assignee_member_id then
    new.assigned_at  := now();
    new.asignada_por := auth.uid();
  end if;
  return new;
end $$;

revoke all on function public.conversacion_marca_asignacion() from public, anon;

-- `zz` para que corra DESPUÉS de `conversations_reparto`: los triggers BEFORE
-- van por orden alfabético, y el reparto automático escribe el responsable en
-- ese mismo paso. Corriendo antes, este no vería el cambio.
drop trigger if exists conversations_zz_asignacion on public.conversations;
create trigger conversations_zz_asignacion
  before update on public.conversations
  for each row execute function public.conversacion_marca_asignacion();
