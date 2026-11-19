import { supabase } from './supabase.js?v=20260902a';

const TABLE = 'leads';
// Feature 3: plant_capacity/plant_capacity_custom/feedstock_availability/
// plant_location appended for the new "Plant details" section — see
// js/constants.js's EMPTY_LEAD and js/ui.js openLeadModal. lead_priority
// appended for the Lead Priority (Hot/Warm/Cold) feature — see the same
// file's OPTIONS.lead_priority/LEAD_PRIORITY_LABELS comment for why it is
// NOT named lead_type. Phase 22: salutation and country_code appended for
// the Salutation + Country Code feature — both nullable, both stored
// separately from client_name/phone_number (see phase22-contact-details-
// migration.sql). Every other column here is unchanged.
const LEAD_COLUMNS = 'id, created_at, salutation, client_name, company_name, country_code, phone_number, email, description, meeting_taken_by, meeting_date, business_domain, lead_type, status, lead_source, assigned_to, next_action, next_action_date, next_action_notes, plant_capacity, plant_capacity_custom, feedstock_availability, plant_location, lead_priority, updated_at';

function cleanLead(lead) {
  return Object.fromEntries(Object.entries(lead).map(([key, value]) => [key, typeof value === 'string' ? value.trim() || null : value]));
}

export async function fetchLeads() {
  const { data, error } = await supabase.from(TABLE).select(LEAD_COLUMNS).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLead(lead) {
  const { data, error } = await supabase.from(TABLE).insert(cleanLead(lead)).select().single();
  if (error) throw error;
  return data;
}

export async function updateLead(leadId, lead) {
  const { data, error } = await supabase
    .from('leads')
    .update({ ...cleanLead(lead), updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteLead(leadId) {
  // Phase 6C: a DELETE that RLS silently filters out (no row matched the
  // policy's USING clause) comes back as a normal success with an empty
  // `data` array and no `error` — PostgREST cannot otherwise distinguish
  // "blocked by RLS" from "genuinely deleted" here. Requesting the deleted
  // row back via .select('id') lets the caller tell the two apart: only
  // data.length > 0 means a row was actually removed.
  const { data, error } = await supabase
    .from('leads')
    .delete()
    .eq('id', leadId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('This lead could not be deleted. It may already be gone, or you may not have permission to delete it.');
  }
}

// Phase 5A.3: team members for lead assignment. Read-only lookup against
// public.profiles — no writes, no changes to lead CRUD behavior.
export async function fetchProfiles() {
  const { data, error } = await supabase.from('profiles').select('id, full_name, role').order('full_name', { ascending: true });
  if (error) throw error;
  return data;
}

// Phase 6C-3: Team Management role editing. Same success-detection pattern
// as deleteLead()/deleteLeadActivity() above: an UPDATE that Phase 6B RLS
// silently filters out (the caller isn't admin/manager) comes back as a
// normal success with an empty `data` array and no `error`, so a zero-row
// result must be treated as a failure — otherwise a blocked role change
// would show a false "Role updated" toast the same way the old delete bug
// did. The frontend never decides whether the change is allowed; it only
// reports whatever Supabase/RLS actually did.
export async function updateProfileRole(profileId, role) {
  const { data, error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', profileId)
    .select('id, full_name, role');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('This role change could not be saved. You may not have permission to manage team members.');
  }
  return data[0];
}

// Phase 5C: lead activity timeline against the existing public.lead_activities
// table (schema/RLS untouched). Newest first: activity_date desc, then
// created_at desc as a same-day tiebreaker. created_by is always supplied by
// the caller from the authenticated session — never trust a client value for it.
const ACTIVITY_COLUMNS = 'id, lead_id, created_at, created_by, activity_type, notes, activity_date';

export async function fetchLeadActivities(leadId) {
  const { data, error } = await supabase
    .from('lead_activities')
    .select(ACTIVITY_COLUMNS)
    .eq('lead_id', leadId)
    .order('activity_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createLeadActivity(activity) {
  const { data, error } = await supabase.from('lead_activities').insert(activity).select().single();
  if (error) throw error;
  return data;
}

export async function deleteLeadActivity(activityId) {
  // Phase 6C (final fix): same reasoning as deleteLead() above — a DELETE
  // that RLS silently filters out (the caller doesn't own this activity)
  // comes back as a normal success with an empty `data` array and no
  // `error`. Requesting the deleted row back via .select('id') lets the
  // caller tell "genuinely deleted" apart from "blocked by RLS": only
  // data.length > 0 means a row was actually removed.
  const { data, error } = await supabase
    .from('lead_activities')
    .delete()
    .eq('id', activityId)
    .select('id');
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error('This activity could not be deleted. It may already be gone, or you may not have permission to delete it.');
  }
}
