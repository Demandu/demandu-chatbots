-- Dos arreglos que se vieron en datos reales, no en teoría.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. EL DOMINIO VACÍO ERA UNA BOMBA DE RELOJERÍA. Una tienda configurada antes
--    de que existiera la columna la tenía en blanco. El cobro se habría creado
--    igual (esa parte tenía respaldo), pero la firma del aviso de pago se
--    comprueba contra ese mismo dominio: con el campo vacío, NINGÚN aviso
--    habría cuadrado nunca. El cliente paga, el banco avisa, y el pedido se
--    queda sin marcar. Un fallo silencioso, y del lado del dinero.
--
-- 2. EL ENTORNO POR DEFECTO ERA «PRUEBA» POR UNA SUPOSICIÓN MÍA: que Yappy
--    Comercial entrega llaves de sandbox a cualquier comercio. La evidencia
--    dice lo contrario — el portal entrega UN juego de credenciales— así que el
--    valor por defecto garantizaba que el primer intento de todo el mundo
--    fallara. Las tiendas nuevas arrancan en producción; pruebas queda para
--    quien de verdad tenga credenciales de integración.
-- ─────────────────────────────────────────────────────────────────────────────

update public.tienda_cobros
   set dominio = 'https://store.demandu.tech'
 where coalesce(dominio, '') = '';

alter table public.tienda_cobros alter column ambiente set default 'produccion';

comment on column public.tienda_cobros.ambiente is
  'produccion o prueba. Por defecto produccion: el portal de Yappy Comercial entrega un solo juego de credenciales, y son las de verdad.';
