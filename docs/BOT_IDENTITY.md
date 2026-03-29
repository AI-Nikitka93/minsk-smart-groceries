# Bot Identity

## Primary Brand

- Product name: `Выгодная корзина Минск`
- Bot display name: `Выгодная корзина Минск`
- Channel title: `Выгодная корзина Минск | Акции и цены`
- Tone: дружелюбный, полезный, спокойный, без рекламного шума
- Author attribution: `Создано @AI_Nikitka93`

## Naming Rule

- The public brand must describe value clearly for a new user.
- The wording must stay neutral and must not contain names of existing store chains.
- Russian names are fine for display text.
- Telegram `@username` values must stay Latin-only and unique.

## Recommended Final Choice

- Bot name: `Выгодная корзина Минск`
- Bot username: `@korzina_minsk_bot`
- Channel name: `Выгодная корзина Минск | Акции и цены`
- Channel username: `@korzina_minsk`

## Safe Fallback Usernames

### Bot

- `@korzina_minsk_bot`
- `@vygodno_minsk_bot`
- `@budget_minsk_bot`
- `@eda_minsk_bot`
- `@korzina_by_bot`

### Channel

- `@korzina_minsk`
- `@vygodno_minsk`
- `@minsk_food_alerts`
- `@budget_food_minsk`
- `@eda_minsk_news`

## BotFather Texts

### Name

```text
Выгодная корзина Минск
```

### Username

```text
@korzina_minsk_bot
```

### Short Description

```text
Помогаю находить выгодные продукты в Минске, собирать корзину под бюджет и сравнивать цены.
```

### About

```text
Бот для поиска выгодных продуктов, подбора корзины и понятных подсказок по покупкам в Минске. Создано @AI_Nikitka93
```

### First Welcome Message

```text
Привет! Я Выгодная корзина Минск.

Я помогу:
- найти более выгодные продукты;
- собрать корзину под нужный бюджет;
- быстро сравнить цены и выбрать удобный вариант покупки.

Примеры запросов:
- Где дешевле купить молоко?
- Собери корзину на 20 рублей
- Найди сыр до 8 рублей

Inline-режим:
в любом чате напиши `@korzina_minsk_bot сыр`

Создано @AI_Nikitka93
```

## Channel Setup

### Channel Title

```text
Выгодная корзина Минск | Акции и цены
```

### Channel Username

```text
@korzina_minsk
```

### Channel Description

```text
Выгодные цены, скидки и продуктовые находки по Минску. Коротко, понятно и без спама. Создано @AI_Nikitka93
```

### Channel Post Style

- 1 выгодная находка = 1 пост
- короткий заголовок
- текущая цена
- старая цена, если есть
- ссылка
- 1 короткая строка, почему это выгодно

## Where To Store This Info

Canonical project file:
- `docs/BOT_IDENTITY.md`

Why here:
- this is product metadata, not a runtime secret;
- it is easy to reuse for BotFather, Telegram channel settings, README, and landing pages;
- the confirmed usernames can later be copied into config after availability is checked in Telegram.

## What Goes Into Config Later

After you claim the usernames in Telegram:

- put the confirmed bot username into `wrangler.toml` as `BOT_USERNAME`
- keep the token only in Cloudflare secret `BOT_TOKEN`
- keep the webhook secret only in Cloudflare secret `WEBHOOK_SECRET`
- if the channel username becomes part of runtime links, add it later as a non-secret variable
