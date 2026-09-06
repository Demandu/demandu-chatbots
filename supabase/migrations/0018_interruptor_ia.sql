-- 0018 · El interruptor «Responder con IA» empieza a valer de verdad
--
-- QUÉ PASABA: `bots.ai.enabled` se guardaba desde el panel pero NINGÚN motor
-- lo leía. Un cliente que apagaba la IA seguía consumiéndola — y pagándola.
--
-- A PARTIR DE AHORA `aiAnswer` (canal web) y `responderConIA` (WhatsApp) cortan
-- cuando está en `false`: no se llama a la API, no se gasta, no se registra
-- consumo. El valor por defecto cuando la llave no existe es ENCENDIDA, porque
-- todo chatbot nuevo nace con un bloque «Respuesta con IA» en su flujo de
-- bienvenida y si naciera apagado ese bloque estaría muerto el primer día.
--
-- POR QUÉ ESTA MIGRACIÓN TOCA DATOS: hoy todos los chatbots responden con IA,
-- tengan `enabled` en true, en false o sin poner. Si el candado entrara en
-- vigor tal cual, a los que lo tienen en `false` se les apagaría la IA de un
-- día para otro sin haber cambiado nada — un cambio de comportamiento que el
-- cliente no pidió. Encenderlo aquí deja el día del despliegue EXACTAMENTE
-- igual que el día anterior. El interruptor manda a partir de ahí.

update bots
   set ai = coalesce(ai, '{}'::jsonb) || jsonb_build_object('enabled', true)
 where ai is null
    or ai->>'enabled' is distinct from 'true';

-- Comprobación: después de esto no debe quedar ningún chatbot apagado.
do $$
declare apagados int;
begin
  select count(*) into apagados
    from bots
   where coalesce(ai->>'enabled', 'true') <> 'true';

  if apagados > 0 then
    raise exception 'Quedaron % chatbots con la IA apagada; la migración debía dejarlos todos encendidos', apagados;
  end if;
end $$;
