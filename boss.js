// AID Quizz v1.0 — boss.js
// Template 17 Boss: 7a Brief · 7b Submit · 7c Grading · 7d Failed · 8 Level-up · 9 Congratulations

import { icon } from './icons.js';
import { go, esc, $, primaryBtn, secondaryBtn, iconBtn, toast, copyText } from './ui.js';
import * as state from './state.js';
import { getBossBrief, gradeBoss, ApiError } from './api.js';
import { levelMapScreen, playLevel, openSummary } from './levelmap.js';
import { showInterruption } from './question.js';

const MIN_PROMPT = 200, MIN_DESC = 40;     // §7 ASSUMED

/* ---------- Boss header (ice accents) ---------- */
function bossHeader(level, { back = false, step = 1 } = {}) {
  return `
  <div class="q-topbar">
    ${back ? iconBtn('chevron-left', 'Back to brief', { id: 'nav' }) : iconBtn('x', 'Exit to level map', { id: 'nav' })}
    <h1 class="q-topbar-title boss-title">${icon('diamond', 16)}<span>Boss · Level ${level}</span></h1>
    <span class="q-topbar-count">Q100</span>
  </div>
  <div class="boss-progress">
    <div class="steps" role="progressbar" aria-valuemin="1" aria-valuemax="2" aria-valuenow="${step}" aria-label="Step ${step} of 2">
      <span class="step is-done"></span><span class="step ${step === 2 ? 'is-done' : ''}"></span>
    </div>
    <p class="t-caption">${step === 1 ? '1 Brief &amp; build of 2' : '2 Submit of 2'}</p>
  </div>`;
}

/* ================= 7a Brief ================= */
export function bossBriefScreen({ level }) {
  return {
    html: `
<div class="screen">
  ${bossHeader(level)}
  <div class="screen-body" id="brief-body" aria-busy="true">
    <div class="skeleton skeleton-tile"></div>
    <div class="stack"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div></div>
  </div>
  <div class="screen-footer">
    <p class="t-caption">Pass mark 7/10 · retry as often as you like</p>
    ${primaryBtn('I’ve built it · Submit', { id: 'submit', disabled: true })}
  </div>
</div>`,
    async mount(el) {
      $('#nav', el).onclick = () => go('map', levelMapScreen);
      let brief;
      try { brief = await getBossBrief(level); }
      catch (e) { return showInterruption(e instanceof ApiError ? e.kind : 'failed', { level, q: 100, retry: () => go('boss', bossBriefScreen, { level }) }); }
      if (!el.querySelector('#brief-body[aria-busy]')) return;   // user left this screen

      const briefText = `CLIENT BRIEF · ${brief.industry.toUpperCase()}\n${brief.heading}\n\n${brief.problem}\n\nMust have: ${brief.mustHave}`;
      const steps = ['Copy the brief', 'Write your prompt in Claude or ChatGPT', 'Iterate until the tool works', 'Come back and submit your final prompt'];
      const body = $('#brief-body', el);
      body.removeAttribute('aria-busy');
      body.innerHTML = `
        <section class="brief-card" aria-label="Client brief">
          <p class="brief-caption">CLIENT BRIEF · ${esc(brief.industry.toUpperCase())}</p>
          <h2 class="t-heading">${esc(brief.heading)}</h2>
          <p class="t-body">${esc(brief.problem)}</p>
          <p class="t-small">Must have: ${esc(brief.mustHave)}</p>
        </section>
        <h2 class="t-heading">How to build it</h2>
        <ol class="how-steps" role="list">
          ${steps.map((s, i) => `<li class="how-step"><span class="tile-key" aria-hidden="true">${i + 1}</span><span class="t-body">${s}</span></li>`).join('')}
        </ol>
        ${secondaryBtn('Copy brief', { id: 'copy', iconName: 'copy' })}
        <div class="btn-row">
          <a class="btn btn-secondary" href="https://claude.ai" target="_blank" rel="noopener">Claude ${icon('external-link', 16)}<span class="sr-only">(opens in new tab)</span></a>
          <a class="btn btn-secondary" href="https://chatgpt.com" target="_blank" rel="noopener">ChatGPT ${icon('external-link', 16)}<span class="sr-only">(opens in new tab)</span></a>
        </div>`;
      $('#copy', el).onclick = async () => { if (await copyText(briefText)) toast('Brief copied', 'success'); };
      const submit = $('#submit', el);
      submit.disabled = false;
      submit.onclick = () => go('boss-submit', bossSubmitScreen, { level });
    },
  };
}

/* ================= 7b Submit ================= */
const validUrl = v => { try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } };

export function bossSubmitScreen({ level }) {
  const d = state.level(level).bossDraft || { prompt: '', link: '', desc: '' };
  return {
    html: `
<div class="screen">
  ${bossHeader(level, { back: true, step: 2 })}
  <div class="screen-body">
    <div class="field">
      <label class="field-label" for="b-prompt">Your final prompt</label>
      <div class="input-wrap is-textarea"><textarea class="textarea t-mono textarea-boss" id="b-prompt" aria-describedby="b-count">${esc(d.prompt)}</textarea></div>
      <p class="field-help" id="b-count">${d.prompt.length} characters · minimum ${MIN_PROMPT}</p>
    </div>
    <div class="field">
      <label class="field-label" for="b-link">Link to the output</label>
      <div class="input-wrap"><input class="input" id="b-link" type="url" inputmode="url" autocomplete="off" autocapitalize="off" value="${esc(d.link)}"></div>
    </div>
    <p class="or-divider">or</p>
    <div class="field">
      <label class="field-label" for="b-desc">Describe what it does</label>
      <div class="input-wrap is-textarea"><textarea class="textarea textarea-desc" id="b-desc">${esc(d.desc)}</textarea></div>
    </div>
  </div>
  <div class="screen-footer">${primaryBtn('Submit for grading', { id: 'grade', disabled: true })}</div>
</div>`,
    mount(el) {
      $('#nav', el).onclick = () => go('boss', bossBriefScreen, { level });
      const p = $('#b-prompt', el), l = $('#b-link', el), ds = $('#b-desc', el), btn = $('#grade', el);
      const read = () => ({ prompt: p.value, link: l.value.trim(), desc: ds.value });
      const sync = () => {
        const v = read();
        $('#b-count', el).textContent = `${v.prompt.length} characters · minimum ${MIN_PROMPT}`;
        btn.disabled = !(v.prompt.trim().length >= MIN_PROMPT && (validUrl(v.link) || v.desc.trim().length >= MIN_DESC));
        state.setBossDraft(level, v);
      };
      [p, l, ds].forEach(x => x.addEventListener('input', sync));
      sync();
      btn.onclick = () => go('boss-grading', bossGradingScreen, { level, draft: read() });
    },
  };
}

/* ================= 7c Grading ================= */
export function bossGradingScreen({ level, draft }) {
  return {
    html: `
<div class="screen">
  ${bossHeader(level, { step: 2 })}
  <div class="center-state" role="status" aria-busy="true">
    <div class="ring-spinner" aria-hidden="true"></div>
    <h2 class="t-title">Grading your build…</h2>
    <p class="t-body c-muted">Checking clarity, constraints and output against the brief. About 10 seconds.</p>
  </div>
</div>`,
    async mount(el) {
      $('#nav', el).onclick = () => go('map', levelMapScreen);
      let g;
      try { g = await gradeBoss(level, { prompt: draft.prompt.trim(), link: validUrl(draft.link) ? draft.link : '', desc: draft.desc.trim() }); }
      catch (e) {
        // Error → S2 with inputs kept (draft is saved in state)
        return showInterruption(e instanceof ApiError ? e.kind : 'failed', { level, q: 100, retry: () => go('boss-submit', bossSubmitScreen, { level }) });
      }
      if (!el.querySelector('.ring-spinner')) return;   // user left this screen
      const r = state.recordBoss(level, g.score);
      if (!r.passed) go('boss-failed', bossFailedScreen, { level, g });
      else if (r.finishedAll) go('congrats', congratsScreen);
      else go('levelup', levelUpScreen, { level, score: g.score });
    },
  };
}

/* ================= 7d Failed ================= */
export function bossFailedScreen({ level, g }) {
  return {
    html: `
<div class="screen">
  ${bossHeader(level, { step: 2 })}
  <div class="screen-body">
    <div class="stack-16 center-state">
      <span class="ring ring-lg is-fail" aria-hidden="true">${g.score}</span>
      <h2 class="t-title">${g.score}/10 · Not yet</h2>
      <p class="t-body c-muted">You need 7 to unlock Level ${level + 1}</p>
    </div>
    <div class="fix-card fb-point">${icon('check', 20, 'c-success')}<span>${esc(g.strength)}</span></div>
    ${g.fixes.map(f => `<div class="fix-card fb-point">${icon('x', 20, 'c-error')}<span>${esc(f)}</span></div>`).join('')}
  </div>
  <div class="screen-footer">
    ${primaryBtn('Fix and resubmit', { id: 'fix' })}
    ${secondaryBtn('Back to level map', { id: 'to-map' })}
  </div>
</div>`,
    mount(el) {
      $('#nav', el).onclick = () => go('map', levelMapScreen);
      $('#fix', el).onclick = () => go('boss-submit', bossSubmitScreen, { level });   // prefilled from draft
      $('#to-map', el).onclick = () => go('map', levelMapScreen);
    },
  };
}

/* ================= 8 Level-up ================= */
export function levelUpScreen({ level, score }) {
  // QA #1/#2: no route past L10, and no jump into an already-cleared level (replay). Final copy pending Designer.
  const next = level + 1;
  const hasNext = level < state.LEVELS && !state.isDone(next);
  return {
    html: `
<div class="screen">
  <div class="celebrate">
    <div class="medallion" aria-hidden="true">L${level}</div>
    <h1 class="t-display">Level ${level} cleared</h1>
    <p class="t-body c-muted">Boss score ${score}/10 · 100 questions done</p>
    <div class="chip-row">
      <span class="chip is-ice">${icon('diamond', 16)}Boss badge</span>
      <span class="chip t-mono">${state.answeredTotal()} / 1000</span>
    </div>
  </div>
  <div class="screen-footer">
    ${hasNext ? primaryBtn(`Start Level ${next}`, { id: 'next' }) : ''}
    ${secondaryBtn('Read level summary', { id: 'summary', iconName: 'book-open' })}
    ${secondaryBtn('Back to level map', { id: 'to-map' })}
  </div>
</div>`,
    mount(el) {
      $('#summary', el).onclick = () => openSummary(level);   // v1.2
      const nextBtn = $('#next', el);
      if (nextBtn) nextBtn.onclick = () => playLevel(next);
      $('#to-map', el).onclick = () => go('map', levelMapScreen);
    },
  };
}

/* ================= 9 Congratulations ================= */
export function congratsScreen() {
  const done = new Date(state.get().completedAt || Date.now());
  const date = done.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });   // DD MMM YYYY
  return {
    html: `
<div class="screen">
  <div class="celebrate">
    <div class="dot dot-trophy dot-gold" aria-hidden="true">${icon('trophy', 24)}</div>
    <p class="big-1000" aria-hidden="true">1000</p>
    <h1 class="t-title">You climbed the whole ladder</h1>
    <p class="t-body c-muted">10 levels · 10 Boss POCs built · ${esc(date)}</p>
    <div class="boss-icons" aria-label="10 Boss badges">${icon('diamond', 20).repeat(10)}</div>
  </div>
  <div class="screen-footer">
    ${primaryBtn('Replay any level', { id: 'replay' })}
    ${secondaryBtn('Copy my backup code', { id: 'copy', iconName: 'copy' })}
  </div>
</div>`,
    mount(el) {
      $('#replay', el).onclick = () => go('map', levelMapScreen);
      $('#copy', el).onclick = async () => { if (await copyText(state.backupCode())) toast('Code copied', 'success'); };
    },
  };
}
