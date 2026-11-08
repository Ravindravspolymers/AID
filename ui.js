// AID Quizz v1.0 — ui.js
// Rendering, router, bottom sheet, dialog, toast, button loading. No visual values here: classes only.

import { icon } from './icons.js';

const app = () => document.getElementById('app');
const overlayRoot = () => document.getElementById('overlay-root');
const toastRegion = () => document.getElementById('toast-region');

/** Escape user/AI text before putting it into HTML. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Read a duration token (e.g. '--dur-sheet-open') in ms. */
function tokenMs(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (v.endsWith('ms')) return parseFloat(v);
  if (v.endsWith('s')) return parseFloat(v) * 1000;
  return 0;
}

/* ================= Router ================= */
// A screen is a function (params) => { html, mount?(el), unmount?() }.
let current = null;          // { name, fn, params, view }
const history = [];          // stack of { name, fn, params } for "return to interrupted screen"

export function go(name, fn, params = {}, { push = false, replace = true } = {}) {
  if (push && current) history.push({ name: current.name, fn: current.fn, params: current.params });
  if (current?.view?.unmount) current.view.unmount();
  closeAllOverlays();
  const view = fn(params) || {};
  const root = app();
  root.innerHTML = view.html || '';
  root.scrollTop = 0; window.scrollTo(0, 0);
  current = { name, fn, params, view };
  if (view.mount) view.mount(root);
  // Focus the first heading for screen readers + keyboard users
  const h = root.querySelector('h1, h2, [data-autofocus]');
  if (h) { if (!h.hasAttribute('tabindex')) h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  return view;
}

/** Return to the screen that was interrupted (S2/S3 → back). */
export function back() {
  const prev = history.pop();
  if (prev) go(prev.name, prev.fn, prev.params);
}
export function clearHistory() { history.length = 0; }
export function currentScreen() { return current?.name; }

/* ================= Focus trap ================= */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trap(container, onEsc) {
  const prevFocus = document.activeElement;
  const handler = e => {
    if (e.key === 'Escape' && onEsc) { e.preventDefault(); onEsc(); return; }
    if (e.key !== 'Tab') return;
    const f = [...container.querySelectorAll(FOCUSABLE)];
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  container.addEventListener('keydown', handler);
  return () => { container.removeEventListener('keydown', handler); prevFocus?.focus?.({ preventScroll: true }); };
}

/* ================= Bottom sheet ================= */
const open = new Set();

/**
 * openSheet(html, { label, dismissible=true, onClose })
 * → { el, body, update(html), close() }
 * Feedback sheets pass dismissible:false (no scrim tap / Esc).
 */
export function openSheet(html, { label = '', dismissible = true, onClose } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const sheet = document.createElement('section');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  if (label) sheet.setAttribute('aria-label', label);
  sheet.innerHTML = `<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-body">${html}</div>`;
  overlayRoot().append(scrim, sheet);

  let release = null, closed = false;
  const api = {
    el: sheet,
    get body() { return sheet.querySelector('.sheet-body'); },
    update(newHtml) { api.body.innerHTML = newHtml; focusFirst(sheet); },
    close() {
      if (closed) return; closed = true;
      open.delete(api);
      release?.();
      scrim.classList.remove('is-open'); sheet.classList.remove('is-open');
      setTimeout(() => { scrim.remove(); sheet.remove(); }, tokenMs('--dur-sheet-close'));
      onClose?.();
    },
  };
  if (dismissible) scrim.addEventListener('click', () => api.close());
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrim.classList.add('is-open'); sheet.classList.add('is-open');
    release = trap(sheet, dismissible ? () => api.close() : null);
    focusFirst(sheet);
  }));
  open.add(api);
  return api;
}

function focusFirst(container) {
  const t = container.querySelector('[data-autofocus]') || container.querySelector(FOCUSABLE);
  t?.focus({ preventScroll: true });
}

/* ================= Dialog ================= */
/**
 * openDialog(html, { label, onClose }) → { el, close() }
 * Scrim tap / Esc = cancel.
 */
export function openDialog(html, { label = '', onClose } = {}) {
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const wrap = document.createElement('div');
  wrap.className = 'dialog-wrap';
  wrap.innerHTML = `<div class="dialog" role="alertdialog" aria-modal="true" ${label ? `aria-label="${esc(label)}"` : ''}>${html}</div>`;
  overlayRoot().append(scrim, wrap);
  let release = null, closed = false;
  const api = {
    el: wrap.querySelector('.dialog'),
    close() {
      if (closed) return; closed = true;
      open.delete(api);
      release?.();
      scrim.classList.remove('is-open'); wrap.classList.remove('is-open');
      setTimeout(() => { scrim.remove(); wrap.remove(); }, tokenMs('--dur-dialog'));
      onClose?.();
    },
  };
  wrap.addEventListener('click', e => { if (e.target === wrap) api.close(); });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    scrim.classList.add('is-open'); wrap.classList.add('is-open');
    release = trap(wrap, () => api.close());
    focusFirst(wrap);
  }));
  open.add(api);
  return api;
}

export function closeAllOverlays() { [...open].forEach(o => o.close()); }

/* ================= Toast ================= */
/** toast('Code copied', 'success' | 'info'). Auto-hides after --dur-toast-hide. */
export function toast(text, kind = 'success') {
  const t = document.createElement('div');
  t.className = `toast is-${kind}`;
  t.innerHTML = `${icon(kind === 'success' ? 'check' : 'alert-circle', 20)}<span>${esc(text)}</span>`;
  const region = toastRegion();
  region.innerHTML = '';
  region.append(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('is-open')));
  setTimeout(() => {
    t.classList.remove('is-open');
    setTimeout(() => t.remove(), tokenMs('--dur-toast'));
  }, tokenMs('--dur-toast-hide'));
}

/* ================= Buttons ================= */
/** Primary button markup. Label sits in .btn-text so loading can hide it. */
export function primaryBtn(label, { id = '', disabled = false, attrs = '' } = {}) {
  return `<button class="btn btn-primary" ${id ? `id="${id}"` : ''} ${disabled ? 'disabled' : ''} ${attrs}><span class="btn-text">${esc(label)}</span></button>`;
}
export function secondaryBtn(label, { id = '', attrs = '', iconName = '' } = {}) {
  return `<button class="btn btn-secondary" ${id ? `id="${id}"` : ''} ${attrs}>${iconName ? icon(iconName, 20) : ''}<span class="btn-text">${esc(label)}</span></button>`;
}
export function ghostBtn(label, { id = '', attrs = '' } = {}) {
  return `<button class="btn btn-ghost" ${id ? `id="${id}"` : ''} ${attrs}>${esc(label)}</button>`;
}
export function iconBtn(name, ariaLabel, { id = '', cls = '', size = 24 } = {}) {
  return `<button class="icon-btn ${cls}" ${id ? `id="${id}"` : ''} aria-label="${esc(ariaLabel)}">${icon(name, size)}</button>`;
}

/** setLoading(btn, true) → spinner replaces label; aria-busy set. */
export function setLoading(btn, on) {
  if (!btn) return;
  btn.classList.toggle('is-loading', on);
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
  let sp = btn.querySelector('.spinner');
  if (on && !sp) { sp = document.createElement('span'); sp.className = 'spinner'; sp.setAttribute('aria-hidden', 'true'); btn.append(sp); }
  if (!on && sp) sp.remove();
}

/** setBtnLabel(btn, 'Try again') */
export function setBtnLabel(btn, label) {
  const t = btn?.querySelector('.btn-text');
  if (t) t.textContent = label;
}

/* ================= Small helpers ================= */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Copy text; returns true on success. */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.className = 'sr-only';
    document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  }
}

/** Field error toggle for .field wrappers: setFieldError(fieldEl, 'msg' | null) */
export function setFieldError(field, msg) {
  if (!field) return;
  field.classList.toggle('is-error', !!msg);
  const input = field.querySelector('input, textarea');
  let err = field.querySelector('.field-error');
  let ico = field.querySelector('.field-error-icon');
  if (msg) {
    if (!err) { err = document.createElement('p'); err.className = 'field-error'; err.id = `${input?.id || 'f'}-err`; field.append(err); }
    err.textContent = msg; err.hidden = false;
    if (!ico) { const w = field.querySelector('.input-wrap'); w?.insertAdjacentHTML('beforeend', `<span class="field-error-icon">${icon('alert-circle', 20)}</span>`); }
    input?.setAttribute('aria-invalid', 'true'); input?.setAttribute('aria-describedby', err.id);
  } else {
    if (err) err.hidden = true;
    ico?.remove();
    input?.removeAttribute('aria-invalid');
  }
}
