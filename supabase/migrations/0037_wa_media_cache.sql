-- Caché de archivos subidos a Meta.
--
-- POR QUÉ EXISTE: cuando WhatsApp recibe una imagen "por enlace", Meta tiene que
-- ir a descargarla antes de poder entregarla. Ese viaje tarda, y mientras tanto
-- el mensaje siguiente —un texto o unos botones, que no necesitan descargar
-- nada— se entrega primero. El cliente ve las opciones antes que la imagen.
--
-- La solución es subir el archivo a Meta ANTES de mandarlo y enviarlo por su
-- identificador: así Meta ya tiene los bytes y no hay nada que esperar, con lo
-- que el orden se respeta siempre.
--
-- Subir el mismo archivo en cada conversación sería un desperdicio, así que se
-- guarda aquí el identificador que devuelve Meta. Los ids de Meta caducan a los
-- 30 días; nosotros los damos por vencidos a los 25 para no apurar el límite.

create table if not exists wa_media_cache (
  id uuid primary key default gen_random_uuid(),
  phone_number_id text not null,
  url text not null,
  media_id text not null,
  created_at timestamptz not null default now()
);

-- Un id de Meta pertenece al número que lo subió: la misma imagen usada por dos
-- clientes distintos son dos filas distintas, y así tiene que ser.
create unique index if not exists wa_media_cache_numero_url
  on wa_media_cache (phone_number_id, url);

create index if not exists wa_media_cache_edad on wa_media_cache (created_at);

-- Solo el motor (service_role) escribe y lee aquí. No hay nada que un cliente
-- deba ver: son identificadores internos de Meta.
alter table wa_media_cache enable row level security;
revoke all on wa_media_cache from public, anon, authenticated;
grant select, insert, update, delete on wa_media_cache to service_role;
