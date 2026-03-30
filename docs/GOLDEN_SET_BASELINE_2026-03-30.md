# Golden Set Baseline 2026-03-30

Актуально на: `2026-03-30 18:29`  
Роль: `P-BOT Universal Bot Architect`

## Что это

Первый живой quality gate для `bot-worker`.

Golden-set v1 прогоняется не на моках, а через реальный production-like контур:

- Telegram Bot API
- Cloudflare Worker webhook
- Turso profile/session state

## Команда запуска

```powershell
npm run eval:golden
```

## Артефакты

- Cases: [src/apps/bot-worker/golden-set.cases.json](m:\Projects\Bot\minsk-smart-groceries\src\apps\bot-worker\golden-set.cases.json)
- Runner: [src/apps/bot-worker/golden-set.ts](m:\Projects\Bot\minsk-smart-groceries\src\apps\bot-worker\golden-set.ts)
- Latest JSON result: [docs/evals/golden-set-latest.json](m:\Projects\Bot\minsk-smart-groceries\docs\evals\golden-set-latest.json)

## Baseline result

- Pass rate: `3/3`
- Worker version during passing run: `1e848823-d64a-4280-9cb0-d7a231bf673d`

## Cases in v1

1. `profile_save_household`
   Проверяет, что profile-only сообщение сохраняет `budgetMinor`, `householdSize` и не загрязняет `lastCatalogQueries`.

2. `cheapest_followup_milk`
   Проверяет multi-turn follow-up: `где дешевле купить молоко` -> `а подешевле`.

3. `basket_week_diabetes`
   Проверяет, что basket flow остаётся в basket/clarification domain и не деградирует в случайный product search.

## Что baseline уже доказал

- Session/household memory теперь реально проверяется, а не предполагается.
- Follow-up price flow удерживает grounded product anchor.
- Profile-only path больше не должен теряться из-за кириллического regex boundary bug.

## Что baseline пока не покрывает

- `а полезнее` и другие health follow-ups
- family-basket continuation flows
- exactness quality для `масло`, `яйца`, `хлеб`, `гречка`
- safer swaps и nutrition explanations
- proactive routines

## Следующий шаг

Расширить golden-set до `v2`:

- cheapest exactness on staple commodities
- basket realism
- diagnosis-aware follow-ups
- clarification quality
- negative cases with explicit refusal expectations
