-- 0033 · De dónde escucha una conversación automática
--
-- Hasta ahora un disparador solo sabía CUÁNDO activarse (bienvenida, palabra
-- clave, cliente que regresa). En Instagram eso no alcanza: la misma palabra
-- clave puede llegar por un mensaje directo, por un comentario en una
-- publicación, por un comentario en un reel o por una respuesta a una historia,
-- y cada caso se contesta distinto.
--
-- POR QUÉ UNA COLUMNA APARTE Y NO MÁS VALORES DE `trigger_type`: son dos
-- preguntas distintas. `trigger_type` responde CUÁNDO; `origen` responde DÓNDE.
-- Metiéndolo todo en una sola columna habría que duplicar la lógica de palabras
-- clave para cada sitio del que puede venir — y esa lógica ya funciona y está
-- probada. Así se combinan: "palabra clave" + "comentario en un reel".
alter table flows
  add column if not exists origen            text    not null default 'dm',
  add column if not exists publicacion       text,
  add column if not exists respuesta_publica text,
  add column if not exists una_por_persona   boolean not null default true;

comment on column flows.origen is
  'De dónde llega: dm | post | reel | story_reply | story_mention. Por defecto dm, que es como se comportaba todo antes.';
comment on column flows.publicacion is
  'Publicación o reel concreto al que aplica. Vacío = a todos.';
comment on column flows.respuesta_publica is
  'Lo que se contesta EN el comentario, a la vista de todos. La conversación del flujo va por privado.';
comment on column flows.una_por_persona is
  'Evita mandarle el mismo privado dos veces a la misma persona por la misma publicación.';

-- Un valor mal escrito aquí no rompería nada de forma visible: el disparador
-- simplemente no se activaría nunca, y eso es de lo más difícil de diagnosticar.
alter table flows drop constraint if exists flows_origen_valido;
alter table flows add constraint flows_origen_valido
  check (origen in ('dm','post','reel','story_reply','story_mention'));
