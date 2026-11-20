# ReadLearn

A personal (single-user) web app for learning English through reading. It turns articles into IELTS-style lessons with vocabulary, exercises and spaced repetition, tracks your progress and keeps you motivated. It works with DeepSeek, ChatGPT, Gemini and Grok.

- **UI languages:** English and Vietnamese, switchable with the EN / VI toggle
- **Stack:** Next.js 15 · TypeScript · Tailwind · Drizzle ORM · MySQL / MariaDB · PM2
- **Hosting target:** aaPanel (Nginx + MySQL + Node.js manager); works on any Linux server with Node 20.6+ and MySQL

**Status:** Phase 0 (foundation) is done. Next up is Phase 1: importing texts and generating lessons with AI. See [docs/ROADMAP.md](docs/ROADMAP.md).

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
| `src/worker` | Background worker: job handlers and per-minute tasks |
| `drizzle/` | SQL migrations, generated from the schema |
| `scripts/` | `init-env.sh`, `deploy.sh` |
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
#   APP_PASSWORD_HASH → npm run -s hash-password -- yourpassword
npm run build:scripts && npm run db:migrate
npm run dev           # http://localhost:3000
npm run dev:worker    # second terminal
```

After you change `src/db/schema.ts`, run `npm run db:generate` to create a new migration file, then commit it.

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

### 6. Backups (aaPanel)
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
| Change login password | `node dist/hash-password.js` → put the result in `APP_PASSWORD_HASH` in `.env` → restart |
| Change default language | `DEFAULT_LOCALE=en` or `vi` in `.env` → restart |
