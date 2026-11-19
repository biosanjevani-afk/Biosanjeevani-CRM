import { supabase } from './supabase.js?v=20260902a';
import { fetchLeads, createLead, updateLead, deleteLead, fetchProfiles, fetchLeadActivities, createLeadActivity, deleteLeadActivity, updateProfileRole } from './leads-api.js?v=20260910a';
import { renderLogin, renderApp, renderMetrics, renderDashboard, renderLeads, openLeadModal, closeModal, setButtonLoading, setLoginButtonLoading, showToast, renderLeadActivityTimeline, renderTeamManagement, canManageLeads, renderDuplicateWarning, setCountryCodeExpanded } from './ui.js?v=20260916b';
import { getFollowUpStatus, FOLLOW_UP_LABELS } from './follow-up.js?v=20260902a';
import { confirmAction } from './confirm.js?v=20260902a';
import { LEAD_PRIORITY_LABELS } from './constants.js?v=20260910a';
import { exportLeadsPdf } from './leads-export.js?v=20260910a';
import { checkDuplicateLead, computeDuplicateLeadIds } from './lead-duplicates.js?v=20260910a';
// Phase 15 — client-side session policy (7-day max age / 24h inactivity,
// Free-plan hardening). See js/session-policy.js's own header comment for
// the full explanation, limitations, and removal instructions.
import { startSessionPolicy, stopSessionPolicy } from './session-policy.js?v=20260903a';

let allLeads = [];
let allProfiles = []; // Phase 5A.3: team members, loaded once per session and reused everywhere.
let currentLeadActivities = []; // Phase 5C: activity history for whichever lead is currently open in the modal.
let renderedUserId = null;
let currentUserRole = null; // Phase 6C: the signed-in user's own profiles.role, looked up from allProfiles after it loads. UI-only — RLS remains the actual enforcement boundary (see js/leads-api.js deleteLead and the Phase 6B SQL migration). Fails closed: null/unrecognized role is treated as not privileged everywhere it's used.
const escapeText = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
let lastModalTrigger = null;

async function loadProfiles() {
  try {
    allProfiles = await fetchProfiles();
  } catch (error) {
    allProfiles = [];
    console.error('fetchProfiles failed:', error);
    showToast('Could not load team members. Leads will show as Unassigned only.', 'error');
  }
  // Phase 6C: look up the signed-in user's own role from the profiles list
  // that was just loaded — no extra Supabase request needed. Left null if
  // the profile fetch failed or no matching row was found, which is the
  // safe/most-restricted default for every role-gated UI check below.
  currentUserRole = allProfiles.find(profile => profile.id === renderedUserId)?.role || null;
}
// Lead Priority + Plant Details filters: reads the same way every existing
// filter here does (a DOM control's current value, compared client-side
// against the already-loaded allLeads array). No new Supabase query is
// introduced by any of these three — the architecture is unchanged, only
// the filter predicate list is extended. Plant Location matching is a
// case-insensitive substring match against the stored value (never
// normalizes/alters the stored plant_location itself — this only reads it).
// Exported (Export Feature, task #184): js/leads-export.js calls this
// directly so the PDF export is built from EXACTLY the same filtered array
// the Leads table is currently rendering — no separate Supabase query, and
// no risk of the export ever disagreeing with what's on screen. Purely
// additive; every existing internal call site (refreshTable, etc.) is
// unaffected.
export function visibleLeads() {
  const query = document.querySelector('#search-input').value.trim().toLowerCase();
  const status = document.querySelector('#status-filter').value; const domain = document.querySelector('#domain-filter').value;
  const assignedTo = document.querySelector('#assigned-filter').value;
  const followUp = document.querySelector('#followup-filter').value;
  const priority = document.querySelector('#priority-filter').value;
  // Phase 22 — Feature 2: Lead Source filter. Reuses the existing
  // lead_source column/data — no new field, exact same
  // read-DOM-value/AND-into-predicate pattern as priority/capacity below.
  const source = document.querySelector('#source-filter').value;
  const capacity = document.querySelector('#capacity-filter').value;
  const location = document.querySelector('#location-filter').value.trim().toLowerCase();
  return allLeads.filter(lead => {
    const text = [lead.client_name, lead.company_name, lead.email, lead.phone_number, lead.country_code, lead.salutation].join(' ').toLowerCase();
    const matchesAssigned = !assignedTo || (assignedTo === 'unassigned' ? !lead.assigned_to : lead.assigned_to === assignedTo);
    const matchesFollowUp = !followUp || getFollowUpStatus(lead) === followUp;
    const matchesPriority = !priority || lead.lead_priority === priority;
    const matchesSource = !source || lead.lead_source === source;
    const matchesCapacity = !capacity || lead.plant_capacity === capacity;
    const matchesLocation = !location || (lead.plant_location || '').toLowerCase().includes(location);
    return (!query || text.includes(query)) && (!status || lead.status === status) && (!domain || lead.business_domain === domain) && matchesAssigned && matchesFollowUp && matchesPriority && matchesSource && matchesCapacity && matchesLocation;
  });
}
function refreshTable() {
  const leads = visibleLeads();
  renderLeads(leads, allLeads.length, allProfiles, currentUserRole, computeDuplicateLeadIds(allLeads));
  const resultCount = document.querySelector('#lead-result-count');
  const clearButton = document.querySelector('#clear-filters');
  const search = document.querySelector('#search-input').value.trim();
  const status = document.querySelector('#status-filter').value;
  const domain = document.querySelector('#domain-filter').value;
  const assignedTo = document.querySelector('#assigned-filter').value;
  const followUp = document.querySelector('#followup-filter').value;
  const priority = document.querySelector('#priority-filter').value;
  const source = document.querySelector('#source-filter').value;
  const capacity = document.querySelector('#capacity-filter').value;
  const location = document.querySelector('#location-filter').value.trim();
  const hasFilters = Boolean(search || status || domain || assignedTo || followUp || priority || source || capacity || location);
  if (resultCount) resultCount.textContent = hasFilters ? `${leads.length} of ${allLeads.length} leads` : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`;
  if (clearButton) clearButton.hidden = !hasFilters;
  document.querySelector('#clear-search').hidden = !search;
  renderActiveFilterChips({ search, status, domain, assignedTo, followUp, priority, source, capacity, location });
}
function assignedFilterLabel(assignedTo) {
  if (assignedTo === 'unassigned') return 'Unassigned';
  return allProfiles.find(profile => profile.id === assignedTo)?.full_name || 'Unassigned';
}
function capacityFilterLabel(capacity) { return capacity === 'OTHER' ? 'Other' : capacity; }
function renderActiveFilterChips({ search, status, domain, assignedTo, followUp, priority, source, capacity, location }) {
  const container = document.querySelector('#active-filter-chips');
  const chips = [
    { key: 'search', label: search ? `Search: ${search}` : '' },
    { key: 'status', label: status ? `Status: ${status}` : '' },
    { key: 'domain', label: domain ? `Domain: ${domain}` : '' },
    { key: 'assigned', label: assignedTo ? `Assigned: ${assignedFilterLabel(assignedTo)}` : '' },
    { key: 'followup', label: followUp ? `Follow-up: ${FOLLOW_UP_LABELS[followUp] || followUp}` : '' },
    { key: 'priority', label: priority ? `Lead Type: ${LEAD_PRIORITY_LABELS[priority] || priority}` : '' },
    { key: 'source', label: source ? `Lead Source: ${source}` : '' },
    { key: 'capacity', label: capacity ? `Plant Capacity: ${capacityFilterLabel(capacity)}` : '' },
    { key: 'location', label: location ? `Plant Location: ${location}` : '' },
  ].filter(chip => chip.label);
  container.hidden = chips.length === 0;
  container.innerHTML = chips.map(chip => `<button type="button" class="filter-chip" data-clear-filter="${chip.key}"><span>${escapeText(chip.label)}</span><span aria-hidden="true">×</span></button>`).join('');
}
// Exported (Export Feature, task #184): the PDF export's "Filters:" summary
// block needs the exact same active-filter label text already shown as
// on-screen chips. Reuses the SAME label-resolution helpers
// (assignedFilterLabel/capacityFilterLabel/LEAD_PRIORITY_LABELS/
// FOLLOW_UP_LABELS) renderActiveFilterChips already uses above, rather than
// reimplementing how any of those labels are derived — this function only
// re-reads the current DOM control values (never a filtering predicate) to
// produce the same shape of chip list, so js/leads-export.js can turn it
// into plain export-summary text via export-utils.js's
// buildFilterSummaryLines().
export function computeActiveLeadFilterChips() {
  const search = document.querySelector('#search-input').value.trim();
  const status = document.querySelector('#status-filter').value;
  const domain = document.querySelector('#domain-filter').value;
  const assignedTo = document.querySelector('#assigned-filter').value;
  const followUp = document.querySelector('#followup-filter').value;
  const priority = document.querySelector('#priority-filter').value;
  const source = document.querySelector('#source-filter').value;
  const capacity = document.querySelector('#capacity-filter').value;
  const location = document.querySelector('#location-filter').value.trim();
  return [
    { key: 'search', label: search ? `Search: ${search}` : '' },
    { key: 'status', label: status ? `Status: ${status}` : '' },
    { key: 'domain', label: domain ? `Domain: ${domain}` : '' },
    { key: 'assigned', label: assignedTo ? `Assigned: ${assignedFilterLabel(assignedTo)}` : '' },
    { key: 'followup', label: followUp ? `Follow-up: ${FOLLOW_UP_LABELS[followUp] || followUp}` : '' },
    { key: 'priority', label: priority ? `Lead Type: ${LEAD_PRIORITY_LABELS[priority] || priority}` : '' },
    { key: 'source', label: source ? `Lead Source: ${source}` : '' },
    { key: 'capacity', label: capacity ? `Plant Capacity: ${capacityFilterLabel(capacity)}` : '' },
    { key: 'location', label: location ? `Plant Location: ${location}` : '' },
  ].filter(chip => chip.label);
}
function clearFilters(filter = 'all') {
  if (filter === 'all' || filter === 'search') document.querySelector('#search-input').value = '';
  if (filter === 'all' || filter === 'status') document.querySelector('#status-filter').value = '';
  if (filter === 'all' || filter === 'domain') document.querySelector('#domain-filter').value = '';
  if (filter === 'all' || filter === 'assigned') document.querySelector('#assigned-filter').value = '';
  if (filter === 'all' || filter === 'followup') document.querySelector('#followup-filter').value = '';
  if (filter === 'all' || filter === 'priority') document.querySelector('#priority-filter').value = '';
  if (filter === 'all' || filter === 'source') document.querySelector('#source-filter').value = '';
  if (filter === 'all' || filter === 'capacity') document.querySelector('#capacity-filter').value = '';
  if (filter === 'all' || filter === 'location') document.querySelector('#location-filter').value = '';
  refreshTable();
}
async function loadLeads() {
  const body = document.querySelector('#leads-body'); body.innerHTML = '<tr class="skeleton-row"><td colspan="12"><span></span><span></span><span></span></td></tr><tr class="skeleton-row"><td colspan="12"><span></span><span></span><span></span></td></tr><tr class="skeleton-row"><td colspan="12"><span></span><span></span><span></span></td></tr>';
  try {
    const leads = await fetchLeads();
    if (leads.some(lead => !lead.id)) throw new Error('Supabase returned a lead without its required id (UUID). No lead actions are available until this is corrected.');
    allLeads = leads;
    renderMetrics(allLeads);
    renderDashboard(allLeads, allProfiles, renderedUserId);
    refreshTable();
  }
  catch (error) { body.innerHTML = '<tr><td colspan="12" class="table-error"><strong>Could not load leads</strong><span data-error-message></span><button type="button" class="btn btn-secondary" data-retry-leads>Retry</button></td></tr>'; body.querySelector('[data-error-message]').textContent = error.message; showToast('Could not load leads. Please try again.', 'error'); }
}
function getLeadPayload(form) {
  // Phase 22: salutation and country_code appended — both plain optional
  // string fields, same '' passthrough as every other optional field here
  // (leads-api.js's cleanLead() already converts a blank '' to null before
  // it reaches Supabase, exactly as it already does for company_name etc.,
  // so no extra handling is needed here).
  const fields = ['salutation', 'client_name', 'company_name', 'country_code', 'phone_number', 'email', 'description', 'meeting_taken_by', 'meeting_date', 'business_domain', 'lead_type', 'status', 'lead_source', 'assigned_to', 'next_action', 'next_action_date', 'next_action_notes', 'plant_capacity', 'plant_capacity_custom', 'feedstock_availability', 'plant_location', 'lead_priority'];
  return Object.fromEntries(fields.map(field => [field, form.elements[field].value]));
}
// Feature 3: shows/hides and (un)requires the Custom Plant Capacity field to
// match the Plant Capacity select's current value — 'OTHER' is the only
// value that needs a custom value; every other option means the field
// should not be shown, not be required, and not carry a stale value. Called
// once from openLeadForm() right after the modal is in the DOM (so an edit
// of an existing 'OTHER' lead is correct on first paint even though the
// template itself already renders the initial hidden/required state — see
// js/ui.js openLeadModal) and again on every change of the select itself.
function syncPlantCapacityCustomField(form) {
  const select = form?.elements['plant_capacity'];
  const wrapper = form?.querySelector('[data-plant-capacity-custom-field]');
  const input = form?.elements['plant_capacity_custom'];
  if (!select || !wrapper || !input) return;
  const isOther = select.value === 'OTHER';
  wrapper.hidden = !isOther;
  input.required = isOther;
  if (!isOther) input.value = '';
}
// Phase 22 — Feature 3: clears any "Save Anyway" acknowledgement and the
// visible duplicate-warning banner the moment the form is edited again
// after a warning was shown — so a stale acknowledgement can never
// silently wave through a save whose field values have since changed
// (e.g. the user saw a phone-number match, then changed the phone number
// to something genuinely unique — that edit must re-run the check on the
// next submit, not reuse the earlier acknowledgement).
function resetDuplicateAcknowledgement(form) {
  if (form.dataset.duplicateAcknowledged !== 'true') return;
  delete form.dataset.duplicateAcknowledged;
  renderDuplicateWarning([]);
  const button = form.querySelector('#lead-save-button');
  if (button) button.textContent = form.dataset.mode === 'edit' ? 'Save Changes' : 'Add Lead';
}
async function saveLead(form) {
  const button = form.querySelector('#lead-save-button'); const errorNode = form.querySelector('#lead-form-error');
  const mode = form.dataset.mode;
  const leadId = form.dataset.leadId;

  if (mode === 'edit' && !leadId) {
    errorNode.textContent = 'This edit form is missing the lead ID and cannot be saved.';
    errorNode.hidden = false;
    return;
  }

  if (!form.checkValidity()) { showFormValidation(form); return; }

  const payload = getLeadPayload(form);

  // Phase 22 — Feature 3: duplicate check, run against the already-loaded
  // allLeads on every submit (both create AND edit — see openLeadForm/
  // saveLead usage on both paths). Never blocks a save by itself: the
  // FIRST submit that turns up a match shows the warning banner and stops
  // (form.dataset.duplicateAcknowledged is set so the very next submit — a
  // deliberate second click — proceeds regardless of confidence tier, per
  // "the user must be able to deliberately continue"). Any further edit to
  // the form after that resets the acknowledgement (see bindAppEvents'
  // input/change listener below), so a stale acknowledgement can never
  // silently wave through a materially different set of field values.
  const duplicateMatches = checkDuplicateLead({ ...payload, id: mode === 'edit' ? leadId : undefined }, allLeads);
  if (duplicateMatches.length && form.dataset.duplicateAcknowledged !== 'true') {
    renderDuplicateWarning(duplicateMatches);
    form.dataset.duplicateAcknowledged = 'true';
    if (button) button.textContent = 'Save Anyway';
    document.querySelector('#lead-duplicate-warning')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return;
  }
  renderDuplicateWarning([]);

  setButtonLoading(button, true, 'Saving…'); errorNode.hidden = true;
  try {
    if (mode === 'edit') await updateLead(leadId, payload);
    else await createLead(payload);

    closeLeadForm();
    showToast(mode === 'edit' ? 'Lead updated.' : 'Lead added.');
    await loadLeads();
  }
  catch (error) { errorNode.textContent = error.message; errorNode.hidden = false; }
  finally { if (document.body.contains(button)) setButtonLoading(button, false); }
}
async function openLeadForm(lead = null) {
  // Phase 8 — Change 3c: block Member-initiated lead creation at the
  // application logic level, not just by hiding the Add lead button (which
  // js/ui.js already does for all three entry points). Editing an existing
  // lead (lead is truthy) is unaffected — Member is still allowed to open
  // the edit interface, just with core fields read-only (see openLeadModal).
  if (!lead && !canManageLeads(currentUserRole)) {
    showToast('Only Admins and Managers can add new leads.', 'error');
    return;
  }
  lastModalTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  currentLeadActivities = [];
  if (lead?.id) {
    try { currentLeadActivities = await fetchLeadActivities(lead.id); }
    catch (error) { console.error('fetchLeadActivities failed:', error); showToast('Could not load activity history.', 'error'); }
  }
  openLeadModal(lead, allProfiles, currentLeadActivities, renderedUserId, currentUserRole);
  requestAnimationFrame(() => {
    const form = document.querySelector('#lead-form');
    if (form) { syncPlantCapacityCustomField(form); form.dataset.initialValues = JSON.stringify(getLeadPayload(form)); }
    document.querySelector('.modal')?.focus();
  });
}
function closeLeadForm() {
  closeModal();
  currentLeadActivities = [];
  lastModalTrigger?.focus();
  lastModalTrigger = null;
}
async function handleAddActivity() {
  const leadId = document.querySelector('#lead-form')?.dataset.leadId;
  if (!leadId) return;
  const typeInput = document.querySelector('#lead-activity-type-input');
  const dateInput = document.querySelector('#lead-activity-date-input');
  const notesInput = document.querySelector('#lead-activity-notes-input');
  const activityType = typeInput?.value;
  const activityDate = dateInput?.value;
  if (!activityType) { showToast('Select an activity type.', 'error'); return; }
  if (!activityDate) { showToast('Select an activity date.', 'error'); return; }
  const button = document.querySelector('[data-add-activity]');
  setButtonLoading(button, true, 'Adding…');
  try {
    await createLeadActivity({
      lead_id: leadId,
      created_by: renderedUserId,
      activity_type: activityType,
      activity_date: activityDate,
      notes: notesInput?.value.trim() || null,
    });
    currentLeadActivities = await fetchLeadActivities(leadId);
    renderLeadActivityTimeline(currentLeadActivities, allProfiles, renderedUserId);
    if (notesInput) notesInput.value = '';
    showToast('Activity added.');
  } catch (error) {
    showToast(error.message || 'Could not add activity.', 'error');
  } finally {
    if (document.body.contains(button)) setButtonLoading(button, false);
  }
}
async function handleDeleteActivity(activityId) {
  if (!activityId) return;
  const leadId = document.querySelector('#lead-form')?.dataset.leadId;
  const confirmed = await confirmAction({
    title: 'Delete Activity?',
    message: 'Are you sure you want to delete this activity?',
    warning: 'This action cannot be undone.',
    confirmLabel: 'Delete Activity',
    onConfirm: () => deleteLeadActivity(activityId),
  });
  if (!confirmed) return;
  currentLeadActivities = leadId ? await fetchLeadActivities(leadId) : currentLeadActivities.filter(activity => activity.id !== activityId);
  renderLeadActivityTimeline(currentLeadActivities, allProfiles, renderedUserId);
  showToast('Activity deleted.');
}
// Phase 6C-3: Team Management role editing. The <select> already shows the
// user's picked value the moment they choose it (native browser behavior),
// so data-previous-role on the element is how we know what to revert to if
// they cancel the confirmation. Supabase/RLS remains authoritative — this
// only decides what gets asked and what gets reverted in the UI.
async function handleRoleChange(select) {
  const profileId = select.dataset.profileId;
  const previousRole = select.dataset.previousRole || '';
  const newRole = select.value;
  if (!profileId || newRole === previousRole) return;
  const profile = allProfiles.find(item => item.id === profileId);
  const confirmed = await confirmAction({
    title: 'Change Role?',
    message: `Change ${profile?.full_name || 'this team member'}'s role from "${previousRole || 'Not set'}" to "${newRole}"?`,
    warning: 'This changes their permissions immediately.',
    confirmLabel: 'Change Role',
    onConfirm: async () => {
      const updated = await updateProfileRole(profileId, newRole);
      const idx = allProfiles.findIndex(item => item.id === profileId);
      if (idx !== -1) allProfiles[idx] = { ...allProfiles[idx], ...updated };
    },
  });
  if (!confirmed) { select.value = previousRole; return; }
  select.dataset.previousRole = newRole;
  showToast('Role updated.');
}
// Phase 6C-4 — Fix 8: replaces the native window.confirm() this used to
// call. Reuses the existing confirmAction() component (same one used for
// Delete Lead/Delete Activity/Role Change) rather than a bespoke dialog, so
// the unsaved-changes prompt matches the rest of the app's visual language,
// theme, keyboard/focus handling, and Escape behavior instead of the
// browser's own unstyled popup.
async function dismissLeadModal() {
  const form = document.querySelector('#lead-form');
  if (form?.dataset.dirty === 'true') {
    const confirmed = await confirmAction({
      title: 'Discard Changes?',
      message: 'This form has unsaved changes.',
      warning: 'Discarding will lose what you’ve entered.',
      confirmLabel: 'Discard Changes',
    });
    if (!confirmed) return;
  }
  closeLeadForm();
}
function updateDirtyState(form) {
  if (!form?.dataset.initialValues) return;
  form.dataset.dirty = String(JSON.stringify(getLeadPayload(form)) !== form.dataset.initialValues);
}
function showFormValidation(form) {
  form.querySelectorAll('input, select, textarea').forEach(field => {
    const invalid = !field.validity.valid;
    field.setAttribute('aria-invalid', String(invalid));
    const error = form.querySelector(`[data-field-error="${field.name}"]`);
    if (error) error.hidden = !invalid;
  });
  form.querySelector(':invalid')?.focus();
}
function clearFieldValidation(field) {
  field.removeAttribute('aria-invalid');
  document.querySelector(`[data-field-error="${field.name}"]`)?.setAttribute('hidden', '');
}
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('biosanjeevani-theme', theme);
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.setAttribute('aria-pressed', String(theme === 'dark')));
}
function toggleTheme() { applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); }
function getButtonLeadId(button) {
  const leadId = button.getAttribute('data-lead-id');
  if (!leadId) {
    showToast('Programming/data error: this lead action has no UUID. No Supabase request was sent.', 'error');
    return null;
  }
  return leadId;
}
async function handleDelete(leadId) {
  const confirmed = await confirmAction({
    title: 'Delete Lead?',
    message: 'Are you sure you want to delete this lead permanently?',
    warning: 'This action cannot be undone.',
    confirmLabel: 'Delete Lead',
    onConfirm: () => deleteLead(leadId),
  });
  if (!confirmed) return;
  if (document.querySelector('#lead-form')?.dataset.leadId === leadId) closeLeadForm();
  showToast('Lead deleted.');
  await loadLeads();
}

function bindAppEvents() {
  document.querySelector('#logout-button').addEventListener('click', handleLogout);
  document.querySelector('#logout-button-mobile')?.addEventListener('click', handleLogout);
  // Phase 8 — Change 3b: #add-lead-button is now only rendered for
  // Admin/Manager (see js/ui.js renderDashboard). Optional chaining is
  // required here since the element is legitimately absent for Member.
  document.querySelector('#add-lead-button')?.addEventListener('click', () => openLeadForm());
  document.querySelector('#leads-add-button')?.addEventListener('click', () => openLeadForm());
  document.querySelector('[data-empty-add]')?.addEventListener('click', () => openLeadForm());
  document.querySelector('#dashboard-analytics').addEventListener('click', event => {
    if (event.target.closest('[data-dashboard-leads]')) { document.querySelector('#leads-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const followUpCard = event.target.closest('[data-dashboard-followup-filter]');
    if (followUpCard) {
      const select = document.querySelector('#followup-filter');
      if (select) { select.value = followUpCard.dataset.dashboardFollowupFilter; refreshTable(); }
      document.querySelector('#leads-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const followUpItem = event.target.closest('[data-dashboard-edit-lead]');
    if (followUpItem) {
      const lead = allLeads.find(item => item.id === followUpItem.dataset.dashboardEditLead);
      if (lead) openLeadForm(lead);
    }
  });
  document.querySelector('#dashboard-analytics').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target.closest('[role="button"]');
    if (!target) return;
    event.preventDefault();
    target.click();
  });
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
  applyTheme(document.documentElement.dataset.theme || 'light');
  document.querySelector('#search-input').addEventListener('input', refreshTable);
  ['#status-filter', '#domain-filter', '#assigned-filter', '#followup-filter', '#priority-filter', '#source-filter', '#capacity-filter'].forEach(selector => document.querySelector(selector).addEventListener('change', refreshTable));
  // Plant Location: free-text, so it follows #search-input's own pattern
  // (plain 'input' listener, no debounce) rather than the select filters'
  // 'change' listener — everything here is already an in-memory filter over
  // allLeads (see visibleLeads()), so there is no per-keystroke Supabase
  // request to debounce against either way.
  document.querySelector('#location-filter').addEventListener('input', refreshTable);
  document.querySelector('#clear-search').addEventListener('click', () => clearFilters('search'));
  document.querySelector('#clear-filters').addEventListener('click', () => clearFilters());
  // Export Feature (task #184): a completely separate code path from lead
  // create/edit/delete/filtering above — exports exactly what visibleLeads()
  // currently returns, so it always matches the on-screen filtered table.
  document.querySelector('#leads-export-pdf')?.addEventListener('click', async () => {
    const button = document.querySelector('#leads-export-pdf');
    try {
      setButtonLoading(button, true, 'Exporting…');
      await exportLeadsPdf(visibleLeads(), allProfiles, computeActiveLeadFilterChips());
    } catch (error) {
      console.error('Export leads PDF failed:', error);
      showToast('Could not export leads to PDF. Please try again.', 'error');
    } finally {
      setButtonLoading(button, false);
    }
  });
  document.querySelectorAll('[data-nav-target]').forEach(button => button.addEventListener('click', () => {
    const targetId = button.dataset.navTarget;
    document.querySelector(`#${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelectorAll('[data-nav-target]').forEach(item => item.classList.toggle('is-active', item.dataset.navTarget === targetId));
  }));
  // Phase 6C-3: only present in the DOM at all for admin/manager (see
  // renderApp/renderTeamManagement in js/ui.js), so this is a no-op for a
  // Member — there's nothing to attach the listener to.
  document.querySelector('#team-management')?.addEventListener('change', async event => {
    const select = event.target.closest('.team-role-select');
    if (select) await handleRoleChange(select);
  });
  document.querySelector('#app').addEventListener('click', async event => {
    if (event.target.closest('[data-retry-leads]')) { await loadLeads(); return; }
    if (event.target.closest('[data-empty-add]')) { openLeadForm(); return; }
    if (event.target.closest('[data-empty-clear]')) { clearFilters(); return; }
    const filterChip = event.target.closest('[data-clear-filter]');
    if (filterChip) { clearFilters(filterChip.dataset.clearFilter); return; }
    const edit = event.target.closest('.edit-lead'); const remove = event.target.closest('.delete-lead');
    if (edit) {
      const leadId = getButtonLeadId(edit);
      if (!leadId) return;
      const selectedLead = allLeads.find(item => item.id === leadId);
      if (!selectedLead) { showToast('Programming/data error: the selected UUID is not present in loaded leads. No save request was sent.', 'error'); return; }
      openLeadForm(selectedLead);
      return;
    }
    if (remove) {
      const leadId = getButtonLeadId(remove);
      if (!leadId) return;
      await handleDelete(leadId);
      return;
    }
  });
  document.querySelector('#modal-root').addEventListener('click', event => { if (event.target.classList.contains('modal-backdrop') || event.target.closest('.modal-close')) dismissLeadModal(); });
  document.querySelector('#modal-root').addEventListener('click', async event => {
    if (event.target.closest('[data-add-activity]')) { await handleAddActivity(); return; }
    const deleteButton = event.target.closest('[data-delete-activity]');
    if (deleteButton) { await handleDeleteActivity(deleteButton.dataset.activityId); return; }
    // Phase 22 — Feature 3: "View Existing Lead" inside the duplicate
    // warning banner. Discards the in-progress (unsaved) form and opens the
    // matched lead for editing instead — the same navigation the Leads
    // table's own "Edit" button already provides, just reached from inside
    // the warning instead of the table.
    const viewDuplicate = event.target.closest('[data-view-duplicate-lead]');
    if (viewDuplicate) {
      const existingLead = allLeads.find(item => item.id === viewDuplicate.dataset.viewDuplicateLead);
      if (existingLead) { closeLeadForm(); openLeadForm(existingLead); }
      return;
    }
  });
  document.querySelector('#modal-root').addEventListener('submit', event => {
    if (event.target.id !== 'lead-form') return;
    event.preventDefault();
    saveLead(event.target);
  });
  document.querySelector('#modal-root').addEventListener('input', event => {
    const form = event.target.closest('#lead-form');
    if (form) { updateDirtyState(form); clearFieldValidation(event.target); resetDuplicateAcknowledgement(form); }
  });
  document.querySelector('#modal-root').addEventListener('change', event => {
    const form = event.target.closest('#lead-form');
    if (!form) return;
    if (event.target.id === 'lead-plant-capacity') syncPlantCapacityCustomField(form);
    if (event.target.id === 'lead-country-code') setCountryCodeExpanded(event.target, false);
    updateDirtyState(form); clearFieldValidation(event.target); resetDuplicateAcknowledgement(form);
  });
  // FINAL BATCH — Change 1: swap the country-code <select>'s options to the
  // long "Country (+code)" form right before its native popup opens, and
  // back to the short "+code" form once it closes. 'mousedown' fires before
  // a click-driven open (so the popup itself paints the long form); the
  // 'change' listener above already covers "closed by picking a value" —
  // 'focusout' below covers "closed without picking one" (e.g. opened, then
  // Tab/click away). Space is the one key that reliably opens a <select>'s
  // popup across Chrome/Firefox/Edge without also risking a form submit the
  // way Enter would.
  document.querySelector('#modal-root').addEventListener('mousedown', event => {
    if (event.target.id === 'lead-country-code') setCountryCodeExpanded(event.target, true);
  });
  document.querySelector('#modal-root').addEventListener('keydown', event => {
    if (event.target.id === 'lead-country-code' && event.key === ' ') setCountryCodeExpanded(event.target, true);
  });
  document.querySelector('#modal-root').addEventListener('focusout', event => {
    if (event.target.id === 'lead-country-code') setCountryCodeExpanded(event.target, false);
  });
  document.querySelector('#modal-root').addEventListener('keydown', event => {
    if (event.key === 'Escape') { dismissLeadModal(); return; }
    if (event.key !== 'Tab') return;
    const modal = document.querySelector('.modal');
    const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}
async function showCrm(user) {
  if (renderedUserId === user.id && document.querySelector('#logout-button')) return;
  renderedUserId = user.id;
  await loadProfiles();
  renderApp(user, allProfiles, currentUserRole);
  renderTeamManagement(allProfiles, currentUserRole, renderedUserId);
  bindAppEvents();
  await loadLeads();
}
// Phase 10.1 — content-only change (manual-test brief, Aug 2026): this used
// to render a bare spinner + text. It's now the same branded loading shell
// as index.html's pre-JS #loading-screen markup (kept as a matched pair —
// see that file's comment), so the very first frame the user ever sees and
// this one (shown for the brief window while supabase.auth.getSession()
// resolves, right after init() calls this) don't visually jar against each
// other. Only the inner HTML string changed; init()'s call site, timing,
// and every other line of this function are untouched — this still fires
// at exactly the same point in the boot sequence and is replaced by
// showCrm()/showLogin() exactly as before.
function renderAuthLoading() {
  document.querySelector('#app').innerHTML = `
    <section class="page-loader loading-screen">
      <div class="loading-scene" aria-hidden="true">
        <span class="loading-ring loading-ring-outer"></span>
        <span class="loading-ring loading-ring-inner"></span>
        <span class="loading-dot loading-dot-1"></span>
        <span class="loading-dot loading-dot-2"></span>
        <span class="loading-dot loading-dot-3"></span>
        <span class="loading-dot loading-dot-4"></span>
        <span class="loading-mark"><span class="loading-leaf"><span></span><span></span></span></span>
      </div>
      <h1 class="loading-brand">Biosanjeevani <span>CRM</span></h1>
      <p class="loading-tagline">Nurturing connections. Growing together.</p>
      <div class="loading-bar" aria-hidden="true"><span class="loading-bar-fill"></span></div>
      <p class="loading-status">Checking your session…</p>
      <ul class="loading-features">
        <li><span class="loading-feature-icon" aria-hidden="true">◈</span>Secure</li>
        <li><span class="loading-feature-icon" aria-hidden="true">◉</span>Reliable</li>
        <li><span class="loading-feature-icon" aria-hidden="true">❁</span>Sustainable</li>
      </ul>
      <p class="loading-footer">© 2025 Biosanjeevani. All rights reserved.</p>
    </section>`;
}
function showLogin() {
  // Phase 15 — stop the session-policy module's timers/listeners and clear
  // its state whenever the app returns to the login screen (a real
  // sign-out, our own policy-driven sign-out, or no session on boot). This
  // is what guarantees the NEXT sign-in starts a fresh 7-day/24h window
  // rather than inheriting stale state.
  stopSessionPolicy();
  renderedUserId = null;
  currentUserRole = null;
  allLeads = [];
  allProfiles = [];
  renderLogin();
  bindLogin();
}
async function handleLogout(event) {
  const button = event.currentTarget;
  setButtonLoading(button, true, 'Signing out…');
  const { error } = await supabase.auth.signOut();
  if (error) {
    setButtonLoading(button, false);
    showToast(error.message, 'error');
    return;
  }
  showLogin();
}
function bindLogin() {
  document.querySelectorAll('[data-theme-toggle]').forEach(button => button.addEventListener('click', toggleTheme));
  applyTheme(document.documentElement.dataset.theme || 'light');
  // Phase 6C-4 — Fix 7: only ever toggles the password input's `type`
  // attribute (password/text) and this button's own label/icon/aria-state.
  // Never touches the input's value, so the password itself and normal
  // form submission are completely unaffected either way.
  document.querySelector('[data-password-toggle]')?.addEventListener('click', event => {
    const button = event.currentTarget;
    const input = document.querySelector('#login-password');
    if (!input) return;
    const reveal = input.type === 'password';
    input.type = reveal ? 'text' : 'password';
    button.setAttribute('aria-label', reveal ? 'Hide password' : 'Show password');
    button.setAttribute('aria-pressed', String(reveal));
    const icon = button.querySelector('span');
    if (icon) icon.textContent = reveal ? '◌' : '◉';
  });
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget; const button = form.querySelector('button[type="submit"]'); const errorNode = document.querySelector('#login-error');
    setLoginButtonLoading(button, true); errorNode.hidden = true;
    const values = new FormData(form);
    const { error } = await supabase.auth.signInWithPassword({ email: values.get('email'), password: values.get('password') });
    if (error) { errorNode.textContent = error.message; errorNode.hidden = false; setLoginButtonLoading(button, false); }
  });
}
function handleAuthStateChange(event, session) {
  if (event === 'SIGNED_OUT' || !session) {
    showLogin();
    return;
  }
  if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
    // Phase 15 — see session-policy.js's file header for why this call
    // takes no arguments: a fresh 7-day anchor is only ever established
    // when no session-policy state currently exists (i.e. right after a
    // real sign-out), never merely because this event fired — testing
    // showed 'SIGNED_IN' itself can be re-reported for an already-running,
    // merely-reloaded session, so the event name isn't trustworthy for
    // this decision.
    startSessionPolicy();
    showCrm(session.user);
  }
}
// Escape-key back navigation — task: global Escape-key navigation behavior.
// CRM has no router/pushState/hash-based view history of its own (a single
// #app innerHTML swap between the login screen and the dashboard, plus
// anchor-scrolled sections within the dashboard — nothing there to "go
// back" from). The only real overlays are #modal-root (the lead form/detail
// modal) and #confirm-root (the delete/discard confirmation dialog), and
// both already close themselves on Escape via their own existing listeners
// in bindAppEvents() and confirm.js. So this handler only ever falls back
// to real history.back() (the exact equivalent of clicking the browser's
// own Back button — a genuine no-op if there's no prior entry, same as a
// disabled Back button), and only when nothing else is entitled to the key:
// never while typing in an input/textarea/select/contenteditable field,
// never on the login screen (or, in Finance, the MFA/access-denied
// screens — all share the one '.auth-page' wrapper), and never while the
// lead modal or confirm dialog is open, so those keep exclusive ownership
// of Escape and this never double-handles or navigates out from under
// them. It only calls preventDefault() on the one path where it actually
// acts, so normal browser Escape behavior everywhere else is untouched.
function isEditableEscapeTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
function handleGlobalEscapeBack(event) {
  if (event.key !== 'Escape' || event.defaultPrevented) return;
  if (isEditableEscapeTarget(event.target)) return;
  if (document.querySelector('.auth-page')) return; // login screen: never navigate away
  // event.target.closest(...) rather than a live DOM-content check: #modal-root's
  // own Escape listener sits closer to the target in the bubble path than
  // document does, so on a plain bubble-phase listener it would already have
  // emptied #modal-root by the time we got here, making a content check see
  // stale (already-closed) state and wrongly fall through to history.back().
  // Registering this listener in the capture phase (see the addEventListener
  // call below) guarantees this check runs before anything has mutated the
  // DOM, so target.closest(...) reliably reflects "Escape originated inside
  // the still-open overlay" regardless of handler registration order.
  if (event.target.closest?.('#modal-root')) return; // lead modal owns Escape
  if (event.target.closest?.('#confirm-root')) return; // confirm dialog owns Escape
  event.preventDefault();
  history.back();
}
document.addEventListener('keydown', handleGlobalEscapeBack, true); // capture phase — see comment above
async function init() {
  renderAuthLoading();
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (session) {
    // Phase 15 — page load / reopen with an already-persisted session
    // leaves any existing 7-day anchor untouched (see session-policy.js).
    startSessionPolicy();
    await showCrm(session.user);
  } else {
    showLogin();
  }
  supabase.auth.onAuthStateChange(handleAuthStateChange);
}
init().catch(error => { document.querySelector('#app').innerHTML = `<section class="fatal-error"><h1>Unable to start the CRM</h1><p>${escapeText(error.message)}</p></section>`; });
