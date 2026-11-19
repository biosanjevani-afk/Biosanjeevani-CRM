import { OPTIONS, EMPTY_LEAD, ACTIVITY_TYPES, ROLE_OPTIONS, LEAD_PRIORITY_LABELS, COUNTRY_CODES, SALUTATIONS } from './constants.js?v=20260910a';
import { getFollowUpStatus, formatFollowUpDate, localTodayISO, FOLLOW_UP_LABELS, FOLLOW_UP_FILTER_OPTIONS } from './follow-up.js?v=20260902a';
// CRM Phase 1 (Executive Command Center redesign) — self-contained inline-SVG
// icon module (see js/icons.js's own header comment for the full rationale).
// Imported only here, under its own tag — no other file references it, so
// there is nothing else to keep in sync. Every call site below only ever
// replaces the *inner markup* of an already-existing, already
// aria-hidden="true" decorative glyph span — never an id, a data-*
// attribute, or visible text content.
import { icon } from './icons.js?v=20260916a';

// FINAL BATCH — Change 2 fix: the previous `(value = '')` default parameter
// only substitutes '' when `value` is `undefined`, NOT when it is `null` —
// so `escapeHtml(null)` fell through to `String(null)`, literally rendering
// the text "null". This is real, not hypothetical: js/leads-api.js's
// cleanLead() converts every blank string field (including company_name and
// email) to a genuine `null` before saving, and js/ui.js's openLeadModal()
// spreads the saved lead straight over EMPTY_LEAD (`{ ...EMPTY_LEAD, ...lead
// }`), so re-opening a lead with a blank Company Name or Email fed exactly
// that `null` into `escapeHtml(data.company_name)` / `escapeHtml(data.email)`
// with no fallback at the call site — the literal word "null" appeared in
// the input box. Fixing the coercion here (nullish coalescing catches both
// `null` and `undefined`) closes this for every existing call site at once,
// including the several optional fields elsewhere in this same form that
// had the identical latent bug, rather than patching each call site
// one-by-one with its own `|| ''`.
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const optionList = (items, value = '', placeholder = 'Select an option') => `<option value="">${placeholder}</option>${items.map(item => `<option ${item === value ? 'selected' : ''} value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`;

// Phase 5A.3: lead assignment helpers. profiles is the array loaded once via
// fetchProfiles() and passed down; assigned_to on a lead is a profiles.id
// (uuid) or null. These never mutate leads/profiles, only look them up.
const assignedProfileOptionList = (profiles, value = '') => `<option value="">Unassigned</option>${profiles.map(profile => `<option ${profile.id === value ? 'selected' : ''} value="${escapeHtml(profile.id)}">${escapeHtml(profile.full_name || 'Unnamed')}</option>`).join('')}`;
const assignedFilterOptionList = profiles => `<option value="">All assignees</option><option value="unassigned">Unassigned</option>${profiles.map(profile => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.full_name || 'Unnamed')}</option>`).join('')}`;
// Exported (Export Feature, task #184): js/leads-export.js needs this exact
// same assigned-owner lookup for the "Assigned Team Member" export column,
// rather than re-implementing the profiles.find(...) lookup a second time.
// Purely additive — every existing caller in this file is unaffected.
export const assignedOwnerName = (assignedTo, profiles) => (assignedTo && profiles.find(profile => profile.id === assignedTo)?.full_name) || 'Unassigned';

// Lead Priority (Hot/Warm/Cold) feature. Stored as lowercase hot/warm/cold
// in leads.lead_priority — a SEPARATE column from the pre-existing
// leads.lead_type (Project/Product/Partnership/Service/Other, shown as the
// table's "Type" column below), which already used that name for an
// unrelated concept. The filter's own label is still "Lead Type" (matching
// what was asked for) since it's unambiguous in a dropdown by itself; the
// table column is labelled "Priority" instead of a second "Type" column,
// to avoid sitting next to the existing "Type" column and reading as a
// duplicate of it.
const leadPriorityOptionList = (value = '') => `<option value="">Select lead type</option>${OPTIONS.lead_priority.map(item => `<option ${item === value ? 'selected' : ''} value="${escapeHtml(item)}">${escapeHtml(LEAD_PRIORITY_LABELS[item] || item)}</option>`).join('')}`;
const priorityFilterOptionList = () => `<option value="">All Leads</option>${OPTIONS.lead_priority.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(LEAD_PRIORITY_LABELS[item] || item)}s</option>`).join('')}`;
const PRIORITY_BADGE_CLASSES = { hot: 'priority-hot', warm: 'priority-warm', cold: 'priority-cold' };
const priorityBadge = value => value
  ? `<span class="badge ${PRIORITY_BADGE_CLASSES[value] || ''}">${escapeHtml(LEAD_PRIORITY_LABELS[value] || value)}</span>`
  : '<span class="badge">Not set</span>';

// Plant Capacity filter — reuses OPTIONS.plant_capacity (the exact same
// list already driving the Add/Edit Lead form's Plant Capacity select), no
// new option source. Filter values are the real stored values ('3 TPD',
// 'OTHER', …) so filtering always matches the actual database column (see
// js/app.js visibleLeads) — only the *display text* for 'OTHER' is
// capitalized to "Other" here, matching the brief's requested wording. The
// Add/Edit Lead form's own Plant Capacity select is untouched and still
// shows "OTHER" exactly as it always has (Phase 4: don't change unrelated
// fields) — this label difference is scoped to this new filter only.
const capacityFilterOptionList = () => `<option value="">All Capacities</option>${OPTIONS.plant_capacity.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item === 'OTHER' ? 'Other' : item)}</option>`).join('')}`;

// Phase 22 — Feature 2: Lead Source filter. Reuses OPTIONS.lead_source (the
// exact same list already driving the Add/Edit Lead form's Lead source
// select), no new/duplicate option source and no new database column —
// mirrors capacityFilterOptionList above exactly (plain optionList()-style
// values, no special "Other"/label-mapping case needed for Lead Source).
const sourceFilterOptionList = () => `<option value="">All Sources</option>${OPTIONS.lead_source.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`;

// Phase 22 — Feature 1/4: Country Code and Salutation dropdowns, shared by
// the lead form (js/ui.js) and, independently, by the Finance customer
// forms (finance/js/*-ui.js each keep their own copy, matching this
// project's established "files don't import from each other" convention).
// FINAL BATCH — Change 1: closed box shows ONLY the code ("+91"); each open
// option shows "Country (+code)" (e.g. "India (+91)"). A native <select> has
// no built-in way to show different text in its closed box vs. its open
// option list, so every option carries both forms as data attributes
// (`data-short`/`data-long`) and starts out rendered in the short form —
// matching the closed box's default appearance with zero JS needed at
// render time. `setCountryCodeExpanded()` below (invoked by js/app.js's
// event wiring on open/close) swaps each option's visible textContent
// between the two forms; `option.value` — the actual stored country code —
// is never touched by that swap, satisfying "stored value must remain the
// country code" and "preserve existing saved country codes" unchanged.
const countryCodeOptionList = (value = '') => `<option value="" data-short="Code" data-long="Code">Code</option>${COUNTRY_CODES.map(entry => `<option ${entry.code === value ? 'selected' : ''} value="${escapeHtml(entry.code)}" data-short="${escapeHtml(entry.code)}" data-long="${escapeHtml(entry.country)} (${escapeHtml(entry.code)})">${escapeHtml(entry.code)}</option>`).join('')}`;

// FINAL BATCH — Change 1: toggles every <option> inside `select` between its
// short (`data-short`) and long (`data-long`) text. `expanded` true is used
// right before the native popup opens (long form, "name + code"); false is
// used once it closes (short form, "code only" in the closed box). A no-op
// if `select` isn't the country-code field or the options don't carry these
// attributes (e.g. called on an unrelated <select> by mistake).
export function setCountryCodeExpanded(select, expanded) {
  if (!select) return;
  select.querySelectorAll('option').forEach(option => {
    const text = expanded ? option.dataset.long : option.dataset.short;
    if (text !== undefined) option.textContent = text;
  });
}
const salutationOptionList = (value = '') => `<option value="">—</option>${SALUTATIONS.map(item => `<option ${item === value ? 'selected' : ''} value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`;

// Phase 22: display-only helpers — country_code/salutation are ALWAYS
// stored as separate columns (see phase22-contact-details-migration.sql)
// and are only ever combined into one string here, for display. Exported
// so js/leads-export.js's PDF "Contact"/"Lead Name" columns and js/app.js's
// dashboard-adjacent displays can show the same combined text the table
// itself shows, without duplicating the combine logic.
export const combinedPhoneDisplay = lead => (lead?.phone_number ? [lead.country_code, lead.phone_number].filter(Boolean).join(' ') : '');
export const combinedNameDisplay = lead => (lead?.client_name ? [lead.salutation, lead.client_name].filter(Boolean).join(' ') : '');

// Plant Capacity table-cell display: for 'OTHER', prefer the free-text
// custom value the user actually entered ("8 TPD (Other)") over the raw
// internal 'OTHER' token; falls back to plain "Other" only when no custom
// value was recorded. Never invents a value for a blank/NULL plant_capacity.
// Exported (Export Feature, task #184): same reasoning as assignedOwnerName
// above — js/leads-export.js needs the exact same "Plant Capacity" display
// rule (prefer plant_capacity_custom for 'OTHER') the table itself uses.
export const plantCapacityDisplay = lead => {
  if (!lead.plant_capacity) return 'Not set';
  if (lead.plant_capacity === 'OTHER') return lead.plant_capacity_custom ? `${lead.plant_capacity_custom} (Other)` : 'Other';
  return lead.plant_capacity;
};

// Phase 6C: UI-only role gate for lead deletion and lead reassignment.
// This does NOT enforce anything — it only decides what controls are shown.
// The real enforcement boundary is Supabase RLS (see js/leads-api.js
// deleteLead and the Phase 6B SQL migration). Fails closed: any role other
// than exactly 'admin' or 'manager' (including null/undefined/unrecognized
// values) is treated as not privileged.
//
// Phase 8: also reused (unchanged) to gate lead CREATION (Add Lead buttons,
// Change 3) and CORE FIELD editability (Change 3b) — both are admin/manager
// capabilities under the finalized Phase 8 role model, exactly the same set
// this predicate already recognized. Exported so app.js can reuse it too
// (Change 3c's application-logic-level create guard) instead of duplicating
// the role check in a second place.
export const canManageLeads = role => role === 'admin' || role === 'manager';

// Phase 6C-3: general "is this a management-tier role" predicate. Kept as
// its own named helper (matches canManageLeads exactly today) since the two
// permissions are conceptually distinct — a future role model could grant
// one without the other. Currently unused for gating Team Management's own
// visibility (Phase 6C-4 Fix 9 made that universal — see renderApp below),
// kept for semantic clarity and any future admin/manager-tier UI decision.
const canManageTeam = role => role === 'admin' || role === 'manager';

// Phase 6C-4 — Fix 3/Fix 6: role *editing* is admin-only, distinct from
// canManageTeam (view) and canManageLeads (assign/delete) above. Fails
// closed exactly like the other two: only the literal string 'admin'
// passes; 'manager', 'member', null, undefined, or anything unrecognized
// does not. This is the ONLY thing that decides whether Team Management
// renders an editable role <select> versus a read-only badge — Supabase
// RLS (see the Phase 6C-4 SQL patch) is what actually enforces it; this
// predicate only controls what the UI offers to click.
const canManageRoles = role => role === 'admin';

// Phase 6C-3: Team Management row helpers. profiles is the same array
// loaded once via fetchProfiles() and already passed everywhere else —
// no separate query is made for Team Management.
const roleLabel = role => (role ? role.charAt(0).toUpperCase() + role.slice(1) : 'Not set');
const teamRowHtml = (profile, currentUserId, canEdit) => {
  const isSelf = profile.id === currentUserId;
  // Phase 6C-3: a profile's own row never gets an editable role select —
  // the logged-in user's own role should not be casually changed from the
  // UI. Every other row gets one when canEdit is true (Phase 6C-4: only
  // when the viewer is admin — see canManageRoles).
  const roleCell = (canEdit && !isSelf)
    ? `<select class="team-role-select" data-profile-id="${escapeHtml(profile.id)}" data-previous-role="${escapeHtml(profile.role || '')}" aria-label="Change role for ${escapeHtml(profile.full_name || 'this team member')}">${ROLE_OPTIONS.map(role => `<option value="${role}" ${role === profile.role ? 'selected' : ''}>${roleLabel(role)}</option>`).join('')}</select>`
    : `<span class="badge">${escapeHtml(roleLabel(profile.role))}</span>`;
  return `<tr><td data-label="Name"><strong>${escapeHtml(profile.full_name || 'Unnamed')}</strong>${isSelf ? '<small>You</small>' : ''}</td><td data-label="Role">${roleCell}</td></tr>`;
};

// Phase 5B: follow-up status helpers. Status is derived purely from
// next_action/next_action_date at render time (see js/follow-up.js) — never
// stored. FOLLOW_UP_BADGE_CLASSES mirrors the existing STATUS_BADGE_CLASSES
// pattern below, reusing the same badge shape via the new .followup-badge class.
const FOLLOW_UP_BADGE_CLASSES = { overdue: 'followup-overdue', due_today: 'followup-due-today', upcoming: 'followup-upcoming', no_action: 'followup-no-action' };
const followUpBadge = status => `<span class="followup-badge ${FOLLOW_UP_BADGE_CLASSES[status] || ''}">${escapeHtml(FOLLOW_UP_LABELS[status] || 'No Action')}</span>`;
const followUpFilterOptionList = () => `<option value="">All follow-ups</option>${FOLLOW_UP_FILTER_OPTIONS.map(status => `<option value="${status}">${escapeHtml(FOLLOW_UP_LABELS[status])}</option>`).join('')}`;

// Phase 5C: lead activity timeline helpers. Classes are prefixed
// "lead-activity-" (not "activity-") to avoid colliding with the unrelated
// .activity-item/.activity-list/.activity-copy classes already used by the
// dashboard's "Recent leads" feed.
const leadActivityCreatorName = (createdBy, profiles) => (createdBy && profiles.find(profile => profile.id === createdBy)?.full_name) || 'Unknown user';
const formatLeadActivityDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const formatLeadActivityTimestamp = value => value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '';
// CRM Phase 5: one marker icon per public.lead_activities.activity_type
// value (mirrors js/constants.js's ACTIVITY_TYPES exactly — not imported
// from there, just kept in sync by hand, same as FOLLOW_UP_BADGE_CLASSES'
// own local, hand-kept mapping above). An unrecognized/missing type (should
// never happen given the DB check constraint, but activity.activity_type is
// still just a string at render time) falls back to the generic note icon
// rather than rendering nothing.
const LEAD_ACTIVITY_TYPE_ICONS = {
  'Call': 'phoneCall', 'WhatsApp': 'messageCircle', 'Email': 'mail', 'Meeting': 'calendarCheck',
  'Follow-up': 'flag', 'Proposal Sent': 'send', 'Site Visit': 'mapPin', 'Status Change': 'refreshCw', 'Note': 'stickyNote',
};
const leadActivityItemHtml = (activity, profiles, currentUserId) => {
  const canDelete = Boolean(activity.created_by) && activity.created_by === currentUserId;
  return `<div class="lead-activity-item"><span class="lead-activity-marker" aria-hidden="true">${icon(LEAD_ACTIVITY_TYPE_ICONS[activity.activity_type] || 'stickyNote')}</span><div class="lead-activity-body"><div class="lead-activity-top"><strong>${escapeHtml(activity.activity_type || 'Note')}</strong><span class="lead-activity-date">${escapeHtml(formatLeadActivityDate(activity.activity_date))}</span></div><span class="lead-activity-author">${escapeHtml(leadActivityCreatorName(activity.created_by, profiles))}</span>${activity.notes ? `<p class="lead-activity-notes">${escapeHtml(activity.notes)}</p>` : ''}<div class="lead-activity-footer">${activity.created_at ? `<small class="lead-activity-logged">Logged ${escapeHtml(formatLeadActivityTimestamp(activity.created_at))}</small>` : '<span></span>'}${canDelete ? `<button type="button" class="icon-button danger lead-activity-delete" data-delete-activity data-activity-id="${escapeHtml(activity.id)}" aria-label="Delete ${escapeHtml(activity.activity_type || 'Note')} activity from ${escapeHtml(formatLeadActivityDate(activity.activity_date))}">Delete</button>` : ''}</div></div></div>`;
};
const leadActivityListHtml = (activities, profiles, currentUserId) => activities.length ? activities.map(activity => leadActivityItemHtml(activity, profiles, currentUserId)).join('') : '<p class="lead-activity-empty">No activity recorded yet.</p>';

export function showToast(message, type = 'success') {
  const region = document.querySelector('#toast-region');
  const toast = document.createElement('div'); toast.className = `toast ${type}`; toast.textContent = message; region.append(toast);
  setTimeout(() => toast.remove(), 4500);
}

export function renderLogin() {
  document.querySelector('#app').innerHTML = `
    <section class="auth-page">
      <div class="auth-shape auth-shape-one" aria-hidden="true"></div><div class="auth-shape auth-shape-two" aria-hidden="true"></div>
      <button class="theme-toggle auth-theme-toggle" type="button" data-theme-toggle aria-label="Switch color theme" aria-pressed="false"><span aria-hidden="true">◐</span><span class="theme-toggle-label">Theme</span></button>
      <div class="auth-panel">
        <div class="auth-brand"><img src="assets/biosanjeevani-logo.png" alt="biosanjeevani Sustainable Solutions" class="auth-logo"></div>
        <p class="eyebrow">INTERNAL LEAD MANAGEMENT</p><h1>Welcome back</h1><p class="muted">Sign in to manage opportunities and move sustainable growth forward.</p>
        <form id="login-form" class="form-stack" novalidate>
          <label for="login-email">Work email<input id="login-email" name="email" type="email" autocomplete="email" required placeholder="you@biosanjeevani.com"></label>
          <label for="login-password">Password<span class="password-field"><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Enter your password"><button type="button" class="password-toggle" data-password-toggle aria-label="Show password" aria-pressed="false"><span aria-hidden="true">◉</span></button></span></label>
          <p id="login-error" class="form-error" role="alert" hidden></p>
          <button class="btn btn-primary btn-block" type="submit">Sign in <span aria-hidden="true">→</span></button>
        </form>
        <p class="auth-note"><span aria-hidden="true">⌁</span> Restricted to authorized Biosanjeevani team members</p>
      </div>
    </section>`;
}

// CRM Phase 1: real-time, real-user greeting for the dashboard page heading
// (#dashboard-overview, explicitly in scope). Never fabricated — `hour` is
// the actual client clock at render time and the name is derived directly
// from the signed-in user's own `user.email` (already passed into
// renderApp by every real caller), never invented or looked up elsewhere.
// Falls back to the greeting alone when no usable email is present (e.g.
// the dashboard-harness.html test fixture always supplies one, but this
// stays defensive regardless).
const timeGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};
const firstNameFromEmail = email => {
  const local = String(email || '').split('@')[0] || '';
  const first = local.split(/[._-]+/).filter(Boolean)[0] || local;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : '';
};

export function renderApp(user, profiles = [], currentUserRole = null) {
  // Phase 6C-4 — Fix 9: Team Management is now visible to every signed-in
  // user regardless of role (Admin/Manager/Member all view the full
  // roster) — the nav item and section are unconditional. What each role
  // can DO once there (edit a role or not) is decided separately, per row,
  // by canManageRoles in renderTeamManagement/teamRowHtml below. RLS on
  // public.profiles (Phase 6B + the Phase 6C-4 patch) remains the actual
  // enforcement boundary regardless of what this UI shows.
  const teamNavDesktop = `<button type="button" class="nav-item" data-nav-target="team-management"><span class="nav-icon" aria-hidden="true">${icon('hexagon')}</span>Team</button>`;
  const teamNavMobile = '<button type="button" class="nav-item" data-nav-target="team-management">Team</button>';
  const greetingName = firstNameFromEmail(user.email);
  const dashboardGreeting = `${timeGreeting()}${greetingName ? `, ${escapeHtml(greetingName)}` : ''}`;
  const teamSection = `<section id="team-management" class="card leads-card"><div class="leads-card-header"><div><p class="section-kicker">TEAM</p><h2>Team Management</h2><p id="team-result-count" class="result-count" aria-live="polite">Loading team…</p></div></div><div class="table-wrap"><table><thead><tr><th>Name</th><th>Role</th></tr></thead><tbody id="team-body"></tbody></table></div></section>`;
  document.querySelector('#app').innerHTML = `
  <div class="app-shell">
    <aside class="sidebar" aria-label="Primary navigation">
      <div class="sidebar-brand"><img src="assets/biosanjeevani-logo.png" alt="Biosanjeevani Sustainable Solutions" class="sidebar-logo"><span class="product-name">Lead CRM</span></div>
      <nav class="side-nav"><button type="button" class="nav-item is-active" data-nav-target="dashboard-overview"><span class="nav-icon" aria-hidden="true">${icon('grid')}</span>Dashboard</button><button type="button" class="nav-item" data-nav-target="leads-workspace"><span class="nav-icon" aria-hidden="true">${icon('list')}</span>Leads</button>${teamNavDesktop}</nav>
      <div class="sidebar-footer"><button class="theme-toggle sidebar-theme-toggle" type="button" data-theme-toggle aria-label="Switch color theme" aria-pressed="false"><span aria-hidden="true">${icon('theme')}</span><span class="theme-toggle-label">Theme</span></button><div class="account-card"><span class="account-avatar" aria-hidden="true">${escapeHtml((user.email || 'U').charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(user.email)}</strong><small>Team member</small></span></div><button id="logout-button" class="logout-button" type="button"><span class="logout-icon" aria-hidden="true">${icon('logout')}</span> Log out</button></div>
    </aside>
    <div class="workspace"><header class="mobile-header"><img src="assets/biosanjeevani-logo.png" alt="Biosanjeevani Sustainable Solutions" class="mobile-logo"><div class="mobile-header-actions"><button class="theme-toggle icon-only" type="button" data-theme-toggle aria-label="Switch color theme" aria-pressed="false"><span aria-hidden="true">${icon('theme')}</span></button><button id="logout-button-mobile" class="theme-toggle icon-only" type="button" aria-label="Log out"><span class="logout-icon" aria-hidden="true">${icon('logout')}</span></button></div></header><nav class="mobile-nav" aria-label="Mobile navigation"><button type="button" class="nav-item is-active" data-nav-target="dashboard-overview">Dashboard</button><button type="button" class="nav-item" data-nav-target="leads-workspace">Leads</button>${teamNavMobile}</nav>
      <main class="main-content"><section id="dashboard-overview" class="page-heading"><div><p class="dashboard-greeting">${dashboardGreeting}</p><p class="eyebrow">LEAD MANAGEMENT</p><h1>Business leads</h1><p class="muted">Track every opportunity from first contact to conversion.</p></div>${canManageLeads(currentUserRole) ? '<button id="add-lead-button" class="btn btn-primary"><span aria-hidden="true">+</span> Add lead</button>' : ''}</section>
      <section class="metrics" aria-label="Lead summary"><article class="metric-card"><div><span>Total leads</span><strong id="metric-total">—</strong></div><span class="metric-icon" aria-hidden="true">${icon('layers')}</span></article><article class="metric-card"><div><span>New leads</span><strong id="metric-new">—</strong></div><span class="metric-icon" aria-hidden="true">${icon('sparkle')}</span></article><article class="metric-card"><div><span>Meeting stage leads</span><strong id="metric-meetings">—</strong></div><span class="metric-icon" aria-hidden="true">${icon('clock')}</span></article><article class="metric-card"><div><span>Converted</span><strong id="metric-converted">—</strong></div><span class="metric-icon" aria-hidden="true">${icon('checkCircle')}</span></article></section>
      <section id="dashboard-analytics" class="analytics-dashboard" aria-label="Lead analytics"></section>
      <section id="leads-workspace" class="card leads-card"><div class="leads-card-header"><div><p class="section-kicker">LEAD DIRECTORY</p><h2>Leads</h2><p id="lead-result-count" class="result-count" aria-live="polite">Loading leads…</p></div>${canManageLeads(currentUserRole) ? '<button id="leads-add-button" class="btn btn-primary leads-add-button" type="button"><span aria-hidden="true">+</span> Add lead</button>' : ''}</div><div class="toolbar"><label class="search" for="search-input"><span aria-hidden="true">${icon('search')}</span><input id="search-input" type="search" placeholder="Search client, company, email or phone" aria-label="Search leads"><button id="clear-search" type="button" class="clear-search" aria-label="Clear search" hidden>×</button></label><div class="filter-row"><label class="select-field"><span class="sr-only">Filter by status</span><select id="status-filter"><option value="">All statuses</option>${OPTIONS.status.map(x => `<option value="${x}">${x}</option>`).join('')}</select></label><label class="select-field"><span class="sr-only">Filter by business domain</span><select id="domain-filter"><option value="">All domains</option>${OPTIONS.business_domain.map(x => `<option value="${x}">${x}</option>`).join('')}</select></label><label class="select-field"><span class="sr-only">Filter by assigned team member</span><select id="assigned-filter">${assignedFilterOptionList(profiles)}</select></label><label class="select-field"><span class="sr-only">Filter by follow-up status</span><select id="followup-filter">${followUpFilterOptionList()}</select></label><label class="select-field"><span class="sr-only">Filter by lead type</span><select id="priority-filter">${priorityFilterOptionList()}</select></label><label class="select-field"><span class="sr-only">Filter by lead source</span><select id="source-filter">${sourceFilterOptionList()}</select></label><label class="select-field"><span class="sr-only">Filter by plant capacity</span><select id="capacity-filter">${capacityFilterOptionList()}</select></label><label class="select-field"><span class="sr-only">Filter by plant location</span><input id="location-filter" type="text" placeholder="Plant location" aria-label="Filter by plant location"></label><button id="clear-filters" type="button" class="btn btn-secondary clear-filters" hidden>Clear filters</button><button id="leads-export-pdf" type="button" class="btn btn-secondary export-button">Export PDF</button></div></div><div id="active-filter-chips" class="active-filter-chips" hidden aria-label="Active filters"></div><div class="table-wrap"><table><thead><tr><th>Lead</th><th>Domain</th><th>Type</th><th>Priority</th><th>Status</th><th>Meeting</th><th>Source</th><th>Assigned To</th><th>Plant Capacity</th><th>Plant Location</th><th>Next Action</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody id="leads-body"></tbody></table></div><div id="empty-state" class="empty-state" hidden></div></section>
      ${teamSection}</main>
    </div>
  </div><div id="modal-root"></div><div id="confirm-root"></div>`;
}

// Phase 6C-3: populates the Team Management table from the already-loaded
// profiles list (no separate Supabase query — same array passed to
// renderApp/renderLeads/openLeadModal everywhere else). No-ops when
// #team-body isn't in the DOM, which is the normal case for a Member,
// since renderApp() never renders the section for them at all.
export function renderTeamManagement(profiles = [], currentUserRole = null, currentUserId = null) {
  const body = document.querySelector('#team-body');
  if (!body) return;
  // Phase 6C-4 — Fix 3/Fix 6: role EDITING is admin-only (canManageRoles),
  // not the broader admin/manager canManageTeam — a Manager now sees every
  // row as a read-only badge, same shape as the viewer's own row.
  const canEdit = canManageRoles(currentUserRole);
  body.innerHTML = profiles.map(profile => teamRowHtml(profile, currentUserId, canEdit)).join('');
  const resultCount = document.querySelector('#team-result-count');
  if (resultCount) resultCount.textContent = `${profiles.length} ${profiles.length === 1 ? 'team member' : 'team members'}`;
}

export function renderMetrics(leads) {
  // FINAL BATCH — Change 3: this counts every lead whose CURRENT status is
  // 'Meeting Scheduled' OR 'Meeting Completed' — i.e. leads presently sitting
  // at the meeting stage of the pipeline, not a count of meeting events, not
  // only upcoming meetings, and not only completed ones. The card's label
  // (search #metric-meetings' <span> in renderApp below) was renamed from
  // the ambiguous "Meetings" to "Meeting stage leads" to describe exactly
  // this — the underlying calculation itself is unchanged.
  const meetings = leads.filter(l => ['Meeting Scheduled', 'Meeting Completed'].includes(l.status)).length;
  document.querySelector('#metric-total').textContent = leads.length;
  document.querySelector('#metric-new').textContent = leads.filter(l => l.status === 'New').length;
  document.querySelector('#metric-meetings').textContent = meetings;
  document.querySelector('#metric-converted').textContent = leads.filter(l => l.status === 'Converted').length;
}

const countBy = (leads, key, values) => values.map(value => ({ label: value, count: leads.filter(lead => lead[key] === value).length }));
const percent = (count, total) => total ? Math.round((count / total) * 100) : 0;
const formatDate = value => value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const renderBreakdownRows = (items, total, kind) => items.map(item => `<div class="breakdown-row"><div class="breakdown-label"><span>${escapeHtml(item.label)}</span><strong>${item.count}</strong></div><div class="progress-track" aria-label="${escapeHtml(item.label)}: ${item.count} leads, ${percent(item.count, total)} percent"><span class="progress-fill ${kind}" style="width:${percent(item.count, total)}%"></span></div><small>${percent(item.count, total)}%</small></div>`).join('');

// THIRD BATCH — Change: Business Domains redesign. Was rendered by the same
// `renderBreakdownRows` horizontal-progress-bar list used for Lead Sources
// (just above), which made the two cards look visually identical. Replaced
// with a small SVG donut + legend so Business Domains reads as a distinct
// visualization while Lead Sources' own progress-bar list is completely
// untouched (still calls renderBreakdownRows exactly as before, a few lines
// down in renderDashboard). No new dependency: this is a handful of native
// SVG <circle> elements using the well-known "r=15.915" trick (a circle
// with that radius has a circumference of exactly 100, so a percentage of
// the ring maps directly to `stroke-dasharray`) — no chart library exists
// anywhere in this project (confirmed by inspection before writing this),
// and adding one for a single 4-slice chart would be a large dependency for
// a small need, which the brief explicitly asked to avoid.
//
// Data: `items`/`total` are the exact same `domains`/`total` values
// `renderBreakdownRows(domains, total, 'domain')` used to receive from
// renderDashboard below — produced by the same untouched `countBy(leads,
// 'business_domain', OPTIONS.business_domain)` call. Nothing about how a
// lead gets counted into a category changes here.
//
// Percentages: each legend row's `${percent(item.count, total)}%` is the
// exact same `percent()` call (count / total leads, rounded) already used
// by every other row/percentage on this dashboard (Lead Sources, Pipeline,
// Conversion) — copied verbatim, not recalculated a different way. The
// donut's own slice ANGLES, though, are sized by each category's share of
// `categorizedTotal` (the sum of the four counts actually being drawn),
// because a pie/donut's slices are geometrically required to add up to a
// full circle — sizing them off `total` instead would leave a physically
// broken-looking gap in the ring whenever a lead exists with no business
// domain set yet (the field is optional in the lead form). In the normal
// case, where every lead already has one of the four domains set,
// `categorizedTotal === total` and the two numbers are identical anyway —
// this distinction only ever matters for that one edge case, and even then
// only changes the ring's geometry, never the printed percentage text.
//
// Center number: shows `total` (the same "total leads" value already
// displayed elsewhere on this exact dashboard, e.g. the Pipeline card's
// "${total} total" note) — reusing that existing, already-displayed number
// rather than inventing a new one, so nothing here can read as a
// mismatched or misleading total.
//
// Colors: all four reuse existing theme-aware CSS custom properties already
// defined in :root (and its `[data-theme=dark]` override) elsewhere in this
// file — `--green`/`--leaf` (the two greens already used for the domain
// progress-fill and the conversion-track fill respectively) plus
// `--purple`/`--warning` (the same two accent tokens already used for other
// status pills) — no new colors are introduced, and all four already adapt
// correctly between light/dark themes exactly as the rest of the dashboard
// does.
const DOMAIN_DONUT_COLORS = { 'Biogas / CBG': 'var(--green)', 'Biofertilizer': 'var(--leaf)', 'Both': 'var(--purple)', 'Other': 'var(--warning)' };
const renderDomainDonut = (items, total) => {
  const categorizedTotal = items.reduce((sum, item) => sum + item.count, 0);
  let cumulative = 0;
  const segments = items.filter(item => item.count > 0).map(item => {
    const color = DOMAIN_DONUT_COLORS[item.label] || 'var(--muted)';
    const arcShare = categorizedTotal ? (item.count / categorizedTotal) * 100 : 0;
    const dashoffset = 25 - cumulative;
    cumulative += arcShare;
    return `<circle class="donut-segment" cx="21" cy="21" r="15.915" fill="transparent" stroke="${color}" stroke-width="7" stroke-dasharray="${arcShare} ${100 - arcShare}" stroke-dashoffset="${dashoffset}"><title>${escapeHtml(item.label)}: ${item.count} (${percent(item.count, total)}%)</title></circle>`;
  }).join('');
  const ariaSummary = items.map(item => `${item.label} ${item.count}, ${percent(item.count, total)} percent`).join('; ');
  const legendRows = items.map(item => `<li class="legend-row"><span class="legend-swatch" style="background:${DOMAIN_DONUT_COLORS[item.label] || 'var(--muted)'}" aria-hidden="true"></span><span class="legend-label">${escapeHtml(item.label)}</span><strong class="legend-count">${item.count}</strong><span class="legend-percent">${percent(item.count, total)}%</span></li>`).join('');
  return `<div class="domain-donut-wrap"><svg class="donut-chart" viewBox="0 0 42 42" role="img" aria-label="Business domain breakdown — ${escapeHtml(ariaSummary)}"><circle class="donut-track" cx="21" cy="21" r="15.915" fill="transparent" stroke-width="7"></circle>${segments}<text class="donut-center-value" x="21" y="19.2" text-anchor="middle">${total}</text><text class="donut-center-label" x="21" y="26.8" text-anchor="middle">leads</text></svg><ul class="domain-legend">${legendRows}</ul></div>`;
};

// CRM visual redesign (Executive Green Command Center) — Conversion card ring.
// Reuses the EXACT same `percent()` helper already used everywhere else on
// this dashboard (no new calculation — `pct`/`remaining` are both derived
// from the same `converted`/`total` numbers the flat-bar version already
// received) and the same donut-track/donut-segment/donut-center-* SVG
// technique already established by renderDomainDonut above, so this is a
// presentation-only change: a single-color progress ring plus a small
// Converted/Remaining stat list, replacing the old flat conversion-track
// bar. `remaining` is plain arithmetic on already-trusted numbers, not a
// new business calculation.
const renderConversionRing = (converted, total) => {
  const pct = percent(converted, total);
  const remaining = Math.max(total - converted, 0);
  return `<div class="conversion-ring-wrap"><svg class="conversion-ring donut-chart" viewBox="0 0 42 42" role="img" aria-label="Lead conversion rate — ${pct} percent, ${converted} converted of ${total} total leads"><circle class="donut-track" cx="21" cy="21" r="15.915" fill="transparent" stroke-width="7"></circle><circle class="donut-segment" cx="21" cy="21" r="15.915" fill="transparent" stroke="var(--green)" stroke-width="7" stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="25"></circle><text class="donut-center-value" x="21" y="19.2" text-anchor="middle">${pct}%</text><text class="donut-center-label" x="21" y="26.8" text-anchor="middle">converted</text></svg><ul class="conversion-stats"><li><span class="legend-swatch" style="background:var(--green)" aria-hidden="true"></span><span class="legend-label">Converted</span><strong class="legend-count">${converted}</strong></li><li><span class="legend-swatch" style="background:var(--line)" aria-hidden="true"></span><span class="legend-label">Remaining</span><strong class="legend-count">${remaining}</strong></li></ul></div>`;
};

export function renderDashboard(leads, profiles = [], currentUserId = null) {
  const root = document.querySelector('#dashboard-analytics');
  if (!root) return;
  const total = leads.length;
  const pipeline = countBy(leads, 'status', OPTIONS.status);
  const domains = countBy(leads, 'business_domain', OPTIONS.business_domain);
  const sources = countBy(leads, 'lead_source', OPTIONS.lead_source);
  const converted = leads.filter(lead => lead.status === 'Converted').length;
  const recent = [...leads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = leads.filter(lead => lead.meeting_date && lead.meeting_date >= today && lead.status !== 'Lost').sort((a, b) => a.meeting_date.localeCompare(b.meeting_date));

  // Phase 5B: dashboard follow-up action cards. Derived from the already
  // loaded `leads` array — no extra Supabase requests. Uses the same local
  // calendar-date helpers as the follow-up filter/column (js/follow-up.js).
  const localToday = localTodayISO();
  const dueTodayCount = leads.filter(lead => getFollowUpStatus(lead, localToday) === 'due_today').length;
  const overdueCount = leads.filter(lead => getFollowUpStatus(lead, localToday) === 'overdue').length;
  // Phase 8 — Change 1: was "Meetings this week" (a next_action_date RANGE
  // check against the local calendar week). Narrowed to an EXACT match
  // against today's date only — a lead counts here if and only if its next
  // action is 'Meeting' scheduled for today, not tomorrow, not yesterday,
  // not later in the week. Same underlying data source as before
  // (next_action / next_action_date), only the date comparison changed.
  const meetingsTodayCount = leads.filter(lead => lead.next_action === 'Meeting' && lead.next_action_date === localToday).length;
  const needingAttentionCount = leads.filter(lead => !['Lost', 'Converted'].includes(lead.status) && ['overdue', 'no_action'].includes(getFollowUpStatus(lead, localToday))).length;
  // Phase 7 — Fix 3 (superseded by CRM Phase 1): the four priority icons
  // were a "circle fill progression" unicode-glyph family. CRM Phase 1
  // replaced them with real inline-SVG icons from js/icons.js — a genuine
  // family in the same sense (same 24x24 stroke contract, same currentColor
  // inheritance). The per-card accent color (warning/danger/info/purple, in
  // this exact order) was already established by the existing Phase 10
  // `.dashboard-priority .metric-card:nth-child(n)` rules in styles.css —
  // left completely untouched here, since that fixed-order, position-based
  // system already colors these four cards correctly; only the icon glyph
  // itself changes. Purely presentational — the underlying counts above
  // are unchanged.
  const actionCards = [
    { label: 'Follow-ups due today', count: dueTodayCount, icon: icon('alarmClock'), filterValue: 'due_today' },
    { label: 'Overdue follow-ups', count: overdueCount, icon: icon('alertTriangle'), filterValue: 'overdue' },
    { label: 'Meetings today', count: meetingsTodayCount, icon: icon('calendarCheck'), filterValue: null },
    { label: 'Leads needing attention', count: needingAttentionCount, icon: icon('flag'), filterValue: null },
  ];

  // Phase 5B: "My Follow-ups" — application-level only (not RLS-enforced this
  // phase). Shows only leads assigned to the current user with a next action
  // and a next action date set, grouped Due Today → Overdue → Upcoming.
  const myLeadsWithFollowUp = currentUserId ? leads.filter(lead => lead.assigned_to === currentUserId && lead.next_action && lead.next_action_date) : [];
  const myFollowUpGroups = ['due_today', 'overdue', 'upcoming'].map(status => ({
    status,
    leads: myLeadsWithFollowUp.filter(lead => getFollowUpStatus(lead, localToday) === status).sort((a, b) => a.next_action_date.localeCompare(b.next_action_date)),
  })).filter(group => group.leads.length);
  const myFollowUpsTotal = myFollowUpGroups.reduce((sum, group) => sum + group.leads.length, 0);
  // CRM Phase 1: each group label now carries a small color dot reusing the
  // EXISTING FOLLOW_UP_BADGE_CLASSES lookup (already defined above, already
  // driving the Lead Directory's own "Next Action" follow-up badges) so the
  // Due Today/Overdue/Upcoming grouping here reads with the same color
  // language the rest of the app already uses for those exact three states
  // — no new status vocabulary, no new color mapping invented.
  const myFollowUpsHtml = myFollowUpsTotal ? myFollowUpGroups.map(group => `<div class="breakdown-label followups-group-label"><span><span class="group-dot ${FOLLOW_UP_BADGE_CLASSES[group.status] || ''}" aria-hidden="true"></span>${escapeHtml(FOLLOW_UP_LABELS[group.status])}</span></div><div class="meeting-list">${group.leads.map(lead => `<article class="meeting-item followup-meeting-item" role="button" tabindex="0" data-dashboard-edit-lead="${escapeHtml(lead.id)}" aria-label="Open ${escapeHtml(lead.client_name || 'lead')} in edit mode"><time datetime="${escapeHtml(lead.next_action_date)}"><strong>${new Date(`${lead.next_action_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric' })}</strong><span>${new Date(`${lead.next_action_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></time><div><strong>${escapeHtml(lead.client_name || 'Unnamed lead')}</strong><span>${escapeHtml(lead.company_name || 'No company recorded')} · ${escapeHtml(lead.next_action)}</span></div></article>`).join('')}</div>`).join('') : `<div class="dashboard-empty"><span aria-hidden="true">${icon('clock')}</span><p>${currentUserId ? 'No follow-ups assigned to you yet.' : 'Sign in to see your assigned follow-ups.'}</p></div>`;

  root.innerHTML = `<div class="dashboard-priority"><p class="section-kicker">TODAY'S PRIORITIES</p><div class="metrics" aria-label="Follow-up summary">${actionCards.map(card => card.filterValue
    ? `<article class="metric-card metric-card-action" role="button" tabindex="0" data-dashboard-followup-filter="${card.filterValue}" aria-label="${escapeHtml(card.label)}: ${card.count}. View matching leads."><div><span>${escapeHtml(card.label)}</span><strong>${card.count}</strong></div><span class="metric-icon" aria-hidden="true">${card.icon}</span></article>`
    : `<article class="metric-card"><div><span>${escapeHtml(card.label)}</span><strong>${card.count}</strong></div><span class="metric-icon" aria-hidden="true">${card.icon}</span></article>`
  ).join('')}</div></div><div class="analytics-grid analytics-top"><section class="analytics-card pipeline-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('activity')}</span><div><p class="section-kicker">PIPELINE</p><h2>Lead pipeline</h2></div></div><span class="analytics-note">${total} total</span></div><div class="pipeline-list">${pipeline.map(item => `<div class="pipeline-row"><span class="pipeline-status">${escapeHtml(item.label)}</span><div class="progress-track"><span class="progress-fill pipeline-${item.label.toLowerCase().replaceAll(' ', '-')}" style="width:${percent(item.count, total)}%"></span></div><strong>${item.count}</strong></div>`).join('')}</div></section><section class="analytics-card conversion-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('checkCircle')}</span><div><p class="section-kicker">CONVERSION</p><h2>Lead conversion rate</h2></div></div></div>${renderConversionRing(converted, total)}<p class="conversion-detail"><strong>${converted}</strong> converted from ${total} total leads</p></section></div><div class="analytics-grid analytics-breakdowns"><section class="analytics-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('hexagon')}</span><div><p class="section-kicker">QUALIFICATION</p><h2>Business domains</h2></div></div></div>${renderDomainDonut(domains, total)}</section><section class="analytics-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('send')}</span><div><p class="section-kicker">ACQUISITION</p><h2>Lead sources</h2></div></div></div><div class="breakdown-list source-list">${renderBreakdownRows(sources, total, 'source')}</div></section></div><div class="analytics-grid analytics-bottom"><section class="analytics-card recent-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('clock')}</span><div><p class="section-kicker">LATEST ACTIVITY</p><h2>Recent leads</h2></div></div><button class="text-link" type="button" data-dashboard-leads>View all leads <span aria-hidden="true">→</span></button></div>${recent.length ? `<div class="activity-list">${recent.map(lead => `<article class="activity-item"><div class="activity-avatar" aria-hidden="true">${escapeHtml((lead.client_name || '?').charAt(0).toUpperCase())}</div><div class="activity-copy"><strong>${escapeHtml(lead.client_name || 'Unnamed lead')}</strong><span>${escapeHtml(lead.company_name || lead.lead_source || 'No company recorded')} · ${escapeHtml(assignedOwnerName(lead.assigned_to, profiles))}</span></div><div class="activity-meta"><span class="mini-domain">${escapeHtml(lead.business_domain || 'Not set')}</span><small>${lead.created_at ? new Date(lead.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—'}</small></div></article>`).join('')}</div>` : `<div class="dashboard-empty"><span aria-hidden="true">${icon('inbox')}</span><p>New leads will appear here once created.</p></div>`}</section><section class="analytics-card meetings-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('calendarCheck')}</span><div><p class="section-kicker">SCHEDULE</p><h2>Upcoming meetings</h2></div></div><span class="analytics-note">${upcoming.length}</span></div>${upcoming.length ? `<div class="meeting-list">${upcoming.slice(0, 5).map(lead => `<article class="meeting-item"><time datetime="${escapeHtml(lead.meeting_date)}"><strong>${new Date(`${lead.meeting_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric' })}</strong><span>${new Date(`${lead.meeting_date}T00:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span></time><div><strong>${escapeHtml(lead.client_name || 'Unnamed lead')}</strong><span>${escapeHtml(lead.company_name || 'No company recorded')} · ${escapeHtml(lead.meeting_taken_by || 'Unassigned')} · ${escapeHtml(assignedOwnerName(lead.assigned_to, profiles))}</span></div>${badge(lead.status)}</article>`).join('')}</div>` : `<div class="dashboard-empty"><span aria-hidden="true">${icon('calendar')}</span><p>No upcoming meetings scheduled.</p></div>`}</section></div><div class="analytics-grid"><section class="analytics-card my-followups-card"><div class="analytics-heading"><div class="analytics-heading-main"><span class="analytics-icon" aria-hidden="true">${icon('flag')}</span><div><p class="section-kicker">MY FOLLOW-UPS</p><h2>Your assigned follow-ups</h2></div></div><span class="analytics-note">${myFollowUpsTotal}</span></div>${myFollowUpsHtml}</section></div>`;
}

const STATUS_BADGE_CLASSES = {
  'New': 'status-new',
  'Contacted': 'status-contacted',
  'Meeting Scheduled': 'status-meeting-scheduled',
  'Meeting Completed': 'status-meeting-completed',
  'Details Sent': 'status-details-sent', // FINAL BATCH — Change 6
  'Proposal Sent': 'status-proposal-sent',
  'Converted': 'status-converted',
  'Lost': 'status-lost',
};
const badge = value => `<span class="badge ${STATUS_BADGE_CLASSES[value] || ''}">${escapeHtml(value || 'Not set')}</span>`;
const domainBadge = value => `<span class="domain-badge">${escapeHtml(value || 'Not set')}</span>`;
const sourceTag = value => `<span class="source-tag"><span aria-hidden="true">•</span>${escapeHtml(value || 'Not set')}</span>`;
// Phase 22 — Feature 3C: optional duplicate indicator in the leads table.
// `duplicateLeadIds` is a plain Set<leadId> computed once by js/app.js (see
// computeDuplicateLeadIds in js/lead-duplicates.js) from the already-loaded
// `allLeads` array — no extra Supabase query, same pattern as every other
// table/filter derivation in this file. Purely a visual flag; never affects
// which rows render or how many.
export function renderLeads(leads, totalLeads = leads.length, profiles = [], currentUserRole = null, duplicateLeadIds = new Set()) {
  const body = document.querySelector('#leads-body'); const empty = document.querySelector('#empty-state');
  const canDelete = canManageLeads(currentUserRole);
  body.innerHTML = leads.map(lead => {
    const leadId = escapeHtml(lead.id);
    const meetingLabel = lead.meeting_date === new Date().toISOString().slice(0, 10) ? 'Today' : lead.meeting_date ? new Date(`${lead.meeting_date}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : 'No meeting';
    const followUpStatus = getFollowUpStatus(lead);
    const followUpDate = formatFollowUpDate(lead.next_action_date);
    const duplicateFlag = duplicateLeadIds.has(lead.id) ? ' <span class="badge duplicate-flag" title="Another lead has a matching phone, email, or company name">Possible duplicate</span>' : '';
    return `<tr><td data-label="Lead"><strong>${escapeHtml(combinedNameDisplay(lead) || 'Unnamed lead')}</strong><small>${escapeHtml(lead.company_name || lead.email || combinedPhoneDisplay(lead) || '—')}</small>${duplicateFlag}</td><td data-label="Domain">${domainBadge(lead.business_domain)}</td><td data-label="Type"><span class="type-tag">${escapeHtml(lead.lead_type || 'Not set')}</span></td><td data-label="Priority">${priorityBadge(lead.lead_priority)}</td><td data-label="Status">${badge(lead.status)}</td><td data-label="Meeting"><span class="meeting-date ${lead.meeting_date ? '' : 'no-meeting'}">${escapeHtml(meetingLabel)}</span><small>${escapeHtml(lead.meeting_taken_by || (lead.meeting_date ? 'Unassigned' : '—'))}</small></td><td data-label="Source">${sourceTag(lead.lead_source)}</td><td data-label="Assigned To"><span class="type-tag">${escapeHtml(assignedOwnerName(lead.assigned_to, profiles))}</span></td><td data-label="Plant Capacity">${escapeHtml(plantCapacityDisplay(lead))}</td><td data-label="Plant Location"${lead.plant_location ? ` title="${escapeHtml(lead.plant_location)}"` : ''}><span class="plant-location-text">${escapeHtml(lead.plant_location || 'Not set')}</span></td><td data-label="Next Action">${followUpBadge(followUpStatus)}<small>${escapeHtml(lead.next_action ? (followUpDate || 'No date set') : 'No follow-up scheduled')}</small></td><td class="actions"><button class="icon-button edit-lead" data-action="edit" data-lead-id="${leadId}" aria-label="Edit ${escapeHtml(lead.client_name || 'lead')}" title="Edit lead">${icon('edit')}</button>${canDelete ? `<button class="icon-button danger delete-lead" data-action="delete" data-lead-id="${leadId}" aria-label="Delete ${escapeHtml(lead.client_name || 'lead')}" title="Delete lead">${icon('trash')}</button>` : ''}</td></tr>`;
  }).join('');
  if (leads.length) { empty.hidden = true; return; }
  empty.hidden = false;
  // Phase 8 — Change 3: the "Add a lead" empty-state button is the third
  // lead-creation entry point (alongside #add-lead-button/#leads-add-button
  // above) — gated the same way so a Member never sees a create action
  // anywhere in the UI, not just the two obvious toolbar buttons.
  empty.innerHTML = totalLeads ? '<span class="empty-icon" aria-hidden="true">⌕</span><h3>No leads match your current filters</h3><p>Try removing a filter or clearing your search to see more opportunities.</p><button class="btn btn-secondary" type="button" data-empty-clear>Clear filters</button>' : `<span class="empty-icon" aria-hidden="true">◎</span><h3>No leads yet</h3><p>${canManageLeads(currentUserRole) ? 'Create the first lead to begin tracking business opportunities.' : 'No leads have been created yet.'}</p>${canManageLeads(currentUserRole) ? '<button class="btn btn-primary" type="button" data-empty-add><span aria-hidden="true">+</span> Add a lead</button>' : ''}`;
}

// Phase 5C: partial re-render of just the activity timeline list, used after
// adding/deleting an activity so the rest of the lead modal (in-progress
// field edits, dirty state, scroll position, focus) is left untouched.
export function renderLeadActivityTimeline(activities, profiles = [], currentUserId = null) {
  const container = document.querySelector('#lead-activity-timeline');
  if (!container) return;
  container.innerHTML = leadActivityListHtml(activities, profiles, currentUserId);
}

export function openLeadModal(lead = null, profiles = [], activities = [], currentUserId = null, currentUserRole = null) {
  const data = { ...EMPTY_LEAD, ...lead }; const isEdit = Boolean(lead);
  // Phase 6C: Members must not see/reliably use lead assignment controls.
  // UI-only — a Member's INSERT is force-assigned to themselves by the
  // Phase 6B database trigger regardless of what this control shows, and a
  // Member's RLS-visible leads for edit are already restricted to their own
  // assigned leads, so the pre-selected value is never misleading.
  const canAssign = canManageLeads(currentUserRole);
  const assignedToSelectedId = canAssign ? data.assigned_to : (currentUserId || data.assigned_to);
  // Phase 8 — Change 3b: Member's finalized permissions restrict editing to
  // meeting information, follow-ups, and activity history only — every
  // other field (client/company/contact details, business qualification,
  // status, assignment, notes) becomes read-only. Reuses canManageLeads
  // (same admin/manager predicate already governing deletion/assignment)
  // rather than adding a new, identically-shaped helper. Enforced here via
  // the native <fieldset disabled> attribute on the relevant sections below
  // — it's the smallest correct mechanism (one attribute per section,
  // cascades to every descendant control, correctly excluded from
  // constraint validation and screen-reader-announced as disabled) rather
  // than hand-disabling each field individually. This is a UI convenience
  // only; actual enforcement is the Phase 8 RLS patch's new
  // enforce_member_core_field_lock trigger on public.leads.
  const readOnlyCore = !canManageLeads(currentUserRole);
  const readOnlyCoreNote = readOnlyCore ? '<p class="lead-readonly-note">Core lead details are managed by Admins and Managers. You can update meeting information, follow-ups, and activity history below.</p>' : '';
  document.querySelector('#modal-root').innerHTML = `<div class="modal-backdrop" role="presentation"><section class="modal lead-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-description" tabindex="-1"><header><div><p class="eyebrow">${isEdit ? 'EDIT EXISTING LEAD' : 'NEW BUSINESS OPPORTUNITY'}</p><h2 id="modal-title">${isEdit ? 'Edit Lead' : 'Add Lead'}</h2><p id="modal-description">${isEdit ? 'Update the information for this existing opportunity.' : 'Capture the details needed to qualify and progress a new opportunity.'}</p></div><button class="modal-close" type="button" aria-label="Close lead form">×</button></header><form id="lead-form" data-mode="${isEdit ? 'edit' : 'create'}" data-lead-id="${lead?.id || ''}" novalidate>${readOnlyCoreNote}<fieldset class="form-section" aria-label="Client information"${readOnlyCore ? ' disabled' : ''}><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('user')}</span>Client information</div><div class="form-grid form-grid-client"><div class="field-pair"><label for="lead-salutation">Salutation<select id="lead-salutation" name="salutation">${salutationOptionList(data.salutation)}</select></label><label for="lead-client-name"><span class="label-heading">Client name<span class="required-indicator" aria-hidden="true">Required</span></span><input id="lead-client-name" name="client_name" required aria-describedby="client-name-error" placeholder="Enter contact name" value="${escapeHtml(data.client_name)}"><small id="client-name-error" class="field-error" data-field-error="client_name" role="alert" hidden>Client name is required.</small></label></div><label for="lead-company-name">Company name<input id="lead-company-name" name="company_name" placeholder="Organisation or business" value="${escapeHtml(data.company_name)}"></label><div class="field-pair"><label for="lead-country-code">Country code<select id="lead-country-code" name="country_code">${countryCodeOptionList(data.country_code)}</select></label><label for="lead-phone-number">Phone number<input id="lead-phone-number" name="phone_number" type="tel" inputmode="tel" autocomplete="tel" placeholder="9876543210" value="${escapeHtml(data.phone_number)}"></label></div><label for="lead-email">Email<input id="lead-email" name="email" type="email" inputmode="email" autocomplete="email" aria-describedby="email-error" placeholder="name@company.com" value="${escapeHtml(data.email)}"><small id="email-error" class="field-error" data-field-error="email" role="alert" hidden>Enter a valid email address.</small></label></div><div id="lead-duplicate-warning" class="duplicate-warning" hidden></div></fieldset><fieldset class="form-section" aria-label="Business qualification"${readOnlyCore ? ' disabled' : ''}><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('briefcase')}</span>Business qualification</div><div class="form-grid"><label for="lead-business-domain">Business domain<select id="lead-business-domain" name="business_domain">${optionList(OPTIONS.business_domain, data.business_domain)}</select></label><label for="lead-assigned-to">Assigned to<select id="lead-assigned-to" name="assigned_to"${canAssign ? '' : ' disabled'}>${assignedProfileOptionList(profiles, assignedToSelectedId)}</select></label><label for="lead-type">Lead type<select id="lead-type" name="lead_type">${optionList(OPTIONS.lead_type, data.lead_type)}</select></label><label for="lead-source">Lead source<select id="lead-source" name="lead_source">${optionList(OPTIONS.lead_source, data.lead_source)}</select></label><label for="lead-priority"><span class="label-heading">Lead Priority${isEdit ? '' : '<span class="required-indicator" aria-hidden="true">Required</span>'}</span><select id="lead-priority" name="lead_priority"${isEdit ? '' : ' required'} aria-describedby="lead-priority-error">${leadPriorityOptionList(data.lead_priority)}</select><small id="lead-priority-error" class="field-error" data-field-error="lead_priority" role="alert" hidden>Select a lead type.</small></label><label for="lead-status"><span class="label-heading">Status<span class="required-indicator" aria-hidden="true">Required</span></span><select id="lead-status" name="status" required aria-describedby="status-error">${optionList(OPTIONS.status, data.status)}</select><small id="status-error" class="field-error" data-field-error="status" role="alert" hidden>Select a lead status.</small></label></div></fieldset><fieldset class="form-section" aria-label="Plant details"${readOnlyCore ? ' disabled' : ''}><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('leaf')}</span>Plant details</div><div class="form-grid"><label for="lead-plant-capacity"><span class="label-heading">Plant Capacity<span class="required-indicator" aria-hidden="true">Required</span></span><select id="lead-plant-capacity" name="plant_capacity" required aria-describedby="plant-capacity-error">${optionList(OPTIONS.plant_capacity, data.plant_capacity, 'Select plant capacity')}</select><small id="plant-capacity-error" class="field-error" data-field-error="plant_capacity" role="alert" hidden>Select a plant capacity.</small></label><label for="lead-plant-capacity-custom" data-plant-capacity-custom-field${data.plant_capacity === 'OTHER' ? '' : ' hidden'}><span class="label-heading">Custom Plant Capacity<span class="required-indicator" aria-hidden="true">Required</span></span><input id="lead-plant-capacity-custom" name="plant_capacity_custom"${data.plant_capacity === 'OTHER' ? ' required' : ''} aria-describedby="plant-capacity-custom-error" placeholder="e.g. 7.5 TPD" value="${escapeHtml(data.plant_capacity_custom || '')}"><small id="plant-capacity-custom-error" class="field-error" data-field-error="plant_capacity_custom" role="alert" hidden>Enter the custom plant capacity.</small></label><label for="lead-feedstock-availability">Feedstock Availability<input id="lead-feedstock-availability" name="feedstock_availability" placeholder="e.g. Rice straw - 20 TPD, or Available" value="${escapeHtml(data.feedstock_availability || '')}"></label><label for="lead-plant-location"><span class="label-heading">Plant Location<span class="required-indicator" aria-hidden="true">Required</span></span><input id="lead-plant-location" name="plant_location" required aria-describedby="plant-location-error" placeholder="e.g. Shirdi, Maharashtra" value="${escapeHtml(data.plant_location || '')}"><small id="plant-location-error" class="field-error" data-field-error="plant_location" role="alert" hidden>Plant location is required.</small></label></div></fieldset><fieldset class="form-section" aria-label="Meeting information"><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('calendarCheck')}</span>Meeting information</div><div class="form-grid"><label for="meeting-taken-by">Meeting taken by<input id="meeting-taken-by" name="meeting_taken_by" placeholder="Team member name" value="${escapeHtml(data.meeting_taken_by)}"></label><label for="meeting-date">Meeting date<input id="meeting-date" name="meeting_date" type="date" value="${escapeHtml(data.meeting_date)}"></label></div></fieldset><fieldset class="form-section" aria-label="Notes"${readOnlyCore ? ' disabled' : ''}><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('fileText')}</span>Notes</div><div class="form-grid"><label class="full" for="lead-description">Description<textarea id="lead-description" name="description" rows="5" placeholder="Meeting notes, project requirements, follow-up context, or next steps…">${escapeHtml(data.description)}</textarea><small>Visible to the Biosanjeevani business team.</small></label></div></fieldset><fieldset class="form-section" aria-label="Follow-up"><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('flag')}</span>Follow-up</div><div class="form-grid"><label for="lead-next-action">Next action<select id="lead-next-action" name="next_action">${optionList(OPTIONS.next_action, data.next_action, 'No action selected')}</select></label><label for="lead-next-action-date">Next action date<input id="lead-next-action-date" name="next_action_date" type="date" value="${escapeHtml(data.next_action_date || '')}"></label><label class="full" for="lead-next-action-notes">Next action notes<textarea id="lead-next-action-notes" name="next_action_notes" rows="3" placeholder="Context for the next follow-up…">${escapeHtml(data.next_action_notes || '')}</textarea></label></div></fieldset><fieldset class="form-section form-section-activity" aria-label="Activity History"><div class="form-section-heading"><span class="lead-section-icon" aria-hidden="true">${icon('activity')}</span>Activity History</div>${isEdit ? `<div class="lead-activity-add"><div class="form-grid"><label for="lead-activity-type-input">Activity type<select id="lead-activity-type-input" form="no-form">${optionList(ACTIVITY_TYPES, '', 'Select activity type')}</select></label><label for="lead-activity-date-input">Activity date<input id="lead-activity-date-input" form="no-form" type="date" value="${localTodayISO()}"></label><label class="full" for="lead-activity-notes-input">Notes<textarea id="lead-activity-notes-input" form="no-form" rows="3" placeholder="What happened, or what's next…"></textarea></label></div><button type="button" class="btn btn-secondary lead-activity-add-button" data-add-activity>+ Add Activity</button></div><p class="lead-activity-timeline-label">Activity Log</p><div id="lead-activity-timeline" class="lead-activity-timeline">${leadActivityListHtml(activities, profiles, currentUserId)}</div>` : `<p class="lead-activity-empty">Save this lead to start recording activity.</p>`}</fieldset><p id="lead-form-error" class="form-error" role="alert" hidden></p><footer><p class="form-footer-note"><span aria-hidden="true">*</span> Required fields</p><div><button type="button" class="btn btn-secondary modal-close">Cancel</button><button id="lead-save-button" class="btn btn-primary" type="submit">${isEdit ? 'Save Changes' : 'Add Lead'}</button></div></footer></form></section></div>`;
}

// Phase 22 — Feature 3: renders (or clears) the non-blocking "Potential
// Duplicate" warning inside the currently-open lead form. Never disables
// the Save button and never prevents submission by itself — js/app.js's
// saveLead() decides, on each submit, whether to show this warning and
// require a second, explicit "Save Anyway" click, or to proceed; this
// function only ever renders whatever matches it's given (an empty array
// clears the banner). `matches` is [{ lead, confidence, reasons }, ...]
// from js/lead-duplicates.js's checkDuplicateLead().
const CONFIDENCE_LABELS = { high: 'High confidence match', medium: 'Possible match', low: 'Possible match' };
export function renderDuplicateWarning(matches = []) {
  const container = document.querySelector('#lead-duplicate-warning');
  if (!container) return;
  if (!matches.length) { container.hidden = true; container.innerHTML = ''; return; }
  container.hidden = false;
  container.innerHTML = `<p class="duplicate-warning-title">${icon('alertTriangle')} Potential Duplicate${matches.length > 1 ? 's' : ''}</p><p class="duplicate-warning-body">This looks like it might already be in your leads. Review before saving, or continue if this is a separate, legitimate lead.</p>${matches.map(match => `<div class="duplicate-match"><p class="duplicate-match-confidence">${escapeHtml(CONFIDENCE_LABELS[match.confidence] || 'Possible match')} — ${escapeHtml(match.reasons.join(', '))}</p><dl class="duplicate-match-details"><div><dt>Lead Name</dt><dd>${escapeHtml(match.lead.client_name || 'Unnamed lead')}</dd></div><div><dt>Company</dt><dd>${escapeHtml(match.lead.company_name || 'Not set')}</dd></div><div><dt>Phone</dt><dd>${escapeHtml(combinedPhoneDisplay(match.lead) || 'Not set')}</dd></div><div><dt>Email</dt><dd>${escapeHtml(match.lead.email || 'Not set')}</dd></div><div><dt>Lead Source</dt><dd>${escapeHtml(match.lead.lead_source || 'Not set')}</dd></div><div><dt>Status</dt><dd>${escapeHtml(match.lead.status || 'Not set')}</dd></div></dl><button type="button" class="btn btn-secondary view-duplicate-lead" data-view-duplicate-lead="${escapeHtml(match.lead.id)}">View Existing Lead</button></div>`).join('')}`;
}

export function closeModal() { document.querySelector('#modal-root').innerHTML = ''; }
export function setButtonLoading(button, loading, text) { button.disabled = loading; button.dataset.originalText ||= button.textContent; button.textContent = loading ? text : button.dataset.originalText; }

// Phase 7 — Fix 5: dedicated login-button loading state. Kept separate from
// the generic setButtonLoading above (still used unchanged by Save
// Lead/Add Activity/Logout/etc. — no risk of regressing those) because the
// reported bug was specific to this one button and needed two things
// setButtonLoading doesn't do: (1) preserve the button's original markup
// (setButtonLoading collapses it to plain textContent, losing the "→" icon
// span on restore) via innerHTML rather than textContent, and (2) render a
// small proportional spinner alongside the label. Layout stability itself
// comes from CSS (.btn now has white-space:nowrap + a fixed .btn-block
// width + min-height, so neither state can wrap or grow the button), not
// from anything JS does here.
//
// This also fixes the actual root cause of the reported bug: the password
// field's toggle button (.password-toggle, added by Phase 6C-4 Fix 7) sits
// earlier in #login-form's DOM order than the submit button, so the old
// `form.querySelector('button')` in app.js's submit handler was silently
// grabbing that 32x32 icon-only toggle button instead of the real submit
// button — cramming "Signing in…" text into a small square button is
// exactly what "escapes the intended box" looks like. app.js now selects
// `button[type="submit"]` explicitly, and this function only ever touches
// the button it's given, so the password toggle is never affected by or
// involved in the login-loading state.
export function setLoginButtonLoading(button, loading) {
  if (loading) {
    button.dataset.originalHtml ||= button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Signing in…</span>';
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
  }
}
