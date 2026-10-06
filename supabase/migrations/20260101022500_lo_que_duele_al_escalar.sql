-- ════════════════════════════════════════════════════════════════════════════
-- LO QUE DUELE AL ESCALAR, ARREGLADO ANTES DE QUE DUELA.
--
-- APLICADA EL 5 DE OCTUBRE DE 2026.
--
-- ⚠️ EL NÚMERO: quedó registrada en Supabase con el nombre
--    `0143_lo_que_duele_al_escalar`, porque al aplicarla no se sabía que el
--    0143 ya estaba tomado por `0143_app_movil_reservas_y_push.sql` (la app
--    móvil, aplicada a mano en el editor SQL y que por eso no aparece en
--    `supabase_migrations.schema_migrations`). El archivo se guarda aquí como
--    **0145** para no pisar aquel número. Si algún día se compara el repo con
--    lo registrado en la base, esa es la discrepancia y está a propósito.
--
-- Medido el mismo día (ver `capacidad-medida-5-oct-2026.md`): la base está al
-- 0,1 % de su presupuesto de tiempo con 7 cuentas, así que nada de esto corre
-- prisa HOY — y por eso mismo es el momento: con 919 filas cada índice se crea
-- al instante y sin bloquear a nadie.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. EL CONTADOR DE CONSUMO LEÍA LOS MENSAJES DE TODAS LAS CUENTAS ───────
--
-- `org_usage()` cuenta los salientes del mes de UNA cuenta. Los índices que
-- había en `messages` eran la clave primaria, `(conversation_id, created_at)` y
-- uno parcial para `wamid`: ninguno empieza por `org_id`. El EXPLAIN de antes
-- usaba `messages_convo_idx` por la fecha sola y después descartaba por cuenta
-- («Rows Removed by Filter: 82» de 123 leídas). O sea: leía los mensajes del
-- mes de TODO EL MUNDO y tiraba los que no eran. Con 100 clientes a 6.000
-- mensajes al mes son 600.000 filas por cada carga del panel.
--
-- Después: «Index Scan using messages_consumo_idx», con las tres condiciones
-- dentro del Index Cond y solo el `payload` quedando como filtro.
--
-- Las tres columnas van EN ESTE ORDEN porque es el de la consulta: la cuenta
-- (igualdad), la dirección (igualdad) y la fecha (rango). Un rango al final es
-- lo que permite saltar directo; al principio obliga a recorrer.
--
-- `usage_events` ya tenía su `(org_id, kind, created_at)` bien puesto desde el
-- principio: el hueco era solo de `messages`, no un descuido general.
create index if not exists messages_consumo_idx
  on public.messages (org_id, direction, created_at);

comment on index public.messages_consumo_idx is
  'Para contar los mensajes de UNA cuenta en un mes (org_usage, consumo_de_clientes y la analitica). Sin este indice se leian los del mes de todas las cuentas y se descartaban despues. Cubre tambien la clave foranea messages_org_id_fkey.';

-- ── 2. LAS CONVERSACIONES DE UN CONTACTO ──────────────────────────────────
-- `conversations.contact_id` es clave foránea y no tenía índice. Se recorre al
-- abrir la ficha de un contacto, al juntar duplicados y en cada borrado de
-- contacto (donde el `SET NULL` tiene que encontrar las filas).
create index if not exists conversations_contact_idx
  on public.conversations (contact_id);

-- ── 3. CINCO POLÍTICAS QUE PREGUNTABAN QUIÉN ERES UNA VEZ POR FILA ────────
--
-- `auth.uid()` suelto dentro de una política se reevalúa PARA CADA FILA que la
-- política mira. Envuelto en `(select …)`, Postgres lo calcula una vez y lo
-- reutiliza. El resultado es idéntico; el coste no. Lo señala el linter de
-- Supabase como `auth_rls_initplan`.
--
-- Se usa `alter policy`, no `drop` + `create`: el MCP de Supabase pide
-- confirmación humana para las sentencias destructivas y, sin nadie que
-- confirme, se agota a los 180 s y parece un cuelgue. Además, un `drop` deja la
-- tabla un instante sin esa política.
--
-- `memberships` es la que paga de verdad: se lee en casi cada petición.
-- `dispositivos_push` es de la app móvil (su tabla se aplicó a mano el 4 oct).
--
-- COMPROBADO después de aplicarla, como usuario autenticado y con rollback:
-- cada quien sigue viendo solo su ficha de admin y de equipo, no se puede
-- registrar un teléfono a nombre de otra persona, y el aviso de contraseña
-- solo se apaga el propio.

alter policy "platform_admins_self" on public.platform_admins
  using (user_id = (select auth.uid()));

alter policy "apagar mi cambio de contrasena" on public.memberships
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and debe_cambiar_contrasena = false);

alter policy "ver mi ficha de equipo" on public.equipo_demandu
  using (user_id = (select auth.uid()));

alter policy "ver mis comisiones" on public.comisiones
  using (miembro_id in (
    select e.id from public.equipo_demandu e where e.user_id = (select auth.uid())
  ));

alter policy "dispositivos_push_mios" on public.dispositivos_push
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and org_id in (select public.auth_org_ids())
  );
