# AI Intelligence Map 2026

_Актуально на: 2026-03-30 | Роль: P-BOT Universal Bot Architect_

## Зачем нужен этот документ

`WORLD_CLASS_ROADMAP_2026.md` уже описывает рынок и продуктовую позицию, но для действительно умного grocery-бота этого недостаточно.

Нужна отдельная карта именно по **внедрению AI**:

- какие слои сегодня делают shopping bots реально умными;
- что в лучших продуктах AI делает сам, а что должно оставаться детерминированным;
- где у нас сейчас разрыв;
- какой AI roadmap нужен, чтобы бот перестал быть “фэйково умным”.

## Короткий вывод

По свежим источникам на 2026-03-30, сильные AI-shopping продукты выигрывают не “одним большим промптом”, а архитектурой из слоёв:

1. `intent/planner layer`
2. `grounded tools layer`
3. `catalog/read-model intelligence`
4. `memory + preference state`
5. `health/nutrition reasoning`
6. `final synthesis + explanation`
7. `eval / critic / trust layer`

### Главный вывод для нашего проекта

Чтобы бот выглядел **по-настоящему умным**, у нас должен появиться не просто лучший поиск, а **grocery brain**:

- ИИ понимает свободную речь;
- вызывает правильные инструменты;
- опирается только на реальные данные из Turso;
- помнит профиль семьи;
- умеет собирать корзину, а не только искать SKU;
- умеет объяснять выбор;
- умеет признать неопределённость и задать уточняющий вопрос.

## Что показывают лучшие мировые паттерны

### 1. OpenAI Agentic Commerce / ACP

Официальный commerce guide OpenAI описывает правильный паттерн для commerce agents:

- агент работает поверх **structured state**;
- на каждом шаге вызывает **tools**;
- держит пользователя в курсе прогресса;
- не превращает весь workflow в один магический ответ модели.

Это почти идеальный architectural match для нашего будущего бота.

Вывод для нас:

- Telegram bot должен стать `commerce copilot`, а не “LLM-answer wrapper”.
- Важнее всего не красота ответа, а качество `state -> tools -> grounded result`.

### 2. OpenAI memory / context personalization patterns

Официальные cookbook-patterns OpenAI по personalization и long-term memory показывают, что сильные агенты держатся на:

- persistent state;
- selective memory injection;
- session notes;
- memory consolidation;
- pruning stale memory.

Вывод для нас:

- одного `user_profile` недостаточно;
- нужен минимум из трёх уровней памяти:
  - `profile memory`
  - `session memory`
  - `household memory`

### 3. OpenAI eval-first guidance

Официальные guidance OpenAI по model selection и evals прямо рекомендуют:

- golden set на `50-100` экспертно проверенных примеров;
- мерить `factuality`, `hallucination rate`, `tool-error rate`;
- валидировать tool reliability и edge cases;
- логировать всё, что критично для качества.

Вывод для нас:

- “нравится ответ или нет” недостаточно;
- нужен отдельный evaluator layer для cheapest, basket, health reasoning и clarification quality.

### 4. Groq / OpenRouter tool + structured output path

Официальные docs Groq и OpenRouter подтверждают, что current-gen stack уже поддерживает:

- tool calling;
- structured outputs;
- schema-driven orchestration.

Но они не обещают semantic correctness сами по себе.

Вывод для нас:

- tool calling нужен обязательно;
- но без нормальных read-models, validators и evaluator-блока бот всё равно останется “умным на вид, слабым по сути”.

### 5. Instacart / Walmart / Samsung Food / Yuka-like pattern

По рынку видно, что сильные продукты строят AI не вокруг одной функции, а вокруг цепочек:

- `goal -> plan -> shoppable result`
- `meal plan -> shopping list -> basket`
- `ingredient signal -> explainability -> safer swap`
- `memory -> personalization -> repeatable household utility`

Вывод для нас:

- наш moat не в одном ответе, а в том, что бот сможет закрывать бытовой loop целиком.

## Что именно должен делать AI, а что нет

### AI должен делать

- понимать свободный бытовой запрос;
- определять намерение;
- извлекать ограничения, бюджет, цели, диагнозы, приоритеты;
- выбирать последовательность действий;
- решать, нужно ли уточнение;
- объяснять выбор понятным человеческим языком;
- предлагать safer swaps и follow-ups;
- поддерживать continuity между сообщениями.

### AI не должен делать

- выдумывать товары;
- выдумывать цены, составы, скидки или ссылки;
- сам “догадываться” о наличии продукта в каталоге без проверки tools;
- выдавать медицинские обещания;
- выдавать плохую корзину только потому, что модель “должна ответить”.

### Детерминированный слой должен отвечать за

- каталог и SKU truth;
- exact cheapest logic;
- money math;
- unit economics;
- category/read-models;
- profile persistence;
- safety guards;
- answer validators;
- trust scoring.

## Архитектура действительно умного grocery bot

### Layer 1. Conversation Planner

Вход: любой свободный текст пользователя.

Выход: строгий план, например:

- `save_profile`
- `search_products`
- `find_cheapest`
- `build_basket`
- `compare_products`
- `analyze_for_condition`
- `ask_clarifying_question`

Требования:

- strict JSON schema;
- confidence field;
- extracted entities;
- list of candidate actions;
- explicit “need clarification” signal.

### Layer 2. Tool Execution Layer

Базовый tool set для нашего проекта:

- `save_user_profile`
- `load_user_profile`
- `search_products`
- `find_cheapest_offer`
- `compare_offers`
- `build_budget_basket`
- `analyze_composition`
- `find_safer_swaps`
- `load_recent_history`

Требования:

- каждый tool возвращает compact structured payload;
- каждый tool имеет validator;
- каждый tool может вернуть `quality_warning` вместо fake-success.

### Layer 3. Grocery Read-Model Layer

Это сердце умного grocery copilot.

Здесь живут:

- staple commodity models;
- category family maps;
- unit normalization;
- duplicate family suppression;
- brand/product canonicalization;
- basket seeds;
- substitute graph;
- price-per-unit model.

Без этого LLM будет выглядеть умной, но покупать “круассан с маслом” вместо масла.

### Layer 4. Memory Layer

Нужны минимум 3 вида памяти:

1. `Profile Memory`
   - бюджет
   - диагнозы
   - аллергии
   - исключаемые ингредиенты
   - любимые магазины
   - household size

2. `Session Memory`
   - что пользователь хотел в этой сессии
   - какой тип корзины уже обсуждали
   - что уточняли
   - какие ответы уже не подошли

3. `Routine Memory`
   - типичные weekly baskets
   - repeat purchases
   - реакция на прошлые рекомендации
   - standing intents вроде “если масло дорожает — сообщи”

### Layer 5. Health / Nutrition Intelligence

Этот слой должен быть гибридным:

- deterministic ingredient signals
- rule-based risk markers
- LLM explanation layer

Он должен уметь:

- сахар / подсластители / сиропы
- натрий / пересоленные продукты
- ultra-processed hints
- lactose/gluten triggers
- short vs noisy composition
- safer alternative suggestions

И очень важно:

- всегда показывать причину;
- не выдавать медицинские гарантии.

### Layer 6. Final Synthesis Layer

Финальный ответ пользователю формирует ИИ, но только **после** tool execution.

Ответ должен:

- быть grounded;
- быть human-friendly;
- содержать реальные ссылки;
- объяснять выбор;
- явно говорить, когда данных недостаточно;
- задавать один хороший уточняющий вопрос, если задача слишком широкая.

### Layer 7. Evaluator / Critic Layer

Этот слой сейчас у нас почти отсутствует, а без него бот не станет world-class.

Он должен проверять:

- ответ реально grounded?
- cheapest действительно про нужный товар?
- корзина не однотипная и не мусорная?
- диагноз-aware советы не противоречат базовой safety logic?
- нужны ли уточнения вместо уверенного ответа?

## Что у нас сейчас есть и чего не хватает

### Уже есть

- Telegram webhook runtime
- tool-calling path через Groq
- Turso как grounded catalog
- persistent profile v1
- basket engine v1
- staple commodity read-model v1
- inline mode

### Не хватает

- strict planner contract with confidence
- dedicated read-model layer outside chat runtime
- real compare mode
- household/session memory
- nutrition reasoning layer v2
- trust/evaluator layer
- proactive intents
- standing routines
- explicit clarification engine
- golden-set eval harness

## Что должно появиться, чтобы бот стал “по-настоящему умным”

### P0. Trust Foundation

- planner JSON contract
- tool validators
- answer validator
- clarification engine
- refusal on weak basket / weak cheapest
- golden set для 50-100 user tasks

### P1. Grocery Brain

- read-model layer outside bot-worker
- category families
- substitute graph
- price per unit
- basket seed library
- cheapest exactness scoring

### P2. Health Copilot

- composition features table
- risk marker extraction
- condition-aware scoring
- safer swaps
- “why this product” explanations

### P3. Household Copilot

- session memory
- routine memory
- weekly basket templates
- repeat order memory
- family profile

### P4. Proactive Grocery Agent

- standing intents
- scheduled nudges
- watchlists
- price-drop alerts by household need
- pantry depletion / refill suggestions

## Какие evals нужны именно нам

### 1. Intent Understanding Evals

Набор:

- `где дешевле купить масло`
- `собери корзину на неделю при диабете`
- `у меня аллергия на лактозу`
- `что взять на перекус без сахара`
- `покажи гречку и ссылки`

Мерить:

- intent accuracy
- entity extraction accuracy
- clarification precision

### 2. Cheapest Accuracy Evals

Мерить:

- top-1 relevance
- exact commodity precision
- false match rate

### 3. Basket Realism Evals

Мерить:

- family diversity
- real-life usefulness
- duplicate suppression
- budget adherence

### 4. Health Reasoning Evals

Мерить:

- groundedness to composition
- explanation quality
- unsafe overclaim rate

### 5. Conversation Quality Evals

Мерить:

- did the bot ask the right clarification?
- did the bot remember user constraints?
- did the bot reduce friction over turns?

## Какой target state нужен нашему боту

Идеальный сценарий:

Пользователь пишет:

`Собери мне недорогую корзину на 5 дней, у меня диабет, без лактозы, нужен перекус для работы и база на ужин`

Что делает система:

1. planner извлекает intent, бюджет, ограничения, meal context;
2. tools поднимают профиль и recent memory;
3. read-model собирает базовые продуктовые семьи;
4. health layer фильтрует и понижает рискованные товары;
5. basket engine строит 2-3 plausible baskets;
6. evaluator отбраковывает слабые;
7. LLM synthesizer объясняет лучший вариант;
8. бот предлагает follow-up:
   - дешевле
   - полезнее
   - больше белка
   - показать альтернативы

Вот это и будет уже не “фэйково умный бот”, а реальный grocery copilot.

## Что меняется в roadmap проекта

После этого исследования продуктовый roadmap должен явно содержать отдельный AI track:

1. `AI planner contract`
2. `tool/result validation`
3. `session + household memory`
4. `nutrition intelligence`
5. `evaluator / critic`
6. `proactive grocery agent`

Без этого мы будем всё время лечить симптомы в поиске, а не строить умный слой.

## Источники

- OpenAI Agentic Commerce: https://developers.openai.com/commerce/
- OpenAI search result snapshot on commerce / structured state / tools: https://developers.openai.com/commerce/
- OpenAI cookbook search snapshot on long-term memory and state management: https://developers.openai.com/cookbook/examples/agents_sdk/context_personalization/
- OpenAI cookbook search snapshot on evals and tool reliability: https://developers.openai.com/cookbook/examples/partners/model_selection_guide/model_selection_guide/
- OpenAI cookbook search snapshot on agent best practices: https://developers.openai.com/cookbook/examples/agents_sdk/multi-agent-portfolio-collaboration/multi_agent_portfolio_collaboration/
- Groq Tool Use: https://console.groq.com/docs/tool-use/overview
- Groq Local Tool Calling: https://console.groq.com/docs/tool-use/local-tool-calling
- OpenRouter Structured Outputs: https://openrouter.ai/docs/guides/features/structured-outputs
- OpenAI + Instacart: https://openai.com/index/instacart-partnership
- Instacart smart commerce / connected food experiences: https://investors.instacart.com/node/8041/pdf
- Walmart Sparky: https://corporate.walmart.com/news/2025/06/06/walmart-the-future-of-shopping-is-agentic-meet-sparky
- Walmart + Google shopping agents: https://corporate.walmart.com/news/2026/01/11/walmart-and-google-turn-ai-discovery-into-effortless-shopping-experiences
- Samsung Food: https://samsungfood.com/
- Samsung Food meal planner: https://samsungfood.com/meal-planner
- Yuka: https://yuka.io/en/

## Уровень уверенности

Высокая уверенность:

- world-class shopping assistants используют layered architecture, а не один prompt
- tool + state + memory + evaluator важнее чисто текстовой “умности”

Умеренная уверенность:

- именно такая комбинация слоёв даст нам шанс стать одним из сильнейших в мире в нашем niche-сегменте

Низкая уверенность:

- утверждение, что никто в мире не сочетает все эти слои одновременно

Это следует считать рабочей стратегической гипотезой, а не доказанным фактом.
