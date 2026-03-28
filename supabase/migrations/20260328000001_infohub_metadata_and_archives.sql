-- ============================================================
-- INFOHUB PERSISTENCE FIELDS
-- Adds metadata, archive support, and persisted folder ordering
-- so the InfoHub UI can use Supabase as its source of truth.
-- ============================================================

alter table if exists infohub_folders
  add column if not exists sort_order integer;

alter table if exists infohub_documents
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table if exists infohub_documents
  add column if not exists archived_at timestamptz;

create index if not exists infohub_folders_org_section_parent_sort_idx
  on infohub_folders (organization_id, section, parent_id, sort_order);

create index if not exists infohub_documents_org_section_archived_idx
  on infohub_documents (organization_id, section, archived_at);
