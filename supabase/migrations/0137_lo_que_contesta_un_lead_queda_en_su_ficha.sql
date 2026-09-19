-- H-13 · Lo que contesta un lead queda en su ficha, y se puede descargar
--
-- ── QUÉ PASABA ─────────────────────────────────────────────────────────────
--
-- Un bloque de pregunta del constructor guarda la respuesta en `vars[...]` y
-- ahí se muere: `vars` vive mientras dura el recorrido. El negocio monta un
-- flujo que pregunta nombre, correo y presupuesto, la persona los contesta
-- los tres, y en la ficha del lead no hay nada. El ÚNICO sitio que escribía
-- en `contacts.attributes` era la herramienta `guardar_dato` de la IA — o sea
-- que capturar datos dependía de tener la IA encendida y de que al modelo le
-- diera por llamarla.
--
-- ── QUÉ CAMBIA ─────────────────────────────────────────────────────────────
--
-- 1. La respuesta de un bloque con variable se escribe en la ficha, en los
--    dos sitios: `attributes` (de donde tiran flujos y plantillas) y la
--    casilla propia cuando el nombre de la variable es uno de los conocidos
--    —nombre, correo, teléfono, empresa, país—, que es donde mira el equipo.
--    Lo hacen los DOS motores, WhatsApp y web, sin que nadie configure nada:
--    es el comportamiento base de los nodos, para las cuentas de hoy y las de
--    mañana.
--
-- 2. Y queda apuntado aquí, una fila por respuesta. Esta tabla es el registro
--    auditable: qué preguntó qué bloque, qué contestó quién y cuándo. Sin
--    ella, comprobar que la captura funciona obliga a abrir fichas una por
--    una, que es justo lo que hace que nadie lo compruebe.
--
-- ── POR QUÉ UNA TABLA Y NO SOLO LA FICHA ───────────────────────────────────
--
-- La ficha guarda el ÚLTIMO valor. Si la misma persona pasa dos veces por el
-- flujo y contesta distinto, el primero desaparece. Para el negocio eso está
-- bien —quiere el dato bueno— pero para auditar no sirve: hace falta ver que
-- la respuesta entró, aunque luego se pisara.
--
-- ── PERMISOS ───────────────────────────────────────────────────────────────
--
-- Se LEE desde el panel con sesión, filtrado por organización. Se ESCRIBE
-- solo con la llave de servicio (los dos motores): a nadie con sesión le hace
-- falta insertar aquí, y un insert desde el navegador solo serviría para
-- ensuciar el registro que existe para poder fiarse de él.

create table if not exists public.respuestas_de_flujo (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  bot_id          uuid references public.bots(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete cascade,
  contact_id      uuid references public.contacts(id) on delete set null,
  flow_id         uuid,
  node_id         text,
  -- Cómo se llama el bloque en el constructor. Se guarda AQUÍ y no se busca
  -- después en el flujo: el negocio renombra y reordena sus bloques, y una
  -- fila de auditoría que cambia de significado con el tiempo no audita nada.
  etiqueta        text,
  variable        text not null,
  valor           text,
  canal           text not null default 'whatsapp',
  created_at      timestamptz not null default now()
);

-- Las dos consultas que va a haber: «todo lo de esta cuenta, lo último
-- primero» y «todo lo de esta persona».
create index if not exists respuestas_de_flujo_org_fecha
  on public.respuestas_de_flujo (org_id, created_at desc);
create index if not exists respuestas_de_flujo_contacto
  on public.respuestas_de_flujo (contact_id, created_at desc);

alter table public.respuestas_de_flujo enable row level security;

drop policy if exists respuestas_de_flujo_org on public.respuestas_de_flujo;
create policy respuestas_de_flujo_org
  on public.respuestas_de_flujo for select to authenticated
  using (org_id in (select auth_org_ids()));

-- Ni INSERT ni UPDATE ni DELETE para nadie con sesión: escribe la llave de
-- servicio, que no pasa por aquí.
revoke all on public.respuestas_de_flujo from anon, authenticated;
grant select on public.respuestas_de_flujo to authenticated;
