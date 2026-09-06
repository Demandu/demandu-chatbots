-- LOS GRUPOS DE LEADS NO TENÍAN DÓNDE GUARDAR A NADIE.
--
-- Existía la tabla `lead_groups`, la pantalla para crearlos y borrarlos, y el
-- selector «Agregar a grupo de leads» dentro del bloque «Etiquetar» del
-- constructor. Lo único que faltaba era el sitio donde decir QUIÉN pertenece a
-- qué grupo. El cliente elegía el grupo, guardaba el flujo, y esa elección no
-- se escribía en ningún lado.
--
-- (Aplicada en su momento junto con el resto de bloques que el motor no
-- ejecutaba; se deja escrita aquí para que el repositorio cuente la historia
-- completa.)
alter table public.contacts
  add column if not exists lead_group_id uuid references public.lead_groups(id) on delete set null;

create index if not exists contacts_por_grupo on public.contacts (org_id, lead_group_id);
