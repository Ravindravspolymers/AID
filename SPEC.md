# AID Quizz SPEC  | Mode: Full | Platform: PWA (GitHub Pages) | Login: none (team passcode / own OpenAI or DeepSeek key)

## Problem & users
Deloitte AI & Data BAs (up to directors) need AI fluency they can sell, and the habit of building POCs by prompting Claude/GPT.
1000 progressively harder AI-generated questions: 10 levels × 100, each level ends in a Boss (build a tiny POC).

## Must / Should / Could / Won't (v2)
- Must (v1.0–1.1): 3 zones (Beginner L1–3, Intermediate L4–6, Expert L7–10), up to 3 industries, 16 question templates,
  feedback after every answer, Boss POC graded ≥7 to unlock next level, progress on phone + backup code, team daily cap 60.
- Must (v1.2): 30-topic BA syllabus; Retry wrong answers; Bookmark; Pressure questions; Explain simpler; CXO line;
  Glossary; Level summary; Hint; Strengths map; Report a bad question.
- Won't (v2): team leaderboard, weekly challenge, duels, shareable badge (need a back-end).

## Syllabus (v1.2, api.js SYLLABUS)
- Beginner: Types of AI, How LLMs work, Tokens & context, AI tools, Prompting basics, Use cases, Limits, Data basics, AI vocabulary, Responsible AI
- Intermediate: Token economics, Model choice, RAG, Vector DBs, Fine-tune vs prompt, Agents & tools, Batch vs real-time, Evals, Data privacy, Demos & POCs, Low-code AI
- Expert: Architecture, ROI, Build vs buy, Sustainability, Governance, Scaling, Adoption, Pricing AI deals, POC-first selling

## v1.2 feature rules
- Review pile: wrong answers (max 30/level) → "Review n wrong answers" on the level card. Right in review = removed; wrong = back of pile. Review never moves Q forward.
- Bookmark: ☆ Save on feedback → Profile → Saved questions (max 100). Carried in backup code (30).
- Pressure: every 10th question (Q10, Q20…) if auto-scored: 30-second timer, time-out = wrong, no hint.
- Explain simpler: 1 AI call from the feedback sheet; not counted in the team cap.
- CXO line + glossary terms: returned with every question (no extra call).
- Glossary: Profile → Glossary, searchable. Stays on the phone (too long for the backup code).
- Level summary: 1 AI call, saved; from Level-up screen and "Level summary" on cleared level cards.
- Hint: single-choice tile questions; removes wrong options until 2 remain; correct = ½ point.
- Strengths: accuracy per topic, weakest first; red = under 60% after 3+ questions. In backup code.
- Report: blocks the question on this phone and tells the AI never to ask it or close variants.

## Screens & flows
Welcome → Access → Setup zone → Setup industries → Level map ⇄ Question → Feedback sheet → … Q99 → Boss brief → Submit → Grading → Level-up / Failed → Congratulations (after L10).
Profile sheet: stats, backup code, Strengths, Saved, Glossary, Industries, Access. Interruptions: S2 error/offline/access, S3 daily cap.

## Style (locked)
"Sharp & premium" dark: tokens.css only. Gold = primary/progress, Ice = Boss only, Success/Error/Warn for state. Inter + mono for counts. Lucide icons inlined in icons.js.

## Data model (phone, localStorage key aidq.v1)
levels[1..10]: q, correct (½ points allowed), bossDone, bossScore, bossBrief, bossDraft, pending, recent[], review[], summary
root: access, zone, industries, currentLevel, jumpedZones, completedAt, capLeft/capDate, bookmarks[], glossary{}, stats{}, blocked[]
Backup code AIDQ1-: progress + stats + bookmarks. Never the passcode/key.

## Gates
Spec ✅ | Mockups ✅ | Data model ✅ (phone-only) | QA pass ✅ v1.2 (simulated: 88/88 headless checks + faked-OpenAI path; real-phone check pending) | Release ⬜ (team Worker pending)

## Changelog
2026-11-08: v1.0 front-end built; v1.1 DeepSeek key + restore flow.
2026-11-08: Skip question added then removed on request (back to default).
2026-11-08: v1.2 30-topic BA syllabus.
2026-11-08: v1.2 Review pile, Bookmark, Pressure, Explain simpler, CXO line, Glossary, Level summary, Hint, Strengths, Report.
2026-11-08: v1.2 QA: fixed pressure time-out sheet; team-mode stub now honours offline for Explain simpler / Summary.

## Next task
Cloudflare Worker for team mode (then a 5-min real-phone check).
