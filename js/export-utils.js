// js/export-utils.js
// Export Feature — shared PDF/Excel "data export" mechanics for the CRM.
// Built per EXPORT-FEATURE-INSPECTION-REPORT.md's recommended architecture.
//
// This module knows nothing about leads, filters, or Supabase — it only
// turns an already-filtered array of plain row objects + a column
// definition into a polished multi-page landscape PDF (title, export
// timestamp, record count, active-filter summary, repeating table headers,
// page numbers, safe long-text wrapping, graceful zero-result handling) or a
// genuine SheetJS .xlsx workbook. The calling page (js/leads-export.js) owns
// what the columns/title/filename are and where the filtered data and
// filter-summary text come from; this file owns the PDF/Excel building
// blocks only, so none of it is duplicated per export.
//
// This is a completely separate code path from the CRM's individual
// per-lead UI (there is none) and, by construction/convention, from
// Finance's own per-document PDF mechanism (window.print() + a hidden
// print-only DOM node — see finance/js/invoices-ui.js /
// finance/js/quotations-ui.js). Nothing here calls window.print().
//
// Two independently-deployed static sites (this CRM + Finance) share no
// build step, so this exact file is duplicated (kept in sync) at
// finance/js/export-utils.js rather than imported across origins — the same
// pattern already used for confirm.js/follow-up.js/invoice-money.js-shaped
// files in this project.
//
// Library loading — CSP-compatible, zero .htaccess change (see .htaccess:
// script-src 'self' https://esm.sh ...): jsPDF + jspdf-autotable + SheetJS
// are loaded from https://esm.sh, the ONLY external script host this app's
// CSP already allow-lists, exactly mirroring how @supabase/supabase-js is
// loaded in js/supabase.js. jspdf-autotable is pinned to the SAME jsPDF
// module instance via esm.sh's `?deps=` dedup query param — it is a
// side-effect plugin that patches whichever `jspdf` module it internally
// resolves; without deps-pinning esm.sh could serve it a second, separate
// jsPDF module instance that never gets `doc.autoTable` attached to the
// class this file actually constructs `new jsPDF()` from.
//
// These are dynamic import()s, NOT static top-of-file imports, and
// deliberately so: a static `import ... from 'https://esm.sh/...'` at
// module scope would be fetched the instant this module is first reached —
// which, transitively, is every time the Leads/Quotations/Invoices page
// loads at all (js/app.js imports js/leads-export.js unconditionally). A
// static import failing (esm.sh hiccup, offline) throws at MODULE
// INSTANTIATION time, which aborts the entire ES module graph — the whole
// app would fail to boot (nobody could even see the login screen) over a
// library only the "Export PDF"/"Export Excel" buttons need. Loading them
// lazily, only when an export is actually clicked, means a load failure
// only breaks that one export action (caught by the caller's try/catch in
// js/app.js) and everything else in the app is unaffected. Each loader
// promise is cached so repeated exports don't re-fetch the library.
let jsPDFLoadPromise = null;
function loadJsPDF() {
  // Sequential, NOT Promise.all — jspdf-autotable is a side-effect plugin
  // that patches whichever jsPDF class it resolves at import time, so its
  // own import must not start until the jspdf import has fully finished
  // resolving (and, in this file's own dynamic-import world, until any
  // module-scope work that import triggers has completed) — starting both
  // fetches "at once" is fine on real esm.sh (URL-keyed module caching
  // dedupes it), but this ordering is the only version that is ALSO
  // correct when this exact loader is exercised against a local module
  // shim (as this project's own Playwright export-feature test harness
  // does, since esm.sh itself is unreachable from that sandbox) — so it's
  // written the safe way unconditionally rather than assuming which
  // environment is loading it.
  if (!jsPDFLoadPromise) {
    jsPDFLoadPromise = (async () => {
      const jspdfModule = await import('https://esm.sh/jspdf@2.5.2');
      await import('https://esm.sh/jspdf-autotable@3.8.4?deps=jspdf@2.5.2');
      return jspdfModule.jsPDF;
    })();
  }
  return jsPDFLoadPromise;
}
let xlsxLoadPromise = null;
function loadXLSX() {
  if (!xlsxLoadPromise) xlsxLoadPromise = import('https://esm.sh/xlsx@0.18.5');
  return xlsxLoadPromise;
}

const NO_RESULTS_TEXT = 'No records match the selected filters.';

// formatDateOnly: handles both a bare 'YYYY-MM-DD' stored date (e.g. a
// quotation/invoice date) and a full ISO timestamp (e.g. created_at),
// anchoring bare dates to LOCAL midnight via the same 'T00:00:00' pattern
// already used everywhere else in this project (js/ui.js formatDate,
// finance/js/quotations-ui.js formatQuotationDate,
// finance/js/invoices-ui.js formatInvoiceDate) so this never silently drifts
// a calendar day backward in a UTC-behind timezone.
export function formatDateOnly(value) {
  if (!value) return '—';
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isBareDate ? `${value}T00:00:00` : value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatExportTimestamp(date = new Date()) {
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function formatFilenameDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// buildFilterSummaryLines: pure formatting only — takes the ALREADY-COMPUTED
// active-filter chip list each page derives from its own real filter state
// (e.g. js/app.js's computeActiveLeadFilterChips(), which is exactly what
// also drives the on-screen filter chips) and turns it into the plain-text
// lines this module prints. It never re-reads a DOM control and never
// re-implements a single filter predicate itself.
export function buildFilterSummaryLines(activeFilterChips = []) {
  const lines = activeFilterChips.map(chip => chip.label).filter(Boolean);
  return lines.length ? lines : ['All records'];
}

function safeCell(value) {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function resolveCellValue(row, column) {
  return typeof column.value === 'function' ? column.value(row) : row[column.key];
}

// computeColumnWidths: turns each column's relative `weight` (default 1 —
// wider columns like a long free-text field pass a larger weight, e.g. 2)
// into an explicit pt width that makes every column's share sum to exactly
// `usableWidth`. See the "Explicit, deliberately-computed column widths"
// comment at exportPdfReport's autoTable() call for why this replaces
// jspdf-autotable's own default 'auto' sizing.
function computeColumnWidths(columns, usableWidth) {
  const totalWeight = columns.reduce((sum, column) => sum + (column.weight || 1), 0);
  return columns.map(column => (usableWidth * (column.weight || 1)) / totalWeight);
}

// pdfSafeCurrency: jsPDF's built-in 'helvetica' font is one of the PDF
// spec's 14 Standard Fonts (WinAnsiEncoding only) — it has no ₹ (Indian
// Rupee, U+20B9) glyph. Found in testing: passing a ₹-formatted string
// straight into an autoTable cell does not throw or drop the character, it
// silently renders as a mangled superscript-one ("¹") in its place, which
// is easy to miss without actually reading the rendered PDF. This wraps
// invoice-money.js's own formatMinor() output — never re-implements the
// underlying Intl.NumberFormat rupee/lakh/crore grouping — and only swaps
// the leading ₹ glyph for the plain-ASCII "Rs. " prefix that every
// Standard PDF font can render correctly. Excel cells are unaffected by
// this (money columns there are written as real numbers, not this string).
export function pdfSafeCurrency(formattedAmount) {
  return formattedAmount.replace(/^₹\s*/, 'Rs. ');
}

// exportPdfReport: A4 landscape, professional internal report layout.
// - Title, export date/time, total record count, and the active-filter
//   summary are drawn once, above the table, on the first page.
// - Table headers repeat on every page (jspdf-autotable's default
//   showHead:'everyPage' behavior) and every page gets "Page N of TOTAL"
//   drawn after the table is fully laid out (TOTAL isn't known until then).
// - Long text wraps within its cell (styles.overflow:'linebreak', the
//   autotable default) rather than being clipped or overflowing the page.
// - Zero-result datasets still produce a complete, valid PDF: the title/
//   meta/filter block is drawn as normal, then the literal text
//   "No records match the selected filters." is drawn in place of a table
//   (an empty table would otherwise render as just a bare header row, which
//   reads as broken rather than intentionally empty).
export async function exportPdfReport({ reportTitle, filenamePrefix, recordLabel, filterLines = ['All records'], rows = [], columns, generatedAt = new Date() }) {
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 32;
  let y = 42;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20, 20, 20);
  doc.text(reportTitle, margin, y); y += 20;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(95, 95, 95);
  doc.text(`Exported: ${formatExportTimestamp(generatedAt)}`, margin, y); y += 13;
  doc.text(`Total ${recordLabel}: ${rows.length}`, margin, y); y += 16;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
  doc.text('Filters:', margin, y); y += 13;
  doc.setFont('helvetica', 'normal'); doc.setTextColor(95, 95, 95);
  filterLines.forEach(line => { doc.text(line, margin + 10, y); y += 13; });
  y += 6;
  doc.setTextColor(20, 20, 20);

  if (rows.length === 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text(NO_RESULTS_TEXT, margin, y + 12);
  } else {
    // Explicit, deliberately-computed column widths (see computeColumnWidths
    // below) rather than jspdf-autotable's own default 'auto' sizing.
    // 'auto' computes each column's width from its own content, then — when
    // the total exceeds the page (routine for a report with a dozen-plus
    // columns) — shrinks every column down, with no floor beyond a single
    // wrapped word. Found in testing: with enough columns this can shrink a
    // column narrower than its own header word, forcing autoTable's
    // line-break overflow to split MID-WORD ("Customer" as "Cust"/"ome"/
    // "r" on three separate lines) — technically not clipped, but unusable
    // as a "professional business report." Giving every column an explicit
    // share of the usable page width up front avoids that failure mode
    // entirely; a column can still wrap onto multiple lines for long
    // content (safe, expected, and what "long text handling" requires),
    // it just never has to wrap a single word into fragments.
    const usableWidth = pageWidth - margin * 2;
    const columnWidths = computeColumnWidths(columns, usableWidth);
    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin, bottom: 34 },
      head: [columns.map(column => column.header)],
      body: rows.map(row => columns.map(column => safeCell(resolveCellValue(row, column)))),
      styles: { fontSize: 7.5, cellPadding: 4, overflow: 'linebreak', valign: 'middle', textColor: [30, 30, 30] },
      headStyles: { fillColor: [31, 87, 61], textColor: 255, fontStyle: 'bold', fontSize: 7.5 },
      alternateRowStyles: { fillColor: [245, 248, 246] },
      columnStyles: Object.fromEntries(columns.map((column, index) => [index, { halign: column.halign || 'left', cellWidth: columnWidths[index] }])),
      tableWidth: usableWidth,
      showHead: 'everyPage',
      theme: 'grid',
    });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(130, 130, 130);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 16, { align: 'right' });
    doc.text(reportTitle, margin, pageHeight - 16);
  }

  doc.save(`${filenamePrefix}_${formatFilenameDate(generatedAt)}.pdf`);
}

// exportExcelReport: a genuine SheetJS workbook (NOT a renamed CSV) built
// via XLSX.utils.aoa_to_sheet + XLSX.writeFile — the standard documented
// SheetJS browser-download path (auto-detects the no-`fs` browser
// environment and triggers a client-side Blob download itself). Numeric
// columns (column.numeric:true) are written as real JS numbers, never
// strings, so SUM()/AVERAGE()/etc. work directly on the exported sheet in
// Excel. Zero-result datasets still produce a valid workbook: the header
// row is always written, with a single clearly-labelled row underneath
// standing in for the (absent) data rows.
//
// Every export (§8 of the brief) must show the active filters used, PDF and
// Excel alike — so, exactly like exportPdfReport above, a small metadata
// block (report title, export timestamp, record count, "Filters:" +
// filterLines) is written as the first few rows of the sheet, above the
// header row, then one blank separator row, then the real header + data
// rows. The metadata block's own cells are never counted as data rows and
// are written as plain single-cell text rows, so they never confuse a
// SUM()/AVERAGE() formula written against the real data range below them.
export async function exportExcelReport({ reportTitle, sheetName, filenamePrefix, recordLabel, filterLines = ['All records'], rows = [], columns, generatedAt = new Date() }) {
  const XLSX = await loadXLSX();
  const metaRows = [
    [reportTitle],
    [`Exported: ${formatExportTimestamp(generatedAt)}`],
    [`Total ${recordLabel}: ${rows.length}`],
    ['Filters:'],
    ...filterLines.map(line => [`  ${line}`]),
    [],
  ];
  const headerRow = columns.map(column => column.header);
  const dataRows = rows.length
    ? rows.map(row => columns.map(column => {
        const raw = resolveCellValue(row, column);
        if (column.numeric) {
          const num = Number(raw);
          return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
        }
        return raw === null || raw === undefined ? '' : raw;
      }))
    : [[NO_RESULTS_TEXT, ...Array(Math.max(0, columns.length - 1)).fill('')]];

  const worksheet = XLSX.utils.aoa_to_sheet([...metaRows, headerRow, ...dataRows]);
  worksheet['!cols'] = columns.map(column => ({ wch: column.width ? Math.round(column.width / 5.2) : 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${filenamePrefix}_${formatFilenameDate(generatedAt)}.xlsx`);
}
