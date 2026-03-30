# World-Class Roadmap 2026

_Актуально на: 2026-03-30 | Роль: P-BOT Universal Bot Architect_

## Короткий вывод

Сейчас наш проект силён в одном: у нас уже есть свой локальный каталог, реальные ссылки на товары и Telegram-native интерфейс.

Но лучшие мировые продукты выигрывают не одним “умным ответом”, а целой системой:

1. они понимают свободный запрос;
2. собирают действие через инструменты;
3. опираются на богатый каталог и атрибуты;
4. держат память о пользователе;
5. объясняют выбор;
6. доводят до покупки или готового списка.

### Главный вывод по рынку

Ни один найденный продукт не выглядит как идеальное объединение всех пяти зон сразу:

- локальное сравнение цен по магазинам;
- agentic chat shopping;
- корзины под бюджет;
- composition / health reasoning;
- persistent household memory.

Это **вывод по собранным источникам**, а не абсолютное утверждение о всём рынке. Но именно здесь лежит наш шанс на moat.

## Что делают лучшие игроки мира

### 1. Instacart

Что умеют хорошо:

- `Smart Shop` персонализирует поиск и выбор;
- `Health Tags` массово размечают каталог по диетическим и нутриционным признакам;
- `Inspiration Pages` дают шоппабельные сценарии, в том числе для диабета;
- интеграция с ChatGPT доводит путь до реального checkout прямо внутри разговора.

Почему это важно для нас:

- они выигрывают не “просто LLM”, а связкой `catalog intelligence + health attributes + actionability`.
- у них очень сильный `intention -> shoppable result` flow.

### 2. Walmart

Что умеют хорошо:

- `Sparky` помогает планировать, сравнивать и покупать;
- Walmart уже строит agentic shopping через OpenAI и Google Gemini;
- сильный фокус на “retail companion”, а не на статический поиск.

Почему это важно для нас:

- мировой вектор явно идёт в сторону `shopping agent`, а не “поисковая строка + карточки”.
- лучший продукт должен уметь работать с широким бытовым запросом, а не только с точным названием SKU.

### 3. Samsung Food

Что умеют хорошо:

- meal planning;
- преобразование плана питания в shopping list;
- pantry / food list;
- AI-персонализация рецептов и недельных планов;
- связь с grocery shopping.

Почему это важно для нас:

- мировой UX-лидер здесь не в “ценах”, а в цепочке `план питания -> список -> корзина -> готовка`.
- для нашего бота это прямой ориентир на weekly basket и household planning.

### 4. AnyList

Что умеют хорошо:

- shared shopping lists;
- meal planning calendar;
- household collaboration;
- превращение meal plan в grocery list.

Почему это важно для нас:

- даже без сильного AI продукт может быть любимым за счёт безупречной бытовой пользы и совместного использования.
- нам нужно не только “умно советовать”, но и помогать семье реально жить с этим списком.

### 5. Yuka / TruthIn / FoodSwitch / Fig-like health scanners

Что умеют хорошо:

- быстро объясняют состав;
- подсвечивают аллергенность, сахар, соль, степень обработки;
- рекомендуют healthier alternatives;
- строят доверие через объяснимость.

Почему это важно для нас:

- “умный бот” без доверия к объяснению состава не станет мировым лидером.
- если бот говорит “лучше при диабете”, он обязан объяснять _почему именно_ и _на основании каких данных_.

## Рынок по сегментам

### Сегмент A — Agentic shopping / conversational commerce

Лидеры:

- Instacart + ChatGPT
- Walmart Sparky
- Walmart + Gemini

Стандарт сегмента:

- пользователь пишет свободный запрос;
- система сама понимает намерение;
- сама собирает действия;
- выдаёт готовый шоппабельный результат;
- в идеале доводит до checkout.

### Сегмент B — Meal planning / household grocery operations

Лидеры:

- Samsung Food
- AnyList

Стандарт сегмента:

- план питания на дни/неделю;
- автоматическая генерация списка;
- shared household flow;
- pantry / leftovers / waste reduction.

### Сегмент C — Ingredient / health intelligence

Лидеры:

- Yuka
- TruthIn
- FoodSwitch
- похожие allergy / diet scanners

Стандарт сегмента:

- понятное объяснение состава;
- безопасные фильтры;
- healthier swap;
- доверие и explainability.

### Сегмент D — Local price intelligence

Рынок фрагментирован.

Есть локальные и региональные price-comparison решения, но по собранным данным они редко совмещают:

- реальный agentic chat;
- diagnosis-aware рекомендации;
- meal planning;
- покупку / корзину;
- household memory.

Именно здесь у нас окно для дифференциации.

## Где наш бот сейчас слабее мирового top-tier

### 1. Слабое понимание запроса на уровне исполнения

Проблема:

- бот уже умеет tool loop, но пользователь всё ещё чувствует “искусственные ответы”.

Что значит мировой уровень:

- любой бытовой запрос маппится в plan of action без ощущения ручных костылей.

### 2. Слабый basket engine

Проблема:

- корзины ещё недостаточно реалистичны и категорийно бедны.

Что значит мировой уровень:

- корзина выглядит как реальная закупка на дни/неделю, а не как список случайных дешёвых позиций.

### 3. Слабая товарная read-model

Проблема:

- базовые запросы всё ещё страдают от шумного каталога.

Что значит мировой уровень:

- продукт понимает базовые категории, unit economics, товарные семьи, дубликаты, заменители и household staples.

### 4. Недостаточная explainability

Проблема:

- бот ещё не всегда ясно показывает, почему товар выбран.

Что значит мировой уровень:

- каждое решение можно объяснить: цена, цена за единицу, состав, аллергенность, противопоказания, альтернатива.

### 5. Нет household operating system

Проблема:

- бот пока не живёт как долгосрочный помощник семьи.

Что значит мировой уровень:

- профиль семьи, избранные магазины, budget memory, повторные покупки, история корзин, избегающие продукты, любимые замены.

## Самая сильная мировая позиция для нас

### Не “лучший grocery chatbot”

Это слишком широко и проигрышно.

### А вот такая позиция сильнее:

`Лучший Telegram-first agentic grocery assistant для повседневной семьи: дешёвые корзины + безопасный состав + реальные ссылки + память о человеке.`

Или ещё точнее:

`Личный продуктовый AI-ассистент, который понимает свободный текст, собирает grounded-корзины под бюджет и ограничения и объясняет выбор по цене и составу.`

## Карта улучшений

## P0 — Убрать всё, что разрушает доверие

Срок: немедленно

Цель:

- чтобы бот перестал казаться “фейково умным”.

Нужно сделать:

1. Закрыть deterministic leakage полностью.
2. Ввести обязательный grounded-answer contract:
   - ни одного товарного утверждения без tool-result.
3. Ввести refusal policy:
   - если корзина плохая, бот задаёт уточнение или признаёт слабость каталога.
4. Добавить explicit confidence levels:
   - `точное совпадение`
   - `похожие варианты`
   - `слабое покрытие базы`
5. Добавить answer quality evaluator:
   - после basket / cheapest / diagnosis tool response делать внутреннюю QA-проверку до отправки текста.

Почему это важно:

- доверие убивается быстрее всего не ошибкой модели, а уверенностью в плохом ответе.

## P1 — Построить настоящий grocery brain

Срок: 1-3 недели

Цель:

- чтобы бот принимал нормальные бытовые запросы и действительно выполнял задачу.

Нужно сделать:

1. Product ontology / taxonomy
   - category families
   - staple goods
   - prepared food vs raw ingredient
   - duplicates and substitutes

2. Category read-model
   - отдельный материализованный слой для `масло`, `молоко`, `крупы`, `овощи`, `белок`, `перекус`, `напитки` и т.д.

3. Unit economics
   - цена за кг / л / 100 г
   - цена за белок / клетчатку / калории там, где возможно

4. Better basket engine
   - минимум по категориям
   - баланс по satiety / budget / diversity
   - household duration model: на 1 день / 3 дня / неделю

5. Query decomposition
   - LLM planner выделяет:
     - intent
     - constraints
     - time horizon
     - household size
     - food anchors
     - acceptable substitutes

Почему это важно:

- без этого AI будет красиво говорить, но плохо выбирать.

## P2 — Стать лучшими по health + safety

Срок: 2-6 недель

Цель:

- чтобы бот был не просто “дешёвым поиском”, а умным food-safety / nutrition copilot.

Нужно сделать:

1. Composition intelligence layer
   - сахар
   - сиропы
   - скрытые подсластители
   - соль
   - трансжиры / рафинированные масла
   - аллергенные ингредиенты
   - additives / UPF heuristics

2. Health mode profiles
   - диабет
   - гипертония
   - без лактозы
   - без глютена
   - FODMAP / sensitive digestion
   - детский режим

3. Explainable recommendations
   - “лучше, потому что…”
   - “хуже, потому что…”
   - “уверенность низкая, состав не указан”

4. Alternative engine
   - если товар плохой, бот обязательно показывает safer swap

5. Medical guardrails
   - не диагнозы
   - не лечение
   - только составные и диетические соображения + дисклеймер

Почему это важно:

- это главный шанс обойти price-comparison продукты и стать действительно полезным каждый день.

## P3 — Стать продуктом, который живёт с семьёй

Срок: 1-2 месяца

Цель:

- превратить бота в household OS.

Нужно сделать:

1. Persistent household profile
   - состав семьи
   - дети / взрослые
   - любимые продукты
   - нелюбимые продукты
   - частые покупки
   - лимит бюджета

2. Weekly grocery missions
   - “закупка на неделю”
   - “эконом-режим”
   - “здоровая неделя”
   - “перекусы для ребёнка”

3. Pantry / repeat purchase memory
   - что уже обычно дома
   - что быстро заканчивается
   - что покупать регулярно

4. Channel + bot synergy
   - канал ловит большие акции
   - бот персонализирует их под профиль пользователя

5. Shared shopping mode
   - переслать корзину супругу
   - inline cards
   - Telegram mini-app на этапе 2

Почему это важно:

- это уже не “бот с ответами”, а продуктовая инфраструктура привычки.

## P4 — Мировой moat

Срок: 2-4 месяца

Цель:

- сделать продукт сложно копируемым.

Нужно сделать:

1. Personal price graph
   - лучшие магазины по категориям именно для этого пользователя

2. Health + cost co-optimization
   - не “самое дешёвое”
   - а “лучший компромисс цена / качество / ограничения”

3. Scenario packs
   - диабетическая неделя
   - офисные перекусы
   - пост / вегетарианство
   - школьные ланчбоксы

4. Agent memory and standing intents
   - “если появляется хорошая акция на мои базовые продукты — сразу напиши”

5. Explainability and trust ledger
   - журнал, почему бот выбрал именно эти продукты

Почему это важно:

- сильный AI moat строится не моделью, а уникальным loop:
  `local catalog -> household memory -> health reasoning -> action`.

## Что делать не надо

1. Не пытаться “победить мир” общим чат-ботом без сильного grocery core.
2. Не строить moat на одной модели.
3. Не идти в тяжёлый medical advice.
4. Не тратить месяцы на UI, пока basket quality и catalog intelligence слабы.
5. Не мерить прогресс только по тому, отвечает ли бот, а не по тому, был ли ответ реально полезен.

## North Star для продукта

Если пользователь пишет:

`У меня диабет, бюджет 120 рублей, собери закупку на 5 дней, чтобы было быстро готовить и без молочки`

бот мирового класса должен:

1. понять запрос без ручных костылей;
2. вспомнить профиль пользователя;
3. выбрать реальные категории и товары;
4. соблюсти бюджет;
5. объяснить, почему они подходят;
6. дать прямые ссылки;
7. предложить более дешёвую и более полезную версии корзины;
8. сохранить это как reusable routine.

## Что даст нам шанс стать лучшими

### Наше реальное окно

Не копировать Instacart или Walmart целиком.

А собрать лучшую комбинацию:

- Telegram-native UX;
- локальный price intelligence;
- grounded agentic chat;
- composition reasoning;
- family memory;
- explainable baskets.

### Формула продукта

`Лучший в мире не тот, кто "умеет всё", а тот, кто в одном жизненном сценарии закрывает весь цикл лучше остальных.`

Для нас этот сценарий:

`семья пишет в чат бытовой запрос -> получает grounded-корзину и понятное объяснение -> реально покупает быстрее, дешевле и спокойнее`.

## Приоритет на ближайшие 3 спринта

### Sprint 1

- убрать fake-smart ответы окончательно;
- довести tool-contract;
- сделать category read-model;
- поднять quality cheapest / basket / profile flows.

### Sprint 2

- собрать настоящий basket engine;
- добавить health scoring и safer swaps;
- внедрить better explanation layer.

### Sprint 3

- household memory;
- weekly missions;
- personalized channel-to-bot promo routing;
- standing intents and alerts.

## Источники

- Instacart Smart Shop / Health Tags / Inspiration Pages:
  - https://www.instacart.com/company/pressreleases/instacart-launches-ai-powered-smart-shop-and-new-features-that-make-healthy-choices-easy/
  - https://www.instacart.com/company/health
- Instacart + ChatGPT:
  - https://openai.com/index/instacart-partnership
- Walmart agentic shopping:
  - https://corporate.walmart.com/news/2025/06/06/walmart-the-future-of-shopping-is-agentic-meet-sparky
  - https://corporate.walmart.com/news/2026/01/11/walmart-and-google-turn-ai-discovery-into-effortless-shopping-experiences
- Samsung Food:
  - https://samsungfood.com/meal-planner
  - https://samsungfood.com/food-plus/
  - https://news.samsung.com/global/upgraded-samsung-food-raises-the-bar-for-food-experiences-at-ifa-2024
- AnyList:
  - https://www.anylist.com/
  - https://www.anylist.com/meal-planning
- Yuka:
  - https://yuka.io/en/
  - https://yuka.io/en/app
- TruthIn:
  - https://truthin.ai/foodscanner
- FoodSwitch:
  - https://www.foodswitch.com/app/foodswitch/
- Agentic commerce framing:
  - https://www.mckinsey.com/~/media/mckinsey/business%20functions/quantumblack/our%20insights/the%20agentic%20commerce%20opportunity%20how%20ai%20agents%20are%20ushering%20in%20a%20new%20era%20for%20consumers%20and%20merchants/the-agentic-commerce-opportunity-how-ai-agents-are-ushering-in-a-new-era-for-consumers-and-merchants_final.pdf
