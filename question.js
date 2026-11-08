// AID Quizz v1.2 — question.js
// Screen 5 Question (shared shell) · 6a/6b/6c Feedback sheet · S1 Loading · S2 Error · S3 Daily cap
// v1.2: Review pile, Hint, Pressure (30s), CXO line, Glossary terms, Bookmark, Explain simpler, Report

import { icon } from './icons.js';
import { go, esc, $, $$, primaryBtn, secondaryBtn, ghostBtn, iconBtn, openSheet, toast } from './ui.js';
import * as state from './state.js';
import { getQuestion, gradeAnswer, explainSimpler, slotFor, ApiError, CONFIG, PRESSURE_SECONDS } from './api.js';
import { createTemplate } from './templates.js';
import { levelMapScreen } from './levelmap.js';
import { accessScreen } from './onboarding.js';
import { bossBriefScreen } from './boss.js';

const drafts = new Map();   // "level-q" → free-text answer kept across S2 retry
const pad = n => String(n).padStart(2, '0');
let timer = null;           // pressure countdown
const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

/* ================= Shell ================= */
function topbar(level, q, review) {
  if (review) return `
  <div class="q-topbar">
    ${iconBtn('x', 'Exit to level map', { id: 'exit' })}
    <h1 class="q-topbar-title">Review · Level ${level}</h1>
    <span class="q-topbar-count">${review.left} left</span>
  </div>
  <div class="q-track"><div class="track"><div class="track-fill is-review" style="width:100%"></div></div></div>`;
  return `
  <div class="q-topbar">
    ${iconBtn('x', 'Exit to level map', { id: 'exit' })}
    <h1 class="q-topbar-title">Level ${level}</h1>
    <span class="q-topbar-count" aria-label="Question ${q} of 100">Q${pad(q)} / 100</span>
  </div>
  <div class="q-track"><div class="track" role="progressbar" aria-label="Level progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${q - 1}"><div class="track-fill" style="width:${q - 1}%"></div></div></div>`;
}

/* S1 Loading (question) */
function loadingBody(industry) {
  return `
  <div class="q-chips chip-row"><span class="chip">Loading</span></div>
  <div class="q-body" aria-busy="true">
    <div class="stack"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div></div>
    <div class="tiles">${'<div class="skeleton skeleton-tile"></div>'.repeat(4)}</div>
    <p class="t-small loading-caption" role="status">Writing your ${esc(industry)} question…</p>
  </div>`;
}

/* ================= 5 Question ================= */
/** params: { level, review?: true, left?: n } — review mode replays the wrong-answer pile without moving Q forward. */
export function questionScreen({ level, review = false, left }) {
  stopTimer();
  const L = state.level(level);
  const q = L.q;
  const rv = review ? { left: left ?? L.review.length } : null;
  const slot = slotFor(level, q);
  return {
    html: `
<div class="screen">
  ${topbar(level, q, rv)}
  <div id="q-main" class="q-main" data-key="${review ? 'r' : ''}${level}-${q}">${loadingBody(slot.industry)}</div>
  <div class="screen-footer">${primaryBtn('Check', { id: 'check', disabled: true })}<div id="hint-slot"></div></div>
</div>`,
    mount(el) {
      $('#exit', el).onclick = () => { stopTimer(); go('map', levelMapScreen); };
      if (review) {
        if (!L.review.length || rv.left <= 0) { go('map', levelMapScreen); return; }
        render(el, level, L.review[0], { review: rv });
        return;
      }
      if (q >= state.BOSS_Q) { go('boss', bossBriefScreen, { level }); return; }
      load(el, level, q, slot);
    },
    unmount: stopTimer,
  };
}

async function load(el, level, q, slot) {
  let question;
  try { question = await getQuestion(level, q); }
  catch (e) { return interrupt(e, { level, q, retry: () => go('question', questionScreen, { level }) }); }
  if (!el.querySelector(`#q-main[data-key="${level}-${q}"]`) || el.querySelector('#answer')) return;   // user left, or already rendered
  render(el, level, question, { pressure: slot.pressure });
}

function render(el, level, question, { review = null, pressure = false }) {
  const q = state.level(level).q;
  const key = `${review ? 'r' : ''}${level}-${q}`;
  const checkBtn = $('#check', el);
  const t = createTemplate(question, { draft: drafts.get(key) || '', onChange: () => { checkBtn.disabled = !t.isValid(); } });
  const d = question.data;

  $('#q-main', el).innerHTML = `
    <div class="q-chips chip-row" aria-label="Question details">
      ${pressure ? `<span class="chip is-pressure" id="timer" role="timer" aria-live="off">${icon('zap', 16)}Pressure · <span id="timer-n">${PRESSURE_SECONDS}s</span></span>` : ''}
      ${review ? `<span class="chip is-review">${icon('rotate-ccw', 16)}Review</span>` : ''}
      <span class="chip">${esc(question.template.name)}</span><span class="chip">${esc(question.stream)}</span><span class="chip">${esc(question.industry)}</span>
    </div>
    <div class="q-body" id="answer">${t.html}</div>`;
  t.mount($('#answer', el));
  checkBtn.disabled = !t.isValid();
  $('#answer', el).querySelector('.q-prompt, .blank-sentence, .term')?.setAttribute('tabindex', '-1');

  const promptText = state.promptOf(d);
  let hintUsed = false, done = false;

  // ---- Hint: single-choice tiles only, not in Pressure. Hides wrong options until 2 remain. ----
  const tiles = () => $$('#answer .tile[data-i]', el);
  const hintable = !pressure && !question.template.graded && Array.isArray(d.options) && Number.isInteger(d.correct)
    && d.options.length >= 3 && tiles().length === d.options.length;
  if (hintable) {
    $('#hint-slot', el).innerHTML = ghostBtn('Hint · remove 2 options (½ point)', { id: 'hint' });
    $('#hint', el).onclick = () => {
      hintUsed = true;
      const wrong = tiles().filter(b => Number(b.dataset.i) !== d.correct && !b.classList.contains('is-selected'));
      wrong.sort(() => Math.random() - 0.5).slice(0, d.options.length - 2).forEach(b => { b.classList.add('is-hinted'); b.disabled = true; b.setAttribute('aria-hidden', 'true'); });
      $('#hint-slot', el).innerHTML = `<p class="t-caption hint-note">${icon('lightbulb', 16)}Hint used · a correct answer now earns ½ point</p>`;
    };
  }

  // ---- Pressure: 30s countdown; time-out = wrong ----
  if (pressure) {
    let leftS = PRESSURE_SECONDS;
    timer = setInterval(() => {
      if (!el.querySelector(`#q-main[data-key="${key}"]`)) { stopTimer(); return; }
      leftS -= 1;
      const n = $('#timer-n', el); if (n) n.textContent = `${leftS}s`;
      if (leftS <= 5) $('#timer', el)?.classList.add('is-urgent');
      if (leftS <= 0) {
        stopTimer(); if (done) return; done = true;
        checkBtn.disabled = true;
        let answerText = '';
        try { answerText = t.check().correctText; } catch { /* nothing picked */ }
        t.lock();
        feedback(null, finish(false, answerText, 'timeout'));
      }
    }, 1000);
  }

  function finish(correct, answerText, kind, g) {
    stopTimer();
    $('#hint-slot', el).innerHTML = '';
    if (review) state.reviewDone(level, question, correct);
    else {
      state.recordAnswer(level, correct, promptText, hintUsed ? 0.5 : 1);
      if (!correct) state.addReview(level, question);
    }
    state.recordStat(question.stream, correct);
    state.addTerms(d.terms, level);
    const head = kind === 'graded' ? gradedHead(g) : kind === 'timeout' ? headTimeout(answerText) : correct ? headCorrect(answerText, hintUsed) : headWrong(answerText);
    const nextText = review ? (review.left > 1 ? 'Next review' : 'Finish review') : kind === 'graded' ? 'Next' : `Next · Q${pad(q + 1)}`;
    return { head, nextText, answerText };
  }

  function feedback(sheet, { head, nextText, answerText }) {
    const html = `${head}
      ${d.why && !question.template.graded ? `<p class="fb-why">${esc(d.why)}</p>` : ''}
      ${d.cxo ? `<div class="fb-cxo"><span class="t-caption">${icon('users', 16)}Say it to a CXO</span><p>${esc(d.cxo)}</p></div>` : ''}
      <div class="fb-simple" id="simple" hidden></div>
      <div class="fb-actions">
        <button class="fb-action" id="bm" aria-pressed="false">${icon('star', 16)}<span>Save</span></button>
        <button class="fb-action" id="simpler">${icon('lightbulb', 16)}<span>Explain simpler</span></button>
        <button class="fb-action" id="report">${icon('flag', 16)}<span>Report</span></button>
      </div>
      ${primaryBtn(nextText, { id: 'next', attrs: 'data-autofocus' })}`;
    if (sheet) sheet.update(html); else sheet = openSheet(html, { label: 'Feedback', dismissible: false });
    bindFeedback(sheet, { level, question, answerText, review });
  }

  checkBtn.onclick = async () => {
    if (done) return; done = true;
    checkBtn.disabled = true;
    stopTimer();

    // Auto-scored → feedback instantly (6a / 6b)
    if (!question.template.graded) {
      const res = t.check(); t.lock();
      feedback(null, finish(res.correct, res.correctText, 'auto'));
      return;
    }

    // GPT-graded → skeleton inside sheet, then 6c
    const answer = t.value();
    drafts.set(key, answer);
    t.lock();
    const sheet = openSheet(`
      <div class="stack" aria-busy="true"><div class="skeleton skeleton-line"></div><div class="skeleton skeleton-line is-short"></div></div>
      <p class="t-small loading-caption" role="status">Grading your answer…</p>`, { label: 'Feedback', dismissible: false });
    try {
      const g = await gradeAnswer(question, answer);
      drafts.delete(key);
      feedback(sheet, finish(g.score >= state.GPT_PASS, '', 'graded', g));
    } catch (e) {
      sheet.close();
      interrupt(e, { level, q, retry: () => go('question', questionScreen, review ? { level, review: true, left: review.left } : { level }) });
    }
  };
}

/* ================= 6 Feedback ================= */
function headCorrect(answer, hintUsed) {
  return `
    <p class="fb-head c-success"><span class="dot dot-sm dot-success" aria-hidden="true"></span>Correct${hintUsed ? ' · ½ point' : ''}</p>
    <p class="fb-answer">${esc(answer)}</p>`;
}
function headWrong(answer) {
  return `
    <p class="fb-head"><span class="dot dot-sm dot-error" aria-hidden="true"></span>Not quite</p>
    <p class="fb-answer">Answer: ${esc(answer)}</p>`;
}
function headTimeout(answer) {
  return `
    <p class="fb-head"><span class="dot dot-sm dot-error" aria-hidden="true"></span>Time’s up</p>
    ${answer ? `<p class="fb-answer">Answer: ${esc(answer)}</p>` : ''}`;
}
function gradedHead(g) {
  const ok = g.score >= state.GPT_PASS;
  return `
    <div class="fb-score">
      <span class="ring ring-md ${ok ? 'is-pass' : 'is-fail'}" aria-hidden="true">${g.score}</span>
      <div class="stack"><p class="t-heading">${g.score}/10 · ${ok ? 'Good' : 'Not quite'}</p>
        <p class="t-caption">Passes · 6 or more counts as correct</p></div>
    </div>
    <p class="fb-point">${icon('check', 20, 'is-check')}<span>${esc(g.strength)}</span></p>
    <p class="fb-point">${icon('x', 20, 'is-x')}<span>${esc(g.fix)}</span></p>`;
}

function bindFeedback(sheet, { level, question, answerText, review }) {
  const b = sheet.body;
  const d = question.data;
  const id = `${level}-${state.promptOf(d)}`.slice(0, 80);

  // Bookmark
  const bm = $('#bm', b);
  const paint = on => { bm.classList.toggle('is-on', on); bm.setAttribute('aria-pressed', on); bm.querySelector('span').textContent = on ? 'Saved' : 'Save'; };
  paint(state.isBookmarked(id));
  bm.onclick = () => paint(state.toggleBookmark({ id, level, stream: question.stream, prompt: state.promptOf(d), answer: answerText || '', why: d.why || '', cxo: d.cxo || '' }));

  // Explain simpler (1 AI call; not counted toward the team cap)
  const simpler = $('#simpler', b);
  simpler.onclick = async () => {
    simpler.disabled = true; simpler.querySelector('span').textContent = 'Thinking…';
    const box = $('#simple', b);
    try {
      const text = await explainSimpler(question, answerText);
      box.innerHTML = `<span class="t-caption">${icon('lightbulb', 16)}In simple words</span><p>${esc(text)}</p>`;
      box.hidden = false; simpler.remove();
    } catch {
      simpler.disabled = false; simpler.querySelector('span').textContent = 'Try again';
    }
  };

  // Report a bad question
  const rep = $('#report', b);
  rep.onclick = () => {
    state.blockQuestion(state.promptOf(d));
    if (review) state.reviewDone(level, question, true);   // drop it from the pile too
    rep.disabled = true; rep.querySelector('span').textContent = 'Reported';
    toast('Reported. You won’t get this one again.', 'info');
  };

  $('#next', b).onclick = () => {
    sheet.close();
    if (review) {
      const left = review.left - 1;
      if (left > 0 && state.level(level).review.length) go('question', questionScreen, { level, review: true, left });
      else { const still = state.level(level).review.length; toast(still ? `Review done · ${still} still to fix` : 'Review pile cleared', 'success'); go('map', levelMapScreen); }
      return;
    }
    // Q99 Next → Boss 7a
    if (state.level(level).q >= state.BOSS_Q) go('boss', bossBriefScreen, { level });
    else go('question', questionScreen, { level });
  };
}

/* ================= S2 / S3 Interruptions ================= */
function interrupt(e, ctx) {
  showInterruption(e instanceof ApiError ? e.kind : 'failed', ctx);
}

/**
 * showInterruption(kind, { retry, level?, q? })
 * kind: 'failed' | 'offline' | 'access' | 'cap'. Each returns to the interrupted screen via retry().
 */
export function showInterruption(kind, { retry, level, q } = {}) {
  go('interrupt', kind === 'cap' ? capScreen : errorScreen, { kind, retry, level, q });
}

function errorScreen({ kind, retry, q }) {
  const v = {
    failed:  { badge: 'alert-badge', ic: 'alert-circle', title: q ? `Couldn’t load Q${pad(q)}` : 'Couldn’t load', body: 'The AI didn’t respond properly. Your progress is safe.' },
    offline: { badge: 'alert-badge', ic: 'wifi-off', title: 'You’re offline', body: 'Connect and try again. Your progress is safe.' },
    access:  { badge: 'alert-badge', ic: 'alert-circle', title: 'Access stopped working', body: '' },
  }[kind] || null;
  const c = v || { badge: 'alert-badge', ic: 'alert-circle', title: q ? `Couldn’t load Q${pad(q)}` : 'Couldn’t load', body: 'The AI didn’t respond properly. Your progress is safe.' };
  const buttons = kind === 'access'
    ? primaryBtn('Check access', { id: 'check-access' })
    : `${primaryBtn('Try again', { id: 'retry' })}${secondaryBtn('Back to level map', { id: 'to-map' })}`;
  return {
    html: `
<div class="screen">
  <div class="center-state">
    <div class="${c.badge}">${icon(c.ic, 24)}</div>
    <h1 class="t-title">${c.title}</h1>
    ${c.body ? `<p class="t-body c-muted">${c.body}</p>` : ''}
  </div>
  <div class="screen-footer">${buttons}</div>
</div>`,
    mount(el) {
      $('#retry', el)?.addEventListener('click', () => retry?.());
      $('#to-map', el)?.addEventListener('click', () => go('map', levelMapScreen));
      $('#check-access', el)?.addEventListener('click', () => go('access', accessScreen, { from: 'interrupt', after: retry }));
    },
  };
}

function capScreen({ retry }) {
  const s = state.get();
  const n = s.currentLevel; const q = state.level(n).q;
  return {
    html: `
<div class="screen">
  <div class="center-state">
    <div class="alert-badge is-warn">${icon('clock', 24)}</div>
    <h1 class="t-title">${CONFIG.TEAM_DAILY_CAP} of ${CONFIG.TEAM_DAILY_CAP} done today</h1>
    <p class="t-body c-muted">Team access resets at 12:00 AM IST. Your place is saved at Level ${n}, Q${pad(q)}.</p>
  </div>
  <div class="screen-footer">
    ${primaryBtn('Back to level map', { id: 'to-map' })}
    ${secondaryBtn('Use my own key instead', { id: 'own-key' })}
  </div>
</div>`,
    mount(el) {
      $('#to-map', el).onclick = () => go('map', levelMapScreen);
      $('#own-key', el).onclick = () => go('access', accessScreen, { from: 'interrupt', mode: 'own', after: retry });
    },
  };
}
