-- 0023 · Que la tarjeta del embudo no se quede con un nombre viejo
--
-- QUÉ PASABA: al crear una tarjeta, el disparador copia el nombre del contacto
-- en `opportunities.title`. Una copia, no un enlace. Así que al renombrar el
-- contacto —a mano desde la Bandeja, o en bloque como pasó al darles código a
-- los visitantes web— el Embudo seguía enseñando el nombre antiguo.
--
-- Se veía así: la ficha decía "Visitante 738B" y la tarjeta del mismo lead
-- seguía diciendo "Visitante web". Dos nombres para la misma persona en dos
-- pantallas es de las cosas que más rápido hacen desconfiar de un CRM.
--
-- POR QUÉ NO SE BORRA LA COPIA Y YA: el título SÍ se puede editar a mano
-- (ficha de la oportunidad). Alguien puede llamarle "Pedido de 50 pasteles" a
-- una tarjeta, y eso no debe perderse porque el contacto cambie de nombre.
--
-- LA REGLA: al renombrar un contacto, la tarjeta se actualiza SOLO si su
-- título seguía siendo exactamente el nombre anterior — es decir, si nadie lo
-- había tocado. Si alguien le puso nombre propio, se respeta.

create or replace function crm_titulo_sigue_al_contacto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $fn$
begin
  if new.name is not distinct from old.name then
    return new;
  end if;

  update opportunities
     set title = new.name
   where contact_id = new.id
     and title is not distinct from old.name;   -- solo la copia sin tocar

  return new;
end $fn$;

drop trigger if exists contacts_titulo_embudo on contacts;

create trigger contacts_titulo_embudo
  after update of name on contacts
  for each row execute function crm_titulo_sigue_al_contacto();

-- Igual que el resto de funciones internas: EXECUTE se concede a PUBLIC por
-- defecto y `anon` hereda de PUBLIC, así que revocar solo de `anon` no sirve.
revoke execute on function public.crm_titulo_sigue_al_contacto() from public, anon, authenticated;

-- Lo que ya quedó desfasado: solo el nombre genérico, que nadie escribió a
-- propósito. Un título de verdad no se toca.
update opportunities o
   set title = c.name
  from contacts c
 where c.id = o.contact_id
   and o.title = 'Visitante web'
   and c.name is not null
   and c.name <> 'Visitante web';
