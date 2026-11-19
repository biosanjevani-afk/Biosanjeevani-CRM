// js/follow-up.js
// Phase 5B: reusable, pure follow-up-status helpers. Derived entirely from
// existing lead fields (next_action, next_action_date) at render/filter
// time — nothing is written back to Supabase.
//
// Dates are treated as calendar dates only. "Today" is computed via local
// Date getters (getFullYear/getMonth/getDate), never toISOString(), which
// converts through UTC and can land on the wrong local calendar day.
// next_action_date is a plain 'YYYY-MM-DD' string, so status comparisons
// stay as zero-padded ISO string comparisons (lexicographic order =
// chronological order) — no Date object parsing, no timezone risk.

export function localTodayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export const FOLLOW_UP_LABELS = {
  overdue: 'Overdue',
  due_today: 'Due Today',
  upcoming: 'Upcoming',
  no_action: 'No Action',
};

export const FOLLOW_UP_FILTER_OPTIONS = ['due_today', 'overdue', 'upcoming', 'no_action'];

export function getFollowUpStatus(lead, today = localTodayISO()) {
  if (!lead?.next_action || !lead?.next_action_date) return 'no_action';
  if (lead.next_action_date < today) return 'overdue';
  if (lead.next_action_date === today) return 'due_today';
  return 'upcoming';
}

export function formatFollowUpDate(dateStr, today = localTodayISO()) {
  if (!dateStr) return null;
  if (dateStr === today) return 'Today';
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// Sunday-start local calendar week containing `todayISO`, computed via the
// local Date(year, monthIndex, day) constructor only — never UTC-parsed.
export function getLocalWeekRange(todayISO = localTodayISO()) {
  const [y, m, d] = todayISO.split('-').map(Number);
  const base = new Date(y, m - 1, d);
  const dayOfWeek = base.getDay();
  const start = new Date(y, m - 1, d - dayOfWeek);
  const end = new Date(y, m - 1, d - dayOfWeek + 6);
  const toISO = dt => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { start: toISO(start), end: toISO(end) };
}
