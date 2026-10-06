-- ════════════════════════════════════════════════════════════════════════════
-- UN DESTINO RECIBE LOS AVISOS DE UNA SOLA CUENTA — 6 oct 2026
--
-- LO QUE PASÓ. El 19 de septiembre se probó el flujo de Zoho de Casas Pacíficas
-- desde la cuenta Demandu LLC: se pegó LA MISMA URL de webhook en una salida de
-- cada cuenta. El documento de ese día dejó escrito «antes de que el cliente
-- entre en producción hay que separarlos», y nadie lo hizo. El 5 de octubre un
-- lead real de Demandu («Cm Nikos») entró como Posible cliente en el CRM DEL
-- CLIENTE. Dos veces.
--
-- La base no mezcló nada: cada evento salió solo por las salidas de SU cuenta
-- (comprobado: 0 eventos cruzados en 194). Lo que se mezcló fue el DESTINO,
-- porque dos cuentas apuntaban al mismo sitio y la plataforma lo permitía.
--
-- LA REGLA. Una dirección de destino solo puede estar ACTIVA en una salida en
-- toda la plataforma. Ni en dos cuentas distintas —eso es mandar los leads de
-- un cliente al CRM de otro— ni dos veces en la misma, que es entregar cada
-- aviso por duplicado.
--
-- Es un índice y no una comprobación en la pantalla porque la pantalla no es la
-- única puerta: hubo salidas creadas y corregidas con `update` directo. Un
-- índice único no se salta ni desde el editor SQL.
--
-- Solo cuenta lo ACTIVO: una salida apagada no manda nada, y así las salidas
-- repetidas que ya existen (todas apagadas hoy) no impiden aplicar la regla.
-- Volver a encender una cuyo destino ya está en uso falla, y ese fallo es el
-- aviso.
-- ════════════════════════════════════════════════════════════════════════════

create unique index if not exists salidas_un_destino_una_cuenta_uidx
  on public.salidas (url)
  where activa;

comment on index public.salidas_un_destino_una_cuenta_uidx is
  'Una misma dirección de destino no puede estar activa en dos salidas, sean de la cuenta que sean. Ver la migración del 6 oct 2026: un lead de Demandu LLC acabó en el CRM de Casas Pacíficas.';
