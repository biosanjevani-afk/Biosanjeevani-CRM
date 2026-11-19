-- ============================================================================
-- Lead Priority (Hot/Warm/Cold) feature — proposed database migration
-- ============================================================================
-- STATUS: NOT EXECUTED. This file is delivered for your own review and
-- manual execution in the Supabase SQL editor (or your usual migration
-- process) — no SQL has been run against your database from this session.
--
-- WHY THIS IS NEEDED
-- Audited js/constants.js, js/leads-api.js, js/app.js, js/ui.js and the
-- existing lead form/table/filters. No existing column represents a
-- Hot/Warm/Cold classification:
--   - leads.lead_type already exists but is a SEPARATE, unrelated concept
--     (Project / Product / Partnership / Service / Other — "what kind of
--     opportunity is this", already shown in the table's "Type" column).
--   - leads.status is the separate pipeline-stage concept (New / Contacted
--     / Meeting Scheduled / ... / Converted / Lost).
-- So a new column is required. Per your approval (via the AskUserQuestion
-- prompt: "Approve lead_priority, do both now"), the new column is named
-- `lead_priority` — NOT `lead_type` — specifically to avoid colliding with
-- the existing unrelated lead_type field.
--
-- Stored values are lowercase 'hot' / 'warm' / 'cold' (never the display
-- text "Hot Lead"/"Warm Lead"/"Cold Lead" — that mapping lives only in the
-- frontend, in js/constants.js's LEAD_PRIORITY_LABELS).
--
-- Per your approval (via the AskUserQuestion prompt: "Add the CHECK
-- constraint"), this migration restricts the column to exactly these three
-- values (plus NULL, for existing/unclassified leads — see below).
-- ============================================================================

-- 1. Add the column. Nullable by design: existing leads have no Lead Type
--    today and must NOT be auto-assigned one (manual classification only,
--    per the brief) — they simply display as "Not set" / unassigned in the
--    UI until a human picks a value. New leads created going forward are
--    required to pick a value at the APPLICATION layer (the Add Lead form
--    marks this field required via HTML5 validation) — this migration does
--    NOT add a NOT NULL constraint, so it does not retroactively touch or
--    reject any existing row.
ALTER TABLE public.leads
  ADD COLUMN lead_priority text;

-- 2. Restrict the column to exactly the three approved values, or NULL
--    (NULL is explicitly allowed so existing/unclassified leads are
--    unaffected — a CHECK constraint only ever rejects a NON-NULL value
--    that fails the condition; it never rejects NULL).
ALTER TABLE public.leads
  ADD CONSTRAINT leads_lead_priority_check
  CHECK (lead_priority IS NULL OR lead_priority IN ('hot', 'warm', 'cold'));

-- ============================================================================
-- ROW-LEVEL SECURITY — NOT MODIFIED BY THIS MIGRATION
-- ============================================================================
-- Existing RLS policies on public.leads apply automatically to new columns
-- (Postgres RLS operates per-row, not per-column), so no RLS policy change
-- is expected to be required for this new column to work under the same
-- read/write rules that already govern every other lead field for each
-- role (admin/manager/member).
--
-- This session could not read your live RLS policy text directly (no
-- database connection is available from this sandbox), so this expectation
-- is based on how Postgres RLS behaves generally, not a direct inspection
-- of your policies. If, after applying this migration, you find that
-- saving or filtering by Lead Priority is unexpectedly blocked for a role
-- that should be able to use it, that would indicate a role-specific
-- column-level GRANT or a column-list in an existing policy that explicitly
-- enumerates leads columns — please let me know rather than editing RLS
-- yourself, so it can be diagnosed against the real policy definitions.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (only if you need to undo this migration)
-- ============================================================================
-- ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_lead_priority_check;
-- ALTER TABLE public.leads DROP COLUMN IF EXISTS lead_priority;
