# Project Map

## Goal
Smart Grocery Assistant for Minsk: Telegram bot plus Telegram channel that tracks grocery prices, builds baskets under budget, evaluates product composition, and publishes major discounts.

## Primary Modules
- `bot-worker`: Telegram webhook runtime and conversational flows.
- `parser-worker`: scheduled collection of catalog and price data.
- `src/db/schema.ts`: Drizzle ORM schema for Turso/libSQL current state, append-only history, publication dedupe, parser cursors, and user settings.
- `src/db/repositories.ts`: idempotent Drizzle write-path for product/offer upserts, append-only price history, and parser cursor orchestration.
- `src/apps/bot-worker/index.ts`: Cloudflare fetch worker that validates Telegram webhook secrets, queries Turso for offers, calls Groq for smart replies, and serves inline mode results.
- `src/apps/parser-worker/index.ts`: Cloudflare scheduled worker that claims one shard from `parser_cursor`, invokes the right store adapter, and persists results.
- `src/apps/parser-worker/cli.ts`: Node.js adapter that invokes the scheduled parser logic directly for GitHub Actions cron runs.
- `wrangler.toml`: bot-worker deployment config for Cloudflare Workers.
- `.github/workflows/parser.yml`: hourly parser execution on GitHub Actions with Turso secrets.
- `package.json` / `tsconfig.json`: minimal Node bootstrap for local typecheck and parser CLI execution.
- `drizzle.config.ts`: code-first migration config for `drizzle-kit push`.
- `src/parsers/green.ts`: direct Green JSON adapter over `/api/v1/*`.
- `src/parsers/edostavka.ts`: Next.js storefront JSON adapter over `/_next/data/{buildId}/...json`.
- `src/parsers/gippo.ts`: guest REST adapter over `app.willesden.by/api/guest/*` with `market_id`.
- `src/parsers/emall.ts`: Next.js storefront JSON adapter over `/_next/data/{buildId}/...json`.
- `src/parsers/shared.ts`: Cloudflare-safe fetch, retry, and normalization helpers.
- `channel-publisher`: automated promo posts to Telegram channel.
- `product-normalizer`: canonical product identity, unit normalization, and store mapping.
- `pricing-history`: current offer state plus append-only price timelines.
- `search-read-model`: search, filter, pagination, and cache-friendly read paths.
- `advisory-engine`: basket optimization and composition analysis.
- `ops-observability`: logs, health checks, exports, and admin controls.

## External Dependencies
- Grocery sites: `green-dostavka.by`, `edostavka.by`, `gippo-market.by`, `emall.by`
- Telegram Bot API
- Cloudflare Workers Free
- GitHub Actions (public repository cron execution)
- Turso Free
- Drizzle ORM / drizzle-kit
- `@libsql/client`
- Groq API Chat Completions
- OpenRouter (optional fallback)
- Optional Cloudflare R2
- Next.js storefront JSON routes for `edostavka.by` and `emall.by`
- `app.willesden.by/api/guest/*` for Gippo

## Scope
- 24/7 cloud-hosted operation with zero monthly budget.
- Parser and bot are separate runtime components.
- Telegram runtime is webhook-only and edge-compatible: native `fetch` to Bot API, no Node-only bot SDK.
- Parsing should avoid heavyweight browser automation by default.
- Architecture must respect Cloudflare free-tier limits, especially HTTP worker constraints, while moving parser scheduling to GitHub Actions cron.

## Main Risks
- Free-tier service suspensions or sleep policies.
- Site anti-bot protections or unstable private APIs.
- Next.js `buildId` churn on `edostavka.by` and `emall.by`.
- `market_id` drift on Gippo when default market changes.
- Over-indexing on SQLite/libSQL can inflate write cost if ingestion cadence becomes too aggressive.
- If shard selection and cursor locking drift, some categories can lag or be processed more often than others.
- LLM free-tier exhaustion or provider throttling.
- GitHub Actions secret drift or cron overlap can stall parser ingestion.
- Data quality drift from changing product names and package sizes.
- Duplicate promo publication or stale data being shown as fresh.
