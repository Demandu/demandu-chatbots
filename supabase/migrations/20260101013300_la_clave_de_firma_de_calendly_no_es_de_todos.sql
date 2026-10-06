-- LA CLAVE CON LA QUE SE FIRMAN LOS AVISOS DE CALENDLY VIVE APARTE.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ NO PUEDE IR EN `data`
--
-- La 0092 dejó `integrations` sin `select` de tabla y concedió columna por
-- columna. `data` quedó dentro de la concesión, y con razón: ahí viven cosas
-- que las pantallas pintan —la lista de calendarios de Google, el nombre de la
-- cuenta, el enlace público de la agenda— y ninguna es un secreto.
--
-- Calendly rompe esa suposición. Su conexión guarda ADEMÁS la clave con la que
-- se firman sus avisos, y esa clave no es un dato de pantalla: es lo ÚNICO que
-- distingue un aviso de verdad de uno inventado.
--
-- Quien la tenga puede mandarnos un `invitee.created` con la firma correcta.
-- Nosotros lo creeríamos, y eso crea un contacto y mete un mensaje en la
-- conversación de cualquier cliente de esa organización. Con `data` concedida a
-- `authenticated`, cualquier MIEMBRO —un agente, alguien que entró una semana—
-- la leía con una consulta suelta desde la consola del navegador.
--
-- Meter un secreto dentro de una columna que ya estaba concedida es exactamente
-- la clase de fallo que la 0092 fue a arreglar. Se corrige antes de existir.
--
-- ── POR QUÉ UNA COLUMNA Y NO UNA TABLA NUEVA ──────────────────────────────
--
-- Porque el patrón ya está y funciona: columna fuera de la concesión, y una
-- puerta `security definer` para quien de verdad la necesita. `token_de_whatsapp`
-- y `secreto_de_salida` hacen justo esto. Una tabla nueva sería otro sitio que
-- recordar proteger.
--
-- AQUÍ NO HACE FALTA NI LA PUERTA: a diferencia del secreto de las salidas
-- —que el cliente copia y pega en su sistema— esta clave no se enseña NUNCA,
-- ni al dueño. La generamos nosotros, se la damos a Calendly al suscribir, y la
-- volvemos a leer solo con la llave de servicio al comprobar cada aviso. Nadie
-- tiene motivo para verla, así que no se concede a nadie.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.integrations add column if not exists firma text;

comment on column public.integrations.firma is
  'Clave de firma de los avisos del proveedor (Calendly). NO SE ENSEÑA NUNCA, ni al dueño: solo se lee con la llave de servicio para verificar cada aviso.';

-- La concesión de la 0092 se repite tal cual —columna por columna— y `firma`
-- NO entra. Un `grant select` sobre columnas no quita las de antes, así que hay
-- que dejar claro que esta se queda fuera: por eso se revoca explícitamente en
-- vez de confiar en que no se concedió.
revoke select (firma) on public.integrations from authenticated, anon, public;
