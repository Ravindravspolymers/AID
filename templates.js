// AID Quizz v1.0 — templates.js
// Answer areas for templates 1–16 (handoff TEMPLATES). Template 17 Boss lives in boss.js.
//
// createTemplate(question, { draft, onChange }) →
//   { html, mount(root), isValid(), value(), check() → { correct, correctText }, lock() }
// Selected state everywhere = answer tile "selected"; post-Check = correct / wrong variants.

import { icon } from './icons.js';
import { esc, $, $$, openSheet } from './ui.js';

const KEYS = ['A', 'B', 'C', 'D', 'E'];
const LONG_PRESS_MS = 350;        // not in handoff — Designer Q13
const ROI_TOLERANCE = 0.02;       // ±2% (§7 ASSUMED)
const shuffle = a => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };

/* ---------- shared tile markup ---------- */
function tile({ text, key = '', idx, attrs = '', trailing = '' }) {
  return `<button class="tile" data-i="${idx}" ${attrs}>
    ${key ? `<span class="tile-key" aria-hidden="true">${key}</span>` : ''}
    <span class="tile-text">${esc(text)}</span>
    <span class="tile-icon" aria-hidden="true">${trailing}</span></button>`;
}
function markTile(el, kind) {      // kind: 'correct' | 'wrong'
  el.classList.remove('is-selected');
  el.classList.add(`is-${kind}`);
  const ic = el.querySelector('.tile-icon');
  if (ic) ic.innerHTML = icon(kind === 'correct' ? 'check' : 'x', 20);
}
const lockAll = root => $$('button', root).forEach(b => { b.disabled = true; });

/* ---------- single choice (2, 7-options, 9, 10, 12, 14, 15, 1) ---------- */
function singleChoice({ head, options, correct, keyed = true, grid = false, onChange }) {
  let sel = null, root;
  return {
    html: `${head}
      <div class="${grid ? 'tiles-2' : 'tiles'}" role="radiogroup" aria-label="Answer options">
        ${options.map((o, i) => tile({ text: o, key: keyed ? KEYS[i] : '', idx: i, attrs: 'role="radio" aria-checked="false"' })).join('')}
      </div>`,
    mount(r) {
      root = r;
      $$('[data-i]', r).forEach(b => b.onclick = () => {
        sel = Number(b.dataset.i);
        $$('[data-i]', r).forEach(x => { const on = Number(x.dataset.i) === sel; x.classList.toggle('is-selected', on); x.setAttribute('aria-checked', on); });
        onChange();
      });
    },
    isValid: () => sel !== null,
    value: () => sel,
    check() {
      const ok = sel === correct;
      const tiles = $$('[data-i]', root);
      markTile(tiles[correct], 'correct');
      if (!ok) markTile(tiles[sel], 'wrong');
      return { correct: ok, correctText: options[correct] };
    },
    lock: () => lockAll(root),
  };
}

const prompt = t => `<h2 class="q-prompt">${esc(t)}</h2>`;

/* ================= Factory ================= */
export function createTemplate(question, { draft = '', onChange = () => {} } = {}) {
  const d = question.data;
  switch (question.template.id) {

    /* 1 Yes/No: 2 tiles side by side */
    case 1: {
      const t = singleChoice({ head: prompt(d.prompt), options: ['Yes', 'No'], correct: d.answer ? 0 : 1, keyed: false, grid: true, onChange });
      return t;
    }

    /* 2 MCQ: 4 keyed tiles, single */
    case 2: return singleChoice({ head: prompt(d.prompt), options: d.options, correct: d.correct, onChange });

    /* 3 Multi-select: trailing check, "Pick all that apply" */
    case 3: {
      const sel = new Set(); let root;
      return {
        html: `${prompt(d.prompt)}<p class="t-caption">Pick all that apply</p>
          <div class="tiles" role="group" aria-label="Answer options">
            ${d.options.map((o, i) => tile({ text: o, key: KEYS[i], idx: i, attrs: 'aria-pressed="false"' })).join('')}
          </div>`,
        mount(r) {
          root = r;
          $$('[data-i]', r).forEach(b => b.onclick = () => {
            const i = Number(b.dataset.i);
            sel.has(i) ? sel.delete(i) : sel.add(i);
            const on = sel.has(i);
            b.classList.toggle('is-selected', on); b.setAttribute('aria-pressed', on);
            b.querySelector('.tile-icon').innerHTML = on ? icon('check', 20) : '';
            onChange();
          });
        },
        isValid: () => sel.size > 0,
        value: () => [...sel],
        check() {
          const right = new Set(d.correct);
          const ok = right.size === sel.size && [...right].every(i => sel.has(i));
          $$('[data-i]', root).forEach(b => {
            const i = Number(b.dataset.i);
            if (right.has(i)) markTile(b, 'correct');
            else if (sel.has(i)) markTile(b, 'wrong');
          });
          return { correct: ok, correctText: d.correct.map(i => d.options[i]).join(' · ') };
        },
        lock: () => lockAll(root),
      };
    }

    /* 4 Fill blank: dashed gold slot + word chips; tap chip fills, tap slot clears */
    case 4: {
      const words = shuffle(d.words); let filled = null, root;
      const [before, after] = d.sentence.split('___');
      return {
        html: `<p class="blank-sentence">${esc(before)}<button class="blank-slot" id="slot" aria-label="Blank, empty">&nbsp;</button>${esc(after)}</p>
          <div class="word-chips" role="group" aria-label="Words">
            ${words.map((w, i) => `<button class="word-chip" data-w="${i}">${esc(w)}</button>`).join('')}
          </div>`,
        mount(r) {
          root = r;
          const slot = $('#slot', r);
          const paint = () => {
            slot.innerHTML = filled === null ? '&nbsp;' : esc(words[filled]);
            slot.classList.toggle('is-filled', filled !== null);
            slot.setAttribute('aria-label', filled === null ? 'Blank, empty' : `Blank: ${words[filled]}. Tap to clear`);
            $$('[data-w]', r).forEach(c => c.classList.toggle('is-used', Number(c.dataset.w) === filled));
            onChange();
          };
          $$('[data-w]', r).forEach(c => c.onclick = () => { filled = Number(c.dataset.w); paint(); });
          slot.onclick = () => { filled = null; paint(); };
        },
        isValid: () => filled !== null,
        value: () => words[filled],
        check() {
          const ok = words[filled] === d.correct;
          const slot = $('#slot', root);
          slot.classList.remove('is-filled'); slot.classList.add(ok ? 'is-correct' : 'is-wrong');
          return { correct: ok, correctText: d.correct };
        },
        lock: () => lockAll(root),
      };
    }

    /* 5 Match: 2 columns; tap left then right; pair shares number key; tap pair to undo */
    case 5: {
      const rightOrder = shuffle(d.right.map((_, i) => i));   // display order → original index
      const pairs = new Map();   // leftIdx → rightOrigIdx
      let pendingLeft = null, root;
      return {
        html: `${prompt(d.prompt)}
          <div class="match">
            <div class="match-col" role="group" aria-label="Terms">
              ${d.left.map((t, i) => `<button class="tile" data-l="${i}"><span class="tile-key" aria-hidden="true"></span><span class="tile-text">${esc(t)}</span></button>`).join('')}
            </div>
            <div class="match-col" role="group" aria-label="Meanings">
              ${rightOrder.map(ri => `<button class="tile" data-r="${ri}"><span class="tile-key" aria-hidden="true"></span><span class="tile-text">${esc(d.right[ri])}</span></button>`).join('')}
            </div>
          </div>`,
        mount(r) {
          root = r;
          const paint = () => {
            const num = new Map(); [...pairs.keys()].sort((a, b) => a - b).forEach((l, k) => num.set(l, k + 1));
            $$('[data-l]', r).forEach(b => {
              const l = Number(b.dataset.l); const n = num.get(l);
              b.querySelector('.tile-key').textContent = n ?? '';
              b.classList.toggle('is-selected', pendingLeft === l || pairs.has(l));
              b.setAttribute('aria-pressed', pendingLeft === l || pairs.has(l));
            });
            $$('[data-r]', r).forEach(b => {
              const ri = Number(b.dataset.r);
              const l = [...pairs].find(([, v]) => v === ri)?.[0];
              b.querySelector('.tile-key').textContent = l !== undefined ? num.get(l) : '';
              b.classList.toggle('is-selected', l !== undefined);
              b.setAttribute('aria-pressed', l !== undefined);
            });
            onChange();
          };
          $$('[data-l]', r).forEach(b => b.onclick = () => {
            const l = Number(b.dataset.l);
            if (pairs.has(l)) { pairs.delete(l); pendingLeft = null; }        // undo
            else pendingLeft = pendingLeft === l ? null : l;
            paint();
          });
          $$('[data-r]', r).forEach(b => b.onclick = () => {
            const ri = Number(b.dataset.r);
            const owner = [...pairs].find(([, v]) => v === ri)?.[0];
            if (owner !== undefined) { pairs.delete(owner); paint(); return; }   // undo
            if (pendingLeft === null) return;
            pairs.set(pendingLeft, ri); pendingLeft = null; paint();
          });
        },
        isValid: () => pairs.size === d.left.length,
        value: () => Object.fromEntries(pairs),
        check() {
          let ok = true;
          $$('[data-l]', root).forEach(b => {
            const l = Number(b.dataset.l); const good = pairs.get(l) === l;
            if (!good) ok = false;
            markTile(b, good ? 'correct' : 'wrong');
            markTile($(`[data-r="${pairs.get(l)}"]`, root), good ? 'correct' : 'wrong');
          });
          return { correct: ok, correctText: d.left.map((t, i) => `${t} → ${d.right[i]}`).join(' · ') };
        },
        lock: () => lockAll(root),
      };
    }

    /* 6 Drag to order: keyed rows + grip; long-press drag; ▲▼ on tap */
    case 6: {
      let order = shuffle(d.items.map((_, i) => i));
      if (order.every((v, i) => v === i)) order.reverse();
      let active = null, root;
      const rowsHtml = () => order.map((orig, pos) => `
        <div class="tile order-row ${active === pos ? 'is-selected' : ''}" data-pos="${pos}" tabindex="0" role="listitem" aria-label="${pos + 1}. ${esc(d.items[orig])}">
          <span class="tile-key" aria-hidden="true">${pos + 1}</span>
          <span class="tile-text">${esc(d.items[orig])}</span>
          ${active === pos ? `<span class="order-moves">
            <button class="icon-btn" data-move="-1" aria-label="Move up" ${pos === 0 ? 'disabled' : ''}>${icon('chevron-up', 20)}</button>
            <button class="icon-btn" data-move="1" aria-label="Move down" ${pos === order.length - 1 ? 'disabled' : ''}>${icon('chevron-down', 20)}</button>
          </span>` : `<span class="grip" aria-hidden="true">${icon('grip-vertical', 20)}</span>`}
        </div>`).join('');
      let locked = false;
      return {
        html: `${prompt(d.prompt)}<div class="tiles" id="order" role="list">${rowsHtml()}</div>`,
        mount(r) {
          root = r;
          const list = $('#order', r);
          const repaint = focusPos => { list.innerHTML = rowsHtml(); onChange(); if (focusPos !== undefined) list.querySelector(`[data-pos="${focusPos}"]`)?.focus(); };
          const move = (pos, dir) => {
            const to = pos + dir; if (to < 0 || to >= order.length) return;
            [order[pos], order[to]] = [order[to], order[pos]]; active = to; repaint(to);
          };
          list.addEventListener('click', e => {
            if (locked) return;
            const mv = e.target.closest('[data-move]');
            const row = e.target.closest('[data-pos]'); if (!row) return;
            const pos = Number(row.dataset.pos);
            if (mv) { e.stopPropagation(); move(pos, Number(mv.dataset.move)); return; }
            active = active === pos ? null : pos; repaint(pos);
          });
          list.addEventListener('keydown', e => {
            if (locked) return;
            const row = e.target.closest('[data-pos]'); if (!row) return;
            const pos = Number(row.dataset.pos);
            if (e.key === 'ArrowUp') { e.preventDefault(); move(pos, -1); }
            if (e.key === 'ArrowDown') { e.preventDefault(); move(pos, 1); }
          });
          // Long-press drag
          let timer = null, dragFrom = null;
          list.addEventListener('pointerdown', e => {
            if (locked || e.target.closest('[data-move]')) return;
            const row = e.target.closest('[data-pos]'); if (!row) return;
            timer = setTimeout(() => { dragFrom = Number(row.dataset.pos); row.classList.add('is-dragging'); list.setPointerCapture?.(e.pointerId); }, LONG_PRESS_MS);
          });
          list.addEventListener('pointermove', e => {
            if (dragFrom === null) { return; }
            e.preventDefault();
            const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-pos]');
            if (!over) return;
            const to = Number(over.dataset.pos);
            if (to !== dragFrom) {
              const [it] = order.splice(dragFrom, 1); order.splice(to, 0, it); dragFrom = to; active = null;
              list.innerHTML = rowsHtml(); list.querySelector(`[data-pos="${to}"]`)?.classList.add('is-dragging');
            }
          });
          const end = () => { clearTimeout(timer); if (dragFrom !== null) { dragFrom = null; repaint(); } };
          list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
        },
        isValid: () => true,
        value: () => [...order],
        check() {
          active = null; locked = true;
          $('#order', root).innerHTML = rowsHtml();
          const ok = order.every((v, i) => v === i);
          $$('[data-pos]', root).forEach(row => {
            const pos = Number(row.dataset.pos);
            const kind = order[pos] === pos ? 'correct' : 'wrong';
            row.classList.add(`is-${kind}`);
            row.querySelector('.grip').innerHTML = icon(kind === 'correct' ? 'check' : 'x', 20);
            row.querySelector('.grip').className = 'tile-icon';
          });
          return { correct: ok, correctText: d.items.join(' → ') };
        },
        lock: () => { locked = true; lockAll(root); },
      };
    }

    /* 7 Complete architecture: boxes + arrows, dashed slot; tap slot → sheet of options */
    case 7: {
      let pick = null, root;
      const arrow = `<div class="arch-arrow" aria-hidden="true">${icon('chevron-down', 20)}</div>`;
      const boxes = () => d.boxes.map(b => b.trim() === '___'
        ? `<button class="arch-box is-slot ${pick !== null ? 'is-filled' : ''}" id="arch-slot" aria-label="${pick === null ? 'Missing component, tap to choose' : `Chosen: ${esc(d.options[pick])}. Tap to change`}">${pick === null ? '?' : esc(d.options[pick])}</button>`
        : `<div class="arch-box">${esc(b)}</div>`).join(arrow);
      return {
        html: `${prompt(d.prompt)}<div class="arch" id="arch">${boxes()}</div>`,
        mount(r) {
          root = r;
          const bind = () => {
            $('#arch-slot', r).onclick = () => {
              const sh = openSheet(`<h2 class="t-heading">Pick the missing component</h2>
                <div class="tiles" role="radiogroup">${d.options.map((o, i) => tile({ text: o, key: KEYS[i], idx: i, attrs: `role="radio" aria-checked="${pick === i}"` })).join('')}</div>`, { label: 'Pick the missing component' });
              $$('[data-i]', sh.body).forEach(b => { if (Number(b.dataset.i) === pick) b.classList.add('is-selected'); b.onclick = () => {
                pick = Number(b.dataset.i); sh.close(); $('#arch', r).innerHTML = boxes(); bind(); onChange(); $('#arch-slot', r).focus();
              }; });
            };
          };
          bind();
        },
        isValid: () => pick !== null,
        value: () => pick,
        check() {
          const ok = pick === d.correct;
          const slot = $('#arch-slot', root);
          slot.classList.remove('is-filled'); slot.classList.add(ok ? 'is-correct' : 'is-wrong');
          return { correct: ok, correctText: d.options[d.correct] };
        },
        lock: () => lockAll(root),
      };
    }

    /* 8 Spot wrong component: tap a box → gold; after Check the wrong component is error-bordered */
    case 8: {
      let pick = null, root;
      const arrow = `<div class="arch-arrow" aria-hidden="true">${icon('chevron-down', 20)}</div>`;
      return {
        html: `${prompt(d.prompt)}<div class="arch" role="radiogroup" aria-label="Components">
          ${d.boxes.map((b, i) => `<button class="arch-box" data-i="${i}" role="radio" aria-checked="false">${esc(b)}</button>`).join(arrow)}</div>`,
        mount(r) {
          root = r;
          $$('[data-i]', r).forEach(b => b.onclick = () => {
            pick = Number(b.dataset.i);
            $$('[data-i]', r).forEach(x => { const on = Number(x.dataset.i) === pick; x.classList.toggle('is-selected', on); x.setAttribute('aria-checked', on); });
            onChange();
          });
        },
        isValid: () => pick !== null,
        value: () => pick,
        check() {
          const ok = pick === d.wrong;
          const boxes = $$('[data-i]', root);
          // QA #6: correct answer → green + check; user's wrong pick → red + x
          boxes[d.wrong].classList.remove('is-selected');
          boxes[d.wrong].classList.add('is-correct');
          boxes[d.wrong].insertAdjacentHTML('beforeend', icon('check', 20, 'c-success'));
          if (!ok) {
            boxes[pick].classList.remove('is-selected');
            boxes[pick].classList.add('is-wrong');
            boxes[pick].insertAdjacentHTML('beforeend', icon('x', 20, 'c-error'));
          }
          return { correct: ok, correctText: d.boxes[d.wrong] };
        },
        lock: () => lockAll(root),
      };
    }

    /* 9 Table insight: mono table ≤4×4, then MCQ */
    case 9: {
      const table = `<table class="data-table"><thead><tr>${d.table.headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>${d.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      return singleChoice({ head: `<p class="q-context">${esc(d.prompt)}</p>${table}${prompt(d.question)}`, options: d.options, correct: d.correct, onChange });
    }

    /* 10 Use-case picker: scenario + 3 tiles */
    case 10: return singleChoice({ head: `<div class="scenario t-body">${esc(d.scenario)}</div>${prompt(d.prompt)}`, options: d.options, correct: d.correct, onChange });

    /* 11 ROI calc: ₹ prefix + unit suffix, decimal keypad; tolerance ±2% */
    case 11: {
      let root;
      return {
        html: `${prompt(d.prompt)}
          <div class="field">
            <label class="sr-only" for="roi">Your answer</label>
            <div class="input-wrap"><span class="input-affix" aria-hidden="true">₹</span>
              <input class="input" id="roi" inputmode="decimal" autocomplete="off" aria-describedby="roi-unit">
              <span class="input-affix" id="roi-unit">${esc(d.unit)}</span></div>
          </div>`,
        mount(r) { root = r; $('#roi', r).oninput = e => { e.target.value = e.target.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1'); onChange(); }; },
        isValid: () => { const v = parseFloat($('#roi', root)?.value); return Number.isFinite(v); },
        value: () => parseFloat($('#roi', root).value),
        check() {
          const v = parseFloat($('#roi', root).value);
          const ok = Math.abs(v - d.answer) <= Math.abs(d.answer) * ROI_TOLERANCE;
          return { correct: ok, correctText: `₹${d.answer} ${d.unit}` };
        },
        lock: () => { $('#roi', root).disabled = true; },
      };
    }

    /* 12 Buzzword decoder: term + tiles */
    case 12: return singleChoice({ head: `<p class="term">${esc(d.term)}</p>${prompt(d.prompt)}`, options: d.options, correct: d.correct, onChange });

    /* 13 Explain to CXO: textarea + "nnn / 400" counter, min 80 (GPT-graded) */
    case 13: {
      let root;
      return {
        html: `${prompt(d.prompt)}
          <div class="field">
            <label class="sr-only" for="cxo">Your answer</label>
            <div class="input-wrap is-textarea"><textarea class="textarea" id="cxo" rows="6" maxlength="400" aria-describedby="cxo-count">${esc(draft)}</textarea></div>
            <div class="counter-row"><span class="t-caption t-mono" id="cxo-count">${draft.length} / 400</span></div>
          </div>`,
        mount(r) { root = r; $('#cxo', r).oninput = e => { $('#cxo-count', r).textContent = `${e.target.value.length} / 400`; onChange(); }; },
        isValid: () => ($('#cxo', root)?.value.trim().length ?? 0) >= 80,
        value: () => $('#cxo', root).value.trim(),
        check: null,
        lock: () => { $('#cxo', root).disabled = true; },
      };
    }

    /* 14 Tool picker / 15 Odd one out: 2×2 tiles */
    case 14: case 15:
      return singleChoice({ head: prompt(d.prompt), options: d.options, correct: d.correct, keyed: false, grid: true, onChange });

    /* 16 Write the Prompt: brief + mono textarea (min 120) + rubric chips (GPT-graded) */
    case 16: {
      let root;
      return {
        html: `<div class="scenario t-body">${esc(d.brief)}</div>${prompt(d.prompt || 'Write the prompt you would give Claude or ChatGPT.')}
          <div class="field">
            <label class="sr-only" for="wp">Your prompt</label>
            <div class="input-wrap is-textarea"><textarea class="textarea t-mono" id="wp" rows="8">${esc(draft)}</textarea></div>
          </div>
          <div class="rubric" aria-label="Graded on"><span class="chip">Clarity</span><span class="chip">Constraints</span><span class="chip">Expected output</span></div>`,
        mount(r) { root = r; $('#wp', r).oninput = onChange; },
        isValid: () => ($('#wp', root)?.value.trim().length ?? 0) >= 120,
        value: () => $('#wp', root).value.trim(),
        check: null,
        lock: () => { $('#wp', root).disabled = true; },
      };
    }

    default: throw new Error(`Unknown template ${question.template.id}`);
  }
}
