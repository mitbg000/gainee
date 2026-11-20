# ReadLearn

A personal (single-user) web app for learning English through reading. It turns articles into IELTS-style lessons with vocabulary, exercises and spaced repetition, tracks your progress and keeps you motivated. It works with DeepSeek, ChatGPT, Gemini and Grok.

- **UI languages:** English and Vietnamese, switchable with the EN / VI toggle
- **Light / dark / system theme**, a mobile-first layout, and installable as an app (PWA), including on iPhone/iPad
- **Offline English–Vietnamese dictionary** (StarDict import) with **Kindle-style look-up**: tap a word or select a phrase while reading. AI is only used when you ask for a deeper explanation
- **Your own categories** for texts and words: nested topics, sources and custom labels
- **Stack:** Next.js 15 · TypeScript · Tailwind · Drizzle ORM · MySQL / MariaDB · PM2
- **Hosting target:** aaPanel (Nginx + MySQL + Node.js manager); works on any Linux server with Node 20.6+ and MySQL

**Status:** Phases 0 and 1 are done. You can import texts, have AI lessons generated and validated, and use the full reader with margin notes, quick AI and the offline dictionary. Next up is Phase 2: the vocabulary notebook with images, spaced repetition and the progress dashboard. See [docs/ROADMAP.md](docs/ROADMAP.md).

> **For AI coding agents:** read [`AGENTS.md`](AGENTS.md). It is the complete technical guide.

## What you can do

- **Import** a PDF, DOCX or TXT file, or paste text, with a preview of how it will be split. The text is cleaned up and split into ~650-word lessons.
- **AI lessons:** each lesson gets a Vietnamese summary, 8–12 vocabulary items, True/False/Not Given, multiple choice, gap fill, useful sentence structures, paraphrase practice and a speaking/writing prompt. Every item is checked against the original text.
- **Reader:**
  - tap a word for the offline dictionary;
  - select text to **highlight**, write a **margin note**, **look it up** or **ask the AI** (explain word or sentence, grammar, translate, paraphrase, or your own question), then **pin** the AI answer to the margin;
  - reading timer with words-per-minute;
  - "show in text" for exercise answers.
- **Practice:** auto-saved paraphrase and speaking/writing answers, with AI feedback.
- **Library:** filter by your own categories (topics, sources, labels); the AI suggests topics and the source.
- **AI settings:** DeepSeek, OpenAI, Gemini, Grok or any OpenAI-compatible API. Choose a model for each task, with an automatic fallback.
- **Dashboard:** "continue reading", day streak and XP.

---

## Architecture

```
Browser ─► Nginx (aaPanel, HTTPS) ─► readlearn-web  (Next.js, PM2) ─┐
                                                                     ├─► MySQL (aaPanel)
                                     readlearn-worker (PM2) ─────────┘
                                     └─ background jobs: AI lesson generation, reminders, reports
Files (word images, PDFs, audio) ─► UPLOAD_DIR (outside the app folder)
```

| Path | Purpose |
|---|---|
| `src/app` | Pages and API routes (App Router) |
| `src/db/schema.ts` | Full data model, including tables for later phases |
| `src/i18n`, `messages/*.json` | Translations (`en`, `vi`) and locale detection |
| `src/lib` | Auth (session, password), API-key encryption, job queue, settings |
| `src/lib/labels.ts`, `src/components/labels` | Categories (topics / sources / labels) |
| `src/components/reader` | Reader components (Kindle-style look-up) |
| `src/lib/dictionary` | Offline dictionary: normalization, lemma rules, lookup, HTML sanitizer |
| `src/lib/ai/tasks.ts` | Per-task AI routing (provider + model for each feature) |
| `src/theme` | Light/dark theme cookie + no-flash init script |
| `src/app/manifest.ts`, `public/sw.js` | PWA manifest and service worker |
| `src/worker` | Background worker: job handlers and per-minute tasks |
| `drizzle/` | SQL migrations, generated from the schema |
| `scripts/` | `init-env.sh`, `deploy.sh`, `make-icons.mjs` |
| `deploy/nginx-aapanel.conf` | Reverse-proxy block for aaPanel |
| `ecosystem.config.cjs` | PM2 config (web + worker) |

---

## Local development

You need Node 22 and a MySQL or MariaDB database (utf8mb4).

```bash
npm install
cp .env.example .env              # set DATABASE_URL, then add secrets:
#   SESSION_SECRET  → openssl rand -hex 32
#   ENCRYPTION_KEY  → openssl rand -base64 32
#   APP_USERNAME      → your login name
#   APP_PASSWORD_HASH → npm run -s hash-password -- yourpassword
npm run build:scripts && npm run db:migrate
npm run dev           # http://localhost:3000
npm run dev:worker    # second terminal
```

After you change `src/db/schema.ts`, run `npm run db:generate` to create a new migration file, then commit it.

### Trying it without an AI key

```bash
node scripts/mock-ai.mjs     # fake OpenAI-compatible server on http://127.0.0.1:4010/v1
```
In **Settings → AI providers → Add**, choose *Custom*, use the base URL `http://127.0.0.1:4010/v1`, any key and the model `mock`. Lessons are then generated instantly from the text itself, which is useful for testing the whole flow.

### Adding or editing UI text

Every string the user sees lives in `messages/en.json` and `messages/vi.json`, and both files must have the same keys. Use them with `useTranslations()` in client components or `getTranslations()` in server components.

---

## Deploy on aaPanel

### 1. Prepare aaPanel
1. **App Store:** install **Nginx**, **MySQL 8.0** (5.7 and MariaDB 10.4+ also work), and the **Node.js version manager**. In the Node.js version manager, install **Node 22 LTS** and set it as the command-line version.
2. **Databases → Add database:**
   - name: `readlearn`
   - user: `readlearn`
   - a strong password
   - charset **utf8mb4**
3. **Website → Add site:** enter your domain (e.g. `learn.example.com`) and choose *Static / no database*. Then open the site's **SSL** tab, request a **Let's Encrypt** certificate, and turn on *Force HTTPS*.
4. Make sure the domain's DNS **A record** points to the server IP.

> Menu names can differ slightly between aaPanel versions.

### 2. Get the code
Push this project to a **private GitHub repo**. Then connect to the server via SSH (or the aaPanel Terminal):

```bash
ssh-keygen -t ed25519 -C readlearn-server      # add ~/.ssh/id_ed25519.pub to GitHub → repo → Settings → Deploy keys
git clone git@github.com:<you>/readlearn.git /www/wwwroot/readlearn
cd /www/wwwroot/readlearn
bash scripts/init-env.sh                       # asks for DB details + login password, generates secrets
```

⚠️ Keep a copy of `ENCRYPTION_KEY` from `.env` somewhere safe. Without it, the AI keys stored in the app cannot be decrypted.

### 3. Build and start
```bash
bash scripts/deploy.sh --no-pull
pm2 startup          # once: start PM2 automatically after a reboot (run the command it prints)
```
`deploy.sh` installs dependencies, builds the app, runs the database migrations, (re)starts both PM2 processes and checks `/api/health`.

### 4. Point Nginx at the app
Open **Website → your site → Config**. Paste the contents of `deploy/nginx-aapanel.conf` inside the `server { … }` block and keep aaPanel's own SSL lines. If you changed `PORT` in `.env`, change `3000` in the block to match. Save, then open `https://learn.example.com`.

> **Alternative:** aaPanel's built-in *Reverse proxy* tab, pointing to `http://127.0.0.1:3000`, also works. If you use it, add `client_max_body_size 30m;` and a 300-second `proxy_read_timeout`.

### 5. Automatic deploys (recommended)
In GitHub, open **Settings → Secrets and variables → Actions** and add:

| Secret | Value |
|---|---|
| `SERVER_HOST` | server IP |
| `SERVER_USER` | SSH user (e.g. `root`) |
| `SERVER_SSH_KEY` | private key of a key pair used **only** by GitHub Actions; add its public key to that user's `~/.ssh/authorized_keys` |
| `SERVER_PORT` | *(optional)* SSH port, default 22 |
| `APP_DIR` | *(optional)* default `/www/wwwroot/readlearn` |

From then on, every push to `main` runs lint, type-check and build in CI, then deploys to the server.

### 6. Offline dictionary (recommended)
Download the **StarDict** version of the dictionary (for example `tudien-stardict-en-vi.zip` from
[redphx/tudien releases](https://github.com/redphx/tudien/releases)) to the server, then import it:

```bash
cd /www/wwwroot/readlearn
wget -O /tmp/tudien.zip "<link to the StarDict .zip from the release page>"
node --env-file=.env dist/import-dictionary.js /tmp/tudien.zip --name tudien
```

The importer reads `.ifo`, `.idx`, `.dict(.dz)` and the optional `.syn` file (inflections such as *remembered → remember*). It cleans the HTML, keeps cross-reference links clickable, and loads everything into the `dict_entries` and `dict_aliases` tables. If you import again with the same `--name`, the old copy is replaced. It accepts a `.zip` file, a folder, or a URL.

Look-ups try three things in order: the exact headword, then a StarDict alias, then simple English lemma rules (*studies → study*, *stopped → stop*). None of this calls the AI.

> The tudien repository has no license file, and its content is compiled from several commercial dictionaries. Keep it for personal use, and do not commit the data to a public repository.

### 7. Backups (aaPanel)
Go to **Cron → Add task**:
- **Backup Database** → `readlearn`, daily, keep 14 copies. If you use aaPanel's cloud-storage plugins, choose a remote target.
- **Backup Directory** → your `UPLOAD_DIR` (word images, PDFs, audio), daily or weekly.

---

## Day-to-day operations

| Task | Command (in `/www/wwwroot/readlearn`) |
|---|---|
| Status | `pm2 ls` |
| Logs | `pm2 logs readlearn-web` / `pm2 logs readlearn-worker` |
| Restart | `pm2 reload ecosystem.config.cjs --update-env` |
| Update manually | `bash scripts/deploy.sh` |
| Change login name | edit `APP_USERNAME` in `.env` → restart |
| Change login password | `node dist/hash-password.js` → put the result in `APP_PASSWORD_HASH` in `.env` → restart |
| Re-import / update dictionary | `node --env-file=.env dist/import-dictionary.js <zip> --name tudien` |
| Change default language | `DEFAULT_LOCALE=en` or `vi` in `.env` → restart |

---

## Install on phones (PWA)

The app must be served over **HTTPS** (aaPanel SSL) to be installable.

- **iPhone / iPad (Safari):** tap **Share → Add to Home Screen**. The app then opens full screen with its own icon. The dashboard shows these instructions automatically on iOS.
- **Android (Chrome) / desktop Chrome & Edge:** an **Install** button appears on the dashboard (or use the browser menu → *Install app*).

The service worker (`public/sw.js`) caches static assets and recently visited pages. If you go offline, you get a friendly offline page instead of an error. API data is never cached. After changing caching rules, bump `VERSION` in `sw.js`.
