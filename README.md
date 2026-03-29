# Smart Grocery Assistant (Минск)

[English version](./README.en.md)

Telegram-бот и promo-channel backend для поиска дешёвых продуктов в Минске, подбора корзины под бюджет и анализа составов.

Автор: `AI_Nikitka93`

## Что уже есть

- JSON-парсеры для `Green`, `Edostavka`, `Gippo`, `Emall`
- Turso/libSQL схема через Drizzle ORM
- `parser-worker` для shard-based сбора цен
- `bot-worker` для Telegram webhook, inline mode и AI-ответов
- проектная память и execution-план для дальнейшей автономной разработки

## Стек

- Cloudflare Workers
- TypeScript
- Turso (libSQL / SQLite)
- Drizzle ORM + drizzle-kit
- Telegram Bot API
- Groq API

## Структура проекта

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

## Основные сценарии

- искать, где дешевле купить конкретный продукт;
- подбирать корзину под бюджет пользователя;
- анализировать составы товаров;
- публиковать выгодные предложения в Telegram-канал;
- отдавать быстрые inline-карточки товаров в любом чате.

## Текущий статус

Проект находится в активной инженерной разработке. Базовая архитектура, слой парсинга, схема БД, parser-worker и первый Telegram bot-worker уже реализованы. Следующие шаги: `wrangler` bindings, локальные smoke-тесты webhook/scheduled flow и deploy path.

## Быстрый старт

Полный bootstrap ещё дорабатывается, но текущая база такая:

```bash
npm install
npx drizzle-kit push
```

Для запуска и деплоя понадобятся bindings/секреты:

- `BOT_TOKEN`
- `WEBHOOK_SECRET`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `GROQ_API_KEY`

## Документация

- Архитектура: [ARCHITECTURE.md](./ARCHITECTURE.md)
- Карта проекта: [docs/PROJECT_MAP.md](./docs/PROJECT_MAP.md)
- История действий: [docs/PROJECT_HISTORY.md](./docs/PROJECT_HISTORY.md)
- Ключевые решения: [docs/DECISIONS.md](./docs/DECISIONS.md)
- Ресёрч: [docs/RESEARCH_LOG.md](./docs/RESEARCH_LOG.md)

## Лицензия

Проект распространяется по лицензии Apache License 2.0. Подробности в [LICENSE](./LICENSE).

Copyright 2026 Nikita (AI_Nikitka93)
