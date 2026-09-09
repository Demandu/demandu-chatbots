-- ═══════════════════════════════════════════════════════════════════════════
-- EL RECORDATORIO DE UNA CITA, Y LO QUE LA PERSONA CONTESTA.
--
-- ── POR QUÉ NO BASTA CON MANDAR EL MENSAJE ────────────────────────────────
--
-- Un recordatorio sin respuesta no reduce las ausencias: las traslada. El
-- negocio sigue sin saber si esa persona viene. Lo que cambia el número es la
-- confirmación, y para eso hay que APUNTARLA — si no, el dato vive en un chat
-- que nadie relee.
--
-- ── TRES COLUMNAS Y NINGUNA DE MÁS ────────────────────────────────────────
--
-- `recordatorio_enviado_at`  para no mandar dos. Un recordatorio repetido es
--                            la forma más rápida de que alguien silencie el
--                            número del negocio.
-- `respondio_at`             cuándo contestó. Sin esto no se puede distinguir
--                            «no ha contestado todavía» de «contestó que no».
-- `respuesta`                qué dijo: confirmó o pidió cambiarla.
--
-- ── CONFIRMAR UNA CITA NO ES GANAR UNA VENTA ──────────────────────────────
--
-- Esto NO toca el embudo directamente y es a propósito. Confirmar que vas a una
-- reunión no es haber comprado, y cancelarla no es haber perdido al cliente —la
-- mayoría reagenda—. Meter «confirmada» en «ganado» inflaría los números del
-- negocio y los del suyo, y esos números son para decidir.
--
-- Lo que sí se emite es un evento propio (`cita.confirmada`, `cita.cambio`),
-- que puede mover la tarjeta a una etapa de citas. Ganado y perdido siguen
-- siendo una decisión de una persona.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.citas
  add column if not exists recordatorio_enviado_at timestamptz,
  add column if not exists respondio_at            timestamptz,
  add column if not exists respuesta               text
    check (respuesta is null or respuesta in ('confirma', 'cambia'));

-- Para encontrar rápido «la cita de esta persona que está esperando respuesta»,
-- que es la pregunta que hace el motor en CADA mensaje entrante.
create index if not exists citas_esperando_respuesta
  on public.citas (org_id, contact_id, inicio)
  where recordatorio_enviado_at is not null
    and respondio_at is null
    and estado <> 'cancelada';

comment on column public.citas.respuesta is
  'Qué contestó al recordatorio: confirma o cambia. NULL = todavía no contestó.';
