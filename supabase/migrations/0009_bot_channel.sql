-- ============================================================================
-- 0009 · Canal del bot
-- Cada bot pertenece a un canal (whatsapp | instagram | messenger | webchat).
-- El Constructor muestra los componentes específicos de ese canal.
-- ============================================================================

alter table bots add column if not exists channel text not null default 'webchat';
