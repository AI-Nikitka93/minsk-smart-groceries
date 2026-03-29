# Decisions

## 2026-03-29 - Project memory is mandatory from day zero
- Decision: Maintain root-level project memory and a machine-readable state file from project start.
- Why: The project is intended for autonomous execution, multi-step architecture work, and later engineering handoff.
- Impact: Every meaningful step must update `docs/STATE.md`, `docs/state.json`, and `docs/PROJECT_HISTORY.md`.

## 2026-03-29 - Use split serverless modular monolith
- Decision: Implement the system as one shared modular codebase with two deployables: `bot-worker` and `parser-worker`.
- Why: This preserves clear runtime separation while keeping domain rules, schema, and read models in one coherent system under free-tier limits.
- Impact: No microservice split is needed before real scale appears.

## 2026-03-29 - Use Turso as primary database
- Decision: Use Turso Free as the primary relational store for `current_offer`, `price_history`, and read models.
- Why: Cloudflare D1 Free is attractive operationally but its `100,000 rows written/day` cap is tighter for multi-store price history and indexed writes.
- Impact: Database access goes over HTTP/libSQL, and schema should stay SQLite-friendly.

## 2026-03-29 - Use Gemini 2.5 Flash-Lite for advice
- Decision: Use `gemini-2.5-flash-lite` as the only LLM dependency for composition analysis and conversational explanations.
- Why: It has a free tier, is current, and avoids the deprecation risk of Gemini 2.0 Flash-Lite.
- Impact: LLM calls must be cache-first and bounded by feature-level quotas.

## 2026-03-29 - Parser cadence must be hourly or slower on free Cloudflare
- Decision: Design parser scheduling around `>= 1 hour` cron intervals with per-store shards.
- Why: On Workers Free, cron gets meaningful CPU budget only at hourly-or-slower cadence.
- Impact: Architecture uses hot/cold shard rotation and change-only history writes instead of near-real-time full scans.

## 2026-03-29 - Use per-store JSON adapters instead of browser scraping
- Decision: Implement four separate TypeScript adapters that talk to store-specific JSON surfaces: Green `/api/v1/*`, Edostavka `/_next/data/{buildId}`, Gippo `app.willesden.by/api/guest/*`, Emall `/_next/data/{buildId}`.
- Why: This keeps the parser Cloudflare Workers-compatible, avoids heavy browser automation, and matches the live endpoint surfaces verified during reconnaissance.
- Impact: Build-id refresh logic is mandatory for Edostavka/Emall, and Gippo requests must resolve `market_id` before reading prices.

## 2026-03-29 - Store money in integer minor units and keep price history append-only
- Decision: Model all prices in Turso as integer minor units (`*_minor`) and keep `price_history` as insert-only with a unique `snapshot_key`.
- Why: SQLite/libSQL does not provide exact decimal semantics suitable for money, while append-only history is safer for auditability, retries, and promo analytics.
- Impact: Ingestion must normalize BYN values before writes, and retries must reuse the same `snapshot_key` to stay idempotent.

## 2026-03-29 - Process one parser shard per cron using DB-managed cursors
- Decision: Use `parser_cursor` as the source of truth for shard scheduling so each cron invocation claims exactly one shard (`bootstrap`, `category`, or `promo`) and advances it independently.
- Why: This matches the 15-minute scheduled Worker wall-time limit and reduces blast radius when one store page or one product write fails.
- Impact: Worker state lives in Turso, retries resume from the same page, and failed shards can be blocked without stopping the rest of the rotation.

## 2026-03-29 - Prefer sequential idempotent Drizzle writes over HTTP transactions
- Decision: Persist parser output through sequential `await` writes and idempotent keys rather than relying on libSQL HTTP transactions.
- Why: The current Worker/Turso path must stay compatible with serverless HTTP execution, and per-product isolation is more valuable than multi-statement transactional coupling at this stage.
- Impact: `upsertProductAndOffer`, `appendPriceHistoryIfNeeded`, and `updateParserCursor` must be individually safe to retry.

## 2026-03-29 - Use native Telegram Bot API fetch calls inside the edge bot worker
- Decision: Implement `bot-worker` with plain HTTPS `fetch` calls to `https://api.telegram.org/bot<TOKEN>/...` instead of `telegraf`, `grammy`, or `node-telegram-bot-api`.
- Why: The target runtime is Cloudflare Workers, and the webhook path needs minimal edge-compatible dependencies plus explicit control over secret-token validation and inline responses.
- Impact: Bot transport helpers, webhook validation, and inline answer payloads live in `src/apps/bot-worker/index.ts`, and future bot modules should stay Web API compatible.

## 2026-03-29 - Use Groq chat completions for conversational grocery replies
- Decision: Use Groq Chat Completions as the first conversational LLM path in the Telegram bot worker, with the model configurable and `llama-3.3-70b-versatile` as the default.
- Why: Current product constraints favor a cardless, edge-friendly HTTPS API that can be called directly from Cloudflare Workers without adding SDK-heavy runtime coupling.
- Impact: Bot replies are built from Turso search results plus a Groq system prompt, and the worker must degrade gracefully to a deterministic text summary if Groq fails.
