-- ============================================================================
-- 0004 · Horario laboral y zona horaria por organización
-- El nodo "Asignar chat" respeta este horario cuando se activa "solo horario laboral".
-- ============================================================================

alter table organizations add column if not exists timezone text not null default 'America/Mexico_City';
alter table organizations add column if not exists business_hours jsonb not null default '{
  "mon":{"enabled":true,"open":"09:00","close":"18:00"},
  "tue":{"enabled":true,"open":"09:00","close":"18:00"},
  "wed":{"enabled":true,"open":"09:00","close":"18:00"},
  "thu":{"enabled":true,"open":"09:00","close":"18:00"},
  "fri":{"enabled":true,"open":"09:00","close":"18:00"},
  "sat":{"enabled":false,"open":"09:00","close":"14:00"},
  "sun":{"enabled":false,"open":"09:00","close":"14:00"}
}'::jsonb;
