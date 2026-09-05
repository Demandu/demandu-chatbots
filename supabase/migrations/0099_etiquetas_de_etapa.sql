-- LA ETAPA DEL EMBUDO, TAMBIÉN COMO ETIQUETA.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ, SI ES UN DATO DUPLICADO
--
-- Lo es, y normalmente eso bastaría para no hacerlo: una copia de
-- `opportunities.stage_id` en otro sitio es una copia que se desincroniza.
--
-- Se hace igual porque LA ETIQUETA ES EL ENGANCHE DE AUTOMATIZACIÓN DE ESTA
-- PLATAFORMA. Las difusiones se mandan a una etiqueta. Los seguimientos se
-- disparan con `tag_added`. Sin etiqueta de etapa, para poder escribirle a «los
-- que se quedaron con el carrito sin pagar» habría que añadir «filtrar por
-- etapa» a las difusiones, a los seguimientos y a todo lo que venga después.
--
-- Con ella, el caso funciona con la maquinaria que ya existe: la tarjeta entra
-- en «Pendiente» → aparece la etiqueta → el seguimiento con disparador
-- `tag_added` manda el recordatorio a las dos horas. Cero código nuevo.
--
-- ── UN SOLO ESCRITOR, Y AHÍ ESTÁ TODO EL CUIDADO ──────────────────────────
--
-- El disparador va sobre `opportunities.stage_id`, NO dentro de la función que
-- mueve la tarjeta por eventos. Si lo escribiera aquella, la etiqueta se
-- quedaría vieja en cuanto alguien ARRASTRARA una tarjeta a mano — y entonces
-- habría dos respuestas a «dónde está esta persona» y ninguna forma de saber
-- cuál vale.
--
-- Así da igual quién la mueva: un evento, un arrastre, una edición en lote o
-- una consulta suelta. La etiqueta sale del mismo sitio que la verdad.
--
-- ── EL GRUPO «Etapa» HACE EL TRABAJO SUCIO ────────────────────────────────
--
-- Las etiquetas de esta plataforma ya tienen grupos, y dentro de un grupo solo
-- puede haber UNA a la vez (ver `poner_etiqueta`). Metiendo las etapas en el
-- grupo «Etapa», la propia plataforma garantiza que nadie acumule cinco: no hay
-- que escribir la lógica de quitar la anterior, ya existe y está probada.
--
-- Y las etiquetas que puso el negocio a mano NO SE TOCAN: solo se reemplazan
-- las del mismo grupo.
--
-- ── SOLO EL EMBUDO PRINCIPAL ──────────────────────────────────────────────
--
-- Con varios embudos, una persona podría estar en dos etapas a la vez y las dos
-- etiquetas se pisarían —quedaría la última en escribirse, o sea la que gane la
-- carrera—. Limitarlo al embudo por defecto evita esa ambigüedad mientras el
-- caso sea raro. Cuando haya clientes usando dos embudos de verdad, la etiqueta
-- tendrá que llevar el nombre del embudo dentro.
-- ─────────────────────────────────────────────────────────────────────────────

-- `etiqueta_automatica` aprende a poner el grupo. La firma cambia con un
-- parámetro NUEVO Y CON VALOR POR DEFECTO, así que las llamadas de la 0098
-- siguen funcionando sin tocarlas.
create or replace function public.etiqueta_automatica(
  p_org_id uuid, p_contacto uuid, p_nombre text, p_color text default '#6E42FF',
  p_grupo text default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_org_id is null or p_contacto is null or coalesce(btrim(p_nombre),'') = '' then return; end if;

  -- `coalesce(tags.grupo, excluded.grupo)`: si el negocio ya tenía una etiqueta
  -- con ese nombre y la había agrupado a su manera, MANDA LA SUYA. Lo que
  -- automatiza la plataforma no puede reorganizarle las etiquetas a nadie.
  insert into public.tags (org_id, name, color, grupo)
  values (p_org_id, p_nombre, p_color, p_grupo)
  on conflict (org_id, name) do update set grupo = coalesce(public.tags.grupo, excluded.grupo);

  perform public.poner_etiqueta(p_org_id, p_contacto, p_nombre);
exception when others then
  raise warning '[etiqueta_automatica] no pude poner %: %', p_nombre, sqlerrm;
end $$;

revoke execute on function public.etiqueta_automatica(uuid, uuid, text, text, text) from public, anon, authenticated;
grant  execute on function public.etiqueta_automatica(uuid, uuid, text, text, text) to service_role;

create or replace function public.crm_etiqueta_de_etapa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_etapa   text;
  v_default boolean;
begin
  if new.contact_id is null or new.stage_id is null then return null; end if;

  select p.is_default into v_default from pipelines p where p.id = new.pipeline_id;
  if not coalesce(v_default, false) then return null; end if;

  select cs.name into v_etapa from conversation_states cs where cs.id = new.stage_id;
  if coalesce(btrim(v_etapa), '') = '' then return null; end if;

  perform public.etiqueta_automatica(new.org_id, new.contact_id, v_etapa, '#8B5CF6', 'Etapa');
  return null;

exception when others then
  -- Etiquetar es una comodidad; mover la tarjeta es lo que el dueño pidió.
  -- Misma lección que la 0090: ningún añadido puede tumbar lo de abajo.
  raise warning '[crm_etiqueta_de_etapa] (%): %', sqlstate, sqlerrm;
  return null;
end $$;

drop trigger if exists etiqueta_de_etapa on public.opportunities;
create trigger etiqueta_de_etapa
  after insert or update of stage_id on public.opportunities
  for each row execute function public.crm_etiqueta_de_etapa();

comment on function public.crm_etiqueta_de_etapa is
  'Mantiene una etiqueta con la etapa del embudo principal, en el grupo Etapa. UN SOLO ESCRITOR: da igual si la tarjeta la movió un evento, un arrastre o una consulta.';

-- ── LAS QUE YA ESTÁN ──────────────────────────────────────────────────────
-- Sin esto, la etiqueta solo aparecería la próxima vez que cada tarjeta se
-- moviera: un embudo lleno de gente sin etiquetar y un dueño que prueba la
-- función el primer día y concluye que no sirve.
do $$
declare r record;
begin
  for r in
    select o.org_id, o.contact_id, cs.name as etapa
      from opportunities o
      join pipelines p on p.id = o.pipeline_id and p.is_default
      join conversation_states cs on cs.id = o.stage_id
     where o.contact_id is not null
  loop
    perform public.etiqueta_automatica(r.org_id, r.contact_id, r.etapa, '#8B5CF6', 'Etapa');
  end loop;
end $$;
