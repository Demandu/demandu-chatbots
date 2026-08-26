-- Un recorrido puede terminar porque el lead sencillamente no volvió.
--
-- Hasta ahora los finales eran: completado, agente, reiniciado y cambio. Falta
-- el más común de todos en la vida real — el lead deja la conversación a
-- medias y no regresa. Sin este valor, el motor v17 (que reinicia una
-- conversación dormida más de 24 h) intentaría cerrar el recorrido con
-- 'abandonado', el CHECK lo rechazaría, y el recorrido se quedaría abierto
-- PARA SIEMPRE, contado como "en curso" en la analítica de embudos.
--
-- Y no vale reutilizar 'reiniciado': eso significa que el lead escribió «0»
-- para volver al menú, que es lo contrario de irse. Mezclarlos convertiría la
-- métrica de abandono en ruido.
alter table public.flow_runs
  drop constraint if exists flow_runs_ended_reason_check;

alter table public.flow_runs
  add constraint flow_runs_ended_reason_check
  check (ended_reason = any (array['completado','agente','reiniciado','cambio','abandonado']));
