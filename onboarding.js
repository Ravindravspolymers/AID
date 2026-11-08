// AID Quizz v1.0 — onboarding.js
// Screens 1 Welcome · 2 Access mode · 3a Setup zone · 3b Setup industries

import { icon, logoMark } from './icons.js';
import { go, esc, $, $$, primaryBtn, ghostBtn, iconBtn, setLoading, setBtnLabel, setFieldError, toast } from './ui.js';
import * as state from './state.js';
import { checkAccess, ApiError } from './api.js';
import { levelMapScreen, openRestore } from './levelmap.js';
import { questionScreen, showInterruption } from './question.js';

/* ================= 1 Welcome ================= */
export function welcomeScreen() {
  return {
    html: `
<div class="screen">
  <div class="welcome-body">
    ${logoMark()}
    <h1 class="welcome-title">AID Quizz</h1>
    <p class="t-body c-muted">1000 questions. 10 levels. A real POC to clear each one.</p>
    <ul class="welcome-rows" role="list">
      <li class="welcome-row">${icon('check', 20)}<span class="t-small">From “what is RAG” to director-level calls</span></li>
      <li class="welcome-row">${icon('check', 20)}<span class="t-small">Questions set in your industries</span></li>
      <li class="welcome-row">${icon('check', 20)}<span class="t-small">Build with Claude or GPT to level up</span></li>
    </ul>
  </div>
  <div class="screen-footer">
    ${primaryBtn('Start climbing', { id: 'start' })}
    ${ghostBtn('I have a backup code', { id: 'restore' })}
  </div>
</div>`,
    mount(el) {
      // v1.1: saved progress + no access → 2R (Setup skipped)
      $('#start', el).onclick = () => go('access', accessScreen, { from: state.needsReconnect() ? 'restore' : 'welcome' });
      $('#restore', el).onclick = () => openRestore({ onDone: () => go('map', levelMapScreen) });
    },
  };
}

/* ================= 2 Access mode ================= */
// params: { from: 'welcome' | 'profile' | 'interrupt' | 'restore', mode?: 'team' | 'own' | 'deepseek', after?: fn }
// from 'restore' = v1.1 screen 2R (Access · after Restore)
// CR-04: 'deepseek' card mirrors the OpenAI card (no new design)
const KEY_MODES = {
  own:      { label: 'Your OpenAI key',   field: 'key' },
  deepseek: { label: 'Your DeepSeek key', field: 'dskey' },
};
export function accessScreen(params = {}) {
  const s = state.get();
  const restored = params.from === 'restore';
  let mode = params.mode || (params.from === 'welcome' ? 'team' : s.access.mode);   // Team preselected on first run; 2R: code's mode or null
  let showKey = false;
  const sum = restored ? state.restoreSummary() : null;
  const pad = n => String(n).padStart(2, '0');
  const goLabel = () => restored ? `Continue to Level ${sum.level}` : 'Continue';

  const fieldHtml = () => !mode ? '' : mode === 'team' ? `
    <div class="field" id="secret-field">
      <label class="field-label" for="secret">Team passcode</label>
      <div class="input-wrap"><input class="input" id="secret" type="password" autocomplete="off" value="${esc(s.access.passcode)}"></div>
      <p class="field-help" id="secret-help">Shared by Abhi on the team channel</p>
    </div>` : `
    <div class="field" id="secret-field">
      <label class="field-label" for="secret">${KEY_MODES[mode].label}</label>
      <div class="input-wrap">
        <input class="input t-mono" id="secret" type="${showKey ? 'text' : 'password'}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(s.access[KEY_MODES[mode].field])}">
        ${iconBtn(showKey ? 'eye-off' : 'eye', showKey ? 'Hide key' : 'Show key', { id: 'toggle-key', size: 20 })}
      </div>
    </div>`;

  const cardHtml = (id, ic, title, extra) => `
    <button class="tile radio-card ${mode === id ? 'is-selected' : ''}" role="radio" aria-checked="${mode === id}" data-mode="${id}">
      <span class="tile-text">
        <span class="radio-card-head">${icon(ic, 20)}<span class="t-label">${title}</span>${extra}</span>
        ${id !== 'team' ? '<span class="t-small">No daily cap. Your key stays on this phone.</span>' : ''}
      </span>
      <span class="radio-mark" aria-hidden="true">${icon('check', 18)}</span>
    </button>`;

  // v1.1 2R: success banner + hint
  const bannerHtml = () => `
    <div class="success-banner" role="status">${icon('check', 18)}
      <span class="banner-text"><span class="t-label">Progress restored</span><span class="banner-caption">Level ${sum.level} · Q${pad(sum.q)} · ${sum.answered} answers</span></span>
    </div>`;
  const hintHtml = () => restored && !mode ? '<p class="t-caption" id="hint">Pick how you connect to continue</p>' : '';

  return {
    html: `
<div class="screen">
  <div class="topbar">${iconBtn('chevron-left', restored ? 'Back to welcome' : 'Back', { id: 'back' })}</div>
  <div class="screen-body">
    ${restored ? bannerHtml() : ''}
    <h1 class="t-title">${restored ? 'Reconnect to keep going' : 'How will you connect?'}</h1>
    ${restored ? '<p class="t-small">Backup codes never store passcodes or keys.</p>' : ''}
    <div class="tiles" role="radiogroup" aria-label="Access mode" id="modes">
      ${cardHtml('team', 'users', 'Team access', '<span class="chip">60 a day</span>')}
      ${cardHtml('own', 'key', 'My own OpenAI key', '')}
      ${cardHtml('deepseek', 'key', 'My own DeepSeek key', '')}
    </div>
    <div id="field-slot">${fieldHtml()}</div>
    ${restored ? '' : `<p class="lock-caption t-caption">${icon('lock', 16)}<span>Personal learning only. Never paste client data.</span></p>`}
  </div>
  <div class="screen-footer"><div id="hint-slot">${hintHtml()}</div>${primaryBtn(goLabel(), { id: 'go', disabled: restored && !mode })}</div>
</div>`,
    mount(el) {
      const btn = $('#go', el);
      const bindField = () => {
        const t = $('#toggle-key', el);
        if (t) t.onclick = () => { showKey = !showKey; const v = $('#secret', el).value; $('#field-slot', el).innerHTML = fieldHtml(); $('#secret', el).value = v; bindField(); $('#toggle-key', el).focus(); };
        const sec = $('#secret', el);
        if (sec) sec.oninput = () => { setFieldError($('#secret-field', el), null); setBtnLabel(btn, goLabel()); };
      };
      bindField();
      // 2R: field autofocused so the keyboard comes up
      if (restored && mode) requestAnimationFrame(() => $('#secret', el)?.focus());

      $('#back', el).onclick = () => {
        if (params.from === 'welcome' || restored) go('welcome', welcomeScreen);   // 2R: progress stays saved
        else go('map', levelMapScreen);
      };

      $$('[data-mode]', el).forEach(card => card.onclick = () => {
        mode = card.dataset.mode;
        $$('[data-mode]', el).forEach(c => { const on = c.dataset.mode === mode; c.classList.toggle('is-selected', on); c.setAttribute('aria-checked', on); });
        $('#field-slot', el).innerHTML = fieldHtml(); bindField();
        setBtnLabel(btn, goLabel());
        btn.disabled = false; $('#hint-slot', el).innerHTML = '';
        if (restored) $('#secret', el)?.focus();
      });

      btn.onclick = async () => {
        const secret = $('#secret', el).value.trim();
        setLoading(btn, true);
        try {
          await checkAccess(mode, secret);
          state.setAccess(mode, secret);
          if (params.after) return params.after();
          if (restored) return go('map', levelMapScreen);   // 2R: no extra toast
          if (state.get().onboarded) go('map', levelMapScreen);
          else go('setup-zone', setupZoneScreen);
        } catch (e) {
          setLoading(btn, false);
          const kind = e instanceof ApiError ? e.kind : 'failed';
          if (kind === 'access' || (kind === 'failed' && !secret)) {
            setFieldError($('#secret-field', el), mode === 'team' ? 'Wrong passcode. Ask Abhi for the current one.' : 'That key didn’t work. Check it and try again.');
            setBtnLabel(btn, 'Try again');
            $('#secret', el).focus();
          } else {
            showInterruption(kind, { retry: () => go('access', accessScreen, { ...params, mode }) });
          }
        }
      };
    },
  };
}

/* ================= 3a Setup · zone ================= */
export function setupZoneScreen() {
  let pick = state.get().onboarded ? state.get().zone : null;
  const tile = z => {
    const Z = state.ZONES[z];
    return `<button class="tile ${pick === z ? 'is-selected' : ''}" role="radio" aria-checked="${pick === z}" data-zone="${z}">
      <span class="tile-text"><span class="row"><span class="t-label">${Z.label}</span><span class="t-caption">${Z.range}</span></span>
      <span class="t-small">${Z.desc}</span></span></button>`;
  };
  return {
    html: `
<div class="screen">
  <div class="topbar">${iconBtn('chevron-left', 'Back', { id: 'back' })}</div>
  <div class="screen-body">
    <div class="steps is-setup" role="progressbar" aria-label="Step 1 of 2" aria-valuemin="1" aria-valuemax="2" aria-valuenow="1"><span class="step is-done"></span><span class="step"></span></div>
    <h1 class="t-title">Where do you start?</h1>
    <div class="tiles" role="radiogroup" aria-label="Zone">${state.ZONE_ORDER.map(tile).join('')}</div>
    <p class="t-caption">You can switch zones anytime from the level map.</p>
  </div>
  <div class="screen-footer">${primaryBtn('Next', { id: 'next', disabled: !pick })}</div>
</div>`,
    mount(el) {
      $('#back', el).onclick = () => go('access', accessScreen, { from: 'welcome' });
      $$('[data-zone]', el).forEach(b => b.onclick = () => {
        pick = b.dataset.zone;
        $$('[data-zone]', el).forEach(x => { const on = x.dataset.zone === pick; x.classList.toggle('is-selected', on); x.setAttribute('aria-checked', on); });
        $('#next', el).disabled = false;
      });
      $('#next', el).onclick = () => { state.setZone(pick); go('setup-industries', setupIndustriesScreen); };
    },
  };
}

/* ================= 3b Setup · industries ================= */
// params: { from: 'profile' } → button "Save", returns to Level map
export function setupIndustriesScreen(params = {}) {
  const fromProfile = params.from === 'profile';
  let picked = [...state.get().industries];
  const startLevel = state.firstLevelOf(state.get().zone);

  const pillsHtml = () => state.INDUSTRIES.map(name => {
    const on = picked.includes(name);
    const dim = !on && picked.length >= state.MAX_INDUSTRIES;
    return `<button class="pill ${on ? 'is-on' : ''} ${dim ? 'is-dimmed' : ''}" aria-pressed="${on}" data-ind="${esc(name)}">${on ? icon('check', 16) : ''}${esc(name)}</button>`;
  }).join('');
  const label = () => fromProfile ? 'Save' : `Start Level ${startLevel}`;

  return {
    html: `
<div class="screen">
  <div class="topbar">${iconBtn('chevron-left', 'Back', { id: 'back' })}</div>
  <div class="screen-body">
    ${fromProfile ? '' : '<div class="steps is-setup" role="progressbar" aria-label="Step 2 of 2" aria-valuemin="1" aria-valuemax="2" aria-valuenow="2"><span class="step is-done"></span><span class="step is-done"></span></div>'}
    <h1 class="t-title">Pick up to 3 industries</h1>
    <p class="t-small">Questions and Boss briefs use these.</p>
    <div class="pills" id="pills" role="group" aria-label="Industries">${pillsHtml()}</div>
    <p class="t-caption" id="count" aria-live="polite">${picked.length} of 3 picked</p>
  </div>
  <div class="screen-footer">${primaryBtn(label(), { id: 'go', disabled: picked.length < 1 })}</div>
</div>`,
    mount(el) {
      $('#back', el).onclick = () => fromProfile ? go('map', levelMapScreen) : go('setup-zone', setupZoneScreen);
      const pills = $('#pills', el);
      pills.onclick = e => {
        const b = e.target.closest('[data-ind]'); if (!b) return;
        const name = b.dataset.ind;
        if (picked.includes(name)) picked = picked.filter(x => x !== name);
        else if (picked.length >= state.MAX_INDUSTRIES) { toast('Max 3 — remove one first', 'info'); return; }
        else picked.push(name);
        pills.innerHTML = pillsHtml();
        pills.querySelector(`[data-ind="${CSS.escape(name)}"]`)?.focus();
        $('#count', el).textContent = `${picked.length} of 3 picked`;
        $('#go', el).disabled = picked.length < 1;
      };
      $('#go', el).onclick = () => {
        state.setIndustries(picked);
        if (fromProfile) { go('map', levelMapScreen); return; }
        state.finishOnboarding();
        // Button reads "Start Level n" → open that level (see Designer Q10)
        go('question', questionScreen, { level: startLevel });
      };
    },
  };
}
