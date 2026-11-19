-- =============================================================================
-- Phase 23 (FINAL BATCH — Change 6) — adds 'Details Sent' as a valid value
-- for public.leads.status, IF AND ONLY IF this database actually has a
-- CHECK constraint restricting that column to a fixed value list.
--
-- IMPORTANT — THIS FILE HAS NOT BEEN EXECUTED. It was written for the
-- project owner to review and run manually in the Supabase SQL editor, per
-- this engagement's explicit instruction not to execute SQL against
-- Supabase or change production data. Whether this migration is needed AT
-- ALL is currently UNKNOWN — see "WHY THIS IS GUARDED" below.
--
-- WHY THIS IS GUARDED (unlike phase22's country_code/salutation columns,
-- which this project's own migration file explicitly chose to leave
-- unconstrained at the database level):
--   Every SQL migration file present in this repository was inspected
--   (lead-priority-migration.sql, phase11-quotation-migration.sql,
--   phase13-finance-security-migration.sql, phase20-hsn-rpc-update.sql,
--   phase21-cgst-sgst-igst-migration.sql, phase22-contact-details-
--   migration.sql). None of them contains the original CREATE TABLE
--   statement for public.leads, and none of them defines or mentions any
--   CHECK constraint on public.leads.status — only lead_priority has a
--   documented CHECK constraint (leads_lead_priority_check, added by
--   lead-priority-migration.sql, restricting it to 'hot'/'warm'/'cold').
--   That means leads.status's schema (whether it has a CHECK constraint,
--   an enum type, a trigger, or no server-side restriction at all) predates
--   every migration file available in this repo and cannot be determined
--   from static inspection alone.
--
--   The constraint name assumed below (leads_status_check) is an EDUCATED
--   GUESS based on this project's own established naming convention for
--   unnamed, single-column inline CHECK constraints — Postgres's own
--   default naming scheme is exactly `<table>_<column>_check`, and this is
--   the same pattern leads_lead_priority_check itself follows (mirrored,
--   not invented, from that constraint's own explicit ADD CONSTRAINT
--   name). It is NOT a confirmed fact. If the real constraint (if one
--   exists at all) has a different, explicitly-chosen name, the DROP
--   IF EXISTS below will simply find nothing to drop (a safe no-op) and the
--   ADD CONSTRAINT will then attempt to add a second, differently-named
--   constraint alongside whatever already exists — which could conflict
--   with the existing one instead of replacing it.
--
-- BEFORE RUNNING THIS: in the Supabase SQL editor, first run:
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'public.leads'::regclass AND contype = 'c';
-- to see the ACTUAL constraint (if any) and its real name and definition.
--   - If that query returns NOTHING for the status column, this migration
--     is not needed at all — the application layer (js/constants.js
--     OPTIONS.status, already updated) is the only place the allowed value
--     list is enforced, exactly like lead_source and business_domain
--     already work today, and 'Details Sent' will already save without
--     any database change.
--   - If it returns a constraint on status with a DIFFERENT name than
--     leads_status_check, replace the name below with the real one before
--     running this file.
--
-- WHAT THIS FILE DOES IF RUN (and a leads_status_check constraint exists,
-- or does not exist at all):
--   - Drops any existing constraint by this name (IF EXISTS — a safe no-op
--     if it doesn't exist under this name).
--   - Re-adds it covering every existing status value PLUS 'Details Sent',
--     so no already-stored lead.status value is invalidated by this change
--     — every one of the 7 pre-existing values in js/constants.js's
--     OPTIONS.status is listed here unchanged, in the same order, with
--     'Details Sent' inserted in the same position Change 6 placed it in
--     the application layer (between 'Meeting Completed' and
--     'Proposal Sent').
--   - Allows NULL (matching leads_lead_priority_check's own
--     "column IS NULL OR column IN (...)" pattern) so this cannot
--     retroactively break any row that has a NULL status, if any exist.
-- =============================================================================

ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_status_check
  CHECK (status IS NULL OR status IN (
    'New',
    'Contacted',
    'Meeting Scheduled',
    'Meeting Completed',
    'Details Sent',
    'Proposal Sent',
    'Converted',
    'Lost'
  ));

-- Rollback (only relevant if the ADD CONSTRAINT above was actually run):
-- ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
-- -- then, if a constraint existed before this migration under a different
-- -- name or definition, re-add it exactly as it was (not reproduced here
-- -- since its original definition, if any, was never confirmed).
