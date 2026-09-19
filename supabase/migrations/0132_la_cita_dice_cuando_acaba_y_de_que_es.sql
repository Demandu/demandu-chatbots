-- La cita dice cuándo acaba y de qué es
--
-- La 0131 le puso teléfono y canal. Faltaba lo que un CRM necesita para
-- pintar la cita en su calendario: CUÁNDO TERMINA. Zoho —y cualquier otro—
-- pide inicio y fin; con solo el inicio, la reunión queda de duración cero.
--
-- Van también `titulo`, `servicio`, `duracion_min` y `enlace`, que ya están en
-- la fila y no cuestan nada mandar. Un evento pobre obliga a que cada
-- integración vuelva a preguntar por lo que ya sabíamos.

create or replace function public.cita_cuenta_lo_que_pasa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_evento   text;
  v_telefono text;
  v_canal    text;
begin
  if tg_op = 'INSERT' then
    v_evento := 'cita.agendada';
  elsif new.estado is distinct from old.estado then
    v_evento := case new.estado
      when 'cancelada' then 'cita.cancelada'
      when 'movida'    then 'cita.movida'
      else null
    end;
  elsif new.inicio is distinct from old.inicio then
    v_evento := 'cita.movida';
  end if;

  if v_evento is null then return null; end if;

  -- Si la ficha no existe o no se puede leer, la cita SALE IGUAL sin teléfono.
  -- Avisar a un CRM tarde es malo; no avisarle nunca es peor.
  begin
    select coalesce(c.phone, case when c.channel = 'whatsapp' then c.external_id end),
           c.channel
      into v_telefono, v_canal
      from public.contacts c
     where c.id = new.contact_id;
  exception when others then
    v_telefono := null;
    v_canal    := null;
  end;

  perform public.emitir_evento(new.org_id, v_evento, jsonb_build_object(
    'cita_id',         new.id,
    'contacto_id',     new.contact_id,
    'conversacion_id', new.conversation_id,
    'inicio',          new.inicio,
    'fin',             new.fin,
    'titulo',          new.titulo,
    'servicio',        new.servicio_nombre,
    'duracion_min',    new.duracion_min,
    'enlace',          new.enlace,
    'correo',          new.correo,
    'nombre',          new.nombre,
    'por',             new.proveedor,
    'telefono',        v_telefono,
    'canal',           v_canal
  ));
  return null;

exception when others then
  raise warning '[cita_cuenta_lo_que_pasa] (%): %', sqlstate, sqlerrm;
  return null;
end $function$;
