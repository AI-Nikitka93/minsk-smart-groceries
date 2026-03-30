# Research Log

## [ТЕМА: Zero-cost hosting stack for 24/7 bot + scheduled parser]
_Последнее обновление: 2026-03-29 | Роль: P-20 Technical Architect_
Статус: Актуально

- Проверено на 2026-03-29, что `Cloudflare Workers Free` дает `100,000` запросов в день, `5` cron triggers на аккаунт, `10 ms` CPU на HTTP-invocation и `15 min` CPU на Cron Trigger при интервале `>= 1 hour`; wall time для Cron Trigger тоже `15 min`.
- `Cloudflare Workers Logs` на free включает `200,000` log events/day и `3 days` retention.
- `Cloudflare Service Bindings` не добавляют отдельную плату за внутренние вызовы между Workers.
- `Cloudflare R2` остается опциональным кандидатом для сырых снапшотов и экспорта, если потребуется хранить архивы вне основной БД.
- Вывод: под бюджет `$0` нельзя опираться на "always-on" VM; нужен webhook-first bot и scheduler-first parser на serverless-событиях.

Источники:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/configuration/cron-triggers/

## [ТЕМА: Free database for price history]
_Последнее обновление: 2026-03-29 | Роль: P-20 Technical Architect_
Статус: Актуально

- `Cloudflare D1 Free`: `5 million rows read/day`, `100,000 rows written/day`, `5 GB total storage`.
- `Turso Free`: `100` databases, `5GB` total storage, `500 Million` rows read/month, `10 Million` rows written/month, `3GB` monthly syncs, `1 day` point-in-time restore.
- Вывод: для истории цен и нормализованных read-моделей `Turso Free` безопаснее как primary DB, потому что месячный write-budget и aggregate reads лучше подходят для периодического парсинга нескольких сетей, чем дневной cap D1 на записи.
- Handoff: D1 оставить только как fallback/локальный прототип, а не как primary production store.

Источники:
- https://turso.tech/pricing
- https://developers.cloudflare.com/d1/platform/pricing/

## [ТЕМА: Free LLM for composition analysis and chat]
_Последнее обновление: 2026-03-29 | Роль: P-20 Technical Architect_
Статус: Актуально

- `Gemini 2.5 Flash-Lite` на free tier имеет `Free of charge` input/output pricing и помечен как "smallest and most cost effective model, built for at scale usage".
- Для `Gemini 2.5 Flash-Lite` Google отдельно указывает `Grounding with Google Search Free of charge, up to 500 RPD (limit shared with Flash RPD)`.
- Документация Google прямо говорит, что лимиты измеряются в `RPM`, `TPM`, `RPD`, применяются per project, а `RPD` reset в `midnight Pacific time`; точные live-limits надо смотреть в AI Studio, потому что они model-specific и могут меняться.
- `Gemini 2.0 Flash-Lite` депрекейтнут и будет отключен `2026-06-01`, поэтому его нельзя закладывать в новую архитектуру.
- Вывод: рекомендован `Gemini 2.5 Flash-Lite` без обязательного search grounding; grounding включать только для редких расширенных объяснений, чтобы не сжечь free RPD.

Источники:
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/rate-limits

## [ТЕМА: Store endpoint reconnaissance]
_Последнее обновление: 2026-03-29 | Роль: P-20 Technical Architect_
Статус: Актуально

- В `green-dostavka.by` из live HTML извлечен runtime key `BACKEND_API` со значением `https://green-dostavka.by/api`.
- В `edostavka.by` зафиксированы домены `api.static.edostavka.by` и `api2.edostavka.by`.
- В `emall.by` зафиксированы домены `api.emall.by`, `api.static.emall.by` и `api-preprod.emall.by`.
- В `gippo-market.by` в HTML виден preconnect к `app.willesden.by`.
- Вывод: рантайм-парсинг нужно строить сначала на публично видимых JSON/API-источниках и runtime-конфигах сайтов; reverse-engineering мобильных API полезен как discovery-инструмент, но не должен быть единственной опорой production-пайплайна.

Источники:
- https://green-dostavka.by
- https://edostavka.by
- https://gippo-market.by
- https://emall.by

## [ТЕМА: Store parser surfaces and live JSON schemas]
_Последнее обновление: 2026-03-29 | Роль: P-WEB Web Intelligence Engineer_
Статус: Актуально

- `green-dostavka.by` подтвержден как прямой JSON API:
  - `GET /api/v1/categories/`
  - `GET /api/v1/products?storeId=2&categoryId=<id>&limit=<n>&skip=<n>`
  - `GET /api/v1/products/special-offers?storeId=2&limit=<n>&skip=<n>`
- `edostavka.by` подтвержден как Next.js storefront JSON:
  - build id на момент проверки: `8ylZDX1xavHYRlo6J5r7l`
  - `GET /_next/data/{buildId}/category/<id>.json?page=<n>`
  - `GET /_next/data/{buildId}/actions.json`
  - `GET /_next/data/{buildId}/actions/<tagAlias>.json?page=<n>`
- `emall.by` подтвержден как Next.js storefront JSON:
  - build id на момент проверки: `V8qFCIWQYtRfOizuh1Ag4`
  - `GET /_next/data/{buildId}/category/<id>.json?page=<n>`
  - `GET /_next/data/{buildId}/actions.json`
  - `GET /_next/data/{buildId}/actions/<slug>.json?page=<n>`
- `gippo-market.by` подтвержден как guest REST:
  - `GET https://app.willesden.by/api/guest/initial-data` -> `market_id=73`
  - `GET /api/guest/shop/categories?market_id=<id>`
  - `GET /api/guest/shop/products?market_id=<id>&page=<n>&per_page=<n>&filter[categories][slug]=<slug>`
  - `GET /api/guest/shop/products?market_id=<id>&page=<n>&per_page=<n>&filter[promo]=1`
- Robots summary:
  - Green: query/search/account restrictions, API open.
  - Edostavka: query-heavy/profile/checkout restrictions, storefront JSON usable.
  - Gippo: query/favorites restrictions, guest API not declared in robots.
  - Emall: `/api/` blocked for Googlebot, so storefront `/_next/data` выбран вместо прямого marketplace API.
- Вывод: production parser layer можно строить без DOM/Playwright, полностью на `fetch` + JSON + retry/backoff.

Источники:
- https://green-dostavka.by/robots.txt
- https://edostavka.by/robots.txt
- https://gippo-market.by/robots.txt
- https://emall.by/robots.txt
- https://green-dostavka.by
- https://edostavka.by
- https://gippo-market.by
- https://emall.by

## [ТЕМА: Drizzle ORM schema conventions for Turso/libSQL]
_Последнее обновление: 2026-03-29 | Роль: P-60 Database Architect_
Статус: Актуально

- Использую свежие данные из `RESEARCH_LOG` от 2026-03-29 по Turso как primary DB; повторный поиск по лимитам не нужен.
- Выполнен delta-check по официальной документации Drizzle:
  - SQLite column types в Drizzle поддерживают `INTEGER`, `TEXT`, `BLOB`, `REAL`, а defaults для timestamp могут задаваться через `sql\`(CURRENT_TIMESTAMP)\``.
  - Drizzle рекомендует описывать индексы и ограничения прямо в schema callbacks через `index(...)`, `uniqueIndex(...)`, `check(...)`.
  - `drizzle-kit push` остается актуальным code-first способом синхронизации схемы напрямую в Turso/libSQL через `dialect: "turso"` и `schema: "./src/db/schema.ts"`.
- Вывод: для Smart Grocery Assistant безопаснее хранить деньги как `INTEGER` minor units, JSON-поля как `text(..., { mode: "json" })`, а миграции вести через `drizzle-kit push` на ранней стадии проекта.

Источники:
- https://orm.drizzle.team/docs/column-types/sqlite
- https://orm.drizzle.team/docs/indexes-constraints
- https://orm.drizzle.team/docs/drizzle-kit-push

## [ТЕМА: Cloudflare scheduled Worker + Turso/Drizzle runtime wiring]
_Последнее обновление: 2026-03-29 | Роль: P-00 Master Engineering Protocol_
Статус: Актуально

- Использую свежие данные из `RESEARCH_LOG` от 2026-03-29 по Cloudflare/Turso лимитам; повторный поиск по лимитам не нужен.
- Выполнен delta-check по официальным источникам:
  - Cloudflare Workers по-прежнему использует module-syntax `export default { async scheduled(controller, env, ctx) { ... } }` для cron handlers.
  - Cron triggers продолжают тестироваться локально через `wrangler dev --test-scheduled`, а в dev-среде доступен маршрут `__scheduled`.
  - Turso JS/TS SDK подтверждает совместимость `@libsql/client` с Cloudflare Workers.
  - Turso official Drizzle guide продолжает использовать `drizzle-orm/libsql` поверх `@libsql/client`.
- Вывод: parser-worker можно безопасно собирать как module Worker с `scheduled()` handler, а DB layer держать на `@libsql/client` + `drizzle-orm/libsql`.

Источники:
- https://developers.cloudflare.com/workers/configuration/cron-triggers/
- https://developers.cloudflare.com/workers/examples/cron-trigger/
- https://docs.turso.tech/sdk/ts/reference
- https://docs.turso.tech/sdk/ts/orm/drizzle

## [ТЕМА: Telegram webhook worker + Groq chat completions]
_Последнее обновление: 2026-03-29 | Роль: P-BOT Universal Bot Architect_
Статус: Актуально

- `Bot API changelog` на момент проверки показывает `Bot API 9.5` от `2026-03-01`.
- Основная Bot API документация подтверждает, что webhook updates приходят как JSON-serialized `Update`, а `inline_query` является штатным типом обновления.
- `setWebhook` по-прежнему поддерживает `secret_token`, а Telegram добавляет заголовок `X-Telegram-Bot-Api-Secret-Token` в каждый webhook request, если секрет задан.
- `answerInlineQuery` и inline mode остаются штатной частью Bot API для выдачи результатов из любого чата.
- Groq official docs подтверждают OpenAI-compatible chat endpoint `POST https://api.groq.com/openai/v1/chat/completions` с заголовком `Authorization: Bearer <GROQ_API_KEY>`.
- В официальных примерах Groq по-прежнему фигурирует модель `llama-3.3-70b-versatile`, поэтому её можно использовать как default model с env override.
- Вывод: bot-worker можно строить как чистый Cloudflare fetch-handler без Telegram SDK, с прямыми POST в Telegram Bot API и Groq Chat Completions.

Источники:
- https://core.telegram.org/bots/api
- https://core.telegram.org/bots/api-changelog
- https://console.groq.com/docs/text-chat
- https://console.groq.com/docs/api-reference

## [ТЕМА: Cloudflare bot deploy + GitHub Actions parser cron]
_Последнее обновление: 2026-03-29 | Роль: P-DEPLOY Autonomous Server & Hosting Manager_
Статус: Актуально

- Локальный `wrangler deploy --help` подтверждает актуальные флаги `--config`, `--outdir` и `--dry-run`, поэтому `wrangler.toml` можно безопасно валидировать без реального деплоя.
- Локальный `wrangler deploy --config wrangler.toml --dry-run --outdir .wrangler-build` успешно собрал `bot-worker`, а в выводе были распознаны `BOT_USERNAME`, `TELEGRAM_WEBHOOK_PATH` и `BUILD_DATE_UTC` как bindings из `wrangler.toml`.
- Официальный `actions/setup-node` README на момент проверки использует `actions/setup-node@v6`; README также рекомендует явно задавать версию Node и не полагаться на системную.
- Вывод: infra path можно строить на `wrangler.toml` для bot-worker и на hourly GitHub Actions workflow с `npm install` + `npx ts-node` для parser CLI.

Источники:
- https://github.com/actions/setup-node

## [ТЕМА: Safe dietary heuristics for diagnosis-aware grocery suggestions]
_Последнее обновление: 2026-03-30 | Роль: P-QA Quality Assurance Gate_
Статус: Актуально

- Для медицински чувствительных сценариев бот не должен обещать лечение или выдавать диагноз; безопаснее использовать формулировку `по составу выглядит более подходящим`, а не `можно всем при диагнозе`.
- Для сахарного диабета безопасно учитывать явные сладкие/сиропные/кондитерские маркеры в составе как негативный сигнал при ранжировании, а не как абсолютный медицинский запрет.
- Для гипертонии разумно учитывать повышенно солёные и ультра-переработанные продукты как caution-сигнал; в официальных рекомендациях DASH ключевой акцент идёт на снижение sodium.
- Для целиакии и безглютенового режима допустимо делать жёсткий negative filter по явным словам `gluten`, `пшеница`, `рожь`, `ячмень`, если они встречаются в названии или составе.
- Для непереносимости лактозы допустимо учитывать слова `лактоза`, `молоко`, `сыворотка`, `сливки` как high-risk маркеры, но не выдавать это за полноценную медицинскую консультацию.
- Вывод: в production-боте лучше сочетать grounded retrieval, мягкие диетические эвристики и явный disclosure о том, что окончательная совместимость зависит от диагноза и полного состава.

Источники:
- https://www.nhlbi.nih.gov/education/dash-eating-plan
- https://www.niddk.nih.gov/health-information/diabetes/overview/diet-eating-physical-activity
- https://medlineplus.gov/celiacdisease.html
- https://www.uhb.nhs.uk/media/f4ilokva/pi-nut-die-info-lactose-intolerance.pdf

## [ТЕМА: March 2026 market + product direction for a truly smart Belarus grocery bot]
_Последнее обновление: 2026-03-30 | Роль: P-BOT Universal Bot Architect_
Статус: Актуально

- На 2026-03-30 в Беларуси и Минске удалось подтвердить существование adjacent решений, но не найден явный массовый Telegram-бот, который одновременно делает grounded product search, ищет где дешевле, собирает корзину под бюджет и ещё учитывает ограничения по составу/диагнозу.
- Подтверждён близкий конкурент по ценовому сравнению: `InfoPrice App` в App Store Беларусь описывает ежедневный сбор цен по сетям Беларуси и сценарии сравнения цен на продукты/доставку. Это сильный сигнал, что просто `сравнение цен` уже не уникально.
- Подтверждены adjacent Telegram-каналы по скидкам и акциям Беларуси/Минска (`Slivki Minsk`, `Акции и листовки Беларусь`), но это в основном broadcast/promo format, а не conversational assistant с tool orchestration.
- Актуальный технический вывод: уникальность надо строить не на ещё одном канале скидок и не на ещё одном price-comparison app, а на `LLM planner + tool execution + persistent health/budget profile + grounded catalog links`.
- Telegram Bot API в актуальном changelog снова подтверждает inline/webhook возможности; для product assistant это значит, что conversational bot + inline share mode остаются правильным UX-комбо.
- Groq docs на 2026-03-30 подтверждают Structured Outputs и Tool Use, но с важным ограничением: Structured Outputs фокусируются на schema compliance, а не на semantic accuracy; значит planner/tool layer всё равно нужно держать детерминированным и grounded.
- Cloudflare Workers docs на 2026-03-30 подтверждают, что free HTTP invocations по-прежнему живут в `10 ms CPU` и `100,000 requests/day`, поэтому оркестрация должна быть компактной: не heavy agent loop в одном запросе, а 1 короткий planner + 1-3 tool executions + 1 final answer.
- Вывод по продукту: чтобы бот выглядел реально умным, а не "фэйково умным", следующий сильный слой должен быть таким:
  1. `planner` -> строгое JSON-решение что пользователь хочет;
  2. `tool layer` -> search / compare / basket / composition ranking;
  3. `user profile` -> бюджет, аллергии, диагнозы, blacklist, любимые магазины;
  4. `session memory` -> уточнение без повторного ввода;
  5. `grounded answer` -> только на реальных SKU и ссылках.

Источники:
- https://apps.apple.com/by/app/infoprice/id1512422887
- https://telemetr.me/content/slivkiminsk
- https://telemetr.me/content/akcii_skidki_belarus
- https://core.telegram.org/bots/api-changelog
- https://console.groq.com/docs/structured-outputs
- https://console.groq.com/docs/tool-use/overview
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

## [ТЕМА: March 2026 agentic bot implementation path with Groq tools]
_Последнее обновление: 2026-03-30 | Роль: P-BOT Universal Bot Architect_
Статус: Актуально

- Официальная страница Groq `Local Tool Calling` подтверждает базовый orchestration loop: model call with tool schemas -> check `tool_calls` -> execute tool -> append `role=tool` result -> final model response.
- В той же документации Groq явно показывает multi-turn agentic loop и рекомендует ограничивать число итераций, а не делать бесконечный цикл.
- Документация Groq отдельно описывает ошибки invalid tool call и рекомендует retry strategy с более низкой temperature, если модель сгенерировала плохой tool object.
- OpenRouter official docs подтверждают строгие Structured Outputs через `response_format: { type: \"json_schema\" }`, что полезно для будущего hardening contract-layer, но для текущего bot-worker local tool calling на Groq уже достаточно для первого agentic checkpoint.
- Вывод: правильная текущая реализация для бота — не ещё один большой prompt с эвристиками, а короткий Groq tool loop поверх Turso, с лимитом итераций и fallback на детерминированный ответ.

Источники:
- https://console.groq.com/docs/tool-use/local-tool-calling
- https://openrouter.ai/docs/guides/features/structured-outputs

## [ТЕМА: Global product benchmark and roadmap for a world-class grocery copilot]
_Последнее обновление: 2026-03-30 | Роль: P-BOT Universal Bot Architect_
Статус: Актуально

- `Instacart` уже задаёт высокий стандарт по сочетанию shopping AI, health intelligence и shoppable flows: компания продвигает `Smart Shop`, `Health Tags`, diet-friendly discovery и grocery shopping inside ChatGPT.
- `Walmart` уже идёт в сторону `agentic shopping companion`: `Sparky` и интеграции вокруг Gemini/OpenAI показывают, что глобальный retail UX движется от search box к task-completing assistant.
- `Samsung Food` и `AnyList` задают benchmark по `meal planning -> grocery list -> household routine`, а не по одиночным ответам в чате.
- `Yuka`, `TruthIn` и `FoodSwitch` задают benchmark по ingredient/health explainability, safer alternatives и clear dietary guidance.
- Инференс из источников: мировой рынок силён в отдельных slice-решениях, но по собранным данным не видно одного явного продукта, который одновременно объединяет `local price intelligence + grounded conversational shopping + budget baskets + diagnosis-aware composition reasoning + persistent household memory`.
- Отсюда продуктовый шанс проекта: не делать ещё один price bot, а строить `Telegram-first household grocery copilot`, где агентный диалог всегда опирается на реальные SKU, цены, объяснимый состав и память о семье.

Источники:
- https://openai.com/index/instacart-partnership
- https://investors.instacart.com/news-releases/news-release-details/instacart-launches-ai-powered-smart-shop-technology-and-new/
- https://corporate.walmart.com/news/2025/06/06/walmart-the-future-of-shopping-is-agentic-meet-sparky
- https://corporate.walmart.com/news/2026/01/11/walmart-and-google-turn-ai-discovery-into-effortless-shopping-experiences
- https://samsungfood.com/
- https://samsungfood.com/food-plus/
- https://samsungfood.com/meal-planner
- https://news.samsung.com/global/upgraded-samsung-food-raises-the-bar-for-food-experiences-at-ifa-2024
- https://www.anylist.com/
- https://www.anylist.com/meal-planning
- https://yuka.io/en/
- https://yuka.io/en/app
- https://truthin.ai/foodscanner
- https://www.foodswitch.com/apps/
- https://www.mckinsey.com/~/media/mckinsey/business%20functions/quantumblack/our%20insights/the%20agentic%20commerce%20opportunity%20how%20ai%20agents%20are%20ushering%20in%20a%20new%20era%20for%20consumers%20and%20merchants/the-agentic-commerce-opportunity-how-ai-agents-are-ushering-in-a-new-era-for-consumers-and-merchants_final.pdf
