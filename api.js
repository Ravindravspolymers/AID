// AID Quizz v1.2 — api.js
// All AI calls. Two access modes:
//   own      → browser calls OpenAI directly with the user's key (key stays on the phone)
//   deepseek → browser calls DeepSeek directly with the user's key (CR-04; OpenAI-compatible API)
//   team → Cloudflare Worker proxy (Back-end owns). Until TEAM_ENDPOINT is set, a STUB
//          serves sample questions so every screen can be tested without a key.
// Errors (handoff §3 S2/S3): 1 silent retry, then throw ApiError.kind =
//   'offline' | 'access' (invalid key/passcode) | 'cap' (60/day) | 'failed'

import * as state from './state.js';

/* ================= Config ================= */
export const CONFIG = {
  TEAM_ENDPOINT: '',            // ← Back-end fills, e.g. 'https://aidq.<you>.workers.dev'
  TEAM_DAILY_CAP: 60,
  TIMEOUT_MS: 30000,
  BOSS_TIMEOUT_MS: 45000,
};
// Own-key providers. Both speak the OpenAI chat format.
export const PROVIDERS = {
  own:      { chat: 'https://api.openai.com/v1/chat/completions', models: 'https://api.openai.com/v1/models', model: 'gpt-4o-mini',   keyField: 'key' },
  deepseek: { chat: 'https://api.deepseek.com/chat/completions',  models: 'https://api.deepseek.com/models',  model: 'deepseek-chat', keyField: 'dskey' },
};
const isStub = () => state.get().access.mode === 'team' && !CONFIG.TEAM_ENDPOINT;

export class ApiError extends Error {
  constructor(kind, msg = '') { super(msg || kind); this.kind = kind; }
}

/* ================= Templates (handoff TEMPLATES 1–16) ================= */
export const TEMPLATES = {
  1:  { id: 1,  name: 'Yes/No',               graded: false },
  2:  { id: 2,  name: 'MCQ',                  graded: false },
  3:  { id: 3,  name: 'Multi-select',         graded: false },
  4:  { id: 4,  name: 'Fill the blank',       graded: false },
  5:  { id: 5,  name: 'Match',                graded: false },
  6:  { id: 6,  name: 'Drag to order',        graded: false },
  7:  { id: 7,  name: 'Complete architecture', graded: false },
  8:  { id: 8,  name: 'Spot wrong component', graded: false },
  9:  { id: 9,  name: 'Table insight',        graded: false },
  10: { id: 10, name: 'Use-case picker',      graded: false },
  11: { id: 11, name: 'ROI calc',             graded: false },
  12: { id: 12, name: 'Buzzword decoder',     graded: false },
  13: { id: 13, name: 'Explain to CXO',       graded: true },
  14: { id: 14, name: 'Tool picker',          graded: false },
  15: { id: 15, name: 'Odd one out',          graded: false },
  16: { id: 16, name: 'Write the Prompt',     graded: true },
};

// ── PLACEHOLDER (BA/PM or Data/AI to replace): which templates and streams each zone uses ──
const ZONE_MIX = {
  beginner:     [2, 1, 12, 10, 4, 14, 3, 15, 5, 16],
  intermediate: [2, 7, 3, 9, 6, 12, 10, 8, 5, 14, 16, 4],
  expert:       [10, 11, 7, 13, 9, 8, 2, 6, 16, 11, 14, 13],
};
// v1.2 BA syllabus (approved 2026-11-08): 30 topics. Short name = chip; focus = what GPT must cover.
const SYLLABUS = {
  beginner: {
    'Types of AI':        'ML vs deep learning vs generative AI vs agents; predictive vs generative; narrow vs general',
    'How LLMs work':      'training, next-token prediction, parameters, why answers vary, temperature',
    'Tokens & context':   'what a token is, words-to-tokens rule of thumb, context window, why long chats forget',
    'AI tools':           'ChatGPT, Claude, Gemini, Copilot, Perplexity, open models; which tool for which job',
    'Prompting basics':   'role, task, context, format, examples; iterating on a prompt',
    'Use cases':          'AI by function: sales, supply chain, finance, HR, customer service',
    'Limits':             'hallucinations, outdated knowledge, bias, when not to use AI',
    'Data basics':        'structured vs unstructured, data quality, labels, why data beats models',
    'AI vocabulary':      'model, inference, embedding, API, multimodal, copilot vs agent',
    'Responsible AI':     'bias, transparency, human in the loop, explainability',
  },
  intermediate: {
    'Token economics':    'input vs output token pricing, cost per call and per month, caching, cheaper models for simple tasks',
    'Model choice':       'big vs small models, open vs closed, speed vs quality vs cost trade-offs',
    'RAG':                'retrieval-augmented generation, chunking, grounding answers in client documents',
    'Vector DBs':         'embeddings, similarity search, when a vector DB is needed',
    'Fine-tune vs prompt':'prompting vs RAG vs fine-tuning: when each wins, cost and effort',
    'Agents & tools':     'tool use, function calling, multi-step agents, MCP, guardrails',
    'Batch vs real-time': 'batch scoring vs live inference, latency, cost and use-case fit',
    'Evals':              'accuracy, test sets, human review, measuring hallucination, A/B tests',
    'Data privacy':       'PII, DPDP Act India, data residency, what never to send to an AI API',
    'Demos & POCs':       'scoping a 2-week POC, success criteria, demo storytelling',
    'Low-code AI':        'Copilot Studio, Power Platform, n8n, Zapier AI; build fast without engineers',
  },
  expert: {
    'Architecture':       'reference architectures, cloud choices (Azure/AWS/GCP), integration, security',
    'ROI':                'AI business case, baseline vs uplift, payback, hard vs soft benefits',
    'Build vs buy':       'SaaS AI vs custom build vs platform; total cost of ownership',
    'Sustainability':     'AI energy and water use, carbon per query, smaller/efficient models, green AI claims',
    'Governance':         'EU AI Act risk tiers, India AI guidelines, model risk, audit trails',
    'Scaling':            'pilot to production, MLOps/LLMOps, monitoring, drift, cost at scale',
    'Adoption':           'change management, training users, measuring usage, CXO sponsorship',
    'Pricing AI deals':   'fixed vs T&M vs outcome-based pricing, run-cost ownership, token cost pass-through',
    'POC-first selling':  'leading with a working POC, objection handling, turning a POC into a programme',
  },
};
const STREAMS = Object.fromEntries(Object.entries(SYLLABUS).map(([z, t]) => [z, Object.keys(t)]));
const focusOf = stream => { for (const z in SYLLABUS) if (SYLLABUS[z][stream]) return SYLLABUS[z][stream]; return ''; };

export const PRESSURE_EVERY = 10;
export const PRESSURE_SECONDS = 30;

/** Which template / stream / industry a slot uses. Deterministic per level+q. */
export function slotFor(level, q) {
  const zone = state.zoneOf(level);
  const mix = ZONE_MIX[zone];
  const inds = state.get().industries.length ? state.get().industries : ['FMCG'];
  const i = (q - 1) + level * 7;
  const template = TEMPLATES[mix[i % mix.length]];
  return {
    template,
    stream: STREAMS[zone][(q - 1) % STREAMS[zone].length],
    industry: inds[(q - 1) % inds.length],
    pressure: q % PRESSURE_EVERY === 0 && !template.graded,   // v1.2: every 10th auto-scored question is timed
  };
}

/* ================= Transport ================= */
async function fetchWithTimeout(url, opts, ms) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}

/** Send chat messages; returns parsed JSON object from the model. */
async function chatJSON(messages, { timeout = CONFIG.TIMEOUT_MS, counts = false } = {}) {
  if (!navigator.onLine) throw new ApiError('offline');
  const s = state.get();
  let res;
  try {
    const P = PROVIDERS[s.access.mode];
    if (P) {
      res = await fetchWithTimeout(P.chat, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.access[P.keyField]}` },
        body: JSON.stringify({ model: P.model, messages, temperature: 0.7, response_format: { type: 'json_object' } }),
      }, timeout);
    } else {
      // Worker contract (Back-end to confirm): POST /chat { messages, counts } + X-Team-Passcode
      // → 200 { content: "<json string>", left: n } | 401 bad passcode | 429 cap reached
      res = await fetchWithTimeout(`${CONFIG.TEAM_ENDPOINT}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Team-Passcode': s.access.passcode },
        body: JSON.stringify({ messages, counts }),
      }, timeout);
    }
  } catch {
    throw new ApiError(navigator.onLine ? 'failed' : 'offline');
  }
  if (res.status === 401 || res.status === 403) throw new ApiError('access');
  if (res.status === 429) {
    // Own-key 429 = provider rate limit → treat as failed; Worker 429 = daily cap
    if (s.access.mode === 'team') { state.setCapLeft(0); throw new ApiError('cap'); }
    throw new ApiError('failed');
  }
  if (!res.ok) throw new ApiError('failed');
  let data;
  try { data = await res.json(); } catch { throw new ApiError('failed'); }
  const content = PROVIDERS[s.access.mode] ? data?.choices?.[0]?.message?.content : data?.content;
  if (s.access.mode === 'team' && typeof data?.left === 'number') state.setCapLeft(data.left);
  try { return JSON.parse(content); } catch { throw new ApiError('failed'); }
}

/** 1 silent retry for 'failed' (bad JSON, bad shape, network/5xx). */
async function withRetry(fn) {
  try { return await fn(); }
  catch (e) {
    if (e instanceof ApiError && e.kind !== 'failed') throw e;
    try { return await fn(); }
    catch (e2) { throw e2 instanceof ApiError ? e2 : new ApiError('failed'); }
  }
}

/* ================= Access check (screen 2) ================= */
/** Returns true or throws ApiError('access' | 'offline' | 'failed'). */
export async function checkAccess(mode, secret) {
  if (!navigator.onLine) throw new ApiError('offline');
  if (!secret || !secret.trim()) throw new ApiError('access');
  if (mode === 'team' && !CONFIG.TEAM_ENDPOINT) {
    // STUB: accepts any passcode except "wrong" (lets QA see the error state)
    await wait(600);
    if (secret.trim().toLowerCase() === 'wrong') throw new ApiError('access');
    stubCapInit();
    return true;
  }
  let res;
  try {
    res = PROVIDERS[mode]
      ? await fetchWithTimeout(PROVIDERS[mode].models, { headers: { Authorization: `Bearer ${secret.trim()}` } }, CONFIG.TIMEOUT_MS)
      : await fetchWithTimeout(`${CONFIG.TEAM_ENDPOINT}/check`, { method: 'POST', headers: { 'X-Team-Passcode': secret.trim() } }, CONFIG.TIMEOUT_MS);
  } catch { throw new ApiError(navigator.onLine ? 'failed' : 'offline'); }
  if (res.status === 401 || res.status === 403) throw new ApiError('access');
  if (!res.ok) throw new ApiError('failed');
  if (mode === 'team') { try { const d = await res.json(); if (typeof d.left === 'number') state.setCapLeft(d.left); } catch {} }
  return true;
}

/* ================= Prompts — PLACEHOLDER (Data/AI to replace) ================= */
const SYSTEM = `You write quiz questions for consultants at a Big 4 firm learning AI for business (BAs up to directors).
Audience is non-technical but sells AI. Be accurate, practical, specific to the industry given. Never invent client names.
Return ONLY one JSON object matching the schema given. Keep "why" to 2 short sentences. Plain English, Indian business context (₹ lakh/crore).
Every question object ALSO has: "cxo": one sentence on how a consultant would say this point to a client CXO; "terms": [1-2 {"term": str, "def": str ≤15 words}] — key AI terms this question teaches.`;

const SCHEMAS = {
  1:  '{"prompt": str, "answer": true|false, "why": str}',
  2:  '{"prompt": str, "options": [4 str], "correct": 0-3, "why": str}',
  3:  '{"prompt": str, "options": [4 or 5 str], "correct": [indexes, 2+ items], "why": str}',
  4:  '{"sentence": str containing exactly one "___", "words": [4 str], "correct": one of words, "why": str}',
  5:  '{"prompt": str, "left": [4 short str], "right": [4 short str, right[i] matches left[i]], "why": str}',
  6:  '{"prompt": str, "items": [4 or 5 short str in the CORRECT order], "why": str}',
  7:  '{"prompt": str, "boxes": [4 or 5 short component labels top-to-bottom, exactly one is "___"], "options": [4 str], "correct": 0-3, "why": str}',
  8:  '{"prompt": str, "boxes": [4 or 5 short component labels top-to-bottom], "wrong": index of the component that does not belong, "why": str}',
  9:  '{"prompt": str, "table": {"headers": [2-4 str], "rows": [[...], up to 4 rows, same length as headers]}, "question": str, "options": [4 str], "correct": 0-3, "why": str}',
  10: '{"scenario": str (2-3 lines), "prompt": str, "options": [3 str], "correct": 0-2, "why": str}',
  11: '{"prompt": str with all numbers needed, "unit": "lakh"|"crore", "answer": number (in that unit), "why": str showing the working}',
  12: '{"term": str, "prompt": str, "options": [4 str], "correct": 0-3, "why": str}',
  13: '{"prompt": str asking to explain a concept to a CXO in plain words, "why": str (what a great answer covers)}',
  14: '{"prompt": str, "options": [4 short tool or approach names], "correct": 0-3, "why": str}',
  15: '{"prompt": str, "options": [4 short str], "correct": index of odd one, "why": str}',
  16: '{"brief": str (a short business task), "prompt": "Write the prompt you would give Claude or ChatGPT.", "why": str (what a great prompt includes)}',
};

function questionMessages({ level, q, template, stream, industry, recent }) {
  const diff = `Level ${level} of 10 (1 = "what is RAG" basics, 10 = director-level architecture/ROI/selling calls). Question ${q} of 99 in this level — difficulty rises slowly through the level.`;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content:
`${diff}
Topic stream: ${stream} (cover: ${focusOf(stream)}). Industry: ${industry}.
Template: ${template.name}. Schema: ${SCHEMAS[template.id]}
Do not repeat these recent questions: ${JSON.stringify(recent.slice(-15))}${state.get().blocked.length ? `
Never ask these reported-as-bad questions or close variants: ${JSON.stringify(state.get().blocked.slice(-15))}` : ''}` },
  ];
}

/* ================= Shape validation ================= */
const isStr = v => typeof v === 'string' && v.trim().length > 0;
const isIdx = (v, n) => Number.isInteger(v) && v >= 0 && v < n;
const strArr = (a, min, max) => Array.isArray(a) && a.length >= min && a.length <= max && a.every(isStr);

export function validQuestion(t, x) {
  if (!x || typeof x !== 'object') return false;
  switch (t) {
    case 1: return isStr(x.prompt) && typeof x.answer === 'boolean';
    case 2: case 12: case 14: case 15:
      return (t === 12 ? isStr(x.term) : true) && isStr(x.prompt) && strArr(x.options, 4, 4) && isIdx(x.correct, 4);
    case 3: return isStr(x.prompt) && strArr(x.options, 4, 5) && Array.isArray(x.correct) && x.correct.length >= 2 && x.correct.every(i => isIdx(i, x.options.length));
    case 4: return isStr(x.sentence) && x.sentence.split('___').length === 2 && strArr(x.words, 4, 4) && x.words.includes(x.correct);
    case 5: return isStr(x.prompt) && strArr(x.left, 4, 4) && strArr(x.right, 4, 4);
    case 6: return isStr(x.prompt) && strArr(x.items, 4, 5);
    case 7: return isStr(x.prompt) && strArr(x.boxes, 4, 5) && x.boxes.filter(b => b.trim() === '___').length === 1 && strArr(x.options, 4, 4) && isIdx(x.correct, 4);
    case 8: return isStr(x.prompt) && strArr(x.boxes, 4, 5) && isIdx(x.wrong, x.boxes.length);
    case 9: return isStr(x.prompt) && x.table && strArr(x.table.headers, 2, 4) && Array.isArray(x.table.rows) && x.table.rows.length >= 1 && x.table.rows.length <= 4
      && x.table.rows.every(r => Array.isArray(r) && r.length === x.table.headers.length) && isStr(x.question) && strArr(x.options, 4, 4) && isIdx(x.correct, 4);
    case 10: return isStr(x.scenario) && isStr(x.prompt) && strArr(x.options, 3, 3) && isIdx(x.correct, 3);
    case 11: return isStr(x.prompt) && (x.unit === 'lakh' || x.unit === 'crore') && typeof x.answer === 'number' && isFinite(x.answer);
    case 13: return isStr(x.prompt);
    case 16: return isStr(x.brief);
    default: return false;
  }
}

/** v1.2: keep cxo/terms only if well-formed (never fail a question over them). */
function cleanExtras(x) {
  x.cxo = isStr(x.cxo) ? x.cxo.trim() : '';
  x.terms = Array.isArray(x.terms) ? x.terms.filter(t => t && isStr(t.term) && isStr(t.def)).slice(0, 2) : [];
  return x;
}

/* ================= Public: questions ================= */
/**
 * getQuestion(level, q) → { template, stream, industry, data }
 * Uses the saved pending question if present (no repeat call on reload).
 */
export async function getQuestion(level, q) {
  const L = state.level(level);
  if (L.pending && L.pending.q === q) return L.pending;
  const slot = slotFor(level, q);
  const data = await withRetry(async () => {
    if (isStub()) return stubQuestion(slot.template.id);
    const x = await chatJSON(questionMessages({ level, q, ...slot, recent: L.recent }), { counts: true });
    if (!validQuestion(slot.template.id, x)) throw new ApiError('failed');
    return cleanExtras(x);
  });
  const out = { q, template: slot.template, stream: slot.stream, industry: slot.industry, data };
  state.setPending(level, out);
  return out;
}

/** Grade a free-text answer (templates 13, 16) → { score 0-10, strength, fix } */
export async function gradeAnswer(question, answer) {
  return withRetry(async () => {
    if (isStub()) { await wait(1200); return { score: answer.length > 200 ? 8 : 5, strength: 'Clear opening that names the business problem.', fix: 'Add one number the CXO can repeat in a meeting.' }; }
    const x = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content:
`Grade this answer 0-10. ${question.template.id === 16 ? 'Rubric: Clarity, Constraints, Expected output.' : 'Rubric: plain words a CXO gets, business value, accuracy.'}
Question: ${JSON.stringify(question.data)}
Answer: ${JSON.stringify(answer)}
Return {"score": integer 0-10, "strength": one short sentence, "fix": one short sentence}` },
    ]);
    if (!Number.isInteger(x?.score) || x.score < 0 || x.score > 10 || !isStr(x.strength) || !isStr(x.fix)) throw new ApiError('failed');
    return x;
  });
}

/* ================= v1.2: Explain simpler · Level summary ================= */
/** Re-explain a question's answer like to a 5-year-old → string. Does not count toward the team daily cap. */
export async function explainSimpler(question, answerText) {
  return withRetry(async () => {
    if (isStub()) { await wait(800); if (!navigator.onLine) throw new ApiError('offline'); return 'Think of it like a librarian: before answering, it runs to the right shelf, grabs the right page, and reads from it.'; }
    const x = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content:
`Explain the answer to this quiz question so a 10-year-old gets it. Use one everyday analogy. Max 3 short sentences.
Question: ${JSON.stringify(question.data)}
Correct answer: ${JSON.stringify(answerText || '')}
Return {"simple": str}` },
    ]);
    if (!isStr(x?.simple)) throw new ApiError('failed');
    return x.simple.trim();
  });
}

/** One-page recap of a cleared level → { title, points: [5 str], cxo }. Saved per level. */
export async function getLevelSummary(level) {
  const L = state.level(level);
  if (L.summary) return L.summary;
  const terms = state.glossaryList().filter(t => t.level === level).slice(0, 25).map(t => t.term);
  const zone = state.zoneOf(level);
  const sum = await withRetry(async () => {
    if (isStub()) { await wait(900); if (!navigator.onLine) throw new ApiError('offline'); return { title: `Level ${level} in 5 lines`, points: ['RAG answers from the client’s own documents.', 'Tokens drive cost: output tokens cost more than input.', 'Pick the smallest model that passes your evals.', 'Batch jobs suit forecasts; real-time suits chat.', 'Lead with a 2-week POC tied to one number.'], cxo: 'We start small, prove value on one number, then scale.' }; }
    const x = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content:
`Write a one-page recap of Level ${level} of 10 for a consultant who just finished it.
Topics in this level: ${STREAMS[zone].join(', ')}.
Questions they saw (sample): ${JSON.stringify(L.recent.slice(-20))}
Terms they met: ${JSON.stringify(terms)}
Return {"title": str (≤8 words), "points": [5 short takeaways, one line each], "cxo": one line they can say to a CXO}` },
    ]);
    if (!isStr(x?.title) || !strArr(x?.points, 3, 7) || !isStr(x?.cxo)) throw new ApiError('failed');
    return { title: x.title, points: x.points.slice(0, 5), cxo: x.cxo };
  });
  state.setSummary(level, sum);
  return sum;
}

/* ================= Public: Boss ================= */
/** Brief for a level's Boss. Saved; same brief on retry. → { industry, heading, problem, mustHave } */
export async function getBossBrief(level) {
  const L = state.level(level);
  if (L.bossBrief) return L.bossBrief;
  const inds = state.get().industries.length ? state.get().industries : ['FMCG'];
  const industry = inds[(level - 1) % inds.length];
  const brief = await withRetry(async () => {
    if (isStub()) return { industry, heading: 'Shelf-gap spotter for a 40-store chain', problem: 'Area managers find empty shelves only on weekly visits. Build a tiny tool that reads a store stock list and flags the top 5 gaps to fix today.', mustHave: 'Paste a CSV, get 5 ranked gaps with a one-line reason each' };
    const x = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content:
`Write a Boss challenge for Level ${level} of 10 in ${industry}: a tiny POC the learner builds in under an hour by prompting Claude or ChatGPT (no coding skills needed). Harder at higher levels.
Return {"heading": str (≤8 words), "problem": str (2-3 lines), "mustHave": str (one line, the testable must-have)}` },
    ], { counts: true });
    if (!isStr(x?.heading) || !isStr(x?.problem) || !isStr(x?.mustHave)) throw new ApiError('failed');
    return { industry, ...x };
  });
  state.setBossBrief(level, brief);
  return brief;
}

/** Grade a Boss build → { score 0-10, strength, fixes: [≤3] } */
export async function gradeBoss(level, { prompt, link, desc }) {
  const brief = state.level(level).bossBrief;
  return withRetry(async () => {
    if (isStub()) { await wait(2500); return prompt.length >= 400 ? { score: 8, strength: 'Constraints are explicit and testable.', fixes: [] } : { score: 5, strength: 'Clear goal stated up front.', fixes: ['Say exactly what the output should look like.', 'Add the must-have as a hard constraint.', 'Give one example input.'] }; }
    const x = await chatJSON([
      { role: 'system', content: SYSTEM },
      { role: 'user', content:
`Grade this Boss POC 0-10 against the brief. Check clarity, constraints, and whether the output meets the brief. Pass mark is 7.
Brief: ${JSON.stringify(brief)}
Final prompt: ${JSON.stringify(prompt)}
Output link: ${JSON.stringify(link || '')}
Description of what it does: ${JSON.stringify(desc || '')}
Return {"score": integer 0-10, "strength": one short sentence, "fixes": [0-3 short sentences, empty if score ≥ 9]}` },
    ], { timeout: CONFIG.BOSS_TIMEOUT_MS });
    if (!Number.isInteger(x?.score) || x.score < 0 || x.score > 10 || !isStr(x.strength) || !Array.isArray(x.fixes)) throw new ApiError('failed');
    return { score: x.score, strength: x.strength, fixes: x.fixes.filter(isStr).slice(0, 3) };
  });
}

/* ================= STUB (team mode until Worker exists) ================= */
const wait = ms => new Promise(r => setTimeout(r, ms));

function stubCapInit() {
  if (state.capLeftToday() === null) state.setCapLeft(CONFIG.TEAM_DAILY_CAP);
}
async function stubQuestion(t) {
  await wait(700);
  if (!navigator.onLine) throw new ApiError('offline');
  stubCapInit();
  const left = state.capLeftToday();
  if (left <= 0) throw new ApiError('cap');
  state.setCapLeft(left - 1);
  return { ...structuredClone(STUB_BANK[t]), cxo: 'Tell the CXO: this cuts manual effort and shows value in weeks, not months.', terms: [{ term: STUB_TERMS[t][0], def: STUB_TERMS[t][1] }] };
}

const STUB_TERMS = {
  1: ['RAG', 'Fetching relevant documents before the AI answers'], 2: ['Batch scoring', 'Running a model on data in scheduled chunks'],
  3: ['Hallucination', 'AI stating something false as if it were true'], 4: ['Embedding', 'Text turned into numbers that capture meaning'],
  5: ['Guardrail', 'A rule that blocks unsafe or off-topic AI output'], 6: ['Retriever', 'The part that finds relevant passages'],
  7: ['Vector database', 'Stores embeddings for fast similarity search'], 8: ['Intent detection', 'Working out what the user wants'],
  9: ['Pilot', 'A small live trial before full rollout'], 10: ['Churn prediction', 'Forecasting which customers will leave'],
  11: ['ROI', 'Return on investment: benefit vs cost'], 12: ['Agentic AI', 'AI that plans steps and uses tools'],
  13: ['CXO', 'A chief-level executive (CEO, CFO, CIO…)'], 14: ['Custom GPT', 'ChatGPT set up with your own files and instructions'],
  15: ['LLM', 'Large language model, e.g. GPT-4o or Claude'], 16: ['Prompt', 'The instruction you give the AI'],
};

export const STUB_BANK = {
  1:  { prompt: 'Can a RAG system answer from documents the model was never trained on?', answer: true, why: 'RAG fetches relevant passages at question time and hands them to the model. Training data is not needed for those documents.' },
  2:  { prompt: 'An FMCG client wants weekly demand forecasts per SKU. Which approach fits first?', options: ['Batch forecasting model', 'Real-time chatbot', 'Image recognition', 'Fine-tuned LLM'], correct: 0, why: 'Weekly forecasts are a classic batch job. A chatbot or LLM adds cost without improving the forecast.' },
  3:  { prompt: 'Which of these reduce LLM hallucination in a client demo?', options: ['Grounding answers in retrieved documents', 'Raising temperature', 'Asking the model to cite sources', 'Removing the system prompt'], correct: [0, 2], why: 'Grounding and citations tie answers to real text. Higher temperature makes output more random.' },
  4:  { sentence: 'A vector database stores ___ so similar text can be found fast.', words: ['embeddings', 'invoices', 'passwords', 'images only'], correct: 'embeddings', why: 'Embeddings are number lists that capture meaning. Similar meanings sit close together, so search is fast.' },
  5:  { prompt: 'Match each term to what it does.', left: ['Embedding', 'Prompt', 'Retriever', 'Guardrail'], right: ['Turns text into numbers', 'Instruction to the model', 'Finds relevant passages', 'Blocks unsafe output'], why: 'These four pieces make up most business GenAI apps. Knowing each lets you explain a POC in one line.' },
  6:  { prompt: 'Put the RAG flow in order.', items: ['User asks a question', 'Retriever finds passages', 'Passages added to the prompt', 'LLM writes the answer'], why: 'Retrieval happens before generation. That is what lets the answer cite the client’s own documents.' },
  7:  { prompt: 'Complete this BFSI document Q&A architecture.', boxes: ['Policy PDFs', 'Chunk + embed', '___', 'LLM answer'], options: ['Vector database', 'Spreadsheet', 'Email server', 'Firewall'], correct: 0, why: 'Embedded chunks are stored in a vector database. The retriever searches it before the LLM answers.' },
  8:  { prompt: 'Which component does not belong in this retail chatbot flow?', boxes: ['Customer message', 'Intent detection', 'Blockchain ledger', 'Answer from FAQ'], wrong: 2, why: 'A chatbot flow does not need a ledger. It adds cost and delay with no benefit.' },
  9:  { prompt: 'Pilot results for a pharma sales-call assistant.', table: { headers: ['Region', 'Calls/day', 'Conv %'], rows: [['North', '42', '11'], ['South', '38', '15'], ['West', '45', '9']] }, question: 'Which region should the next phase copy from?', options: ['North', 'South', 'West', 'None'], correct: 1, why: 'South converts best despite fewer calls. Quality beats volume, so copy what South does.' },
  10: { scenario: 'A telecom client loses 3% of prepaid users each month. They have 2 years of usage and recharge data.', prompt: 'Best first AI use case?', options: ['Churn prediction', 'Logo generator', 'Voice cloning'], correct: 0, why: 'Churn prediction uses data they already have. It ties straight to a revenue number.' },
  11: { prompt: 'A bot saves 20 agents 1 hour a day. Agent cost is ₹600/hour, 250 working days a year. Annual saving?', unit: 'lakh', answer: 30, why: '20 × 1 × 600 × 250 = ₹30,00,000. That is ₹30 lakh a year.' },
  12: { term: 'Agentic AI', prompt: 'What does it mean in plain words?', options: ['AI that plans and takes steps using tools', 'AI that only answers FAQs', 'A sales agent using ChatGPT', 'A faster GPU'], correct: 0, why: 'Agentic AI breaks a goal into steps and uses tools to do them. That goes beyond answering one question.' },
  13: { prompt: 'Explain RAG to a CFO in under 4 lines, with why it matters to her.', why: 'Great answers say it answers from our own documents, so it is accurate and auditable. They link it to time or cost saved.' },
  14: { prompt: 'Best quick tool to build a no-code POC chatbot over 20 PDFs in a day?', options: ['Claude Projects or Custom GPT', 'Hadoop cluster', 'Excel macros', 'Building an LLM from scratch'], correct: 0, why: 'Claude Projects and Custom GPTs take documents directly. A demo is ready in hours.' },
  15: { prompt: 'Which one is the odd one out?', options: ['GPT-4o', 'Claude', 'Gemini', 'Tableau'], correct: 3, why: 'Tableau is a BI dashboard tool. The other three are large language models.' },
  16: { brief: 'An FMCG sales head wants a weekly 5-bullet summary of distributor complaints from a CSV.', prompt: 'Write the prompt you would give Claude or ChatGPT.', why: 'Great prompts set the role, input format, the 5-bullet output and what to ignore.' },
};
