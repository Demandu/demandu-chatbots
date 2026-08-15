-- ============================================================================
-- 0008 · Campos de operación para la Bandeja
-- Asignación a un miembro del equipo, estado personalizado por conversación,
-- y contador de no leídos para los badges.
-- ============================================================================

alter table conversations add column if not exists assignee_member_id uuid references team_members(id) on delete set null;
alter table conversations add column if not exists state_id uuid references conversation_states(id) on delete set null;
alter table conversations add column if not exists unread int not null default 0;

create index if not exists conversations_state_idx on conversations(org_id, state_id);
