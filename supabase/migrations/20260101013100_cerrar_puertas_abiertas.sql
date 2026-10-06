-- Cinco puertas que estaban abiertas. Auditoría del 4 de septiembre de 2026.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LAS CINCO SE VERIFICARON CONTRA LA BASE DE PRODUCCIÓN, no leyendo el código.
-- Es la única forma de auditar permisos: dos de estas parecían cerradas en la
-- migración que las creó y no lo estaban.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1 y 2. Preguntar por la cuenta de OTRO ────────────────────────────────
--
-- `revoke execute ... from authenticated` NO QUITA NADA si PUBLIC conserva el
-- permiso, y PUBLIC lo tiene por defecto en toda función que se crea. La
-- migración 0088 hizo justo eso y quedó con la conciencia tranquila.
--
-- `has_function_privilege('anon', ...)` devolvía `true`: cualquiera con la
-- llave anon —que viaja al navegador en cada carga— podía preguntar el plan,
-- los complementos y los descuentos de cualquier organización cuyo UUID
-- conociera. Y los UUID viajan en las URL.
--
-- SE CONCEDE A `service_role` EXPLÍCITAMENTE. Hasta ahora ejecutaba a través de
-- PUBLIC; revocar sin conceder habría dejado al motor sin poder consultar el
-- plan — y `tieneIA` falla abierto, así que la avería habría sido «todos los
-- clientes tienen IA gratis» y nadie se entera.

revoke execute on function public.org_features(uuid) from public, anon, authenticated;
grant  execute on function public.org_features(uuid) to service_role;

revoke execute on function public.org_puede(uuid, text) from public, anon, authenticated;
grant  execute on function public.org_puede(uuid, text) to service_role;

-- ── 3. Escritura SIN SESIÓN sobre la tabla `tiendas` ──────────────────────
--
-- `siguiente_numero_pedido` es SECURITY DEFINER y hace
-- `update tiendas set ultimo_pedido = ultimo_pedido + 1`. Era ejecutable por
-- `anon`. Con el UUID de una tienda —que el escaparate público entrega— se
-- podía mover el contador de pedidos de cualquier negocio en un bucle.
--
-- Solo la llama `crearPedido`, con la llave de servicio.
revoke execute on function public.siguiente_numero_pedido(uuid) from public, anon, authenticated;
grant  execute on function public.siguiente_numero_pedido(uuid) to service_role;

-- ── 4. Cuántas tiendas se cobran ──────────────────────────────────────────
--
-- Esta SÍ la llama una pantalla con la sesión del usuario (settings/plan), así
-- que revocarla de `authenticated` la habría roto. La guarda va DENTRO: quien
-- pregunta por una cuenta que no es suya recibe 0.
--
-- Se prefiere la guarda a una función `_mias` nueva porque entra en vigor sin
-- publicar nada: la pantalla sigue llamando igual y funciona igual.
create or replace function public.tiendas_que_se_cobran(p_org_id uuid)
returns integer language sql stable security definer set search_path = public as $fn$
  select case
    when p_org_id is null then 0
    when p_org_id not in (select auth_org_ids()) then 0
    else greatest(0, (select count(*)::int from tiendas t where t.org_id = p_org_id) - 1)
  end;
$fn$;

revoke execute on function public.tiendas_que_se_cobran(uuid) from public, anon;
grant  execute on function public.tiendas_que_se_cobran(uuid) to authenticated, service_role;

-- ── 5. La vista de campañas se saltaba las políticas ──────────────────────
--
-- `leads_por_campana` es propiedad de `postgres`, que tiene `rolbypassrls`. Sin
-- `security_invoker`, la vista corre con SUS privilegios y no con los de quien
-- pregunta: cualquier usuario con sesión veía los anuncios, los leads captados
-- y las fechas de campaña de TODOS los clientes de la plataforma. La
-- inteligencia de marketing de la competencia, en una consulta.
--
-- La 0065 revocó de `public, anon` y se dejó `authenticated`, que es
-- precisamente quien podía usarla.
--
-- Con `security_invoker` la vista pasa a respetar RLS, así que se puede dejar
-- concedida: sirve, y solo enseña lo propio.
alter view public.leads_por_campana set (security_invoker = on);

-- ── 6. El almacén de archivos era público Y LISTABLE ──────────────────────
--
-- ─────────────────────────────────────────────────────────────────────────────
-- LA MÁS GRAVE DE LAS CINCO.
--
-- La política de lectura era `FOR SELECT TO public USING (bucket_id='media')`:
-- sin ningún filtro de carpeta. Con la llave anon se podía LISTAR el árbol
-- entero del bucket. La primera carpeta de cada ruta es el `org_id`, así que se
-- enumeraba cliente por cliente, y de ahí se bajaba cada archivo.
--
-- Ahí es donde acaban los adjuntos de las conversaciones: las fotos, los
-- comprobantes de pago y las cédulas que los clientes finales mandan por chat.
-- Se verificó como `anon` sobre la base real y devolvía adjuntos de una
-- conversación de verdad.
--
-- ── POR QUÉ SE CIERRA EL LISTADO Y NO LA LECTURA ──────────────────────────
--
-- El bucket sigue siendo público a propósito: Meta descarga por URL la
-- multimedia que manda el bot, y el escaparate pinta las fotos de los
-- productos. Quitar eso rompería las tiendas que están vendiendo hoy.
--
-- Lo que se corta es la ENUMERACIÓN, que es lo que convierte «hay que conocer
-- la URL» en «están todas aquí». Una URL con marca de tiempo en milisegundos no
-- se adivina; un listado no hace falta adivinarlo.
--
-- PENDIENTE, y no es poco: los adjuntos de la Bandeja no deberían vivir en un
-- bucket público ni con URL eterna. Lo correcto es moverlos a uno privado con
-- URL firmada de corta vida. Eso sí toca código y pantallas, así que se hace
-- aparte — pero mientras tanto, cerrar el listado sube el listón de «cualquiera
-- con la llave pública» a «alguien que ya vio esa URL concreta».
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists media_public_read on storage.objects;

create policy media_lista_solo_lo_mio on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and ((storage.foldername(name))[1])::uuid in (select auth_org_ids())
  );
