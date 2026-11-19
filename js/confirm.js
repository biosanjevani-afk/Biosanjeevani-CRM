// js/confirm.js
// Phase 5D: reusable confirmation modal, replacing window.confirm() for
// destructive actions (delete lead, delete activity). Renders into its own
// #confirm-root — a sibling of #modal-root created by renderApp() — so it
// can stack above an already-open lead modal without touching it, and
// closing it never mutates #modal-root.
//
// Usage: const ok = await confirmAction({ title, message, warning,
// confirmLabel, onConfirm }). onConfirm is optional; when provided,
// confirmAction awaits it on the confirm click, shows a loading state on
// the buttons meanwhile, keeps the dialog open and shows the existing toast
// on failure, and only resolves true once onConfirm succeeds. Cancel,
// Escape, and a backdrop click all resolve false and never call onConfirm.
import { showToast, setButtonLoading } from './ui.js?v=20260916b';

const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);

let active = null; // { onConfirm, resolve, lastFocused, busy }
let wired = false;

function confirmRoot() {
  return document.querySelector('#confirm-root');
}

function closeConfirm(result) {
  if (!active) return;
  const { resolve, lastFocused } = active;
  active = null;
  const node = confirmRoot();
  if (node) node.innerHTML = '';
  if (lastFocused && document.body.contains(lastFocused)) lastFocused.focus();
  resolve(result);
}

async function handleConfirmClick() {
  if (!active || active.busy) return;
  if (!active.onConfirm) { closeConfirm(true); return; }
  active.busy = true;
  const cancelButton = document.querySelector('[data-confirm-cancel]');
  const okButton = document.querySelector('[data-confirm-ok]');
  if (cancelButton) cancelButton.disabled = true;
  if (okButton) setButtonLoading(okButton, true, 'Working…');
  try {
    await active.onConfirm();
    closeConfirm(true);
  } catch (error) {
    showToast(error?.message || 'Something went wrong. Please try again.', 'error');
    if (active) {
      active.busy = false;
      if (cancelButton) cancelButton.disabled = false;
      if (okButton) setButtonLoading(okButton, false);
    }
  }
}

function ensureWired() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', event => {
    if (!active || active.busy) return;
    if (event.target.classList.contains('confirm-backdrop') || event.target.closest('[data-confirm-cancel]')) { closeConfirm(false); return; }
    if (event.target.closest('[data-confirm-ok]')) handleConfirmClick();
  });
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { if (!active.busy) closeConfirm(false); return; }
    if (event.key !== 'Tab') return;
    const modal = document.querySelector('.confirm-modal');
    if (!modal) return;
    const focusable = [...modal.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) return;
    const first = focusable[0]; const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

export function confirmAction({ title, message, warning = '', confirmLabel = 'Confirm', onConfirm } = {}) {
  ensureWired();
  if (active) closeConfirm(false);
  return new Promise(resolve => {
    const lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const node = confirmRoot();
    if (!node) { resolve(false); return; }
    active = { onConfirm, resolve, lastFocused, busy: false };
    node.innerHTML = `<div class="modal-backdrop confirm-backdrop" role="presentation"><section class="modal confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message" tabindex="-1"><h2 id="confirm-title">${escapeHtml(title)}</h2><p id="confirm-message">${escapeHtml(message)}</p>${warning ? `<p class="confirm-warning">${escapeHtml(warning)}</p>` : ''}<div class="confirm-actions"><button type="button" class="btn btn-secondary" data-confirm-cancel>Cancel</button><button type="button" class="btn btn-danger" data-confirm-ok>${escapeHtml(confirmLabel)}</button></div></section></div>`;
    requestAnimationFrame(() => document.querySelector('.confirm-modal')?.focus());
  });
}
