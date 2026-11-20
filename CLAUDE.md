# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It is the complete guide to this repository: product, architecture, data model, flows, API, conventions, commands, deployment.

Non-negotiable rules (details in AGENTS.md §9):

- English only in code, comments, file names and docs. Every user-facing string goes in **both** `messages/en.json` and `messages/vi.json`.
- Use theme tokens (`bg-card`, `text-muted`, `border-line`, `bg-accent`, `text-on-accent` …), never raw `bg-white` / `text-gray-*`. Check light + dark + phone width.
- Follow the MySQL compatibility rules for the schema: the `jsonText` type, no DEFAULT on TEXT/JSON, `$returningId()`, UTC. After any schema change, run `npm run db:generate` and commit `drizzle/`.
- Validate every API input with zod, and validate AI output against the source text.
- Never expose API keys. Keep the worker single-instance. Put long tasks into jobs.
- Before finishing: `npm run lint && npm run typecheck && npm run build`.
- For local AI testing without keys: `node scripts/mock-ai.mjs` (AGENTS.md §13).
