-- LA ZONA HORARIA DEJA DE ADIVINARSE EN SILENCIO.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- EL FALLO, CON FECHA. `timezone` era `not null default 'America/Mexico_City'`.
-- La base NO PODÍA REPRESENTAR «no sé dónde está este negocio»: todos nacían en
-- Ciudad de México. Y ese mismo valor estaba escrito a mano como respaldo en
-- diez sitios del código.
--
-- El 5 de septiembre de 2026, un negocio de Panamá ofreció TODAS sus citas una
-- hora corridas. El bot decía «09:00» y el evento caía a las 10:00 hora local.
-- Nadie lo vio, y no por descuido: la pantalla enseñaba una zona perfectamente
-- plausible, y el síntoma —una cita a una hora rara— no se parece en nada a la
-- causa.
--
-- ── LA LECCIÓN NO ES «FALTABA DÓNDE CONFIGURARLO» ─────────────────────────
--
-- La pantalla existía desde hacía meses. Lo que faltaba era la posibilidad de
-- NO SABER: sin un estado «sin configurar», no hay nada que avisar, y una
-- respuesta por defecto que parece correcta es peor que no tener respuesta.
--
-- Por eso esta migración hace dos cosas que parecen contrarias:
--
--   1. Quita el valor por defecto y el `not null`. Nulo pasa a significar «no
--      lo sabemos», y la agenda avisa en vez de ofrecer horas equivocadas.
--   2. Añade `zona_confirmada`. La plataforma puede DEDUCIR la zona —del
--      navegador de quien configura, o del prefijo de su WhatsApp— pero lo
--      deducido no cuenta como sabido hasta que alguien lo mira y dice que sí.
--
-- ── POR QUÉ NO SE PREGUNTA EL PAÍS ────────────────────────────────────────
--
-- Porque un país no es una zona horaria. México tiene cuatro husos, Brasil
-- cuatro, Estados Unidos seis. Preguntar el país y traducirlo a una zona
-- volvería a meter el mismo tipo de error, y justo en los países donde más
-- clientes hay. El navegador da la zona IANA exacta sin preguntar nada.
--
-- ── LAS CUENTAS QUE YA ESTÁN ──────────────────────────────────────────────
--
-- Se quedan con la zona que tengan y con `zona_confirmada = false`, que es la
-- verdad: nadie la ha mirado nunca. Van a ver el aviso la próxima vez que
-- entren, que es exactamente lo que hace falta — las dos cuentas que existen
-- hoy tienen la zona equivocada.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists zona_confirmada boolean not null default false;

-- NULO PASA A SER UN VALOR LEGÍTIMO. Es el cambio importante de todo esto.
alter table public.organizations alter column timezone drop default;
alter table public.organizations alter column timezone drop not null;

comment on column public.organizations.zona_confirmada is
  'El negocio miró su zona horaria y dijo que era correcta. Falso = la plataforma la dedujo y todavía no la ha visto nadie.';

comment on column public.organizations.timezone is
  'Zona IANA del negocio. PUEDE SER NULA a propósito: nula significa «no lo sabemos» y la agenda avisa en vez de ofrecer horas. Antes era not null default America/Mexico_City, y por eso un negocio de Panamá ofreció todas sus citas una hora corridas sin que nadie lo viera.';
