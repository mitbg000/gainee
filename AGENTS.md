# AGENTS.md – Gainee guide for AI coding agents

This file is the single source of truth for any AI agent (Claude Code, Codex, Cursor, Copilot, …) working on this repository. It explains **what the product does, how it is built, how data flows, the conventions to follow, and how to build, test and deploy it.**

Read it fully before making changes. Keep it up to date when you change architecture, commands, env vars or conventions.

---

## 1. Product in one paragraph

Gainee is a **personal, single-user web app for learning English (IELTS focus) through authentic reading**. The owner is a Vietnamese learner. They import an article (PDF / DOCX / TXT / pasted text). The app cleans the text and splits it into ~500–800-word lessons. An AI model then generates, for each lesson:

- a Vietnamese summary and a warm-up question;
- 8–12 vocabulary items;
- IELTS-style exercises (True/False/Not Given, multiple choice, gap fill);
- sentence structures worth learning, paraphrase practice, and a speaking/writing prompt.

Every AI item is **validated against the source text** before it is saved. While reading, the learner can:

- tap a word for an **offline dictionary** entry (Kindle-style);
- highlight text and write **margin notes** (Google-Docs-style);
- ask an AI tutor quick questions and **pin** the answers to the margin;
- save words to a notebook;
- do the exercises and get AI feedback on paraphrases and speaking/writing answers.

Progress (reading speed, accuracy by question type, XP, streak) is recorded for motivation and tracking. The UI is bilingual (EN / VI), has light/dark themes, works well on phones, and can be installed as a PWA (including on iOS).

---

## 2. Status and roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundation: auth (username + password), MySQL/Drizzle, i18n, theme, PWA, mobile layout, worker + job queue, offline dictionary, categories (labels), aaPanel deploy | ✅ done |
| 1 | AI providers + per-task routing; import → clean → split → AI lesson generation with validation; library; full lesson reader (highlights, margin notes, quick-AI panel, dictionary, vocab, exercises, practice); XP/activity basics; dashboard | ✅ done |
| 2 | Vocabulary notebook page (with **images**: paste/drag/upload/URL, compressed with `sharp`), FSRS reviews (`ts-fsrs`), review modes (recognize / recall / cloze / listen / image), progress dashboard (WPM trend, lookup rate, accuracy by question type, heat map), goals and achievements | partly done: notebook (edit/search/grouped), FSRS review (`lib/review.ts`, recognize/recall/cloze/listen), progress page; images on words, goals, achievements still to do |
| 3 | Assistant chat (basic version done: `/assistant`, history in the browser), writing grading with stored band scores (`writings.band_*`), AI cost dashboard | |
| 4 | Reminders (web push, Telegram, email), weekly report, speaking practice with recording + transcription | |

Detailed product design (metrics, motivation features, reader UX): **`docs/ROADMAP.md`**.

---

## 3. Tech stack

| Area | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15** (App Router, React 19, TypeScript strict) | `next start` behind PM2; not `output: standalone` |
| Styling | **Tailwind CSS v4** with CSS-variable theme tokens | tokens in `src/app/globals.css` |
| DB | **MySQL 5.7 / 8.0 or MariaDB 10.4+** via **Drizzle ORM** (`mysql2`) | aaPanel's MySQL in production |
| Validation | **zod** | on every API input and on AI output |
| Auth | Single user: `APP_USERNAME` + scrypt `APP_PASSWORD_HASH`; HS256 JWT cookie (`jose`) | middleware protects every route |
| i18n | **next-intl** (no locale routing; locale from cookie → Accept-Language → `DEFAULT_LOCALE`) | `messages/en.json`, `messages/vi.json` |
| Background work | Separate **worker** process with a job queue stored in MySQL | `src/worker` |
| AI | Any **OpenAI-compatible** chat API (DeepSeek, OpenAI, Gemini OpenAI-compat endpoint, xAI Grok, custom) | own fetch client, no SDK |
| Files | PDF → `unpdf`, DOCX → `mammoth`, ZIP → `fflate`, HTML sanitizing → `sanitize-html`, icons → `sharp` | |
| Process manager | **PM2** (`ecosystem.config.cjs`: `gainee-web`, `gainee-worker`) | |
| Reverse proxy | aaPanel **Nginx** + Let's Encrypt | snippet in `deploy/nginx-aapanel.conf` |
| CI/CD | GitHub Actions: lint → typecheck → build → SSH `scripts/deploy.sh` | `.github/workflows/deploy.yml` |

Node **20.6+** is required (`--env-file`); **22 LTS** is recommended.

---

## 4. Repository map

```
AGENTS.md                ← this file          CLAUDE.md → points here
README.md                ← human-oriented setup & deploy guide
docs/ROADMAP.md          ← product design: metrics, motivation, reader, categories
ecosystem.config.cjs     ← PM2 apps (reads .env itself)
drizzle/                 ← SQL migrations generated from src/db/schema.ts (commit them!)
messages/{en,vi}.json    ← ALL user-facing strings (keys must match in both files)
public/                  ← sw.js (service worker), offline.html, icons/
scripts/
  init-env.sh            ← interactive .env creation on the server
  deploy.sh              ← pull → npm ci → build → migrate → pm2 reload → health check
  _node.sh               ← finds aaPanel's Node install for non-login shells
  make-icons.mjs         ← regenerates PWA/app icons with sharp
  mock-ai.mjs            ← mock OpenAI-compatible server for dev/tests (no API key)
deploy/nginx-aapanel.conf
src/
  middleware.ts          ← auth gate (public: /login, /api/auth/login, /api/health, PWA files)
  app/                   ← pages + API route handlers (see §8)
    layout.tsx           ← <html>, theme init script, NextIntl provider, PWA register
    page.tsx             ← dashboard
    login/ library/ library/[id]/ import/ lessons/[id]/ dictionary/ labels/ settings/ read/demo/
    manifest.ts icon.png apple-icon.png
  components/
    Shell.tsx            ← app frame: desktop sidebar, mobile top bar + bottom tab bar
    nav.ts, NavLinks.tsx ← navigation definition (single source) + rendering
    ThemeSwitcher, LanguageSwitcher, InstallPrompt, PwaRegister, icons.tsx
    lesson/              ← THE READER: LessonReader, ReadPane, Notes (margin), ToolPanel, Panes (vocab/exercises/practice), marks.ts, useAiAsk.ts, Markdown.tsx
    reader/ReaderLookup  ← Kindle-style lookup wrapper (used by /read/demo)
    library/             ← ImportForm, LibraryFilters, DocumentView
    labels/              ← LabelManager, LabelPicker, LabelChip, colors.ts
    settings/            ← AiSettings (providers + routing), ProfileSettings
    DictionaryLookup.tsx, JobsPanel.tsx
  db/
    schema.ts            ← COMPLETE data model (read it before touching data)
    index.ts             ← getDb(): lazy mysql2 pool (utf8mb4, UTC session time zone)
    migrate.ts           ← bundled to dist/migrate.js
  lib/
    ai/                  ← client.ts (chat, chatStream, parseJsonReply, listModels), providers.ts, tasks.ts (task list + presets), prompts.ts
    lessons/             ← generate.ts (prompt + zod schema + validation + retry), queries.ts (reader data)
    documents/           ← create.ts (parse form → paragraphs → lessons → job), process.ts (worker job), queries.ts (library, labels, regenerate, delete)
    text/                ← extract.ts (PDF/DOCX/TXT), clean.ts (paragraph reconstruction), split.ts, match.ts (validation helpers)
    dictionary/          ← normalize.ts (keys + lemma rules), lookup.ts, sanitize.ts
    labels.ts words.ts activity.ts stats.ts profile.ts settings.ts jobs.ts storage.ts
    session.ts password.ts crypto.ts api.ts
  i18n/                  ← config.ts, request.ts (locale resolution), actions.ts (setLocale)
  theme/                 ← config.ts (cookie + no-flash script), server.ts
  worker/                ← index.ts (loop, heartbeat, per-minute tasks), handlers.ts (job types)
  scripts/               ← hash-password.ts, import-dictionary.ts (bundled to dist/)
```

---

## 5. Runtime architecture

```
Browser (desktop / phone / installed PWA)
   │ HTTPS
   ▼
Nginx (aaPanel) ──► gainee-web  (next start, 127.0.0.1:PORT, PM2)
                         │  route handlers / server components
                         ▼
                      MySQL  ◄──────── gainee-worker (node dist/worker.js, PM2)
                         ▲                 • polls `jobs` every 1 s
                         │                 • generate_document (AI lesson generation)
UPLOAD_DIR (files) ◄─────┘                 • heartbeat → settings["worker.heartbeat"]
                                           • everyMinute(): reminders etc. (Phase 4)
AI providers (OpenAI-compatible HTTPS APIs) ◄── called by web (reader Q&A, streaming) and worker (lesson generation)
```

- **Two processes, one codebase.** `npm run build` builds Next.js, then esbuild bundles `dist/worker.js`, `dist/migrate.js`, `dist/hash-password.js` and `dist/import-dictionary.js`, with `mysql2` left external.
- **Job queue** (`src/lib/jobs.ts`):
  - rows in `jobs`, claimed with an optimistic `UPDATE … WHERE status='queued'` (works on MySQL 5.7 without SKIP LOCKED);
  - exponential retry (30 s, 60 s, …);
  - jobs interrupted by a crash are re-queued when the worker starts.
- **Run exactly one worker.**

---

## 6. Data model (src/db/schema.ts)

All tables use `int` auto-increment `id`, `created_at DATETIME(3)` UTC. Key groups:

| Group | Tables | Notes |
|---|---|---|
| Settings | `settings(key, value json)` | keys: `ai.routing`, `profile`, `worker.heartbeat`, `dictionary.<name>` |
| Content | `documents` → `lessons` → `lesson_vocab` | `lessons.paragraphs` json string[]; `lessons.content` json = `LessonContent` (`src/lib/lessons/generate.ts`); `documents.meta` json = AI summary + suggested topics/source (applied only when the user accepts) |
| Categories | `labels(kind topic/source/custom, name, emoji, color, parent_id)`, `document_labels`, `word_labels` | topics nest ≤ 3 levels (checked in code); unique (kind, name), case-insensitive collation |
| Reader | `annotations(lesson_id, paragraph, start_offset, end_offset, quote, prefix, suffix, color, note)`, `ai_messages(action, selection, context, question, answer, pinned, annotation_id)` | offsets are **character offsets in the paragraph's plain text** |
| Vocabulary | `words` (+ FSRS columns), `media`, `word_media`, `review_logs` | words saved from a lesson inherit the document's labels |
| History | `attempts` + `answer_logs(qtype, correct)`, `reading_sessions(wpm, lookups)`, `writings(kind, body, band_*)`, `assessments` | raw data for progress metrics |
| Motivation | `activity(day PK, minutes, xp, reviews, lessons_done, words_added, …)`, `xp_events`, `goals`, `achievements` | `src/lib/activity.ts`: `bumpActivity`, `addXp`, `XP` constants |
| AI | `ai_providers(base_url, api_key_enc, default_model, enabled)`, `ai_calls` (usage log) | keys AES-256-GCM encrypted with `ENCRYPTION_KEY` |
| Dictionary | `dict_entries(dict, headword, lookup_key, html)`, `dict_aliases(lookup_key → entry_id)` | HTML sanitized at import |
| Queue | `jobs(type, payload json, status, attempts, progress, result, error, run_at)` | |

**MySQL compatibility rules (must follow):**
- Use the `jsonText<T>()` custom type for JSON columns. MariaDB returns JSON as a string, and the custom type parses both forms.
- **Do not put DEFAULT values on TEXT or JSON columns**, because MySQL 5.7 rejects them. Set defaults in code instead.
- Use `.$returningId()`, never `.returning()`, which does not exist in MySQL.
- `getDb()` sets the session `time_zone = '+00:00'`. Always store UTC.
- Strings must be utf8mb4; indexed varchar columns are at most 191 characters.
- Drizzle wraps driver errors, so check `cause.code` (see `isDuplicate` in `src/lib/labels.ts`).

**Changing the schema:** edit `src/db/schema.ts`, run `npm run db:generate`, review the generated SQL in `drizzle/`, and commit it. `scripts/deploy.sh` runs migrations automatically. Never edit a migration that is already deployed. (Before the first deploy, all migrations were squashed into `0000_init.sql`.)

---

## 7. Key flows

### 7.1 Auth
- `POST /api/auth/login` compares `{username, password}` against `APP_USERNAME` and the scrypt hash `APP_PASSWORD_HASH`, using constant-time comparison. After 5 failures in 15 minutes from one IP, logins are blocked.
- On success it sets the `rl_session` cookie: an HS256 JWT valid for 30 days, `Secure` when the request came over HTTPS (`x-forwarded-proto`).
- `src/middleware.ts` guards every path except `/login`, `/api/auth/login`, `/api/health` and the PWA files. Unauthenticated API calls get `401 {error:"unauthorized"}`; pages redirect to `/login?next=…`.

### 7.2 i18n and theme
- **Strings:** every user-facing string lives in `messages/en.json` and `messages/vi.json`, and both files must have identical keys. Server components use `getTranslations()`, client components `useTranslations()`. Use ICU syntax for plurals and numbers.
- **Locale:** stored in the `NEXT_LOCALE` cookie and changed through the `setLocale` server action, followed by `router.refresh()`.
- **Theme:** the `rl_theme` cookie holds `light`, `dark` or `system`. `themeInitScript` runs inline in `<head>`, so the page loads without a flash of the wrong theme. Dark mode is the `.dark` class on `<html>`.
- **Colours:** always use the theme tokens (`bg-paper`, `bg-card`, `text-ink`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent`, `text-accent2`, `bg-highlight`). Never use raw `bg-white` or `text-gray-*`. Where a raw palette colour is unavoidable, add a `dark:` variant.

### 7.3 Import → lessons
1. **Form and preview.** `ImportForm` posts multipart data to `/api/documents/preview`, which returns a dry run, and then to `/api/documents` to create the document.
2. **Parsing** (`parseImportForm`, in `lib/documents/create.ts`):
   - `extractFile` turns the input into pages of text;
   - `cleanToParagraphs` drops page numbers and repeated headers/footers, rebuilds paragraphs from line lengths, de-hyphenates only when the joined word appears elsewhere in the text, and merges paragraphs split by page breaks;
   - `splitLessons` splits at paragraph boundaries (at sentence boundaries for very long paragraphs), targeting `profile.lessonWords`.
3. **Saving.** `createDocument` stores the original file under `UPLOAD_DIR/documents/YYYY/MM/uuid.ext`, then inserts the `documents` row (status `processing`), one `lessons` row per part (status `pending`) and any selected labels. Finally it enqueues the job `generate_document {documentId}`.
4. **Generation.** The worker runs `processDocument` (`lib/documents/process.ts`):
   - it first produces an overview (`generateMeta`: summary, CEFR level, suggested topics preferring existing label names, source);
   - then generates each pending lesson with `generateLesson`;
   - progress is written to `jobs.progress` and to each lesson's `status`. The UI (`DocumentView`) polls `GET /api/documents/:id` every 2.5 s.
5. **Retry.** `POST /api/documents/:id/regenerate {lessonIds?}` re-runs generation for failed (or chosen) lessons.

### 7.4 AI lesson generation and validation (`lib/lessons/generate.ts`)
- **Prompts:** the system prompt carries the learner profile (level, target band, explanation language) and the exact JSON shape; the user prompt contains the lesson text inside `<text>` tags.
- **Validation** (`validateLesson`), with helpers in `lib/text/match.ts`:
  - each vocab `match` must appear in the text as a whole word (after normalization); otherwise the `headword` is tried; otherwise the item is dropped;
  - True/False and MCQ items need an `evidence` quote that appears verbatim in the text (parts separated by "…" are checked separately). Items failing the check are dropped;
  - structure sentences and the paraphrase source must be verbatim quotes;
  - gap-fill sentences must contain `______`.
- **Retries:** if fewer than 5 vocab / 3 TFNG / 2 gap items survive, the AI is asked again with the list of problems, up to 3 attempts in total. The best result is kept if it meets a minimum.
- **Context sentences** for vocabulary are computed from the text in code, never taken from the AI.

### 7.5 Reader (`components/lesson/*`)
- **Rendering:**
  - `LessonReader` holds the state (annotations, AI messages, saved words, flash) and the tabs `read | vocab | ex | practice`;
  - `ReadPane` renders each paragraph as segments built by `marks.ts:segments()`. Highlights, vocabulary underlines and the "show in text" flash are flat, non-nested `<span>`s, so `Range.toString()` offsets always equal plain-text offsets. Do **not** insert extra text nodes inside `[data-p]` paragraphs; use CSS `::after` (e.g. the ✎ marker) instead.
- **Interactions:**
  - **Selection** (handled on `selectionchange`, debounced) is clamped to one paragraph and converted to `{paragraph, start, end, quote, context}`. It opens a toolbar with highlight colours, Note, Look up, Ask AI and Save (≤ 4 words). On desktop the toolbar floats above the selection; on mobile it is fixed above the tab bar.
  - **Tap or click** on a highlight opens its note. A tap on a word uses `wordAt()` (caretPositionFromPoint with a caretRangeFromPoint fallback) and opens `ToolPanel` in lookup mode: the lesson vocab card if the word is one, then the offline dictionary, then an "Explain with AI" button.
  - **Quick AI:** `ToolPanel` in AI mode streams from `POST /api/ai/ask`. Actions: explain_word, explain_sentence, grammar, translate, paraphrase, custom, feedback. The response header `x-message-id` gives the stored answer's id. **Pin** creates a purple annotation if needed and links the AI message to it, so it appears in the margin. A model picker can override the route for one question.
- **Margin notes:** on desktop (≥ 1024 px), `MarginNotes` places each card at the vertical position of its highlight and pushes overlapping cards down (ResizeObserver plus a layout effect). On mobile, notes and the tool panel open as bottom sheets.
- **Tracking:**
  - finishing reading posts `{seconds, words, lookups}` to `/api/lessons/:id/reading` (WPM; sessions shorter than 10 s are ignored);
  - exercises post per-question rows to `/api/lessons/:id/attempt`. XP is awarded only on the first attempt;
  - practice texts auto-save to `/api/lessons/:id/writing`;
  - "Mark as done" sends `PATCH /api/lessons/:id {completed}`, which awards XP and counts the lesson in the day's activity.

### 7.6 Offline dictionary
- **Import:** `dist/import-dictionary.js <zip|folder|url> [--name tudien]` reads StarDict files (`.ifo`, `.idx` with 32/64-bit offsets, `.dict(.dz)`, optional `.syn`).
  - It handles both `sametypesequence` and per-field types (h/g/x/m/l/t).
  - It sanitizes the HTML and turns `bword://x` links into `<a data-word="x">`.
  - It inserts in batches of 500 inside one transaction. Re-importing with the same name replaces the old data.
- **Lookup** (`lib/dictionary/lookup.ts`) tries, in order: exact `lookup_key`, then `.syn` alias, then rule-based lemma candidates (`lemmaCandidates`).
- **Data source:** the intended source is `redphx/tudien` (StarDict build). It has **no license** and is compiled from commercial dictionaries. Never commit dictionary data, and keep the repository private.

### 7.7 AI providers and routing
- **Providers:** `ai_providers` stores `base_url` and the encrypted key. Presets for DeepSeek, OpenAI, Gemini (`/v1beta/openai`), xAI and custom are in `lib/ai/tasks.ts`. Model names change often, so the Settings page has a **Test** button that lists models via `GET /models` and sends a 1-token chat.
- **Routing:** `settings["ai.routing"]` maps each task (`lesson_generate`, `reader_quick`, `writing_grade`, `chat`) to `{providerId, model, temperature?, fallback?}`. A task with no route uses the first enabled provider and its default model.
- **Client (`lib/ai/client.ts`):**
  - JSON mode via `response_format: {type: "json_object"}`; if the provider rejects it with a 400 mentioning it, the call is retried without it;
  - the fallback route is tried once if the main one fails;
  - every call is logged in `ai_calls`;
  - `chatStream` parses SSE `data:` lines.
- **Mock server:** `node scripts/mock-ai.mjs` serves a fake AI at `http://127.0.0.1:4010/v1`. Its first lesson attempt deliberately contains a word that is not in the text and a fake quote, so the validation and retry path gets exercised.

### 7.8 Categories (labels)
- `/labels` (`LabelManager`) manages the three kinds of label. `LabelPicker` is used on the import form and the document page.
- AI-suggested topics and source are stored in `documents.meta` and only become labels when the user presses "Add these" (`acceptSuggestions` creates any missing labels).
- The library filters by labels (AND logic) through `?label=1&label=4&q=…`.

---

## 8. HTTP API (all JSON, all behind auth unless noted)

| Method & path | Purpose |
|---|---|
| `POST /api/auth/login` (public), `POST /api/auth/logout` | session |
| `GET /api/health` (public) | DB check, used by `deploy.sh` |
| `GET/POST /api/jobs` | recent jobs / enqueue `ping` (diagnostics) |
| `GET/POST /api/documents`, `POST /api/documents/preview` | list (filters `label`, `q`) / import (multipart: `file` or `text`, `title`, `author`, `source`, `labelIds` JSON) |
| `GET/PATCH/DELETE /api/documents/:id`, `POST /api/documents/:id/regenerate` | detail, edit fields/labels, accept or dismiss suggestions, delete (also deletes the stored file), re-run AI |
| `GET/PATCH /api/lessons/:id` | reader data; `{notes?, completed?}` |
| `POST /api/lessons/:id/annotations`, `PATCH/DELETE /api/annotations/:id` | highlights and notes |
| `POST /api/lessons/:id/attempt`, `/reading`, `PUT /writing` | progress data |
| `POST /api/ai/ask` | **streams plain text**; header `x-message-id` |
| `PATCH/DELETE /api/ai/messages/:id` | pin/unpin (`{pinned, annotationId?}`) |
| `GET/POST /api/ai/providers`, `PATCH/DELETE /api/ai/providers/:id`, `POST /api/ai/providers/:id/test` | providers |
| `GET/PUT /api/ai/routing`, `GET/PUT /api/settings/profile` | settings |
| `GET /api/dictionary?q=` | offline lookup |
| `GET/POST /api/labels` (`{preset:"ielts_topics"}` adds the starter set), `PATCH/DELETE /api/labels/:id` | categories |
| `POST /api/words` (`{lessonVocabId}` or `{term, meaningVi?, context?, note?, lessonId?}`), `DELETE /api/words/:id` | notebook |

**Error convention:** `{ error: "<snake_case_code>" }` with a 4xx status. The UI maps codes to translations (`t.has("errors.<code>")`). Input is validated with zod through `parseBody()` in `lib/api.ts`.

---

## 9. Conventions (follow strictly)

1. **English only** in code, comments, identifiers, file and folder names, commit messages and docs. Vietnamese text appears only in `messages/vi.json` and in AI prompts/outputs meant for the learner.
2. **No hard-coded UI strings.** Add keys to *both* `messages/en.json` and `messages/vi.json`.
3. **Theme tokens only** for colours (§7.2). Check every new UI in light, dark, desktop and a ~390 px-wide phone.
4. **Mobile and PWA:**
   - touch targets at least about 40–44 px (`min-h-10` / `min-h-11`);
   - inputs use `text-base`, so iOS does not zoom in;
   - respect safe areas (`env(safe-area-inset-*)`);
   - fixed bottom UI must sit above the tab bar (`bottom: calc(env(safe-area-inset-bottom) + 4–5rem)`).
5. **Server-side:**
   - validate inputs with zod;
   - route handlers declare `export const runtime = "nodejs"`, plus `dynamic = "force-dynamic"` for reads;
   - pages that read the DB use `export const dynamic = "force-dynamic"`;
   - call `getDb()` lazily, never at module top level, because `next build` has no DB.
6. **Any AI-produced content that is shown as fact** must be validated against the source text, or clearly presented as an AI answer.
7. **Never log or return API keys.** Use `maskKey()` for display.
8. **Keep the worker single-instance.** Long-running work goes into a job type (§10), not into a request handler, apart from streaming chat.
9. **Formatting:** the repo uses ESLint (`next/core-web-vitals`, `next/typescript`). Before finishing, run `npm run lint && npm run typecheck && npm run build`.
10. Every new route under `src/app/api` stays behind auth automatically through the middleware. Only add to `PUBLIC_PATHS` if it is truly public.

---

## 10. How to add things

| Task | Steps |
|---|---|
| **New page** | `src/app/<path>/page.tsx` (server component, wrap in `<Shell>`; use `<Shell wide>` for reading layouts) → add to `src/components/nav.ts` (`phase` marks "coming soon"; `mobileTab` puts it in the bottom bar, max 4) → add `nav.<key>` (and `nav.tab.<key>` if it is a tab) to both message files. |
| **New API route** | `src/app/api/.../route.ts`; parse with `parseBody(req, zodSchema)`; return `NextResponse.json`; errors as `{error:"code"}`. |
| **New table / column** | edit `schema.ts` (follow the MySQL rules in §6) → `npm run db:generate` → commit `drizzle/*`. |
| **New background job** | add a handler in `src/worker/handlers.ts` (`async (job) => result`) → enqueue with `enqueue("type", payload)` from `lib/jobs.ts`; report progress with `setProgress(job.id, "...")`. |
| **New AI task** | add to `AI_TASKS` in `lib/ai/tasks.ts` → add `settings.routing.tasks.<task>.{title,hint}` to both message files → call `chat({ task, ... })` or `chatStream`. |
| **New quick-AI action** | add to `ASK_ACTIONS` and the prompt map in `lib/ai/prompts.ts` and to the `ai_messages.action` enum (+ migration) → add labels under `lesson.tool.actions` and `lesson.notes.actions`. |
| **New exercise type** | extend `AiLesson`/`LessonContent` and the prompt in `lessons/generate.ts` → validate in `validateLesson` → render and grade in `components/lesson/Panes.tsx` (`ExercisesPane`) → log a `qtype` (extend the enum if needed). |
| **New translation language** | add it to `locales` in `src/i18n/config.ts` + `messages/<code>.json`. |

---

## 11. Commands

```bash
npm install
npm run dev               # Next.js dev server (http://localhost:3000)
npm run dev:worker        # worker with tsx watch (reads .env)
npm run build             # next build + esbuild bundles into dist/
npm start                 # next start (production)
npm run worker            # node --env-file=.env dist/worker.js
npm run lint && npm run typecheck
npm run db:generate       # create a migration from schema changes
npm run db:migrate        # apply migrations (needs dist/ – run build:scripts first)
npm run dict:import -- /path/tudien-stardict.zip --name tudien
npm run hash-password -- 'new password'
node scripts/mock-ai.mjs  # fake AI on :4010 for local testing
node scripts/make-icons.mjs
```

Local MySQL quick start:

```sql
CREATE DATABASE gainee CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'gainee'@'localhost' IDENTIFIED BY '...';
GRANT ALL ON gainee.* TO 'gainee'@'localhost';
```

---

## 12. Environment variables (`.env`, see `.env.example`)

| Var | Required | Meaning |
|---|---|---|
| `PORT` | – | web port (default 3000; Nginx proxies to it) |
| `DEFAULT_LOCALE` | – | `en` or `vi`; UI language before the user chooses |
| `TZ` | – | user time zone for streaks and daily stats (default `Asia/Ho_Chi_Minh`) |
| `DATABASE_URL` | ✅ | `mysql://user:pass@127.0.0.1:3306/gainee` (URL-encode the password) |
| `DATABASE_POOL_SIZE` | – | default 5 |
| `APP_USERNAME` | ✅ | login name (case-insensitive) |
| `APP_PASSWORD_HASH` | ✅ | `scrypt:<salt>:<hash>` from `hash-password` |
| `SESSION_SECRET` | ✅ | ≥ 32 characters (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | ✅ | 32 bytes base64 (`openssl rand -base64 32`). **Back it up**: without it, stored AI keys cannot be decrypted |
| `UPLOAD_DIR` | – | file storage *outside* the app folder (default `./data/uploads`) |

---

## 13. Testing and verification

There is no unit-test suite yet. Verify changes like this:
1. `npm run lint && npm run typecheck && npm run build` must all pass.
2. Start MySQL/MariaDB, run `node --env-file=.env dist/migrate.js`, then start the web app and the worker (`pm2 startOrReload ecosystem.config.cjs`, or the dev commands).
3. `node scripts/mock-ai.mjs`. In **Settings**, add a provider: *Custom*, base URL `http://127.0.0.1:4010/v1`, any key of 8+ characters, model `mock`. Press **Test**; it should report "OK" and 2 models.
4. Import a PDF in **Add new text**. All lessons should become *Ready* within seconds, and no vocab word `flibbertigibbet` should survive validation.
5. In a lesson, check:
   - tap a word → dictionary panel;
   - select text → highlight / note (the margin card is aligned with its line);
   - Ask AI → streamed answer → Pin → purple highlight with the AI card;
   - exercises → "Show in text" flashes the quote;
   - Practice → AI feedback;
   - phone width → bottom sheets.
6. Useful SQL checks: `annotations`, `ai_messages` (`pinned`, `annotation_id`), `attempts`/`answer_logs`, `words`/`word_labels`, `activity`, `xp_events`, `ai_calls`.

Browser automation (Playwright) was used during development but is not committed. If you add tests, put them under `tests/` and document them here.

---

## 14. Deployment (aaPanel, production)

Short version; the full step-by-step guide is in README.md.

1. **aaPanel:** install Nginx, MySQL 8 and the Node.js version manager (Node 22). Create the database `gainee` (utf8mb4). Create a site for the domain and enable SSL (Let's Encrypt, force HTTPS).
2. **Code:** `git clone` the private repo to `/www/wwwroot/gainee`, then run `bash scripts/init-env.sh`, which asks for DB credentials and the login name/password and generates the secrets.
3. **Start:** `bash scripts/deploy.sh --no-pull`, which installs dependencies, builds, migrates, starts the PM2 apps and checks `/api/health`. Then run `pm2 startup` once.
4. **Nginx:** paste `deploy/nginx-aapanel.conf` into the site config (proxy to `127.0.0.1:PORT`, `client_max_body_size 30m`, 300 s timeouts, buffering off for streaming).
5. **Optional, the dictionary:** `node --env-file=.env dist/import-dictionary.js /tmp/tudien.zip --name tudien`.
6. **Automatic deploys:** set the GitHub secrets `SERVER_HOST`, `SERVER_USER`, `SERVER_SSH_KEY` (plus optional `SERVER_PORT` and `APP_DIR`). Every push to `main` runs CI and then `scripts/deploy.sh` over SSH.
7. **Backups:** create aaPanel cron jobs for "Backup Database" (`gainee`) and "Backup Directory" (`UPLOAD_DIR`).

The PWA needs HTTPS. If you change caching in `public/sw.js`, bump `VERSION` in that file.

---

## 15. Known limitations / gotchas

- **Scanned PDFs** (images only) have no text, and import fails with `no_text_in_pdf`. OCR is not implemented.
- **PDF paragraph reconstruction is heuristic.** Front matter (section headers, bylines, URLs) can end up in lesson 1.
- **Reader offsets:** annotations store paragraph offsets. If lesson text is ever re-generated or edited, use `quote` + `prefix`/`suffix` to re-anchor (not implemented yet, because lesson text never changes after import).
- **Rate limiting** of login attempts is in memory and resets on restart. That is acceptable for a single user.
- **Request size:** `next start` route handlers accept large multipart uploads. Nginx limits them to 30 MB, and the app to 25 MB (`MAX_UPLOAD_BYTES`).
- **iOS text selection:** the native callout appears above the selection, which is why the app's own toolbar sits at the bottom on mobile.
- **Gemini / xAI:** their exact model names and JSON-mode support change over time. Use the Test button, and set a fallback route for `lesson_generate`.
