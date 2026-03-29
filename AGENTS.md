# Smart Grocery Assistant (Minsk)

## Goal
Design and implement a 24/7 Telegram grocery assistant and promo channel for Minsk with zero monthly infrastructure budget.

## Current Stage
Telegram bot webhook worker implementation on top of live-validated parsers, Turso schema, and repository layer.

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
- Parser adapters: `src/parsers/`
- Database schema: `src/db/schema.ts`
- Database repositories: `src/db/repositories.ts`
- Bot worker: `src/apps/bot-worker/index.ts`
- Parser worker: `src/apps/parser-worker/index.ts`
- Drizzle config: `drizzle.config.ts`
- Store API notes: `docs/api_map.md`
- Project memory: `docs/`
- Master execution anchor: `EXECUTION_PLAN.md`
- Research knowledge map: `docs/RESEARCH_LOG.md`

## Working Rules
- Read project memory in this order: `AGENTS.md` -> `docs/STATE.md` -> `docs/state.json` -> `docs/EXEC_PLAN.md` -> recent `docs/PROJECT_HISTORY.md` -> `docs/DECISIONS.md`
- Update memory after every meaningful step.
- Use `docs/RESEARCH_LOG.md` for internet-backed findings and freshness tracking.
