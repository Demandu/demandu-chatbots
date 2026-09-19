-- H-11 · Un almacén para lo que es de una persona
--
-- APLICADA EN PRODUCCIÓN el 19 sep 2026 como
-- `un_almacen_para_lo_que_es_de_una_persona` (versión 20260919201842).
-- Ver la nota de la 0133.
--
-- `media` es público y se queda así: ahí vive lo que el negocio sube al bloque
-- Multimedia, y esa dirección queda escrita DENTRO de los flujos guardados.
-- Volverlo privado obligaría a reescribir los flujos de todos los clientes y a
-- firmar cada imagen en el widget web, y no hace falta: es contenido que el
-- negocio manda a cualquiera que le escriba.
--
-- Lo que NO puede seguir ahí son los adjuntos de las conversaciones —fotos,
-- recibos, documentos que un cliente le manda a un negocio— y los archivos de
-- entrenamiento. Eso no es contenido: son datos de una persona, y hoy
-- cualquiera con el enlace se los baja sin sesión y sin caducidad.
--
-- LAS POLÍTICAS SON LAS MISMAS QUE LAS DE `media`, a propósito: la primera
-- carpeta de la ruta es la organización dueña. Copiarlas y no inventarlas evita
-- que las dos capas discrepen el día que alguien toque una sola.
--
-- LO QUE YA ESTABA EN `media` NO SE MUEVE DESDE AQUÍ: una migración no puede
-- copiar archivos entre almacenes. Eso lo hace `scripts/mover-adjuntos-a-privado.mjs`,
-- y es irreversible, así que se corre a mano y después de publicar el código.

insert into storage.buckets (id, name, public, file_size_limit)
values ('privado', 'privado', false, 26214400)
on conflict (id) do update set public = false;

create policy "privado_lista_solo_lo_mio"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'privado'
    and ((storage.foldername(name))[1])::uuid in (select auth_org_ids())
  );

create policy "privado_org_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'privado'
    and ((storage.foldername(name))[1])::uuid in (select auth_org_ids())
  );

create policy "privado_org_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'privado'
    and ((storage.foldername(name))[1])::uuid in (select auth_org_ids())
  );

create policy "privado_org_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'privado'
    and ((storage.foldername(name))[1])::uuid in (select auth_org_ids())
  );
