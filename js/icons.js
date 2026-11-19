// js/icons.js
// CRM Phase 1 (Executive Command Center redesign) — self-contained inline
// SVG icon module, mirroring the pattern already established in this same
// project's finance/js/icons.js module (finance is a separate codebase —
// this file is a fresh, independent implementation, not a copy/import of
// it — kept in the same *spirit* only: no external icon font/library, no
// CDN, no build step, safe under any CSP that only allows same-origin
// script/style).
//
// Every icon here is DECORATIVE ONLY: it always renders with
// aria-hidden="true" and focusable="false", exactly matching the plain
// unicode glyph spans (already aria-hidden="true") it replaces in
// js/ui.js's renderApp()/renderDashboard() templates. Swapping a glyph's
// inner markup for one of these never changes an id, a data-* attribute,
// or any visible text content anything else depends on.
//
// STYLE CONTRACT — every icon obeys all of these, so they mix freely and
// need zero per-theme variants:
//   * 24x24 viewBox, no width/height attribute by default (sized via the
//     .crm-icon CSS class in styles.css, or the `size` option below).
//   * Stroke-based (fill="none"), stroke="currentColor", stroke-width 1.7,
//     round caps/joins — inherits the surrounding text/icon color, so
//     light/dark theming and per-card "tone" colors are automatic. A
//     couple of small solid glyphs (sparkle) use fill="currentColor"
//     instead, set per-path.
//   * No text/data is ever interpolated into these strings — they are
//     fixed, static markup, so there is no escaping concern here.

const STROKE_ATTRS = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

// Each entry is only the inner geometry of a 24x24 icon; icon() wraps it.
const PATHS = {
  // ---- sidebar / mobile nav ----------------------------------------------
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.6"/><rect x="13" y="3" width="8" height="8" rx="1.6"/><rect x="3" y="13" width="8" height="8" rx="1.6"/><rect x="13" y="13" width="8" height="8" rx="1.6"/>',
  list: '<circle cx="4.5" cy="6" r="1.4"/><path d="M9 6h11"/><circle cx="4.5" cy="12" r="1.4"/><path d="M9 12h11"/><circle cx="4.5" cy="18" r="1.4"/><path d="M9 18h11"/>',
  hexagon: '<path d="M12 2.5 20.5 7.5V16.5L12 21.5 3.5 16.5V7.5Z"/>',

  // ---- theme toggle / logout ----------------------------------------------
  theme: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" stroke="none"/>',
  logout: '<path d="M9.5 20.5H5.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2h4"/><path d="m15.5 16.5 4.5-4.5-4.5-4.5"/><path d="M20 12H9.5"/>',

  // ---- KPI metric cards -----------------------------------------------
  layers: '<path d="M12 3 3 8l9 5 9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 16 9 5 9-5"/>',
  sparkle: '<path d="M12 3.5c.6 3.2 1.7 4.9 4.5 5.5-2.8.6-3.9 2.3-4.5 5.5-.6-3.2-1.7-4.9-4.5-5.5 2.8-.6 3.9-2.3 4.5-5.5Z" fill="currentColor" stroke="none"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
  checkCircle: '<circle cx="12" cy="12" r="8.5"/><path d="m8 12.3 2.6 2.6 5.4-6"/>',

  // ---- dashboard priority action cards ------------------------------------
  alarmClock: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5"/><path d="M5.5 4.5 3.5 6.5"/><path d="m18.5 4.5 2 2"/><path d="M9 2.5h6"/>',
  alertTriangle: '<path d="M12 4 21 19.5H3Z"/><path d="M12 9.5v4"/><path d="M12 16.7h.01"/>',
  calendarCheck: '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3"/><path d="M16 3.5v3"/><path d="m9 14.5 2 2 4-4.5"/>',
  flag: '<path d="M6 21V4"/><path d="M6 4.5c1.7-1.2 3.6-1.2 5.3 0 1.7 1.2 3.6 1.2 5.2 0v8.3c-1.6 1.2-3.5 1.2-5.2 0-1.7-1.2-3.6-1.2-5.3 0Z"/>',

  // ---- dashboard empty states ----------------------------------------------
  inbox: '<path d="M4 12.5h4.2l1.6 2.5h4.4l1.6-2.5H20"/><path d="M6 5.5h12l2 7v6.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6.5Z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3.5v3"/><path d="M16 3.5v3"/>',

  // ---- CRM Phase 2 (Lead Directory redesign) — table row actions and the
  // toolbar search field. Same 24x24 stroke contract as every icon above,
  // so they mix in freely with zero new CSS/theme handling needed. Purely
  // additive entries — nothing above this comment is changed.
  edit: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>',
  trash: '<path d="M4 6.5h16"/><path d="M18 6.5 17.2 19a2 2 0 0 1-2 1.9H8.8a2 2 0 0 1-2-1.9L6 6.5"/><path d="M9.5 6.5V4.7A1.7 1.7 0 0 1 11.2 3h1.6a1.7 1.7 0 0 1 1.7 1.7v1.8"/><path d="M10 10.5v6"/><path d="M14 10.5v6"/>',
  search: '<circle cx="11" cy="11" r="7.2"/><path d="m20.5 20.5-4.3-4.3"/>',

  // ---- CRM Phase 3 (Add/Edit Lead modal redesign) — icon-led section
  // legends inside openLeadModal() and the duplicate-warning banner's
  // title. Same 24x24 stroke contract as every icon above; purely
  // additive entries, nothing above this comment is changed.
  user: '<circle cx="12" cy="8.3" r="3.6"/><path d="M4.5 20c1.3-4 4-6 7.5-6s6.2 2 7.5 6"/>',
  briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M8.5 7.5V5.8A1.8 1.8 0 0 1 10.3 4h3.4a1.8 1.8 0 0 1 1.8 1.8V7.5"/><path d="M3 12.5h18"/>',
  leaf: '<path d="M5 19c-1-6 1-11 6-13.5C16 3 20 4 20 4s1 4-1.5 9C16 18 11 20 5 19Z"/><path d="M5 19c2-4 5-7.5 9-10"/>',
  fileText: '<path d="M7 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19V5A1.5 1.5 0 0 1 7 3.5Z"/><path d="M14 3.5V8h4.5"/><path d="M9 13h6"/><path d="M9 16.3h6"/>',
  activity: '<path d="M3 12h4l2.2-6.5L13 18l2-6h6"/>',

  // ---- CRM Phase 5 (Meetings/Follow-ups/Activity History redesign) — one
  // icon per public.lead_activities.activity_type value (see
  // js/constants.js's ACTIVITY_TYPES), used only as the small marker glyph
  // inside each Activity History timeline entry (js/ui.js's
  // leadActivityItemHtml, via a local, hardcoded string->icon-name lookup —
  // this module is never told about activity_type strings directly). Same
  // 24x24 stroke contract as every icon above; purely additive entries,
  // nothing above this comment is changed. 'Meeting' and 'Follow-up' reuse
  // the existing calendarCheck/flag icons above rather than duplicating a
  // near-identical glyph.
  phoneCall: '<path d="M6.5 3.5c.9 0 1.7.6 1.9 1.5l.7 2.8c.2.7-.1 1.5-.7 1.9l-1.3.9c1 2.3 2.8 4.1 5.1 5.1l.9-1.3c.4-.6 1.2-.9 1.9-.7l2.8.7c.9.2 1.5 1 1.5 1.9v2.3c0 1.1-.9 2-2 1.9-7-.4-12.6-6-13-13-.1-1.1.8-2 1.9-2Z"/>',
  messageCircle: '<path d="M12 3.5c-4.7 0-8.5 3.4-8.5 7.6 0 2.3 1.1 4.4 3 5.8l-.8 3.6 3.9-1.7c.8.2 1.6.3 2.4.3 4.7 0 8.5-3.4 8.5-7.6S16.7 3.5 12 3.5Z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  send: '<path d="M21 3 3 10.5l7 3 3 7L21 3Z"/><path d="M13.5 13.5 21 3"/>',
  mapPin: '<path d="M12 21.5C8 17 5.5 13.6 5.5 10a6.5 6.5 0 0 1 13 0c0 3.6-2.5 7-6.5 11.5Z"/><circle cx="12" cy="10" r="2.3"/>',
  refreshCw: '<path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.7L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  stickyNote: '<path d="M5 4.5h11l3 3V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z"/><path d="M15 4.5V9h4"/>',
};

// A stable, ordered list of every icon name this module ships.
export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

/**
 * Return the SVG markup string for one icon.
 *
 * @param {string} name  one of ICON_NAMES. An unknown name returns '' rather
 *                       than throwing — a missing icon should never take the
 *                       whole shell down at render time.
 * @param {{size?:number|string, className?:string}} [options]
 *        size      — rendered px size. Omit to let CSS (.crm-icon) size it.
 *        className — extra class(es) appended after the base "crm-icon".
 * @returns {string} SVG markup, or '' for an unknown name.
 */
export function icon(name, options = {}) {
  const inner = PATHS[name];
  if (!inner) return '';
  const { size, className = '' } = options;
  const sizeAttrs = size ? ` width="${size}" height="${size}"` : '';
  const classAttr = `crm-icon${className ? ` ${className}` : ''}`;
  return `<svg class="${classAttr}" viewBox="0 0 24 24"${sizeAttrs} ${STROKE_ATTRS} aria-hidden="true" focusable="false">${inner}</svg>`;
}

export default icon;
