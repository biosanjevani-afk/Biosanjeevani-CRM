// js/leads-export.js
// Export Feature — CRM Leads bulk "data export" PDF (task #184). Wired to
// the "Export PDF" button in the Leads toolbar (js/ui.js renderApp, right
// next to #clear-filters). Exports EXACTLY the array js/app.js's
// visibleLeads() currently returns — the same filtered/searched dataset the
// Leads table itself is showing — so this always respects every active
// filter with zero extra Supabase query. This is a brand-new, completely
// separate feature: Leads have no individual per-record PDF today, so
// nothing existing is touched, replaced, or at risk here.
import { LEAD_PRIORITY_LABELS } from './constants.js?v=20260910a';
import { getFollowUpStatus, FOLLOW_UP_LABELS } from './follow-up.js?v=20260902a';
import { assignedOwnerName, plantCapacityDisplay, combinedPhoneDisplay, combinedNameDisplay } from './ui.js?v=20260916b';
import { exportPdfReport, formatDateOnly, buildFilterSummaryLines } from './export-utils.js?v=20260902a';

// Phase 22: uses combinedPhoneDisplay so the exported "Contact" column shows
// the country code alongside the phone number ("+91 9876543210") exactly as
// it's now shown in the leads table, instead of the bare phone_number value.
function contactLine(lead) {
  const parts = [combinedPhoneDisplay(lead), lead.email].filter(Boolean);
  return parts.length ? parts.join(' / ') : '';
}

// Column order matches the field list from EXPORT-FEATURE-INSPECTION-REPORT.md
// / the implementation brief exactly: Lead Name, Company, Contact, Business
// Domain, Lead Type, Lead Priority, Status, Assigned Team Member, Follow-up
// Status, Plant Capacity, Plant Location, Feedstock Availability, Created Date.
// `weight` gives each column its explicit share of the printable page width
// (see export-utils.js's computeColumnWidths) — sized by hand per column so
// long free-text fields (Company, Contact, Plant Location, Feedstock
// Availability) get noticeably more room than short/fixed-vocabulary ones
// (Lead Type, Lead Priority, Status, Created Date), rather than leaving
// every column an equal, awkwardly narrow slice of 13 columns.
function leadExportColumns(profiles) {
  return [
    { header: 'Lead Name', value: lead => combinedNameDisplay(lead) || 'Unnamed lead', weight: 1.3 },
    { header: 'Company', value: lead => lead.company_name, weight: 1.4 },
    { header: 'Contact', value: contactLine, weight: 1.5 },
    { header: 'Business Domain', value: lead => lead.business_domain, weight: 1.1 },
    { header: 'Lead Type', value: lead => lead.lead_type, weight: 0.9 },
    { header: 'Lead Priority', value: lead => LEAD_PRIORITY_LABELS[lead.lead_priority] || lead.lead_priority, weight: 0.9 },
    { header: 'Status', value: lead => lead.status, weight: 1.0 },
    { header: 'Assigned Team Member', value: lead => assignedOwnerName(lead.assigned_to, profiles), weight: 1.1 },
    { header: 'Follow-up Status', value: lead => FOLLOW_UP_LABELS[getFollowUpStatus(lead)], weight: 1.0 },
    { header: 'Plant Capacity', value: lead => plantCapacityDisplay(lead), weight: 1.0 },
    { header: 'Plant Location', value: lead => lead.plant_location, weight: 1.4 },
    { header: 'Feedstock Availability', value: lead => lead.feedstock_availability, weight: 1.7 },
    { header: 'Created Date', value: lead => formatDateOnly(lead.created_at), weight: 0.8 },
  ];
}

// exportLeadsPdf: called by js/app.js with the live visibleLeads() result,
// the already-loaded profiles array, and the active-filter chip list from
// computeActiveLeadFilterChips() — this module performs no filtering and no
// Supabase reads of its own.
export function exportLeadsPdf(leads, profiles, activeFilterChips) {
  return exportPdfReport({
    reportTitle: 'Biosanjeevani CRM - Leads Report',
    filenamePrefix: 'Biosanjeevani_Leads_Report',
    recordLabel: 'leads',
    filterLines: buildFilterSummaryLines(activeFilterChips),
    rows: leads,
    columns: leadExportColumns(profiles),
  });
}
