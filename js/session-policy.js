// js/session-policy.js
//
// ============================================================================
// CLIENT-SIDE SESSION POLICY (CRM) — Phase 15, Free-plan session hardening.
// ============================================================================
// READ THIS FIRST:
//
// This module is a CLIENT-SIDE, APPLICATION-LEVEL policy layer only. It is
// NOT equivalent to Supabase's server-side "time-box user sessions" or
// "inactivity timeout" features (both Supabase Pro-plan-only; this project
// is on the Free plan and cannot use either). Concretely:
//
//   - It does NOT change, wrap, or intercept Supabase's own auth/session
//     handling in any way. js/supabase.js's createClient() options
//     (persistSession: true, autoRefreshToken: true, detectSessionInUrl:
//     true) and the Supabase project's 1-hour access-token expiry are
//     completely untouched by this file, and this file has no mechanism to
//     shorten, lengthen, or otherwise interfere with a live, server-issued
//     access or refresh token.
//   - Enforcement works by watching two plain, non-secret timestamps kept in
//     THIS FILE'S OWN localStorage key (STORAGE_KEY below) — never
//     Supabase's own session storage — and, when either limit is crossed,
//     calling the exact same supabase.auth.signOut() that the manual
//     "Sign out" button already calls (see handleLogout in js/app.js).
//     That's the entire mechanism: no custom token handling, no secrets.
//   - BECAUSE it is ordinary JavaScript running in the user's own browser,
//     this is a UX/compliance control, not a hard security boundary. A user
//     with dev-tools access to their own browser could edit these
//     timestamps and defeat both limits. A refresh token used directly
//     against Supabase's API, outside this app's own pages, is completely
//     unaffected by anything in this file. True server-side enforcement
//     would require either Supabase Pro's session controls, or a separate
//     RLS/session-table mechanism — neither is implemented here.
//
// POLICY (see design discussion for the full rationale):
//   - Maximum session age: 7 days from the last genuine sign-in, regardless
//     of page refreshes, tab/browser closes and reopens, or Supabase's own
//     background token refreshes.
//   - Inactivity timeout: 24 hours since the last genuine user interaction
//     (click / keydown / pointerdown) — NOT merely having a tab open.
//
// HOW "genuine new sign-in" IS DETECTED (important, and deliberately NOT
// based on the raw Supabase event name): testing showed that Supabase's JS
// SDK can report a 'SIGNED_IN' event even when merely rehydrating an
// already-persisted session on an ordinary page reload — not just on an
// actual fresh credential-based login. Trusting the event name alone would
// have reset the 7-day clock on every page refresh, which is exactly what
// this feature must not do. Instead, the anchor is keyed off THIS MODULE'S
// OWN STORAGE STATE: startSessionPolicy() only ever writes a fresh
// sessionStartedAt when its own localStorage key is completely empty
// (ensureStateExists() below) — and the only thing that empties it is
// stopSessionPolicy() running on a real SIGNED_OUT. So a brand-new anchor
// is only ever established right after a genuine sign-out (or on this
// feature's very first run for an already-logged-in user — see
// ensureStateExists()'s comment) — never merely because some auth event
// fired again for a session that was already running.
//
// TO REMOVE THIS FEATURE ENTIRELY:
//   1. Delete this file.
//   2. In js/app.js, remove the `session-policy.js` import and the
//      startSessionPolicy()/stopSessionPolicy() call sites (search the file
//      for "session-policy" — there are three call sites: init(),
//      handleAuthStateChange(), and showLogin()).
//   3. In index.html, no change is needed (it only references js/app.js).
//   Nothing else in the app depends on this module or its localStorage key;
//   removing it has zero effect on login, logout, MFA (N/A for CRM), or any
//   business logic.
// ============================================================================

import { supabase } from './supabase.js?v=20260902a';

const STORAGE_KEY = 'biosanjeevani-session-policy';
const SIGNOUT_LOCK_KEY = 'biosanjeevani-session-policy-signout-lock';

const MAX_SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — absolute session age cap
const INACTIVITY_MS = 24 * 60 * 60 * 1000; // 24 hours — inactivity cap
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000; // coalesce activity writes to at most once/minute
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // coarse backstop only — see visibilitychange/focus below for the real sleep/wake handling
const SIGNOUT_LOCK_MS = 5 * 1000; // how long one tab's in-flight signOut() suppresses other tabs' redundant calls

let started = false; // guards against re-registering listeners/interval on repeated startSessionPolicy() calls (e.g. every TOKEN_REFRESHED)
let intervalId = null;
let lastActivityWriteAt = 0; // in-memory per-tab throttle guard (localStorage read is cheap, but no need to write every keystroke)
const handlers = {};

function readState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.sessionStartedAt !== 'number' || typeof parsed?.lastActivityAt !== 'number') return null;
    return parsed;
  } catch {
    return null; // corrupt/unavailable localStorage — fail open to "no state yet" rather than throw
  }
}

function writeState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* localStorage unavailable (private mode, quota exceeded) — the policy simply can't persist; not fatal to the app */
  }
}

function clearState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// Sets a brand-new anchor. Only ever reached via ensureStateExists() below
// (i.e. only when no state currently exists at all), or as a fail-safe
// inside recordActivity(). This is the only function that sets
// sessionStartedAt, which is what keeps the 7-day clock immune to page
// refresh, tab/browser restart, and TOKEN_REFRESHED/SIGNED_IN
// re-notifications for a session that was already running.
function anchorNewSession() {
  const now = Date.now();
  writeState({ sessionStartedAt: now, lastActivityAt: now });
}

// Called on every startSessionPolicy() invocation. Seeds a fresh anchor
// ONLY if no state exists at all — which happens in exactly two cases: (1)
// the very first sign-in after a real sign-out (stopSessionPolicy() clears
// state on every SIGNED_OUT, so the next session starts from nothing), or
// (2) the one-time case of a user already mid-session the moment this
// feature first ships. Never overwrites an existing anchor — so a page
// reload, a re-notified TOKEN_REFRESHED, or even a same-session 'SIGNED_IN'
// re-emission (see the file header comment) all leave a running session's
// sessionStartedAt and lastActivityAt completely untouched.
function ensureStateExists() {
  if (!readState()) anchorNewSession();
}

function recordActivity() {
  const now = Date.now();
  if (now - lastActivityWriteAt < ACTIVITY_WRITE_THROTTLE_MS) return;
  lastActivityWriteAt = now;
  const state = readState();
  if (!state) { anchorNewSession(); return; } // shouldn't normally happen while signed in; fail safe rather than throw
  writeState({ ...state, lastActivityAt: now });
}

function isSignoutLocked() {
  try {
    const raw = localStorage.getItem(SIGNOUT_LOCK_KEY);
    if (!raw) return false;
    return Date.now() - Number(raw) < SIGNOUT_LOCK_MS;
  } catch {
    return false;
  }
}

function setSignoutLock() {
  try { localStorage.setItem(SIGNOUT_LOCK_KEY, String(Date.now())); } catch { /* ignore */ }
}

// The actual policy check. Pure localStorage reads — zero Supabase requests
// — unless a limit has actually been crossed, in which case it makes
// exactly the one signOut() call needed to end the session.
async function enforce() {
  const state = readState();
  if (!state) return; // nothing to enforce yet (signed out, or not yet anchored)
  const now = Date.now();
  const sessionAge = now - state.sessionStartedAt;
  const idleFor = now - state.lastActivityAt;
  if (sessionAge < MAX_SESSION_MS && idleFor < INACTIVITY_MS) return; // within policy

  if (isSignoutLocked()) return; // another tab is already handling this expiry
  setSignoutLock();
  clearState();
  try {
    // Reuses the app's existing sign-out mechanism exactly — this module
    // never clears Supabase's own session directly, only ever asks
    // Supabase to do it. handleAuthStateChange's existing SIGNED_OUT
    // handling (js/app.js) takes it from here.
    await supabase.auth.signOut();
  } catch {
    /* If this particular signOut() call fails (e.g. offline), the next
       check (interval / visibility / activity) will simply try again —
       clearState() above already means the local policy no longer
       considers this session valid either way. */
  }
}

function scheduleCheck() {
  enforce();
}

/**
 * Start (or re-notify) the session policy. Safe to call from every relevant
 * auth event (SIGNED_IN, TOKEN_REFRESHED, INITIAL_SESSION, page load) with
 * no arguments — see the file header comment for why a fresh anchor is
 * decided by this module's own stored state rather than by the event name.
 */
export function startSessionPolicy() {
  ensureStateExists();

  if (started) {
    // Already wired up for this page's lifetime (this call is just a
    // re-notification, e.g. from TOKEN_REFRESHED) — the anchor/ensure logic
    // above is all that needed to happen again. Re-adding listeners/timers
    // here would leak duplicates on every token refresh.
    scheduleCheck();
    return;
  }
  started = true;

  // Genuine interaction only (requirement: not merely an open tab).
  // Deliberately no 'scroll' listener, to keep the signal clean — click,
  // keydown, and pointerdown already cover mouse, keyboard, and touch.
  handlers.activity = () => recordActivity();
  ['click', 'keydown', 'pointerdown'].forEach(type =>
    window.addEventListener(type, handlers.activity, { passive: true })
  );

  // Browser sleep/wake and tab-reopen handling: setInterval alone is not
  // trustworthy across sleep (browsers throttle/pause timers in
  // backgrounded or suspended tabs), so the real trigger is running an
  // immediate check the instant the tab becomes visible/focused again.
  handlers.visibility = () => { if (document.visibilityState === 'visible') scheduleCheck(); };
  handlers.focus = () => scheduleCheck();
  document.addEventListener('visibilitychange', handlers.visibility);
  window.addEventListener('focus', handlers.focus);

  // Coarse backstop for a tab that stays open, visible, and idle for a long
  // time without any other trigger firing.
  intervalId = window.setInterval(scheduleCheck, CHECK_INTERVAL_MS);

  // Check immediately too — catches a session that already expired while
  // the browser/tab was closed, without waiting for the interval.
  scheduleCheck();
}

export function stopSessionPolicy() {
  started = false;
  if (intervalId !== null) { window.clearInterval(intervalId); intervalId = null; }
  if (handlers.activity) {
    ['click', 'keydown', 'pointerdown'].forEach(type => window.removeEventListener(type, handlers.activity));
  }
  if (handlers.visibility) document.removeEventListener('visibilitychange', handlers.visibility);
  if (handlers.focus) window.removeEventListener('focus', handlers.focus);
  clearState();
}
