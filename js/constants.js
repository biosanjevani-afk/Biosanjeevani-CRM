// Phase 22: Country Code dropdown for phone numbers. Structured as an
// array of {code, country} objects (not a flat string list) specifically
// so more countries can be appended later without touching any code that
// reads this list — every call site below iterates it generically. `code`
// is what's stored in leads.country_code (e.g. '+91'); `country` is only
// for the dropdown's own label text ("+91 India").
export const COUNTRY_CODES = [
  { code: '+91', country: 'India' },
  { code: '+1', country: 'United States/Canada' },
  { code: '+44', country: 'United Kingdom' },
  { code: '+971', country: 'UAE' },
  { code: '+966', country: 'Saudi Arabia' },
  { code: '+974', country: 'Qatar' },
  { code: '+61', country: 'Australia' },
  { code: '+65', country: 'Singapore' },
  { code: '+49', country: 'Germany' },
  { code: '+33', country: 'France' },
  { code: '+81', country: 'Japan' },
  { code: '+86', country: 'China' },
];

// Phase 22: Salutation dropdown for the contact/customer name field.
// Deliberately exactly these three values, per the feature brief — always
// stored in its own column (leads.salutation), never combined into
// client_name itself; combined only at display time (see ui.js).
export const SALUTATIONS = ['Mr.', 'Miss', 'Mrs.'];

export const OPTIONS = {
  business_domain: ['Biogas / CBG', 'Biofertilizer', 'Both', 'Other'],
  lead_type: ['Project', 'Product', 'Partnership', 'Service', 'Other'],
  // FINAL BATCH — Change 6: 'Details Sent' inserted between 'Meeting
  // Completed' and 'Proposal Sent' — the pipeline position that matches its
  // real-world meaning (project/product details sent to the prospect after
  // a meeting, before a formal proposal). Every existing status keeps its
  // exact string value and position relative to each other, so this is a
  // pure addition: nothing here changes any already-stored lead.status
  // value, and every place that already reads OPTIONS.status (the lead
  // form's status <select>, the #status-filter dropdown, the dashboard
  // pipeline breakdown) picks up the new option automatically with no
  // further code change.
  status: ['New', 'Contacted', 'Meeting Scheduled', 'Meeting Completed', 'Details Sent', 'Proposal Sent', 'Converted', 'Lost'],
  lead_source: ['Meta Ads', 'Google Ads', 'LinkedIn', 'Website', 'Referral', 'IndiaMART', 'Exhibition/Event', 'Direct Outreach', 'Other'],
  // Phase 8 — Change 4: 'Follow-up' removed from this list only (it read as
  // a confusing option inside the Follow-up section itself). Follow-up
  // functionality itself (next_action_date, reminders, badges, filtering,
  // "My Follow-ups") is entirely independent of this specific option list
  // and is unaffected — see js/follow-up.js, none of which references this
  // array. ACTIVITY_TYPES below is a SEPARATE list (the Activity History
  // "Activity type" dropdown) and deliberately keeps its own 'Follow-up'
  // entry — it was not part of this request.
  next_action: ['Call', 'WhatsApp', 'Email', 'Meeting', 'Send Proposal', 'Site Visit', 'Other'],
  // Feature 3: plant capacity options for the Add/Edit Lead "Plant details"
  // section. 'OTHER' triggers the free-text Custom Plant Capacity field
  // (see EMPTY_LEAD's plant_capacity_custom below) — it is not itself a
  // capacity value, so it's handled specially wherever this list is used
  // for display (see quotationStatusOptionList-style helpers if ever added).
  plant_capacity: ['3 TPD', '5 TPD', '6 TPD', 'OTHER'],
  // Lead Priority feature: stored as lowercase hot/warm/cold in
  // public.leads.lead_priority. Named lead_priority (NOT lead_type) because
  // `lead_type` already exists as a SEPARATE, unrelated field above
  // (Project/Product/Partnership/Service/Other — what kind of opportunity
  // this is). Display text for these raw values is LEAD_PRIORITY_LABELS
  // below, not this array directly — the UI always shows "Hot Lead"/"Warm
  // Lead"/"Cold Lead", never the raw "hot"/"warm"/"cold".
  lead_priority: ['hot', 'warm', 'cold'],
};

// Lead Priority display labels — the ONLY place raw hot/warm/cold values are
// mapped to the "Hot Lead"/"Warm Lead"/"Cold Lead" text shown to users
// (badge, filter chip, filter dropdown option). Keeps every call site in
// sync automatically if wording ever needs to change.
export const LEAD_PRIORITY_LABELS = { hot: 'Hot Lead', warm: 'Warm Lead', cold: 'Cold Lead' };

export const EMPTY_LEAD = {
  // Phase 22: salutation and country_code both default to '' (blank/unset)
  // for a new lead — never defaulted to 'Mr.'/'+91', matching this file's
  // existing no-blind-default convention (see lead_priority below).
  salutation: '', client_name: '', company_name: '', country_code: '', phone_number: '', email: '', description: '',
  meeting_taken_by: '', meeting_date: '', business_domain: '', lead_type: '', status: 'New', lead_source: '', assigned_to: '',
  next_action: '', next_action_date: '', next_action_notes: '',
  // Feature 3: plant details. plant_capacity_custom only holds a value when
  // plant_capacity === 'OTHER' (see js/ui.js openLeadModal and js/app.js
  // syncPlantCapacityCustomField); feedstock_availability is deliberately
  // free text (business format not yet defined — see the feature brief).
  plant_capacity: '', plant_capacity_custom: '', feedstock_availability: '', plant_location: '',
  // Lead Priority feature: '' (blank/unassigned) for a new lead — never
  // defaulted to 'hot'/'warm'/'cold', since this is a manual, human choice
  // (see js/ui.js openLeadModal — required only when creating a new lead).
  lead_priority: '',
};

// Phase 5C: allowed public.lead_activities.activity_type values (matches the
// database check constraint exactly — do not add/remove values here without
// also updating the constraint).
export const ACTIVITY_TYPES = ['Call', 'WhatsApp', 'Email', 'Meeting', 'Follow-up', 'Proposal Sent', 'Site Visit', 'Status Change', 'Note'];

// Phase 6C-3: allowed public.profiles.role values, for the Team Management
// role-edit select. Mirrors the same "matches the database exactly" pattern
// as ACTIVITY_TYPES above — do not add/remove values here without also
// updating the Phase 6B RLS policies, which only recognize these three roles.
export const ROLE_OPTIONS = ['admin', 'manager', 'member'];

