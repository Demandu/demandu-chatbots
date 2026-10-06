-- Plantillas creadas desde Demandu (no solo sincronizadas desde Meta).
--
-- `creada_aqui` distingue las que nacieron en nuestro constructor de las que
-- el cliente ya tenía en Meta. Sirve para dos cosas: poder mostrarle "esta la
-- hiciste aquí, puedes editarla" y no pisar con la sincronización lo que él
-- acaba de enviar a revisión.
--
-- `rejected_reason` es lo que Meta contesta cuando rechaza. Sin esto el cliente
-- ve un "RECHAZADA" mudo y no sabe qué corregir.

alter table whatsapp_templates
  add column if not exists rejected_reason text,
  add column if not exists quality text,
  add column if not exists creada_aqui boolean not null default false,
  add column if not exists created_at timestamptz not null default now();
