# ReadLearn – Roadmap & product design

## Phases

| Phase | Scope | Status |
|---|---|---|
| **0 – Foundation** | Next.js, MySQL + Drizzle, username + password login, EN/VI UI, light/dark theme, mobile layout + PWA (iOS & Android), offline StarDict dictionary, job queue + worker, PM2, aaPanel deploy, CI/CD | ✅ done |
| **1 – Texts → lessons + reader** | AI provider settings (all 4 providers, model per task); import (paste / PDF / DOCX / TXT); clean & split into ~500–800-word lessons; AI generates summary, vocabulary, TFNG / MCQ / gap / matching, structures, paraphrase, speaking/writing prompts, validated against the source text; **reader with margin notes, dictionary pop-up and quick-AI panel** (see below); exercises with explanations | next |
| **2 – Vocabulary, progress, motivation** | Notebook with **images** and mnemonics; FSRS reviews in several modes; progress dashboard; streaks, XP, goals, achievements; "then vs. now" | |
| **3 – Assistant & writing** | Fallback provider, cost dashboard, Writing Task 2 grading by criterion, free chat about a text | |
| **4 – Reminders, mobile, speaking** | PWA install + web push; Telegram / email reminders; weekly report; speaking practice (record → transcript → feedback) | |

---

## Progress tracking – measure skills, not just activity

Activity shows that you are showing up. Skill metrics show that you are actually improving. The dashboard shows both, and the schema records the raw data for every metric below.

### Skill metrics (are you improving?)

| Metric | How it is computed | Data |
|---|---|---|
| **Effective reading speed** | Words per minute, counted only for sessions where the exercise score is ≥ 70%, so speed never comes at the cost of understanding | `reading_sessions`, `attempts` |
| **Lookup rate** | Words looked up per 1,000 words read. A falling line means your passive vocabulary is growing, so you understand more without help | `reading_sessions.lookups` |
| **Accuracy by question type** | Rolling 30-day accuracy for TFNG, MCQ, gap fill and matching. The weakest type is highlighted and suggested as today's focus | `answer_logs` |
| **Vocabulary size** | Words learned and *mature* words (FSRS stability > 21 days); new vs. mature words over time | `words` |
| **Retention rate** | Share of reviews answered Good or Easy (target about 85–90%) | `review_logs` |
| **Writing band trend** | AI band per IELTS criterion (TR, CC, LR, GRA) over time, with the most frequent error types | `writings` |
| **Estimated reading band** | A band range converted from recent reading accuracy, clearly labelled as an estimate | `answer_logs` |

### Monthly check-up (objective before vs. after)

Once a month the app offers a 20-minute check-up:
- a fixed-format reading test;
- a vocabulary-size test;
- one Writing Task 2 essay.

Results go into `assessments` and are plotted as one line per skill. This answers the question "Am I better than last month?" with numbers, not feelings.

### "Then vs. now"

- **Re-read challenge:** after 4–8 weeks, re-read an early lesson. The app compares reading speed, lookups and score with your first attempt on the same text.
- **Your first highlighted paragraph:** the words you had to look up in your first lesson are shown next to how many of them you now know.

---

## Motivation

The rules behind these features: small daily wins, visible progress, and no all-or-nothing pressure.

- **Today's plan card:** one tap starts a concrete plan, for example "15 reviews + 1 lesson ≈ 20 minutes".
- **Daily goal + streak:** set in minutes or XP. One *streak freeze* per week, so one missed day does not reset everything (`activity.freeze_used`).
- **Activity heat map:** a year view, GitHub-style.
- **XP for learning actions, not clicks:** finished lessons, correct answers, reviews and essays earn XP; a perfect score earns a bonus (`xp_events`).
- **Levels and achievements:**
  - first 100 / 500 / 1,000 words;
  - 7- / 30- / 100-day streaks;
  - first band 7 in Writing;
  - 10 articles finished;
  - new reading-speed record.
- **Personal records:** fastest effective WPM, longest streak, best exercise score.
- **Exam countdown:** target band and exam date (`goals`), with the weekly effort needed to get there.
- **Daily reflection:** one line on "What did I learn today?" plus an optional mood rating (`activity.reflection`, `activity.mood`). Reading these back later is surprisingly motivating.
- **Weekly report (Phase 4):** sent every Sunday by Telegram or email, covering what you did, what improved and next week's focus.
- **Word of the day:** a random mature word from your own notebook, with its image.

---

## Vocabulary images

- **How to add an image to a word:**
  - paste it with **Ctrl/⌘ + V** while editing the word (screenshots and copied images both work);
  - drag and drop it onto the word;
  - upload a file;
  - paste an image URL, and the server downloads the image.
- **Processing:** the server checks the file type, then resizes and compresses the image to WebP (max 800 px) with `sharp`. Files are stored under `UPLOAD_DIR/images/YYYY/MM/<uuid>.webp` and served only to the logged-in user through `/api/media/:id`.
- **Data model:** a word can have several images with captions (`media`, `word_media`). Each word also has a `mnemonic` field for a personal memory hook.
- **Review modes:** *image → word* (recall), *word → meaning + image*, *cloze* with the original sentence, *listen → spell*.
- **Later (optional):** image search via the Unsplash or Pixabay API, AI-generated images, and AI-suggested mnemonics.

---

## Reader (Phase 1)

The reader keeps everything on one screen, so you never have to switch tabs while reading.

```
┌──────────── text (serif, adjustable size) ────────────┬──── right panel ────┐
│ … she carried herself with an [air of easy command] … │ 💬 Note             │
│                                                       │  "confident without │
│                                                       │   trying – use in   │
│                                                       │   Speaking P2"      │
│                                                       │ ─────────────────── │
│                                                       │ 📖 Dictionary       │
│                                                       │ ✨ Ask AI           │
└───────────────────────────────────────────────────────┴─────────────────────┘
```

**Selecting text** opens a small toolbar: **Highlight** (5 colours) · **Note** · **Look up** · **Ask AI** · **Save word**.

- **Margin notes (Google Docs style):** notes appear in the right panel, lined up with their highlight. Clicking a highlight scrolls to its note, and clicking a note flashes its highlight. Notes are saved automatically. Each note is stored in `annotations` with paragraph, start/end offsets and the quoted text plus a little context, so it stays attached even if the text is edited. A search box filters all notes in the lesson.
- **Dictionary first, AI second:** *Look up* shows the offline dictionary entry in the panel instantly, with no API call. An **"Explain more with AI"** button sits under every entry, for when the dictionary is not enough.
- **Quick-AI panel:** one-tap actions for the selection:
  - *Explain word in context*
  - *Explain sentence*
  - *Grammar / structure*
  - *Translate*
  - *Paraphrase (IELTS)*
  - a free question box

  The AI receives the selection, its sentence and its paragraph. Answers stream into the panel. Each answer can be **pinned** to the margin like a note, or turned into a vocabulary card. Everything is saved in `ai_messages`, so you can search old answers later.
- **Model per task:** the quick-AI panel uses the `reader_quick` route from `ai.routing` (`src/lib/ai/tasks.ts`). In Settings you choose the provider and model for each task, e.g. a cheap DeepSeek model for quick questions, and a stronger model for lesson generation and writing feedback. A small model picker in the panel lets you override it for one question.
- **Mobile:** the right panel becomes a bottom sheet. On phones, selecting text pops up the same toolbar. Tapping a highlight opens its note in the sheet.
