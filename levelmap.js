// AID Quizz v1.2 — levelmap.js
// Screen 4 Level map (hub) · S4 Profile & backup sheet · S5 Restore
// v1.2: Review pile button · Level summary · Profile → Strengths, Saved, Glossary

import { icon, logoMark } from './icons.js';
import { go, esc, $, $$, primaryBtn, secondaryBtn, iconBtn, openSheet, openDialog, toast, copyText, setFieldError } from './ui.js';
import * as state from './state.js';
import { CONFIG, getLevelSummary } from './api.js';
import { questionScreen } from './question.js';
import { bossBriefScreen } from './boss.js';
import { accessScreen, setupIndustriesScreen } from './onboarding.js';

/* ================= 4 Level map ================= */
export function levelMapScreen() {
  const s = state.get();
  const zone = s.zone;
  const replay = state.isAllDone();
  const firstTime = state.isFirstTime() && zone === 'beginner';

  const capHtml = () => {
    if (s.access.mode !== 'team') return '';
    const left = state.capLeftToday() ?? CONFIG.TEAM_DAILY_CAP;
    return `<span class="row t-caption">${icon('clock', 16)}<span>${left} of ${CONFIG.TEAM_DAILY_CAP} left today</span></span>`;
  };

  const doneCard = n => {
    const L = state.level(n);
    const inner = `
      <span class="level-card-row">
        <span class="dot dot-level dot-success">${icon('check', 20)}</span>
        <span class="level-card-main"><span class="t-heading">Level ${n}</span>
          <span class="t-small">100/100 · Boss ${L.bossScore ?? '–'}/10</span></span>
        <span class="chip is-ice">Badge</span>
      </span>
      <button class="btn btn-ghost level-summary-link" data-summary="${n}">${icon('book-open', 16)}Level summary</button>`;
    return replay
      ? `<button class="level-card" data-replay="${n}" aria-label="Replay Level ${n} from Q1">${inner}</button>`
      : `<div class="level-card">${inner}</div>`;
  };

  const currentCard = n => {
    const q = state.level(n).q;
    const pct = ((q - 1) / state.QUESTIONS_PER_LEVEL) * 100;
    const label = q > 1 ? `Resume Q${q}` : `Start Level ${n}`;
    return `
    <div class="level-card is-current" id="current-card">
      <span class="level-card-row">
        <span class="dot dot-level dot-gold">${n}</span>
        <span class="level-card-main"><span class="t-heading">Level ${n}</span>
          <span class="t-small">Q${q} of 100 · Boss at Q100</span></span>
        <span class="boss-mark" aria-label="Boss at Q100">${icon('diamond', 24)}</span>
      </span>
      <div class="track" role="progressbar" aria-label="Level ${n} progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${q - 1}"><div class="track-fill" style="width:${pct}%"></div></div>
      ${primaryBtn(label, { attrs: `data-play="${n}"` })}
      ${state.level(n).review.length ? secondaryBtn(`Review ${state.level(n).review.length} wrong answer${state.level(n).review.length > 1 ? 's' : ''}`, { iconName: 'rotate-ccw', attrs: `data-review="${n}"` }) : ''}
    </div>`;
  };

  const lockedCard = n => `
    <div class="level-card is-locked" aria-disabled="true">
      <span class="level-card-row">
        <span class="dot dot-level dot-locked">${icon('lock', 20)}</span>
        <span class="level-card-main"><span class="t-heading">Level ${n}</span>
          <span class="t-small">Beat the Level ${n - 1} Boss to unlock</span></span>
      </span>
    </div>`;

  const emptyCard = () => `
    <div class="level-card is-current" id="current-card">
      <span class="chip is-gold">Start here</span>
      <span class="t-heading">Level 1 · AI foundations</span>
      <span class="t-small">99 questions, then your first Boss: build a tiny POC with Claude or GPT.</span>
      ${primaryBtn('Start Level 1', { attrs: 'data-play="1"' })}
    </div>`;

  // DOM order ascending + column-reverse = lowest level at the bottom
  const cards = firstTime ? emptyCard() : state.ZONES[zone].levels.map(n => {
    const st = state.cardState(n);
    if (st === 'done') return doneCard(n);
    if (st === 'locked') return lockedCard(n);
    return currentCard(n);   // unlocked & not done = the current level
  }).join('');

  const tabs = state.ZONE_ORDER.map(z => `<button class="tab ${z === zone ? 'is-active' : ''}" role="tab" aria-selected="${z === zone}" data-zone="${z}">${state.ZONES[z].label}</button>`).join('');

  return {
    html: `
<div class="screen">
  <header class="map-header">
    <div class="row-between">
      <span class="row">${logoMark()}<h1 class="brand">AID Quizz</h1></span>
      ${iconBtn('user', 'Profile and backup', { id: 'profile', cls: 'is-avatar' })}
    </div>
    <div class="tabs" role="tablist" aria-label="Zone">${tabs}</div>
    <div class="map-meta"><span class="t-caption">${esc(s.industries.join(' · '))}</span>${capHtml()}</div>
  </header>
  <section class="level-list" aria-label="${state.ZONES[zone].label} levels">${cards}</section>
</div>`,
    mount(el) {
      $('#profile', el).onclick = () => openProfile();
      $$('[data-zone]', el).forEach(t => t.onclick = () => {
        if (t.dataset.zone === zone) return;
        state.setZone(t.dataset.zone);          // CR: unlocks that zone's first level
        go('map', levelMapScreen);
        document.querySelector(`[data-zone="${t.dataset.zone}"]`)?.focus();
      });
      $$('[data-play]', el).forEach(b => b.onclick = () => playLevel(Number(b.dataset.play)));
      $$('[data-replay]', el).forEach(b => b.onclick = e => { if (e.target.closest('[data-summary]')) return; const n = Number(b.dataset.replay); state.startReplay(n); playLevel(n); });
      $$('[data-review]', el).forEach(b => b.onclick = () => { const n = Number(b.dataset.review); state.setCurrentLevel(n); go('question', questionScreen, { level: n, review: true }); });
      $$('[data-summary]', el).forEach(b => b.onclick = e => { e.stopPropagation(); openSummary(Number(b.dataset.summary)); });
      // Designer Q4: auto-scroll to the current card
      requestAnimationFrame(() => $('#current-card', el)?.scrollIntoView({ block: 'center' }));
    },
  };
}

export function playLevel(n) {
  state.setCurrentLevel(n);
  if (state.level(n).q >= state.BOSS_Q && !state.isDone(n)) go('boss', bossBriefScreen, { level: n });
  else go('question', questionScreen, { level: n });
}

/* ================= S4 Profile & backup sheet ================= */
export function openProfile() {
  const s = state.get();
  const code = state.backupCode();
  const sheet = openSheet(`
    <h2 class="t-heading">Your progress</h2>
    <div class="stats">
      <div class="stat"><span class="stat-num">${state.answeredTotal()}</span><span class="t-caption">answered of 1000</span></div>
      <div class="stat"><span class="stat-num">${state.badgeCount()}</span><span class="t-caption">Boss badges</span></div>
      <div class="stat"><span class="stat-num">L${s.currentLevel}</span><span class="t-caption">current level</span></div>
    </div>
    <div class="field">
      <label class="field-label" for="code">Backup code</label>
      <div class="input-wrap"><input class="input t-mono" id="code" readonly value="${esc(code)}"></div>
      <p class="field-help">Paste it on a new phone to continue where you left off.</p>
    </div>
    ${secondaryBtn('Copy', { id: 'copy', iconName: 'copy' })}
    ${secondaryBtn('Restore from a code', { id: 'restore' })}
    <div>
      <button class="list-row" id="row-str"><span class="row">${icon('bar-chart', 20)}Strengths</span><span class="c-subtle" aria-hidden="true">›</span></button>
      <button class="list-row" id="row-saved"><span class="row">${icon('star', 20)}Saved questions · ${s.bookmarks.length}</span><span class="c-subtle" aria-hidden="true">›</span></button>
      <button class="list-row" id="row-gloss"><span class="row">${icon('book-open', 20)}Glossary · ${Object.keys(s.glossary).length} terms</span><span class="c-subtle" aria-hidden="true">›</span></button>
      <button class="list-row" id="row-ind"><span>Industries</span><span class="c-subtle" aria-hidden="true">›</span></button>
      <button class="list-row" id="row-access"><span>Access</span><span class="c-subtle" aria-hidden="true">›</span></button>
    </div>`, { label: 'Profile and backup' });

  const b = sheet.body;
  $('#copy', b).onclick = async () => { if (await copyText(code)) toast('Code copied', 'success'); };
  $('#restore', b).onclick = () => { sheet.close(); openRestore({ onDone: () => go('map', levelMapScreen) }); };
  $('#row-ind', b).onclick = () => { sheet.close(); go('setup-industries', setupIndustriesScreen, { from: 'profile' }); };
  $('#row-access', b).onclick = () => { sheet.close(); go('access', accessScreen, { from: 'profile' }); };
  $('#row-str', b).onclick = () => { sheet.close(); openStrengths(); };
  $('#row-saved', b).onclick = () => { sheet.close(); openSaved(); };
  $('#row-gloss', b).onclick = () => { sheet.close(); openGlossary(); };
}

/* ================= v1.2 Strengths · Saved · Glossary · Summary ================= */
const backRow = () => `<button class="list-row sheet-back" id="back-profile">${icon('chevron-left', 20)}<span>Profile</span><span></span></button>`;
const bindBack = sheet => { $('#back-profile', sheet.body).onclick = () => { sheet.close(); openProfile(); }; };

export function openStrengths() {
  const rows = state.strengths();
  const body = rows.length ? rows.map(r => `
    <div class="str-row ${r.total >= 3 && r.pct < 60 ? 'is-weak' : ''}">
      <div class="row-between"><span class="t-body">${esc(r.stream)}</span><span class="t-caption t-mono">${r.pct}% · ${r.right}/${r.total}</span></div>
      <div class="track"><div class="track-fill" style="width:${r.pct}%"></div></div>
    </div>`).join('')
    : '<p class="t-body c-muted">Answer a few questions and your strengths by topic show up here.</p>';
  const sheet = openSheet(`${backRow()}
    <h2 class="t-heading">Strengths by topic</h2>
    <p class="t-caption">Weakest first. Red = under 60% after 3+ questions.</p>
    <div class="stack-16">${body}</div>`, { label: 'Strengths' });
  bindBack(sheet);
}

export function openSaved() {
  const list = state.get().bookmarks;
  const body = list.length ? list.map(x => `
    <details class="saved-item">
      <summary><span class="t-caption">L${x.level} · ${esc(x.stream)}</span><span class="t-body">${esc(x.prompt)}</span></summary>
      ${x.answer ? `<p class="fb-answer">Answer: ${esc(x.answer)}</p>` : ''}
      ${x.why ? `<p class="fb-why">${esc(x.why)}</p>` : ''}
      ${x.cxo ? `<p class="t-small c-muted">CXO: ${esc(x.cxo)}</p>` : ''}
      <button class="fb-action" data-unsave="${esc(x.id)}">${icon('star', 16)}<span>Remove</span></button>
    </details>`).join('')
    : '<p class="t-body c-muted">Tap ☆ Save on any answer to keep it here.</p>';
  const sheet = openSheet(`${backRow()}
    <h2 class="t-heading">Saved questions</h2>
    <div class="stack">${body}</div>`, { label: 'Saved questions' });
  bindBack(sheet);
  $$('[data-unsave]', sheet.body).forEach(btn => btn.onclick = () => {
    const item = state.get().bookmarks.find(b => b.id === btn.dataset.unsave);
    if (item) state.toggleBookmark(item);
    btn.closest('.saved-item').remove();
  });
}

export function openGlossary() {
  const all = state.glossaryList();
  const list = q => all.filter(t => !q || t.term.toLowerCase().includes(q) || t.def.toLowerCase().includes(q))
    .map(t => `<div class="gloss-row"><span class="t-body fw-700">${esc(t.term)}</span><span class="t-small c-muted">${esc(t.def)}</span></div>`).join('')
    || `<p class="t-body c-muted">${all.length ? 'No match.' : 'Terms from your questions collect here as you play.'}</p>`;
  const sheet = openSheet(`${backRow()}
    <h2 class="t-heading">Glossary · ${all.length}</h2>
    <div class="field"><div class="input-wrap"><input class="input" id="gloss-q" type="search" placeholder="Search terms" autocomplete="off"></div></div>
    <div class="stack" id="gloss-list">${list('')}</div>`, { label: 'Glossary' });
  bindBack(sheet);
  $('#gloss-q', sheet.body).oninput = e => { $('#gloss-list', sheet.body).innerHTML = list(e.target.value.trim().toLowerCase()); };
}

/** Level summary sheet (1 AI call the first time, then saved). */
export function openSummary(level) {
  const sheet = openSheet(`
    <h2 class="t-heading">Level ${level} summary</h2>
    <div class="stack" aria-busy="true"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div></div>
    <p class="t-small loading-caption" role="status">Writing your recap…</p>`, { label: `Level ${level} summary` });
  getLevelSummary(level).then(sum => {
    sheet.update(`
      <span class="t-caption">Level ${level} summary</span>
      <h2 class="t-heading">${esc(sum.title)}</h2>
      <ol class="summary-list">${sum.points.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
      <div class="fb-cxo"><span class="t-caption">${icon('users', 16)}Say it to a CXO</span><p>${esc(sum.cxo)}</p></div>
      ${secondaryBtn('Close', { id: 'close-sum' })}`);
    $('#close-sum', sheet.body).onclick = () => sheet.close();
  }).catch(() => {
    sheet.update(`<h2 class="t-heading">Couldn’t load the summary</h2><p class="t-body c-muted">Check your connection and try again.</p>${primaryBtn('Try again', { id: 'retry-sum' })}`);
    $('#retry-sum', sheet.body).onclick = () => { sheet.close(); openSummary(level); };
  });
}

/* ================= S5 Restore ================= */
export function openRestore({ onDone }) {
  const sheet = openSheet(`
    <h2 class="t-heading">Restore from a code</h2>
    <div class="field" id="code-field">
      <label class="field-label" for="paste">Backup code</label>
      <div class="input-wrap is-textarea"><textarea class="textarea t-mono" id="paste" rows="3" autocapitalize="off" spellcheck="false" data-autofocus></textarea></div>
    </div>
    ${primaryBtn('Restore', { id: 'do-restore', disabled: true })}`, { label: 'Restore from a code' });

  const b = sheet.body;
  const input = $('#paste', b), btn = $('#do-restore', b);
  input.oninput = () => { setFieldError($('#code-field', b), null); btn.disabled = !input.value.trim(); };
  btn.onclick = () => {
    const parsed = state.parseBackup(input.value);
    if (!parsed.ok) { setFieldError($('#code-field', b), 'That code doesn’t look right. Check for typos.'); input.focus(); return; }
    const mine = state.answeredTotal();
    // v1.1: after restore → phone with access: Level map + toast; no access: 2R
    const finish = () => {
      state.applyBackup(parsed);
      sheet.close();
      if (state.hasAccess()) { toast(`Restored · Level ${parsed.level}, Q${String(parsed.q).padStart(2, '0')}`, 'success'); onDone?.(); }
      else go('access', accessScreen, { from: 'restore' });
    };
    // v1.1: Replace dialog only if this phone already has ≥1 answer
    if (mine < 1) { finish(); return; }
    const dlg = openDialog(`
      <h2 class="t-heading">Replace progress on this phone?</h2>
      <p class="t-body c-muted">The code holds ${parsed.answered} answers and Level ${parsed.level}. This phone’s ${mine} answers will be replaced.</p>
      <div class="btn-row">${secondaryBtn('Cancel', { id: 'cancel' })}${primaryBtn('Replace', { id: 'replace' })}</div>`, { label: 'Replace progress' });
    $('#cancel', dlg.el).onclick = () => dlg.close();
    $('#replace', dlg.el).onclick = () => { dlg.close(); finish(); };
  };
}
