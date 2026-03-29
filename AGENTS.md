# Smart Grocery Assistant (Minsk)

## Goal
Design and implement a 24/7 Telegram grocery assistant and promo channel for Minsk with zero monthly infrastructure budget.

## Current Stage
Infrastructure scaffold for deploying `bot-worker` on Cloudflare Workers and running `parser-worker` from GitHub Actions.

## Expected Stack
- Runtime: TypeScript on Cloudflare Workers
- Bot/API: Telegram webhook worker
- Parsing workers: scheduled Cloudflare Worker shards
- Database: Turso Free (libSQL/SQLite managed)
- ORM / migrations: Drizzle ORM + drizzle-kit
- LLM: Groq API by default, OpenRouter as optional fallback
- Deployment: zero-cost serverless cloud services

## Main Artifacts
- Public repository: `https://github.com/AI-Nikitka93/minsk-smart-groceries`
- Architecture document: `ARCHITECTURE.md`
- Russian README: `README.md`
- English README: `README.en.md`
- License: `LICENSE`
- Bot identity pack: `docs/BOT_IDENTITY.md`
- Cloudflare config: `wrangler.toml`
- Node bootstrap: `package.json`, `tsconfig.json`
- GitHub Actions workflow: `.github/workflows/parser.yml`
- Parser adapters: `src/parsers/`
- Database schema: `src/db/schema.ts`
- Database repositories: `src/db/repositories.ts`
- Bot worker: `src/apps/bot-worker/index.ts`
- Parser worker: `src/apps/parser-worker/index.ts`
- Parser CLI adapter: `src/apps/parser-worker/cli.ts`
- Drizzle config: `drizzle.config.ts`
- Store API notes: `docs/api_map.md`
- Project memory: `docs/`
- Master execution anchor: `EXECUTION_PLAN.md`
- Research knowledge map: `docs/RESEARCH_LOG.md`

## Working Rules
- Read project memory in this order: `AGENTS.md` -> `docs/STATE.md` -> `docs/state.json` -> `docs/EXEC_PLAN.md` -> recent `docs/PROJECT_HISTORY.md` -> `docs/DECISIONS.md`
- Update memory after every meaningful step.
- Use `docs/RESEARCH_LOG.md` for internet-backed findings and freshness tracking.
