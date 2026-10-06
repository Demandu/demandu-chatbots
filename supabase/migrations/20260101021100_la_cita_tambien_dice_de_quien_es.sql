-- La cita también dice de quién es
--
-- `cita.agendada` (y `movida` y `cancelada`) salían SIN teléfono. El único
-- dato que compartían con `lead.nuevo` era `contacto_id`, así que un CRM de
-- fuera solo podía enlazar la cita con su lead si había guardado ese id antes.
-- Para un lead de WhatsApp la llave natural es el teléfono, y no viajaba.
--
-- Se añaden `telefono` y `canal`, leídos de la ficha del contacto.
--
-- POR QUÉ `coalesce(phone, external_id)` Y NO `phone` A SECAS: hoy hay 27
-- contactos y solo 18 tienen `phone`; los 27 tienen `external_id`. En WhatsApp
-- `external_id` ES el número. Mirar solo `phone` habría dejado un tercio de
-- las citas sin teléfono, que es justo el fallo que esto viene a cerrar.
--
-- El `case` sobre el canal está a propósito: en el widget web o en Instagram
-- `external_id` NO es un teléfono, y mandar un identificador de Instagram en
-- un campo que se llama `telefono` es peor que mandarlo vacío.

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
