-- ═══════════════════════════════════════════════════════════════════════════
-- QUE LANA CONTESTE LOS COMENTARIOS, NO UNA FRASE HECHA
--
-- La 0033 añadió `respuesta_publica`: UN TEXTO FIJO que sale debajo de todos
-- los comentarios, digan lo que digan. Alguien pregunta «¿cuánto cuesta?» y
-- otro escribe «qué bonito», y los dos reciben la misma frase. Es justo lo que
-- hace que un negocio parezca un robot delante de sus seguidores.
--
-- La IA ya estaba conectada y ya entendía los mensajes directos. Lo único que
-- faltaba era dejarla hablar también arriba, en el comentario.
--
-- ── POR QUÉ UNA COLUMNA Y NO UN VALOR MÁGICO EN LA QUE YA HABÍA ────────────
--
-- La tentación era guardar algo como '{{ia}}' dentro de `respuesta_publica` y
-- ahorrarse la migración. Sería una bomba: el día que un negocio escriba esa
-- cadena a mano, o que la copie de un tutorial, su comentario se comportaría
-- distinto sin que nada lo explique. El modo es una decisión, no un texto.
--
-- ── EL VALOR POR DEFECTO ES `texto`, Y ESO NO ES CONSERVADURISMO ───────────
--
-- Es lo que hacen hoy los flujos que ya existen. Un cliente con su promoción
-- funcionando no puede despertarse con la IA improvisando debajo de sus
-- publicaciones porque nosotros cambiamos un valor por defecto. Lo nuevo se
-- elige; no se hereda.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.flows
  add column if not exists respuesta_publica_modo text not null default 'texto';

-- La restricción se crea aparte y con guarda: `add column if not exists` no
-- vuelve a aplicar el check si la columna ya estaba, y una columna sin
-- restricción admitiría cualquier cadena — que es como acaban las columnas de
-- estado convertidas en un basurero de valores que nadie sabe interpretar.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'flows_respuesta_publica_modo_check'
  ) then
    alter table public.flows
      add constraint flows_respuesta_publica_modo_check
      check (respuesta_publica_modo in ('no', 'ia', 'texto'));
  end if;
end $$;

comment on column public.flows.respuesta_publica_modo is
  'Qué se publica debajo del comentario: ia (Lana lo lee y contesta), texto (la frase de respuesta_publica) o no (nada).';
