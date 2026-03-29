# API Map

Дата проверки: 2026-03-29  
Роль: P-WEB

## Site Intelligence

### Green
- URL: `https://green-dostavka.by`
- Тип: XHR API + SSR hydration
- Защита: без явного challenge
- Robots: закрыты поиск, account, payment и query-heavy страницы; `/api` не закрыт
- Подтвержденные эндпоинты:
  - `GET /api/v1/categories/`
  - `GET /api/v1/products?storeId=2&categoryId=<id>&limit=<n>&skip=<n>`
  - `GET /api/v1/products/special-offers?storeId=2&limit=<n>&skip=<n>`
  - `GET /api/v1/products/<slug>?storeId=2`

### Edostavka
- URL: `https://edostavka.by`
- Тип: SSR + Next.js `/_next/data/{buildId}/...json`
- Защита: build id меняется, challenge не обнаружен
- Robots: закрыты query-heavy страницы, profile, checkout, order
- Подтвержденные JSON-маршруты:
  - `GET /_next/data/{buildId}/index.json`
  - `GET /_next/data/{buildId}/category/<id>.json?page=<n>`
  - `GET /_next/data/{buildId}/actions.json`
  - `GET /_next/data/{buildId}/actions/<tagAlias>.json?page=<n>`

### Gippo
- URL: `https://gippo-market.by`
- Тип: SPA + guest REST API
- Защита: для товаров нужен `market_id`
- Robots: запрещены favorites, search и query pages; `/api` не указан
- Подтвержденные эндпоинты:
  - `GET /api/guest/initial-data` -> текущий `market_id=73`
  - `GET /api/guest/shop/categories?market_id=<id>`
  - `GET /api/guest/shop/products?market_id=<id>&page=<n>&per_page=<n>&filter[categories][slug]=<slug>`
  - `GET /api/guest/shop/products?market_id=<id>&page=<n>&per_page=<n>&filter[promo]=1`

### Emall
- URL: `https://emall.by`
- Тип: SSR + Next.js `/_next/data/{buildId}/...json`
- Защита: build id меняется, challenge не обнаружен
- Robots: `/api/` закрыт для Googlebot, поэтому взят storefront JSON `/_next/data/...json`
- Подтвержденные JSON-маршруты:
  - `GET /_next/data/{buildId}/index.json`
  - `GET /_next/data/{buildId}/category/<id>.json?page=<n>`
  - `GET /_next/data/{buildId}/actions.json`
  - `GET /_next/data/{buildId}/actions/<slug>.json?page=<n>`

## DevTools Refresh Guide

### Green
1. Открой `https://green-dostavka.by`.
2. DevTools -> Network -> фильтр `Fetch/XHR`.
3. Кликни каталог, категорию и карточку товара.
4. Подтверди запросы к `/api/v1/categories/`, `/api/v1/products`, `/api/v1/products/special-offers`.
5. Зафиксируй `storeId`, `categoryId`, `limit`, `skip`.

### Edostavka
1. Открой `https://edostavka.by`.
2. В HTML или DevTools найди `"buildId":"..."`.
3. Открой категорию `/category/<id>` и акцию `/actions/<tagAlias>`.
4. Подтверди:
   - `/_next/data/{buildId}/category/<id>.json?page=<n>`
   - `/_next/data/{buildId}/actions.json`
   - `/_next/data/{buildId}/actions/<tagAlias>.json?page=<n>`

### Gippo
1. Открой `https://gippo-market.by`.
2. DevTools -> Network -> `Fetch/XHR`.
3. Найди `GET https://app.willesden.by/api/guest/initial-data`.
4. Запиши `market_id`.
5. Затем открой категорию и вкладку акций, чтобы подтвердить:
   - `/api/guest/shop/categories`
   - `/api/guest/shop/products?...filter[categories][slug]=...`
   - `/api/guest/shop/products?...filter[promo]=1`

### Emall
1. Открой `https://emall.by`.
2. Найди `"buildId":"..."` в HTML.
3. Открой категорию `/category/<id>` и акцию `/actions/<slug>`.
4. Подтверди:
   - `/_next/data/{buildId}/category/<id>.json?page=<n>`
   - `/_next/data/{buildId}/actions.json`
   - `/_next/data/{buildId}/actions/<slug>.json?page=<n>`

## Notes
- Green и Gippo дают прямые API-ответы с ценами.
- Edostavka и Emall на текущем срезе удобнее читать через storefront JSON `/_next/data/...json`.
- Для Gippo без `market_id` товар приходит без рыночного предложения и цены.
