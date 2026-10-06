-- ═══════════════════════════════════════════════════════════════════════════
-- 0066 · Calificar SIN depender de que el modelo se acuerde.
--
-- EL PROBLEMA. La IA conversa bien y captura bien: en la prueba del 1 sep
-- guardó la ciudad y el nombre sin que nadie se lo recordara. Lo que NO se
-- puede garantizar es que DECIDA etiquetar en el momento correcto. Pedírselo
-- en el prompt lo hace probable, no seguro — y «probable» no sirve para una
-- regla de negocio con dinero detrás: «≥900 es lead alto» tiene que cumplirse
-- las mil veces, no novecientas.
--
-- LA SOLUCIÓN. Se reparte el trabajo por lo que cada uno hace bien:
--
--   La IA          → conversa y captura el dato («ingreso = 500»).
--   Esta migración → compara contra el umbral y etiqueta. Siempre.
--
-- Y como es un disparador sobre la ficha, da igual QUIÉN escribió el dato: la
-- herramienta del agente, un bloque del flujo, o un vendedor tecleándolo a
-- mano en la Bandeja. Los tres caminos califican igual.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.reglas_de_calificacion (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- La clave del dato: un campo de «Datos del lead» (`ingreso`, `presupuesto`)
  -- o uno de los fijos de la ficha (`email`, `phone`, `name`, `company`).
  campo       text not null,
  operador    text not null,
  -- Se guarda como texto y se compara como número cuando los dos lados lo son.
  -- Así la misma tabla sirve para «ingreso >= 900» y para «ciudad = Panamá».
  valor       text,
  etiqueta_id uuid not null references public.tags(id) on delete cascade,
  prioridad   integer not null default 0,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),

  constraint operador_conocido check (
    operador in ('>=','<=','>','<','=','!=','contiene','vacio','no_vacio')
  )
);

create index if not exists reglas_calif_org_idx
  on public.reglas_de_calificacion (org_id, activa, prioridad desc);

alter table public.reglas_de_calificacion enable row level security;

revoke all on public.reglas_de_calificacion from public, anon;
grant select, insert, update, delete on public.reglas_de_calificacion to authenticated;

drop policy if exists reglas_calif_de_mi_org on public.reglas_de_calificacion;
create policy reglas_calif_de_mi_org on public.reglas_de_calificacion
  for all
  using (org_id in (select auth_org_ids()))
  with check (org_id in (select auth_org_ids()));

-- ── El valor de un campo, venga de donde venga ─────────────────────────────
--
-- Un dato puede estar en la casilla fija de la ficha o en los atributos, según
-- quién lo escribiera. Para una regla eso es indiferente: lo que importa es el
-- dato, no dónde acabó guardado.
create or replace function public.valor_del_campo(c public.contacts, p_campo text)
returns text
language sql
immutable
as $$
  select coalesce(
    case lower(p_campo)
      when 'name'    then c.name
      when 'nombre'  then c.name
      when 'email'   then c.email
      when 'correo'  then c.email
      when 'phone'   then c.phone
      when 'telefono' then c.phone
      when 'company' then c.company
      when 'empresa' then c.company
      else null
    end,
    c.attributes ->> p_campo
  );
$$;

-- ── ¿Se cumple una regla? ──────────────────────────────────────────────────
--
-- LA COMPARACIÓN NUMÉRICA SE INTENTA PRIMERO y esto importa: la gente escribe
-- «1000 dolitas», no «1000». Se extrae el primer número del texto; si los dos
-- lados son números, se comparan como números. Si no, como texto.
--
-- Sin esto, «>= 900» contra «1000 dolitas» compararía cadenas y diría que NO,
-- porque "1" va antes que "9" en el alfabeto. Un lead bueno calificado como
-- malo por una comparación de texto es justo la clase de error que nadie mira.
create or replace function public.regla_se_cumple(
  p_valor text,
  p_operador text,
  p_esperado text
) returns boolean
language plpgsql
immutable
as $$
declare
  v_num  numeric;
  e_num  numeric;
  v_txt  text := lower(coalesce(p_valor, ''));
  e_txt  text := lower(coalesce(p_esperado, ''));
begin
  if p_operador = 'vacio'    then return coalesce(trim(p_valor), '') = ''; end if;
  if p_operador = 'no_vacio' then return coalesce(trim(p_valor), '') <> ''; end if;

  -- Sin dato no se cumple ninguna comparación: un contacto del que todavía no
  -- sabemos el ingreso NO es «menor que 900». Es desconocido, que no es lo
  -- mismo — y tratarlo como bajo calificaría a todo el mundo al primer mensaje.
  if coalesce(trim(p_valor), '') = '' then return false; end if;

  v_num := substring(replace(p_valor, ',', '') from '-?[0-9]+\.?[0-9]*')::numeric;
  e_num := substring(replace(coalesce(p_esperado,''), ',', '') from '-?[0-9]+\.?[0-9]*')::numeric;

  if v_num is not null and e_num is not null then
    case p_operador
      when '>='      then return v_num >= e_num;
      when '<='      then return v_num <= e_num;
      when '>'       then return v_num >  e_num;
      when '<'       then return v_num <  e_num;
      when '='       then return v_num =  e_num;
      when '!='      then return v_num <> e_num;
      when 'contiene' then return v_txt like '%' || e_txt || '%';
      else return false;
    end case;
  end if;

  case p_operador
    when '='        then return v_txt = e_txt;
    when '!='       then return v_txt <> e_txt;
    when 'contiene' then return v_txt like '%' || e_txt || '%';
    else return false;   -- comparar «mayor que» entre textos no significa nada
  end case;
exception when others then
  -- Una regla mal escrita no puede tumbar la conversación de nadie.
  return false;
end $$;

-- ── Calificar ──────────────────────────────────────────────────────────────
--
-- GANA LA PRIMERA REGLA QUE SE CUMPLE, por prioridad. El orden es la regla:
-- igual que en el bloque de condición del constructor, quien escribe las
-- reglas decide qué manda poniéndolas en orden.
create or replace function public.calificar_contacto(
  p_org_id uuid,
  p_contact_id uuid
) returns text
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  c public.contacts;
  r record;
begin
  select * into c from public.contacts
   where id = p_contact_id and org_id = p_org_id;
  if not found then return null; end if;

  for r in
    select rc.campo, rc.operador, rc.valor, t.name as etiqueta
      from public.reglas_de_calificacion rc
      join public.tags t on t.id = rc.etiqueta_id
     where rc.org_id = p_org_id and rc.activa
     order by rc.prioridad desc, rc.created_at
  loop
    if regla_se_cumple(valor_del_campo(c, r.campo), r.operador, r.valor) then
      perform poner_etiqueta(p_org_id, p_contact_id, r.etiqueta);
      return r.etiqueta;
    end if;
  end loop;

  return null;
end $$;

revoke all on function public.calificar_contacto(uuid, uuid) from public, anon;
grant execute on function public.calificar_contacto(uuid, uuid) to service_role, authenticated;

-- ── Que se dispare solo ────────────────────────────────────────────────────
--
-- AFTER UPDATE OF los campos de datos — NO de `tags`. Es lo que evita el
-- bucle: `poner_etiqueta` solo toca `tags`, así que etiquetar no vuelve a
-- disparar la calificación.
--
-- `pg_trigger_depth()` es el segundo cinturón: si alguna vez alguien añade un
-- disparador que escriba atributos, esto no se llama a sí mismo en cadena.
create or replace function public.calificar_al_cambiar_datos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  perform calificar_contacto(new.org_id, new.id);
  return new;
end $$;

drop trigger if exists contacts_calificar on public.contacts;
create trigger contacts_calificar
  after insert or update of attributes, email, phone, name, company
  on public.contacts
  for each row execute function public.calificar_al_cambiar_datos();
