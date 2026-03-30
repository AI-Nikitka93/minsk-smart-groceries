# Delivery Backlog 2026-03-30

_Актуально на: 2026-03-30 | Роль: P-BOT Universal Bot Architect_

## Назначение

Это рабочий backlog, вытащенный из [WORLD_CLASS_ROADMAP_2026.md](m:\Projects\Bot\minsk-smart-groceries\docs\WORLD_CLASS_ROADMAP_2026.md), чтобы следующий инженер или ИИ видел не только стратегию, но и ближайшие исполнимые шаги.

## Sprint A — Grounded Core

### A1. Tool contract hardening
- Статус: `IN_PROGRESS`
- Цель: бот не должен отправлять слабый tool-result как “нормальный ответ”.
- Задачи:
  - добавить quality metadata для basket / cheapest / diagnosis tools;
  - валидировать exactness, family diversity и budget realism;
  - явно различать `exact match`, `close alternatives`, `needs clarification`.

### A2. Category read-model v1
- Статус: `PLANNED`
- Цель: перестать искать базовые продукты через сырой noisy catalog.
- Задачи:
  - ввести commodity families: `масло`, `молоко`, `крупы`, `овощи`, `фрукты`, `белок`, `перекус`, `напитки`;
  - собрать alias map и family markers;
  - использовать read-model для basket и cheapest flow раньше общего fallback-поиска.

### A3. Basket engine v2
- Статус: `IN_PROGRESS`
- Цель: корзины должны выглядеть как реальные закупки.
- Задачи:
  - учитывать горизонт `1 день / 3 дня / неделя`;
  - требовать core families для длинной корзины;
  - не пропускать слишком бедные и однотипные наборы;
  - не брать tiny packs, семена, prepared-noise и household-irrelevant items.

## Sprint B — Health Intelligence

### B1. Composition scoring
- Статус: `PLANNED`
- Цель: вывести объяснимое health reasoning, а не абстрактное “лучше/хуже”.
- Задачи:
  - сахар / сиропы / сладкие fillers;
  - соль / processed warnings;
  - lactose / gluten / allergy markers;
  - confidence downgrade when composition is missing.

### B2. Safer swaps
- Статус: `PLANNED`
- Цель: если товар плохой, бот должен автоматически предлагать grounded alternative.

### B3. Medical guardrails
- Статус: `PLANNED`
- Цель: бот не лечит и не ставит диагноз, а объясняет ограничение только через состав и dietary rules.

## Sprint C — Household Memory

### C1. Household profile
- Статус: `PLANNED`
- Цель: помнить не только бюджет, но и household context.
- Задачи:
  - household size;
  - children/adults mode;
  - frequent purchases;
  - disliked products;
  - standing grocery routines.

### C2. Repeat and mission flows
- Статус: `PLANNED`
- Цель: weekly missions вместо одноразовых ответов.
- Задачи:
  - “закупка на неделю”;
  - “эконом-режим”;
  - “здоровая неделя”;
  - “перекусы для ребёнка”.

## Definition of Better

Изменение считается хорошим, только если после него бот:

1. лучше понимает бытовой запрос;
2. лучше выбирает реальные товары;
3. лучше объясняет, почему выбрал именно их;
4. реже просит уточнение без необходимости;
5. не выдаёт мусор как уверенный результат.
