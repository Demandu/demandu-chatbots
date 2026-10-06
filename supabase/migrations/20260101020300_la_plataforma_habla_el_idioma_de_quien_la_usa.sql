-- La plataforma habla el idioma de quien la usa.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR PERSONA, NO SOLO POR CUENTA, Y ES A PROPÓSITO. Un equipo puede tener a
-- alguien atendiendo desde Brasil y a alguien desde México en la MISMA cuenta.
-- Con el idioma solo en la organización, uno de los dos trabaja siempre en un
-- idioma que no es el suyo.
--
--   organizations.idioma  → el de fábrica. Lo hereda quien no eligió el suyo, y
--                           es el de los correos que la plataforma le manda al
--                           negocio (ahí no hay «quien mira», hay una cuenta).
--   memberships.idioma    → el que eligió esa persona. NULO = hereda.
--
-- ── POR QUÉ EN `memberships` Y NO EN UNA TABLA DE PERFILES ────────────────
--
-- Porque `membresiaDeLaSesion()` YA trae esa fila en cada carga del panel para
-- saber en qué cuenta estás y con qué rol. El idioma viaja en el mismo viaje a
-- la base: cero consultas nuevas por pantalla. Una tabla de perfiles habría
-- añadido un viaje a cada render para guardar un solo dato.
--
-- ── EL `check` NO ES ADORNO ───────────────────────────────────────────────
--
-- Un idioma que no existe no rompe con un error: deja la pantalla en blanco o
-- sin traducir, que es de los fallos más difíciles de rastrear. Que la base lo
-- rechace hace que ese estado no pueda existir. Cuando se añada un idioma hay
-- que ampliarlo aquí — y ese recordatorio forzado es parte del valor.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.organizations
  add column if not exists idioma text not null default 'es'
  check (idioma in ('es', 'pt-BR', 'en'));

alter table public.memberships
  add column if not exists idioma text
  check (idioma is null or idioma in ('es', 'pt-BR', 'en'));

comment on column public.organizations.idioma is
  'Idioma de fabrica de la cuenta. Lo hereda cada miembro que no eligio el suyo, y es el de los correos que la plataforma le manda al negocio.';
comment on column public.memberships.idioma is
  'Idioma elegido por esta persona. NULO = hereda el de su organizacion. Es por persona a proposito: un equipo puede tener a alguien en Brasil y a alguien en Mexico.';
