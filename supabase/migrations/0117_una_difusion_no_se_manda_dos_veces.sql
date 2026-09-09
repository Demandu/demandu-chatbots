-- ────────────────────────────────────────────────────────────────────────────
-- UNA DIFUSIÓN NO SE MANDA DOS VECES.
--
-- 9 SEP 2026. Se pulsó «Enviar difusión» y salieron DOS campañas idénticas con
-- 1,5 segundos de diferencia: «Prueba», misma plantilla, los mismos 2
-- contactos. Cada persona recibió el mismo mensaje dos veces, con dos wamid
-- distintos, las dos entregadas.
--
-- No fue la primera vez: el 2 de septiembre pasó igual con «Apertura», 6
-- contactos, 8 segundos de diferencia. Nadie lo vio porque nada lo miraba.
--
-- ── POR QUÉ ESTO IMPORTA MÁS QUE UN FALLO DE PANTALLA ──────────────────────
--
-- Cada duplicado es una conversación que Meta COBRA, y a partir del 1 de
-- octubre se cobra por mensaje. Peor que el dinero: recibir dos veces la misma
-- plantilla es la forma más rápida de que alguien pulse «Bloquear», y los
-- bloqueos le bajan la calidad al número — que afecta a TODOS los mensajes del
-- negocio, no solo a esa campaña.
--
-- ── LA CAUSA, Y POR QUÉ EL BOTÓN NO ES EL CANDADO ──────────────────────────
--
-- El botón de «Enviar difusión» era un `<button>` pelado: no se desactivaba al
-- pulsarlo. La acción tarda varios segundos (mira el canal, pide el token, lee
-- la plantilla, arma la audiencia, escribe la cola), y en ese rato el botón
-- seguía pareciendo que no había hecho nada. Quien pulsa otra vez encola otra
-- campaña entera.
--
-- Desactivar el botón se arregla en el navegador, y el navegador NO ES UN
-- CANDADO: no protege de una recarga, de un reintento de la red, ni de dos
-- pestañas. El candado tiene que estar aquí abajo.
--
-- ── CÓMO ────────────────────────────────────────────────────────────────────
--
-- El formulario nace con un identificador propio (`idem`). Pulsar dos veces el
-- MISMO formulario manda el MISMO identificador, y este índice hace que el
-- segundo intento no pueda entrar. La acción lo recoge y lleva a la campaña que
-- ya existe, en vez de crear otra.
--
-- Volver a cargar la pantalla da un identificador nuevo: repetir una difusión a
-- propósito sigue funcionando. Lo único que deja de ser posible es mandar dos
-- veces sin querer.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.campaigns
  add column if not exists idem text;

comment on column public.campaigns.idem is
  'Identificador del formulario que la creó. Dos envíos del mismo formulario '
  'traen el mismo valor y el índice único corta el segundo. Nulo en las '
  'campañas anteriores a esta migración.';

-- Parcial a propósito: las campañas de antes tienen `idem` nulo y no se pueden
-- inventar. Un índice normal las dejaría a todas chocando entre sí.
create unique index if not exists campaigns_idem_unico
  on public.campaigns (org_id, idem)
  where idem is not null;
