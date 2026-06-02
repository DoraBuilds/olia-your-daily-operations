-- Add sort_order to folders so drag-to-reorder persists across sessions.

ALTER TABLE folders ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

-- Backfill existing rows: preserve current alphabetical order within each parent.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY COALESCE(parent_id::text, '__root__')
           ORDER BY name
         ) - 1 AS rn
  FROM folders
)
UPDATE folders SET sort_order = ranked.rn FROM ranked WHERE folders.id = ranked.id;
