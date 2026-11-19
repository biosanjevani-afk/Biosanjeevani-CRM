// js/lead-duplicates.js
// Phase 22 — Feature 3: duplicate-lead DETECTION only. This module never
// deletes, merges, or overwrites a lead — it only compares a candidate
// lead against the already-loaded `allLeads` array (the same in-memory
// array js/app.js's visibleLeads()/refreshTable() already filter over, so
// this adds zero extra Supabase queries) and returns a list of possible
// matches with a confidence tier, for js/ui.js's renderDuplicateWarning()
// to display. Whether to actually block/warn on save is entirely
// js/app.js's decision (saveLead()); this file only classifies.
//
// Confidence tiers, per the feature brief:
//   HIGH   — normalized country_code+phone_number match, OR normalized
//            email match.
//   MEDIUM — normalized company_name match, with the contact/person name
//            NOT also matching (e.g. a different employee enquiring from
//            the same company) — company name alone is a reasonably
//            reliable business identifier.
//   LOW    — contact/person name AND company name BOTH match (normalized).
//            Deliberately ranked BELOW plain company-only MEDIUM matches:
//            the brief explicitly warns that person-name matching is prone
//            to false positives (common names recur across unrelated
//            people/companies — see the "Rajesh Kumar at two unrelated
//            companies" negative test), so once a person-name signal is
//            part of the match at all, this module never lets it push the
//            result above LOW/supporting, even when it's paired with a
//            company match. Name alone (without company) is never
//            sufficient and produces no match at any tier.

// Digits only — strips spaces, hyphens, brackets, dots, and the leading
// '+' from a country code, so '+91' and '(+91)' and '91' all normalize the
// same way, and so 'country_code + phone_number' can be compared as one
// normalized digit string regardless of how either half was formatted.
function normalizeDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizedPhoneKey(lead) {
  const digits = normalizeDigits(lead.phone_number);
  if (!digits) return '';
  // Country code is included when present (per the brief's "Country code +
  // phone number" HIGH-confidence rule) but its absence must not itself
  // cause a false negative against a lead that DOES have one recorded —
  // see checkDuplicateLead's comparison, which tries both a
  // country-code-qualified and a bare-digits comparison rather than
  // requiring an exact key match here.
  return digits;
}

// Phone digit-string comparison with a legacy-data fallback. Tries an
// exact match on the full normalized digit string first (handles two
// NEW-style records, or two legacy records whose phone_number happens to
// embed the same prefix). If that doesn't match, falls back to comparing
// only the trailing PHONE_TAIL_LENGTH digits — this is what catches a
// PRE-Phase-22 lead whose phone_number free-text already has a country
// code typed into it (e.g. '+91 98765 43210' — the shape every seed lead
// in this project actually has) against a NEW lead that stores the same
// number with country_code split into its own field (phone_number alone
// is just '9876543210'). Without this fallback, checkDuplicateLead would
// silently miss exactly the duplicate-detection case the feature exists
// for: someone re-submitting a lead that's already in the system under
// the old combined-phone format. Matching only the last 10 digits keeps
// this safe against false positives — two genuinely different phone
// numbers essentially never share a 10-digit suffix by chance, so this
// never weakens the existing "avoid overly aggressive fuzzy matching"
// requirement, it only tolerates a known formatting-history quirk.
const PHONE_TAIL_LENGTH = 10;
function phoneDigitsMatch(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.length >= PHONE_TAIL_LENGTH && b.length >= PHONE_TAIL_LENGTH) {
    return a.slice(-PHONE_TAIL_LENGTH) === b.slice(-PHONE_TAIL_LENGTH);
  }
  return false;
}

function normalizedEmail(lead) {
  return String(lead.email || '').trim().toLowerCase();
}

// Collapses internal whitespace and trims, then lowercases — tolerant of
// "  Acme  Biogas " vs "Acme Biogas" and of case differences, but does NOT
// do any fuzzy/edit-distance matching (deliberately, per the brief's
// "avoid overly aggressive fuzzy matching" requirement).
function normalizedText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// checkDuplicateLead: compares `candidate` (the in-progress form payload —
// may or may not have an `id` yet) against every OTHER lead in `allLeads`
// (excluding the candidate's own id, so editing a lead never flags itself)
// and returns an array of { lead, confidence, reasons } for every lead
// that matches on at least one signal. `reasons` is a short list of
// human-readable strings for display (e.g. "phone", "email").
export function checkDuplicateLead(candidate, allLeads = []) {
  const candidatePhone = normalizedPhoneKey(candidate);
  const candidateCountry = normalizeDigits(candidate.country_code);
  const candidateEmail = normalizedEmail(candidate);
  const candidateCompany = normalizedText(candidate.company_name);
  const candidateName = normalizedText(candidate.client_name);

  const results = [];
  for (const lead of allLeads) {
    if (!lead || (candidate.id && lead.id === candidate.id)) continue;

    const leadPhone = normalizedPhoneKey(lead);
    const leadCountry = normalizeDigits(lead.country_code);
    const leadEmail = normalizedEmail(lead);
    const leadCompany = normalizedText(lead.company_name);
    const leadName = normalizedText(lead.client_name);

    const reasons = [];
    let confidence = null;

    // HIGH — country code + phone number. Requires both phone digit
    // strings to be non-empty and equal; if BOTH sides also have a country
    // code recorded, the country codes must match too (a shared bare
    // number with two different country codes is not treated as the same
    // number). If either side is missing a country code, phone-digit
    // equality alone is enough — this keeps the check useful for the many
    // existing leads that predate this feature and have no country_code
    // recorded yet.
    if (candidatePhone && leadPhone && phoneDigitsMatch(candidatePhone, leadPhone)) {
      const countriesCompatible = !candidateCountry || !leadCountry || candidateCountry === leadCountry;
      if (countriesCompatible) { reasons.push('phone number'); confidence = 'high'; }
    }

    // HIGH — email.
    if (candidateEmail && leadEmail && candidateEmail === leadEmail) {
      reasons.push('email address');
      confidence = 'high';
    }

    // Company name match (only relevant if not already HIGH from
    // phone/email). Whether this lands at MEDIUM or LOW depends on whether
    // the contact/person name ALSO matches — see the tier comment above.
    if (confidence !== 'high' && candidateCompany && leadCompany && candidateCompany === leadCompany) {
      const nameAlsoMatches = Boolean(candidateName && leadName && candidateName === leadName);
      if (nameAlsoMatches) {
        // LOW / supporting — contact name + company name together. Name
        // alone is never sufficient (guarded by requiring the company
        // match above too), which avoids flagging two unrelated people who
        // simply share a common name at different companies.
        reasons.push('contact name + company name');
        confidence = 'low';
      } else {
        reasons.push('company name');
        confidence = 'medium';
      }
    }

    if (confidence) results.push({ lead, confidence, reasons });
  }

  // Highest confidence first (high, then medium, then low), so the most
  // relevant match is what the warning banner leads with.
  const rank = { high: 0, medium: 1, low: 2 };
  return results.sort((a, b) => rank[a.confidence] - rank[b.confidence]);
}

// computeDuplicateLeadIds: for the optional Feature 3C table indicator —
// returns a Set of every lead id that has at least one match (any
// confidence tier) somewhere else in the same array, computed once per
// render from the already-loaded `allLeads`. O(n) bucketing by normalized
// phone/email/company first, then a name+company pass only within
// same-company buckets — deliberately avoids a naive O(n^2) compare over
// every pair, since this runs on every table render.
export function computeDuplicateLeadIds(allLeads = []) {
  const flagged = new Set();
  const byPhone = new Map();
  // Same legacy-data tolerance as checkDuplicateLead's phoneDigitsMatch:
  // a pre-Phase-22 lead's phone_number free-text may already embed a
  // country code ('+91 98765 43210'), while a new lead stores the same
  // number with country_code split out (phone_number alone is the bare 10
  // digits). Bucketing by full digit string alone would put those two
  // records in different buckets and silently fail to flag either one —
  // this second bucket, keyed by only the trailing PHONE_TAIL_LENGTH
  // digits, catches that case too, so the table indicator never disagrees
  // with what checkDuplicateLead would report for the same two leads.
  const byPhoneTail = new Map();
  const byEmail = new Map();
  const byCompany = new Map();

  for (const lead of allLeads) {
    const phone = normalizedPhoneKey(lead);
    if (phone) {
      if (!byPhone.has(phone)) byPhone.set(phone, []); byPhone.get(phone).push(lead);
      if (phone.length >= PHONE_TAIL_LENGTH) {
        const tail = phone.slice(-PHONE_TAIL_LENGTH);
        if (!byPhoneTail.has(tail)) byPhoneTail.set(tail, []); byPhoneTail.get(tail).push(lead);
      }
    }
    const email = normalizedEmail(lead);
    if (email) { if (!byEmail.has(email)) byEmail.set(email, []); byEmail.get(email).push(lead); }
    const company = normalizedText(lead.company_name);
    if (company) { if (!byCompany.has(company)) byCompany.set(company, []); byCompany.get(company).push(lead); }
  }

  for (const bucket of byPhone.values()) if (bucket.length > 1) bucket.forEach(lead => flagged.add(lead.id));
  for (const bucket of byPhoneTail.values()) if (bucket.length > 1) bucket.forEach(lead => flagged.add(lead.id));
  for (const bucket of byEmail.values()) if (bucket.length > 1) bucket.forEach(lead => flagged.add(lead.id));
  for (const bucket of byCompany.values()) if (bucket.length > 1) bucket.forEach(lead => flagged.add(lead.id));

  return flagged;
}
