-- BUSCAR EN EL CONOCIMIENTO DEL NEGOCIO SIN PEDIR QUE LA PREGUNTA COINCIDA PALABRA POR PALABRA.
--
-- QUÉ ESTABA PASANDO. La búsqueda por palabras usaba `websearch_to_tsquery`,
-- que une TODOS los términos con Y. Una pregunta real —«¿cuántos mensajes trae
-- el plan de 99 dólares?»— exigía que un mismo fragmento contuviera «mensaje»
-- Y «plan» Y «99» Y «dólar». Casi nunca pasa. Así que la búsqueda no devolvía
-- nada, el motor caía al respaldo —«los primeros 5 fragmentos», siempre los
-- mismos, sin relación con lo preguntado— y la IA contestaba con lo que tenía a
-- mano. De ahí salió que dijera que el plan de 99 «no tiene límite de mensajes»:
-- nadie se lo dijo, lo dedujo de un contexto que no venía al caso.
--
-- Una respuesta inventada con seguridad es peor que un «no lo sé»: el cliente
-- se la cree y el negocio queda comprometido.
--
-- QUÉ HACE AHORA. Se arma una consulta con los términos unidos por O y se ordena
-- por relevancia, dando preferencia a los fragmentos que además cumplen la
-- consulta estricta. Devuelve lo que de verdad se parece a la pregunta, y nada
-- cuando no hay nada parecido.

create or replace function public.buscar_conocimiento(
  p_org_id uuid,
  p_bot_id uuid,
  p_pregunta text,
  p_limit int default 5
)
returns table (title text, content text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_or  tsquery;
  v_and tsquery;
begin
  -- AISLAMIENTO: sin organización Y chatbot no se busca nada. Nunca. El
  -- conocimiento de un cliente no puede rozar el de otro ni por accidente.
  if p_org_id is null or p_bot_id is null or coalesce(btrim(p_pregunta), '') = '' then
    return;
  end if;

  v_and := websearch_to_tsquery('spanish', p_pregunta);

  -- Los lexemas ya vienen normalizados por la configuración «spanish»; se
  -- vuelven a montar con 'simple' justamente para NO derivarlos dos veces.
  select to_tsquery('simple', string_agg(quote_literal(lexeme), ' | '))
    into v_or
    from unnest(to_tsvector('spanish', p_pregunta));

  if v_or is null then
    return;
  end if;

  return query
  select k.title, k.content
  from public.bot_knowledge k
  where k.org_id = p_org_id
    and k.bot_id = p_bot_id
    and k.enabled is true
    and k.search @@ v_or
  order by
    -- Primero lo que cumple la pregunta entera, luego lo más parecido.
    (case when v_and is not null and k.search @@ v_and then 0 else 1 end),
    ts_rank(k.search, v_or) desc
  limit greatest(1, least(coalesce(p_limit, 5), 20));
end;
$$;

-- EXECUTE se concede a PUBLIC por omisión. Una función `security definer` que
-- lee el conocimiento de cualquier organización no puede quedar al alcance de
-- un usuario anónimo: se quita primero y se concede a quien toca.
revoke execute on function public.buscar_conocimiento(uuid, uuid, text, int) from public, anon;
grant execute on function public.buscar_conocimiento(uuid, uuid, text, int) to authenticated, service_role;
