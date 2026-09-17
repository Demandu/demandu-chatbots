-- ─────────────────────────────────────────────────────────────────────────────
-- NINGÚN PLAN ACTIVO SE QUEDA SIN CUPO
--
-- El plan «Empresa» (`scale`) tenía `messages_month`, `conversations_month`,
-- `ai_messages_month` y `agents_included` en CERO. No rompía nada hoy porque
-- nadie está en él y porque la pantalla solo marca «agotado» cuando el límite
-- es mayor que cero (`over: limit > 0 && used >= limit`) — así que un límite de
-- cero se lee como «0% usado». Pero el día que se pusiera a alguien ahí, su
-- panel le diría que tiene 0 mensajes de límite mientras manda mensajes.
--
-- El plan sigue SIN precio en Stripe, y eso sí es a propósito: `scale` se
-- excluye de la lista comprable (`p.code !== "scale"` en settings/plan/page.tsx)
-- y se pinta aparte como la tarjeta «¿Necesitas algo distinto?», con teléfono y
-- correo en vez de formulario. Un plan que se negocia contigo no lleva botón de
-- pago. Lo que se arregla aquí son los números, no la forma de venderlo.
--
-- Y el camino de verdad para un cliente grande sigue siendo un PLAN A LA MEDIDA
-- (`is_custom`, con su `org_id`) desde superadmin, con los números que se hayan
-- negociado. Estos son el escalón siguiente de la escalera, para que la pantalla
-- nunca enseñe un cero.
-- ─────────────────────────────────────────────────────────────────────────────

update public.plans
   set messages_month      = 30000,
       conversations_month = 30000,
       ai_messages_month   = 15000,
       agents_included     = 15
 where code = 'scale' and org_id is null;

-- ── Y que no vuelva a pasar ────────────────────────────────────────────────
--
-- Esto estuvo en cero desde la 0087 y nadie lo vio, porque un cero no falla:
-- se pinta. La regla lo convierte en un error en el momento de escribirlo, que
-- es cuando todavía se puede arreglar.
--
-- SE EXIME a los planes a la medida y a los de una organización concreta: esos
-- los escribe una persona desde superadmin con lo que negoció, y a veces se
-- guardan por partes. Los cuatro de catálogo, que son los que ve cualquiera que
-- entre a la pantalla de planes, no tienen excusa.
alter table public.plans
  drop constraint if exists plans_activos_con_cupo;
alter table public.plans
  add constraint plans_activos_con_cupo
  check (
    not active or is_custom or org_id is not null
    or (
      coalesce(messages_month, 0)  > 0
      and coalesce(agents_included, 0) > 0
      and coalesce(storage_mb, 0)  > 0
    )
  );
