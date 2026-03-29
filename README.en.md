# Smart Grocery Assistant (Minsk)

[Русская версия](./README.md)

A Telegram grocery assistant and promo-channel backend focused on Minsk: price discovery, budget basket building, and ingredient/composition analysis.

Author: `AI_Nikitka93`

## Current capabilities

- JSON parsers for `Green`, `Edostavka`, `Gippo`, and `Emall`
- Turso/libSQL schema powered by Drizzle ORM
- `parser-worker` for shard-based scheduled price ingestion
- `bot-worker` for Telegram webhook handling, inline mode, and AI-assisted replies
- project memory and execution planning docs for continued autonomous development

## Stack

- Cloudflare Workers
- TypeScript
- Turso (libSQL / SQLite)
- Drizzle ORM + drizzle-kit
- Telegram Bot API
- Groq API

## Project layout

```text
.
├── AGENTS.md
├── ARCHITECTURE.md
├── EXECUTION_PLAN.md
├── drizzle.config.ts
├── docs/
│   ├── DECISIONS.md
│   ├── EXEC_PLAN.md
│   ├── PROJECT_HISTORY.md
│   ├── PROJECT_MAP.md
│   ├── RESEARCH_LOG.md
│   ├── STATE.md
│   ├── api_map.md
│   └── state.json
└── src/
    ├── apps/
    │   ├── bot-worker/
    │   └── parser-worker/
    ├── db/
    └── parsers/
```

## Core use cases

- find the cheapest store for a specific product;
- build a grocery basket within a user budget;
- analyze product compositions and ingredients;
- publish strong deals to a Telegram promo channel;
- return fast inline product cards in any Telegram chat.

## Status

The project is under active engineering development. The core architecture, parser layer, database schema, parser-worker, and the first Telegram bot-worker are already implemented. Next milestones are `wrangler` bindings, local smoke tests for webhook/scheduled flows, and the deployment path.

## Quick start

The full bootstrap flow is still being finalized, but the current baseline is:

```bash
npm install
npx drizzle-kit push
```

Required bindings/secrets:

- `BOT_TOKEN`
- `WEBHOOK_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GROQ_API_KEY`

## Documentation

- Architecture: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Project map: [docs/PROJECT_MAP.md](./docs/PROJECT_MAP.md)
- Project history: [docs/PROJECT_HISTORY.md](./docs/PROJECT_HISTORY.md)
- Key decisions: [docs/DECISIONS.md](./docs/DECISIONS.md)
- Research log: [docs/RESEARCH_LOG.md](./docs/RESEARCH_LOG.md)

## License

This project is licensed under the Apache License 2.0. See [LICENSE](./LICENSE) for details.

Copyright 2026 Nikita (AI_Nikitka93)
