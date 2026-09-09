-- ═══════════════════════════════════════════════════════════════════════════
-- QUÉ CALENDARIOS SE VEN EN LA PANTALLA DE AGENDA.
--
-- La primera versión enseñaba TODOS los calendarios que el negocio posee. En la
-- cuenta de Demandu, el primer día, eso puso en pantalla:
--
--     «Ultrasonido estructural Darwin Bracho»
--     «Genesis Robles's birthday»
--
-- Una cita médica y un cumpleaños, en una pantalla que abre el vendedor. No es
-- un caso raro: el calendario de trabajo de cualquiera lleva médicos, colegios y
-- cumpleaños, porque un calendario es de una persona antes que de una empresa.
--
-- ── EL VALOR POR DEFECTO ES EL PRUDENTE ───────────────────────────────────
--
-- NULL = «no lo he elegido» y NO significa «todos». Significa: el principal más
-- aquellos donde la plataforma ya agendó, que son los que el negocio eligió para
-- esto. Lo demás se enciende a mano, sabiendo lo que se enciende.
--
-- Al revés —enseñar todo y dejar apagar— la sorpresa ya ocurrió cuando alguien
-- se da cuenta. Esa asimetría es la que manda: encender de más cuesta un clic;
-- enseñar de más cuesta explicarle a un empleado por qué vio tu ecografía.
--
-- Es un array de identificadores de calendario, no de nombres: el nombre lo
-- cambia el dueño desde Google y la pantalla se quedaría apuntando a nada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.organizations
  add column if not exists calendarios_visibles text[];

comment on column public.organizations.calendarios_visibles is
  'Identificadores de los calendarios que se ven en la pantalla de agenda. '
  'NULL = el principal más donde ya se agenda; nunca significa «todos».';
