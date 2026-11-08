// AID Quizz v1.2 — state.js
// Progress on this phone (localStorage), levels/zones/unlock rules, backup code.
// Rules from handoff §3/§7: 10 levels × 100 Q; Q100 = Boss; Boss pass ≥7 unlocks next;
// zone jump unlocks that zone's first level (L1/L4/L7) [CR]; restore overwrites after confirm.

const KEY = 'aidq.v1';
const CODE_PREFIX = 'AIDQ1-';

export const QUESTIONS_PER_LEVEL = 100;
export const BOSS_Q = 100;
export const LEVELS = 10;
export const BOSS_PASS = 7;
export const GPT_PASS = 6;

export const ZONES = {
  beginner:     { id: 'beginner',     label: 'Beginner',     levels: [1, 2, 3],     range: 'L1–3',  desc: 'AI basics, use cases, first prompts' },
  intermediate: { id: 'intermediate', label: 'Intermediate', levels: [4, 5, 6],     range: 'L4–6',  desc: 'RAG, vector DBs, batch vs real-time, demos' },
  expert:       { id: 'expert',       label: 'Expert',       levels: [7, 8, 9, 10], range: 'L7–10', desc: 'Architecture calls, ROI, POC-first selling' },
};
export const ZONE_ORDER = ['beginner', 'intermediate', 'expert'];
export const INDUSTRIES = ['FMCG', 'BFSI', 'Retail', 'Pharma', 'Telecom', 'Manufacturing', 'Energy', 'Public Sector'];
export const MAX_INDUSTRIES = 3;

export function zoneOf(level) { return ZONE_ORDER.find(z => ZONES[z].levels.includes(level)); }
export function firstLevelOf(zone) { return ZONES[zone].levels[0]; }

/* ================= Store ================= */
function blankLevel() {
  return {
    q: 1,               // next question number (1..100); 100 = Boss
    correct: 0,
    bossDone: false,
    bossScore: null,
    bossBrief: null,    // same brief on retry
    bossDraft: null,    // { prompt, link, desc } kept for retry / error
    pending: null,      // generated question for current q (avoid regenerating on reload)
    recent: [],         // last prompts, sent to GPT to avoid repeats
    review: [],         // v1.2: wrong-answer questions to retry (full question objects, max 30)
    summary: null,      // v1.2: level summary after Boss pass { title, points[], cxo }
  };
}

function blank() {
  const levels = {};
  for (let n = 1; n <= LEVELS; n++) levels[n] = blankLevel();
  return {
    v: 1,
    onboarded: false,
    access: { mode: 'team', passcode: '', key: '', dskey: '' },   // mode: 'team' | 'own' (OpenAI) | 'deepseek'
    zone: 'beginner',
    industries: [],
    currentLevel: 1,
    jumpedZones: [],       // zones whose first level is unlocked via jump
    levels,
    completedAt: null,     // set after L10 Boss pass (Congratulations date)
    capLeft: null,         // team mode "n of 60 left today" (from server)
    capDate: null,         // IST date of capLeft
    // v1.2 learning extras (this phone)
    bookmarks: [],         // [{ id, level, stream, prompt, answer, why, cxo }]
    glossary: {},          // term → { def, level }
    stats: {},             // stream → [right, total]
    blocked: [],           // reported question prompts (never ask again on this phone)
  };
}

let S = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const s = JSON.parse(raw);
    return mergeBlank(s);
  } catch { return blank(); }
}
function mergeBlank(s) {
  const b = blank();
  const out = { ...b, ...s, access: { ...b.access, ...(s.access || {}) }, levels: {},
    bookmarks: Array.isArray(s.bookmarks) ? s.bookmarks : [], glossary: s.glossary || {}, stats: s.stats || {}, blocked: Array.isArray(s.blocked) ? s.blocked : [] };
  for (let n = 1; n <= LEVELS; n++) out.levels[n] = { ...blankLevel(), ...(s.levels?.[n] || {}) };
  return out;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage full/blocked: keep in memory */ } }

export function get() { return S; }
export function level(n) { return S.levels[n]; }
export function update(fn) { fn(S); save(); return S; }

/* ================= Onboarding / settings ================= */
export function setAccess(mode, secret) {
  update(s => {
    s.access.mode = mode;
    if (mode === 'team') s.access.passcode = secret;
    else if (mode === 'deepseek') s.access.dskey = secret;
    else s.access.key = secret;
  });
}
/** v1.1: does this phone have a usable secret for its access mode? */
export function hasAccess(s = S) {
  const a = s.access || {};
  if (a.mode === 'team') return !!a.passcode;
  if (a.mode === 'own') return !!a.key;
  if (a.mode === 'deepseek') return !!a.dskey;
  return false;
}
/** v1.1: saved progress but no access (after a restore) → 2R */
export function needsReconnect() { return S.onboarded && !hasAccess(); }
/** v1.1: banner numbers for 2R: { level, q, answered } */
export function restoreSummary() { return { level: S.currentLevel, q: S.levels[S.currentLevel].q, answered: answeredTotal() }; }

export function setZone(zone) {
  update(s => {
    s.zone = zone;
    if (!s.jumpedZones.includes(zone)) s.jumpedZones.push(zone);
  });
}
export function setIndustries(list) { update(s => { s.industries = list.slice(0, MAX_INDUSTRIES); }); }
export function finishOnboarding() {
  update(s => { s.onboarded = true; s.currentLevel = firstLevelOf(s.zone); });
}

/* ================= Levels ================= */
export function isUnlocked(n) {
  if (n === 1) return true;
  const z = zoneOf(n);
  if (n === firstLevelOf(z) && S.jumpedZones.includes(z)) return true;   // CR: zone jump
  return !!S.levels[n - 1]?.bossDone;
}
export function isDone(n) { return !!S.levels[n].bossDone; }
export function isAllDone() { return !!S.completedAt; }

/** Card state for Level map: 'done' | 'current' | 'locked' | 'open' */
export function cardState(n) {
  if (isDone(n)) return 'done';
  if (!isUnlocked(n)) return 'locked';
  return 'open';
}

/** The expanded (current) level within a zone: lowest unlocked & not done level. */
export function currentLevelIn(zone) {
  const lv = ZONES[zone].levels;
  if (S.currentLevel && lv.includes(S.currentLevel) && isUnlocked(S.currentLevel) && !isDone(S.currentLevel)) return S.currentLevel;
  return lv.find(n => isUnlocked(n) && !isDone(n)) ?? null;
}

/** First time = nothing answered anywhere yet. */
export function isFirstTime() {
  return Object.values(S.levels).every(l => l.q === 1 && !l.bossDone);
}

export function setCurrentLevel(n) { update(s => { s.currentLevel = n; s.zone = zoneOf(n); }); }

/* ================= Questions ================= */
export function setPending(n, question) { update(s => { s.levels[n].pending = question; }); }

/** Record an answer for level n's current q and move on. points: 1 normal, 0.5 with a hint (v1.2). */
export function recordAnswer(n, isCorrect, promptText, points = 1) {
  update(s => {
    const L = s.levels[n];
    if (isCorrect) L.correct += points;
    if (promptText) { L.recent.push(String(promptText).slice(0, 120)); L.recent = L.recent.slice(-30); }
    L.q = Math.min(BOSS_Q, L.q + 1);
    L.pending = null;
  });
}

/* ================= v1.2 Learning extras ================= */
export const REVIEW_MAX = 30;
export const promptOf = d => d?.prompt || d?.sentence || d?.term || d?.brief || d?.scenario || '';

/** Strengths: tally right/total per topic stream. */
export function recordStat(stream, isCorrect) {
  if (!stream) return;
  update(s => { const r = s.stats[stream] || [0, 0]; if (isCorrect) r[0] += 1; r[1] += 1; s.stats[stream] = r; });
}
/** [{ stream, right, total, pct }] sorted weakest first. */
export function strengths() {
  return Object.entries(S.stats).map(([stream, [right, total]]) => ({ stream, right, total, pct: total ? Math.round(right / total * 100) : 0 }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
}

/** Review pile (retry wrong answers). Review items keep their own q so they never move the level forward. */
export function addReview(n, question) {
  update(s => {
    const L = s.levels[n];
    const key = promptOf(question.data);
    L.review = L.review.filter(x => promptOf(x.data) !== key);
    L.review.push(question); L.review = L.review.slice(-REVIEW_MAX);
  });
}
export function reviewDone(n, question, isCorrect) {
  update(s => {
    const L = s.levels[n];
    const key = promptOf(question.data);
    const i = L.review.findIndex(x => promptOf(x.data) === key);
    if (i < 0) return;
    const [item] = L.review.splice(i, 1);
    if (!isCorrect) L.review.push(item);   // still wrong → back of the pile
  });
}

/** Bookmarks. */
export function isBookmarked(id) { return S.bookmarks.some(b => b.id === id); }
export function toggleBookmark(item) {
  let on = false;
  update(s => {
    if (s.bookmarks.some(b => b.id === item.id)) s.bookmarks = s.bookmarks.filter(b => b.id !== item.id);
    else { s.bookmarks.unshift(item); s.bookmarks = s.bookmarks.slice(0, 100); on = true; }
  });
  return on;
}

/** Glossary terms collected from questions. */
export function addTerms(terms, level) {
  if (!Array.isArray(terms) || !terms.length) return;
  update(s => { terms.forEach(t => { const k = String(t.term).trim(); if (k && !s.glossary[k]) s.glossary[k] = { def: String(t.def).trim(), level }; }); });
}
export function glossaryList() { return Object.entries(S.glossary).map(([term, v]) => ({ term, ...v })).sort((a, b) => a.term.localeCompare(b.term)); }

/** Report a bad question: never ask it again on this phone. */
export function blockQuestion(promptText) {
  if (!promptText) return;
  update(s => { s.blocked.push(String(promptText).slice(0, 120)); s.blocked = s.blocked.slice(-50); });
}

export function setSummary(n, summary) { update(s => { s.levels[n].summary = summary; }); }

/* ================= Boss ================= */
export function setBossBrief(n, brief) { update(s => { s.levels[n].bossBrief = brief; }); }
export function setBossDraft(n, draft) { update(s => { s.levels[n].bossDraft = draft; }); }

/** Boss result. Returns { passed, nextLevel, finishedAll } */
export function recordBoss(n, score) {
  const passed = score >= BOSS_PASS;
  let nextLevel = null, finishedAll = false;
  update(s => {
    const L = s.levels[n];
    const isReplay = !!L.bossDone;   // QA #10: replay pass keeps currentLevel on the replayed level
    if (passed) {
      L.bossDone = true;
      L.bossScore = Math.max(L.bossScore ?? 0, score);
      L.q = BOSS_Q;
      if (n < LEVELS) { nextLevel = n + 1; if (!isReplay) { s.currentLevel = nextLevel; s.zone = zoneOf(nextLevel); } }
      else if (!s.completedAt) { s.completedAt = new Date().toISOString(); finishedAll = true; }
    }
  });
  return { passed, nextLevel, finishedAll };
}

/** Replay mode (after Q1000): restart a level from Q1, keeping its badge. */
export function startReplay(n) {
  update(s => {
    const L = s.levels[n];
    L.q = 1; L.correct = 0; L.pending = null;
    s.currentLevel = n; s.zone = zoneOf(n);
  });
}

/* ================= Stats ================= */
/** Questions answered of 1000 (a cleared level counts 100). */
export function answeredTotal(state = S) {
  return Object.values(state.levels).reduce((t, L) => t + (L.bossDone ? QUESTIONS_PER_LEVEL : L.q - 1), 0);
}
export function badgeCount(state = S) { return Object.values(state.levels).filter(L => L.bossDone).length; }

/* ================= Daily cap (team mode display) ================= */
export function istDate(d = new Date()) {
  return new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);   // UTC+5:30
}
export function setCapLeft(n) { update(s => { s.capLeft = n; s.capDate = istDate(); }); }
export function capLeftToday() { return S.capDate === istDate() ? S.capLeft : null; }

/* ================= Backup code ================= */
// Holds progress only — never the passcode or API key.
function b64urlEncode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(pad);
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function checksum(str) { let h = 0; for (const c of str) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h.toString(36).padStart(7, '0').slice(-4); }

export function backupCode() {
  const payload = {
    z: S.zone, i: S.industries, c: S.currentLevel, j: S.jumpedZones, d: S.completedAt,
    m: hasAccess() ? S.access.mode : null,      // v1.1: mode only, never the passcode/key
    s: S.stats,                                  // v1.2: strengths
    b: S.bookmarks.slice(0, 30).map(x => [x.level, x.stream, String(x.prompt).slice(0, 200), String(x.answer || '').slice(0, 120), String(x.why || '').slice(0, 240)]),
    l: Object.fromEntries(Object.entries(S.levels).map(([n, L]) => [n, [L.q, L.correct, L.bossDone ? 1 : 0, L.bossScore ?? -1]])),
  };
  const body = b64urlEncode(JSON.stringify(payload));
  return CODE_PREFIX + body + '.' + checksum(body);
}

/** Parse a code. Returns { ok, state, answered, level } or { ok:false }. Does not apply. */
export function parseBackup(code) {
  try {
    const c = String(code).trim().replace(/\s+/g, '');
    if (!c.startsWith(CODE_PREFIX)) return { ok: false };
    const [body, sum] = c.slice(CODE_PREFIX.length).split('.');
    if (!body || checksum(body) !== sum) return { ok: false };
    const p = JSON.parse(b64urlDecode(body));
    const next = blank();
    next.onboarded = true;
    // v1.1: phone with access keeps it untouched; otherwise take the code's mode (no secret)
    const codeMode = ['team', 'own', 'deepseek'].includes(p.m) ? p.m : null;   // pre-v1.1 codes → null
    next.access = hasAccess() ? { ...S.access } : { ...S.access, mode: codeMode };
    next.zone = ZONES[p.z] ? p.z : 'beginner';
    next.industries = Array.isArray(p.i) ? p.i.filter(x => INDUSTRIES.includes(x)).slice(0, MAX_INDUSTRIES) : [];
    next.currentLevel = Number(p.c) >= 1 && Number(p.c) <= LEVELS ? Number(p.c) : 1;
    next.jumpedZones = Array.isArray(p.j) ? p.j.filter(z => ZONES[z]) : [];
    next.completedAt = p.d || null;
    if (p.s && typeof p.s === 'object') next.stats = Object.fromEntries(Object.entries(p.s).filter(([, v]) => Array.isArray(v) && v.length === 2).map(([k, v]) => [k, [Number(v[0]) || 0, Number(v[1]) || 0]]));
    if (Array.isArray(p.b)) next.bookmarks = p.b.filter(Array.isArray).map((r, i) => ({ id: `r${i}-${r[2]}`.slice(0, 80), level: Number(r[0]) || 1, stream: String(r[1] || ''), prompt: String(r[2] || ''), answer: String(r[3] || ''), why: String(r[4] || ''), cxo: '' }));
    next.glossary = { ...S.glossary }; next.blocked = [...S.blocked];   // phone-only extras stay as they are
    for (let n = 1; n <= LEVELS; n++) {
      const r = p.l?.[n]; if (!r) continue;
      const L = next.levels[n];
      L.q = Math.min(BOSS_Q, Math.max(1, Number(r[0]) || 1));
      L.correct = Math.max(0, Number(r[1]) || 0);
      L.bossDone = r[2] === 1;
      L.bossScore = r[3] >= 0 ? r[3] : null;
    }
    if (!next.industries.length) return { ok: false };
    return { ok: true, state: next, mode: codeMode, answered: answeredTotal(next), level: next.currentLevel, q: next.levels[next.currentLevel].q };
  } catch { return { ok: false }; }
}

export function applyBackup(parsed) { S = mergeBlank(parsed.state); save(); }

/** For tests / "start over" (not exposed in UI). */
export function _reset() { S = blank(); save(); }
