-- ============================================================================
-- 0005 · Almacenamiento de archivos del constructor (bucket "media")
-- El nodo Multimedia sube imágenes/video/archivos aquí. Lectura pública
-- (para servir por URL) y escritura aislada por organización.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 26214400)
on conflict (id) do update set public = true, file_size_limit = 26214400;

drop policy if exists "media_public_read" on storage.objects;
drop policy if exists "media_org_insert" on storage.objects;
drop policy if exists "media_org_update" on storage.objects;
drop policy if exists "media_org_delete" on storage.objects;

-- Lectura pública (el bucket es público; sirve para URLs directas)
create policy "media_public_read" on storage.objects
  for select using (bucket_id = 'media');

-- Subir/editar/borrar solo dentro de la carpeta {org_id}/ del usuario
create policy "media_org_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1]::uuid in (select auth_org_ids())
  );

create policy "media_org_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1]::uuid in (select auth_org_ids())
  );

create policy "media_org_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1]::uuid in (select auth_org_ids())
  );
