-- ═══════════════════════════════════════════════════════════════════════════
-- 0067 · Cuántos leads trajo cada campaña.
--
-- POR QUÉ UNA FUNCIÓN APARTE Y NO DENTRO DE `analytics_overview`:
-- `analytics_overview` ya es larga y la toca cualquier cambio del tablero.
-- Esto se pregunta por CONTACTOS (de dónde vino cada persona), no por
-- conversaciones, y no se filtra por chatbot ni por canal — un anuncio trae a
-- alguien, y a quién lo atienda después le da igual al anuncio. Meterlo dentro
-- obligaría a arrastrar filtros que aquí no significan nada.
--
-- DE DÓNDE SALE EL DATO. Lo escribe `guardar_origen()` (migración 0065) con lo
-- que manda WhatsApp:
--   · Anuncio de Meta → el webhook trae `referral` con el id del anuncio.
--   · Todo lo demás   → el marcador `[cmp:codigo]` en el primer mensaje, que
--                       es lo que se pone en un `wa.me/...?text=`.
-- ═══════════════════════════════════════════════════════════════════════════

-- SIN `security definer`, IGUAL QUE `analytics_overview`. Con definer, la
-- función leería saltándose RLS y cualquier usuario autenticado que pasara el
-- id de otra organización vería sus campañas. Aquí manda RLS, y además se
-- comprueba la organización a la cara para fallar ruidosamente en vez de
-- devolver ceros silenciosos.
create or replace function public.analytics_campanas(
  p_org   uuid,
  p_desde timestamptz,
  p_hasta timestamptz
) returns jsonb
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $$
begin
if p_org is null or p_org not in (select auth_org_ids()) then
  raise exception 'sin acceso a esa organización';
end if;

return (
with leads as (
  select
    ct.id,
    -- FACEBOOK E INSTAGRAM VAN JUNTOS COMO «meta», y no es pereza: el webhook
    -- de WhatsApp manda EXACTAMENTE el mismo objeto `referral` para un anuncio
    -- visto en Facebook y para uno visto en Instagram — no incluye la
    -- colocación. Separarlos sería repartir a ojo un número que no tenemos, y
    -- alguien movería presupuesto con él.
    coalesce(
      nullif(ct.origen->>'plataforma', ''),
      case when ct.origen->>'tipo' in ('ad','post') then 'meta' else 'enlace' end
    ) as plataforma,
    coalesce(
      nullif(ct.origen->>'anuncio_id',''),
      nullif(ct.origen->>'titular',''),
      'sin identificar'
    ) as campana,
    nullif(ct.origen->>'titular','') as titular,
    -- La columna que de verdad importa: un anuncio que trae cien curiosos vale
    -- menos que uno que trae diez personas pidiendo hablar con un asesor.
    exists (
      select 1 from conversations cv
       where cv.contact_id = ct.id and cv.handoff_requested_at is not null
    ) as paso_a_persona
  from contacts ct
  where ct.org_id = p_org
    and ct.origen is not null
    and ct.created_at >= p_desde
    and ct.created_at <  p_hasta
),
plataformas as (
  select plataforma,
         count(*)                                as leads,
         count(*) filter (where paso_a_persona)  as pasaron
    from leads group by plataforma
),
campanas as (
  select campana,
         max(titular)                            as titular,
         max(plataforma)                         as plataforma,
         count(*)                                as leads,
         count(*) filter (where paso_a_persona)  as pasaron
    from leads group by campana
   order by count(*) desc
   limit 20
)
select jsonb_build_object(
  'total_con_campana', (select count(*) from leads),
  'total_leads', (
    select count(*) from contacts
     where org_id = p_org and created_at >= p_desde and created_at < p_hasta
  ),
  -- El orden se hace sobre la COLUMNA numérica, nunca sobre el jsonb ya
  -- armado: `x->>'leads'` es texto, y en texto "9" va después de "10".
  'por_plataforma', coalesce((
    select jsonb_agg(
             jsonb_build_object('plataforma', plataforma,
                                'leads', leads,
                                'pasaron_a_persona', pasaron)
             order by leads desc)
      from plataformas
  ), '[]'::jsonb),
  'por_campana', coalesce((
    select jsonb_agg(
             jsonb_build_object('campana', campana,
                                'titular', titular,
                                'plataforma', plataforma,
                                'leads', leads,
                                'pasaron_a_persona', pasaron)
             order by leads desc)
      from campanas
  ), '[]'::jsonb)
)
);
end $$;

revoke all on function public.analytics_campanas(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_campanas(uuid, timestamptz, timestamptz) to authenticated, service_role;
