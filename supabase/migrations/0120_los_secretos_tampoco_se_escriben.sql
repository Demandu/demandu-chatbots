-- Los secretos tampoco se ESCRIBEN por pertenecer a la cuenta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA MITAD QUE FALTÓ. La migración 0092 cerró la LECTURA de estas columnas por
-- columna, y lo hizo bien: hoy ningún agente puede leerse un token, escriba la
-- consulta que escriba. Pero dejó la puerta de entrada abierta — `insert` y
-- `update` sobre esas MISMAS columnas seguían concedidos a `authenticated`, y
-- cuatro de las siete hasta a `anon`.
--
-- No hace falta leer un secreto para hacer daño con él:
--
--   · sobrescribir `tienda_cobros.secreto` con uno que uno mismo elija, y con
--     él falsificarle a la tienda un aviso de «pagado» que nadie pagó
--   · cambiar `whatsapp_channels.access_token` y dejar de enviar, o enviar
--     desde otro sitio
--   · cambiar `integrations.firma` y que los avisos de Calendly dejen de
--     entrar sin un solo error a la vista
--
-- Un agente —alguien contratado para contestar chats— podía hacerlo desde la
-- consola del navegador. No es hipotético: es un `update` de una línea.
--
-- ── LA PRUEBA DE QUE ESTE ES EL PATRÓN CORRECTO ───────────────────────────
--
-- `salidas.secreto` YA estaba cerrado en las dos direcciones. O sea: el patrón
-- bueno ya vivía en esta base, aplicado a una sola de las cinco tablas. Esto
-- solo lo extiende a las otras cuatro.
--
-- ── LA MISMA TRAMPA DE POSTGRES QUE EN 0092 ───────────────────────────────
--
-- El permiso de TABLA implica todas las columnas, y revocar una sola columna
-- mientras existe el de tabla NO HACE NADA. Hay que quitar el de tabla y
-- conceder las columnas una por una.
--
-- EFECTO SECUNDARIO A PROPÓSITO, igual que allá: una columna nueva no queda
-- concedida hasta que alguien la añada aquí. Falla hacia el lado seguro.
--
-- ── QUÉ HUBO QUE CAMBIAR EN EL CÓDIGO ─────────────────────────────────────
--
-- Dos sitios escribían un secreto con la sesión del usuario:
--
--   · `guardarCobros`       (el secreto de comercio de Yappy)
--   · `saveWhatsappChannel` (el token de Meta)
--
-- Los dos pasan ahora por la llave de servicio DESPUÉS de comprobar el permiso
-- de «conexiones» — que además ninguno comprobaba. Guardar las credenciales de
-- cobro del negocio no era tarea de quien atiende los chats, y lo era.
--
-- `anon` no vuelve a recibir nada: la tienda pública lee con la llave de
-- servicio y nunca ha escrito aquí.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── WhatsApp ────────────────────────────────────────────────────────────────
revoke insert, update on public.whatsapp_channels from authenticated, anon;
grant insert (id, org_id, bot_id, phone_number_id, waba_id, display_number,
              created_at, updated_at, catalog_id, llamadas),
      update (id, org_id, bot_id, phone_number_id, waba_id, display_number,
              created_at, updated_at, catalog_id, llamadas)
  on public.whatsapp_channels to authenticated;

-- ── Instagram ───────────────────────────────────────────────────────────────
revoke insert, update on public.instagram_channels from authenticated, anon;
grant insert (id, org_id, bot_id, ig_user_id, username, page_id, page_name,
              token_caduca, conectado_por, created_at, updated_at, permisos),
      update (id, org_id, bot_id, ig_user_id, username, page_id, page_name,
              token_caduca, conectado_por, created_at, updated_at, permisos)
  on public.instagram_channels to authenticated;

-- ── Google y Calendly ───────────────────────────────────────────────────────
revoke insert, update on public.integrations from authenticated, anon;
grant insert (id, org_id, provider, account_email, token_expiry, scope, data,
              created_at, updated_at),
      update (id, org_id, provider, account_email, token_expiry, scope, data,
              created_at, updated_at)
  on public.integrations to authenticated;

-- ── Webhooks salientes ──────────────────────────────────────────────────────
revoke insert, update on public.salidas from authenticated, anon;
grant insert (id, org_id, nombre, url, eventos, activa, ultimo_intento_at,
              ultimo_estado, ultimo_error, created_at),
      update (id, org_id, nombre, url, eventos, activa, ultimo_intento_at,
              ultimo_estado, ultimo_error, created_at)
  on public.salidas to authenticated;

-- ── Cobros de la tienda ─────────────────────────────────────────────────────
revoke insert, update on public.tienda_cobros from authenticated, anon;
grant insert (id, org_id, tienda_id, proveedor, comercio, activo, created_at,
              updated_at, dominio, ambiente, validado_en),
      update (id, org_id, tienda_id, proveedor, comercio, activo, created_at,
              updated_at, dominio, ambiente, validado_en)
  on public.tienda_cobros to authenticated;
