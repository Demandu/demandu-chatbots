-- La plataforma manda sus propios correos, y queda apuntado.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- ESTOS NO SON LOS DE SUPABASE. Supabase manda tres —confirmar la cuenta,
-- recuperar la contraseña e invitar a alguien— y los dispara la autenticación.
-- No sabe que existe un correo de bienvenida ni que el equipo quiera escribirle
-- a un cliente, y nunca los va a mandar.
--
-- ── POR QUÉ POSTMARK Y NO RESEND, QUE ERA EL PLAN DE AGOSTO ───────────────
--
-- Resend exige un registro MX en el subdominio de envío, y **Wix no admite MX
-- en subdominios**. Lo dice el propio Resend al intentar añadir el dominio:
-- «you can't verify your domain for Resend if your DNS is managed by Wix».
--
-- La alternativa era mover el DNS de `demandu.tech` fuera de Wix — pero por ahí
-- cuelgan el sitio web Y el correo de Google Workspace de toda la empresa.
-- Mover los nameservers de un dominio vivo para ahorrarse un cambio de
-- proveedor de correo es cambiar un problema pequeño por uno grande.
--
-- Postmark verifica con un TXT y un CNAME. Ningún MX. El DNS se queda en Wix.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.correos_enviados (
  id           uuid primary key default gen_random_uuid(),
  -- Nulo si el correo no es de ningún cliente en concreto.
  org_id       uuid references public.organizations(id) on delete set null,
  para         text not null,
  asunto       text not null default '',
  -- 'bienvenida', 'superadmin'… para poder contar y filtrar sin adivinar.
  etiqueta     text not null default '',
  enviado      boolean not null default false,
  -- El identificador del proveedor. Es con lo que se busca un correo concreto
  -- en su panel cuando un cliente reclama que no le llegó.
  proveedor_id text,
  error        text,
  -- Quién lo mandó, cuando fue una persona y no una tarea programada.
  enviado_por  uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists correos_enviados_org_idx
  on public.correos_enviados (org_id, created_at desc);
create index if not exists correos_enviados_etiqueta_idx
  on public.correos_enviados (etiqueta, created_at desc);

alter table public.correos_enviados enable row level security;

-- ── NI UNA POLÍTICA, Y ES DELIBERADO ──────────────────────────────────────
--
-- Esta tabla la escribe y la lee el servidor con la llave de servicio. Un
-- cliente no tiene nada que hacer aquí —son los correos de TODOS los negocios—
-- y las pantallas del superadmin ya entran con la llave de servicio.
--
-- Con RLS activo y sin políticas, `authenticated` y `anon` no ven ni una fila.
-- Es la forma correcta de decir «esto no es para el navegador».

comment on table public.correos_enviados is
  'Bitácora de los correos que manda la plataforma. Se escribe salga o no salga el envío: cuando alguien diga «no me llegó nada», la respuesta no puede ser «pues debería».';

/* ── QUE LA BIENVENIDA NO SE MANDE DOS VECES ────────────────────────────────
 *
 * La marca vive en la organización y no en una tabla aparte a propósito: la
 * pregunta que hay que poder hacer es «qué negocios nacieron y todavía no
 * recibieron su bienvenida», y con una columna eso es un `where … is null`.
 * Dentro de la bitácora sería recorrerla entera cada cinco minutos.
 *
 * LOS QUE YA EXISTEN SE MARCAN COMO ENVIADA aunque nunca la recibieran.
 * Mandarle hoy un «bienvenido, tu cuenta ya está lista» a alguien que se
 * registró hace tres semanas es peor que no mandarle nada: se lee como que el
 * sistema acaba de despertarse.
 */
alter table public.organizations
  add column if not exists bienvenida_enviada_at timestamptz;

update public.organizations
   set bienvenida_enviada_at = now()
 where bienvenida_enviada_at is null;

comment on column public.organizations.bienvenida_enviada_at is
  'Cuándo se le mandó el correo de bienvenida. Nulo = todavía no. Los negocios anteriores a esta columna se marcaron como enviada para no escribirles tarde.';
