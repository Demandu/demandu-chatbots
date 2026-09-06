-- 0031 · Lo que Lana no supo responder
--
-- EL DIFERENCIADOR, Y RESULTA QUE NO HACÍA FALTA CONSTRUIR NADA NUEVO.
-- Todo lo necesario ya estaba guardado:
--
--   · El mensaje de respaldo de cada bot vive en `bots.ai.fallback`.
--   · Cada mensaje guarda quién lo mandó (`contact`, `bot`, `agent`).
--
-- Así que una pregunta sin respuesta es exactamente esto: un mensaje del bot
-- cuyo texto es el de respaldo, y el mensaje del cliente inmediatamente
-- anterior en esa misma conversación. No hay que registrar nada aparte ni
-- cambiar los motores: se lee de lo que ya pasó.
--
-- POR QUÉ IMPORTA: hoy esas preguntas se pierden. El cliente pregunta algo, el
-- bot dice que no sabe, y nadie se entera nunca de qué era. Cada una es una
-- venta que se escapó y, a la vez, la lista exacta de lo que hay que
-- enseñarle. Es lo único que convierte "mi bot no sirve" en "mi bot aprendió".
--
-- SE AGRUPAN POR TEXTO EXACTO (sin distinguir mayúsculas). Agrupar por
-- parecido sería más bonito y mucho más fácil de equivocar: juntaría preguntas
-- distintas y el dueño acabaría enseñándole una respuesta que no corresponde.
-- Mejor repetir una fila que mentir en una.

create or replace function lo_que_no_supo(p_dias int default 30)
returns table (
  pregunta        text,
  veces           int,
  bot_id          uuid,
  bot_nombre      text,
  ultima_vez      timestamptz,
  conversacion_id uuid,
  ya_lo_sabe      boolean
)
language sql
stable
security definer
set search_path to 'public'
as $fn$
with respaldos as (
  select m.conversation_id, m.created_at, c.bot_id
    from messages m
    join conversations c on c.id = m.conversation_id
    left join bots b on b.id = c.bot_id
   where m.org_id in (select auth_org_ids())
     and m.sender = 'bot'
     and m.created_at > now() - make_interval(days => greatest(coalesce(p_dias, 30), 1))
     -- Si el bot nunca cambió su mensaje de respaldo, `ai.fallback` viene
     -- vacío y hay que comparar contra el de fábrica (el mismo de AI_DEFAULTS).
     and btrim(m.body) = btrim(coalesce(
           nullif(b.ai ->> 'fallback', ''),
           'Esa no me la sé todavía 🙈 ¿Quieres que te comunique con una persona del equipo?'
         ))
),
con_pregunta as (
  select r.bot_id, r.conversation_id, r.created_at,
         (select btrim(m2.body)
            from messages m2
           where m2.conversation_id = r.conversation_id
             and m2.sender = 'contact'
             and m2.created_at < r.created_at
           order by m2.created_at desc
           limit 1) as pregunta
    from respaldos r
)
select (array_agg(p.pregunta order by p.created_at desc))[1]         as pregunta,
       count(*)::int                                                 as veces,
       p.bot_id,
       b.name                                                        as bot_nombre,
       max(p.created_at)                                             as ultima_vez,
       (array_agg(p.conversation_id order by p.created_at desc))[1]  as conversacion_id,
       -- Si ya se le enseñó, la fila sigue apareciendo pero marcada: sirve para
       -- ver que el problema está atendido sin borrar el historial.
       exists (
         select 1 from bot_knowledge k
          where k.bot_id = p.bot_id
            and k.enabled
            and lower(btrim(k.title)) = lower((array_agg(p.pregunta order by p.created_at desc))[1])
       )                                                             as ya_lo_sabe
  from con_pregunta p
  left join bots b on b.id = p.bot_id
 where p.pregunta is not null
   and p.pregunta <> ''
 group by lower(p.pregunta), p.bot_id, b.name
 order by count(*) desc, max(p.created_at) desc
 limit 100;
$fn$;

-- EXECUTE se concede a PUBLIC por defecto y `anon` hereda de PUBLIC, así que
-- revocar solo de `anon` no sirve. Ha pasado tres veces.
revoke execute on function public.lo_que_no_supo(int) from public, anon;
grant  execute on function public.lo_que_no_supo(int) to authenticated, service_role;
