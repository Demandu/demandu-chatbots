-- ============================================================================
-- 0003 · Opt-out / "dar de baja" del contacto
-- Un contacto dado de baja NUNCA recibe campañas, broadcasts ni plantillas,
-- aunque su número venga en un CSV o en un grupo de leads.
-- ============================================================================

alter table contacts add column if not exists opted_out boolean not null default false;
alter table contacts add column if not exists opted_out_at timestamptz;
alter table contacts add column if not exists opt_out_reason text;

-- Índice parcial: acelera las consultas de destinatarios elegibles (no dados de baja)
create index if not exists contacts_sendable_idx on contacts (org_id) where opted_out = false;

comment on column contacts.opted_out is 'Si true, NUNCA recibe campañas/broadcasts/plantillas, aunque esté en un CSV o grupo.';
