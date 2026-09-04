-- Los secretos dejan de ser legibles por pertenecer a la cuenta.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL PROBLEMA. Las políticas de estas cinco tablas comprobaban SOLO `org_id`.
-- Un `agent` o un `viewer` —alguien que solo debería atender conversaciones—
-- abría la consola del navegador ya autenticado y se leía:
--
--   · el secreto de comercio de Yappy      → cobrar a nombre del negocio
--   · el token de Meta (WhatsApp/Instagram) → mandar desde su número
--   · el refresh token de Google            → su calendario y sus hojas
--   · el secreto de firma de los webhooks   → falsificar avisos a su CRM
--
-- La plataforma ya sabía hacerlo bien: `api_keys` y `sheets_config` añaden
-- `AND auth_puede('conexiones')` a sus políticas. Estas cinco no.
--
-- ── POR QUÉ POR COLUMNA Y NO POR FILA ─────────────────────────────────────
--
-- RLS es de FILAS: no sabe distinguir «puedes ver este canal» de «puedes ver su
-- token». Cerrar la fila entera rompía las pantallas que necesitan el número de
-- teléfono o el nombre de usuario, que no tienen nada de secreto.
--
-- Los permisos por columna sí saben. El secreto se vuelve ilegible POR ROL, no
-- por convención: da igual la consulta que alguien escriba.
--
-- ── LA TRAMPA DE POSTGRES ─────────────────────────────────────────────────
--
-- El permiso de TABLA implica todas las columnas, y revocar una sola columna
-- mientras existe el de tabla NO HACE NADA. Hay que quitar el de tabla y
-- conceder las columnas una por una — que es lo que hace esto.
--
-- EFECTO SECUNDARIO A PROPÓSITO: una columna nueva no queda concedida hasta que
-- alguien la añada aquí. Falla hacia el lado seguro; se nota enseguida y no
-- publica un secreto por descuido.
--
-- ── LO QUE HUBO QUE CAMBIAR EN EL CÓDIGO ──────────────────────────────────
--
-- Una regla estática nueva (`estatico.mjs`) encontró SIETE sitios que pedían
-- estas columnas con la sesión del usuario, y dos que hacían `select("*")` —
-- que habría fallado ENTERO y dejado pantallas diciendo «no conectado» a todo
-- el mundo. Entre ellos, el de enviar desde la Bandeja: un agente sí puede
-- contestar —es su trabajo— pero no tiene por qué poder leer el token.
--
-- Lo que de verdad necesita el valor va por `token_de_whatsapp` /
-- `secreto_de_salida`, que comprueban el permiso; lo interno va con la llave de
-- servicio, con el alcance que ya traía quien llamó.
-- ─────────────────────────────────────────────────────────────────────────────

revoke select on public.whatsapp_channels from authenticated, anon;
grant select (id, org_id, bot_id, phone_number_id, waba_id, display_number,
              created_at, updated_at, catalog_id, llamadas)
  on public.whatsapp_channels to authenticated;

revoke select on public.instagram_channels from authenticated, anon;
grant select (id, org_id, bot_id, ig_user_id, username, page_id, page_name,
              token_caduca, conectado_por, created_at, updated_at, permisos)
  on public.instagram_channels to authenticated;

revoke select on public.integrations from authenticated, anon;
grant select (id, org_id, provider, account_email, token_expiry, scope, data,
              created_at, updated_at)
  on public.integrations to authenticated;

revoke select on public.salidas from authenticated, anon;
grant select (id, org_id, nombre, url, eventos, activa, ultimo_intento_at,
              ultimo_estado, ultimo_error, created_at)
  on public.salidas to authenticated;

revoke select on public.tienda_cobros from authenticated, anon;
grant select (id, org_id, tienda_id, proveedor, comercio, activo, created_at,
              updated_at, dominio, ambiente, validado_en)
  on public.tienda_cobros to authenticated;

-- ── LA PUERTA PARA QUIEN SÍ DEBE ENTRAR ───────────────────────────────────
--
-- Instalar WhatsApp, manejar plantillas, ver formularios, sincronizar campañas
-- y copiar el secreto de firma son tareas de CONEXIÓN. El valor se entrega por
-- una puerta que comprueba el permiso, en vez de estar tirado en la fila.
--
-- Quien no lo tiene recibe NULO, y las pantallas ya saben decir «este chatbot
-- no tiene WhatsApp conectado» — que es el mensaje correcto para un agente que
-- no debería estar ahí.

create or replace function public.token_de_whatsapp(p_bot_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select w.access_token
    from whatsapp_channels w
   where w.bot_id = p_bot_id
     and w.org_id in (select auth_org_ids())
     and auth_puede('conexiones')
   limit 1;
$fn$;

revoke execute on function public.token_de_whatsapp(uuid) from public, anon;
grant  execute on function public.token_de_whatsapp(uuid) to authenticated, service_role;

create or replace function public.secreto_de_salida(p_id uuid)
returns text language sql stable security definer set search_path = public as $fn$
  select s.secreto
    from salidas s
   where s.id = p_id
     and s.org_id in (select auth_org_ids())
     and auth_puede('conexiones')
   limit 1;
$fn$;

revoke execute on function public.secreto_de_salida(uuid) from public, anon;
grant  execute on function public.secreto_de_salida(uuid) to authenticated, service_role;

comment on function public.token_de_whatsapp is
  'El token de Meta de un chatbot. Solo para quien tiene el permiso de conexiones.';
comment on function public.secreto_de_salida is
  'El secreto de firma de un webhook saliente. Solo para quien tiene el permiso de conexiones.';
