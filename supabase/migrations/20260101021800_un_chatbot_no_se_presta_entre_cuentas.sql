-- 1.3 · Un chatbot no se presta entre cuentas
--
-- ── LO QUE PASABA, REPRODUCIDO EL 19 DE SEPTIEMBRE ──────────────────────────
--
-- Un usuario con sesión de la cuenta A ejecutaba, desde la consola de su propio
-- navegador:
--
--     update whatsapp_channels set bot_id = '<bot de otro negocio>'
--
-- sobre SU PROPIO canal, y el update pasaba. Desde el siguiente mensaje a su
-- número, el motor ejecutaba los flujos del competidor y se los iba escribiendo
-- por WhatsApp: sus mensajes, sus ofertas, y lo que hubiera dentro de un bloque
-- de API del grafo.
--
-- La política de RLS comprueba `org_id`. Y el `org_id` de la fila NO cambia: el
-- canal sigue siendo suyo. Lo que cambia es a qué chatbot apunta, y eso no lo
-- miraba nadie.
--
-- ── POR QUÉ UNA CLAVE FORÁNEA Y NO UNA COMPROBACIÓN EN CADA CONSULTA ────────
--
-- Porque una comprobación hay que acordarse de ponerla. La auditoría del 8 de
-- septiembre encontró el MISMO error tres veces —los flujos, el chatbot y el
-- agente de IA— y cada uno se había escrito en un sitio distinto, en semanas
-- distintas, por el mismo descuido.
--
-- Con `foreign key (org_id, bot_id) references bots(org_id, id)`, el par tiene
-- que existir. Un `bot_id` de otra cuenta junto a TU `org_id` no es una fila
-- que exista en `bots`, así que la base lo rechaza. Deja de depender de que
-- cada consulta nueva se acuerde del `.eq("org_id", …)`.
--
-- Es el mismo patrón que ya llevaba `agentes.tienda_id`.
--
-- ── LAS REGLAS DE BORRADO SE RESPETAN, UNA POR UNA ──────────────────────────
--
-- Cada tabla ya tenía su `foreign key (bot_id)` con su propia regla. La nueva
-- restricción tiene que hacer LO MISMO al borrar un chatbot, o cambiaríamos el
-- comportamiento del producto sin querer:
--
--   · `whatsapp_channels` e `instagram_channels` ponían `bot_id` a null, para
--     que el canal siga conectado aunque se borre el chatbot. Se usa
--     `on delete set null (bot_id)` —de Postgres 15 en adelante— para vaciar
--     ESA columna y no el `org_id`, que es `not null`: sin nombrar la columna,
--     el borrado de un chatbot intentaría dejar el canal sin dueño y fallaría.
--   · `flows`, `ai_configs` y `bot_knowledge` se borraban con el chatbot.
--     Siguen igual.
--
-- ── PROBADO ANTES DE APLICAR ────────────────────────────────────────────────
--
-- Las seis sentencias se corrieron el 21 de septiembre dentro de una
-- transacción que se deshace, sobre los datos reales de producción:
--
--   1. Las seis restricciones se crean sin una sola fila que las viole. Se
--      midieron antes las 19 tablas que tienen `org_id` y `bot_id`: cero filas
--      donde el chatbot fuera de otra cuenta.
--   2. Apuntar un canal al chatbot de otra cuenta → rechazado.
--   3. Apuntarlo a un chatbot propio → sigue funcionando.
--   4. Dejarlo sin chatbot → sigue funcionando.

-- Para poder referenciar el par hace falta que sea único. `id` ya es la clave
-- primaria, así que esto no restringe nada nuevo: solo lo declara.
alter table public.bots
  add constraint bots_org_id_key unique (org_id, id);

-- ── Los dos canales por donde entra el tráfico ──────────────────────────────
alter table public.whatsapp_channels
  add constraint whatsapp_channels_org_bot_fkey
  foreign key (org_id, bot_id) references public.bots(org_id, id)
  on delete set null (bot_id);

alter table public.instagram_channels
  add constraint instagram_channels_org_bot_fkey
  foreign key (org_id, bot_id) references public.bots(org_id, id)
  on delete set null (bot_id);

-- ── Y lo que ES el chatbot: sus flujos, su prompt y su conocimiento ─────────
--
-- Estos tres son el producto del negocio. El prompt de un competidor es su
-- trabajo de meses, y la auditoría lo encontró alcanzable por la misma puerta.
alter table public.flows
  add constraint flows_org_bot_fkey
  foreign key (org_id, bot_id) references public.bots(org_id, id) on delete cascade;

alter table public.ai_configs
  add constraint ai_configs_org_bot_fkey
  foreign key (org_id, bot_id) references public.bots(org_id, id) on delete cascade;

alter table public.bot_knowledge
  add constraint bot_knowledge_org_bot_fkey
  foreign key (org_id, bot_id) references public.bots(org_id, id) on delete cascade;
