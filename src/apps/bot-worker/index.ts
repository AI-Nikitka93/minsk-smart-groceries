import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  like,
  lte,
  sql,
} from "drizzle-orm";
import { createDatabase } from "../../db/repositories";
import { canonicalProduct, currentOffer, store } from "../../db/schema";

const APP_NAME = "smart-grocery-bot-worker";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const TELEGRAM_API_BASE = "https://api.telegram.org";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_ASSISTANT_PRODUCTS = 8;
const MAX_INLINE_PRODUCTS = 5;
const GROQ_TIMEOUT_MS = 7_000;
const STOP_WORDS = new Set([
  "а",
  "без",
  "в",
  "во",
  "вы",
  "где",
  "для",
  "до",
  "его",
  "ее",
  "если",
  "же",
  "за",
  "и",
  "из",
  "или",
  "их",
  "к",
  "как",
  "какая",
  "какие",
  "какой",
  "какую",
  "ли",
  "мне",
  "на",
  "надо",
  "не",
  "но",
  "о",
  "об",
  "от",
  "по",
  "под",
  "про",
  "с",
  "со",
  "собери",
  "собрать",
  "сколько",
  "могу",
  "можно",
  "моя",
  "мой",
  "мои",
  "мы",
  "ты",
  "у",
  "хочу",
  "что",
  "чтобы",
  "это",
  "эта",
  "этот",
  "эти",
  "я",
  "руб",
  "рубля",
  "рублей",
  "р",
  "byn",
]);

interface BotWorkerEnv {
  BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  GROQ_API_KEY: string;
  GROQ_MODEL?: string;
  BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_PATH?: string;
  BUILD_DATE_UTC?: string;
  GIT_SHA?: string;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  username?: string;
  language_code?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
}

interface TelegramInlineQuery {
  id: string;
  from: TelegramUser;
  query: string;
  offset: string;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  inline_query?: TelegramInlineQuery;
}

interface TelegramApiEnvelope<T> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

interface GroqChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

interface AssistantProductRow {
  offerId: string;
  storeId: string;
  storeName: string;
  canonicalProductId: string;
  title: string;
  brand: string | null;
  compositionText: string | null;
  imageUrl: string | null;
  url: string;
  available: boolean;
  priceMinor: number | null;
  oldPriceMinor: number | null;
  discountPercent: number | null;
  searchText: string;
}

interface SearchIntent {
  normalizedQuery: string;
  searchTerms: string[];
  wantsHealthy: boolean;
  wantsCheap: boolean;
  budgetMinor: number | null;
}

let cachedDatabase: ReturnType<typeof createDatabase> | null = null;
let cachedDatabaseKey: string | null = null;

export default {
  async fetch(request: Request, env: BotWorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({
        ok: true,
        app: APP_NAME,
        author: "Nikita",
        nickname: "AI_Nikitka93",
        checkedAt: new Date().toISOString(),
        buildDateUtc: env.BUILD_DATE_UTC ?? null,
        gitSha: env.GIT_SHA ?? null,
        webhookPath: getWebhookPath(env),
        missingBindings: getMissingBindings(env),
      });
    }

    if (request.method !== "POST" || url.pathname !== getWebhookPath(env)) {
      return new Response("Not Found", { status: 404 });
    }

    const missingBindings = getMissingBindings(env);
    if (missingBindings.length > 0) {
      return jsonResponse(
        {
          ok: false,
          error: `Missing required bindings: ${missingBindings.join(", ")}`,
        },
        500,
      );
    }

    if (!isWebhookSecretValid(request, env)) {
      return jsonResponse(
        {
          ok: false,
          error: "Invalid Telegram webhook secret",
        },
        401,
      );
    }

    let update: TelegramUpdate;
    try {
      update = (await request.json()) as TelegramUpdate;
    } catch (error) {
      console.error("Failed to parse Telegram update JSON", error);
      return jsonResponse({ ok: false, error: "Invalid JSON payload" }, 400);
    }

    ctx.waitUntil(processTelegramUpdate(update, env));
    return new Response("ok", { status: 200 });
  },
};

async function processTelegramUpdate(update: TelegramUpdate, env: BotWorkerEnv): Promise<void> {
  try {
    if (update.message?.from?.is_bot) {
      return;
    }

    if (update.message) {
      await handleMessage(update.message, env);
      return;
    }

    if (update.inline_query) {
      await handleInlineQuery(update.inline_query, env);
    }
  } catch (error) {
    console.error(`Failed to process Telegram update ${update.update_id}`, error);
  }
}

async function handleMessage(message: TelegramMessage, env: BotWorkerEnv): Promise<void> {
  const text = message.text?.trim();
  if (!text) {
    await sendTelegramText(
      env,
      message.chat.id,
      "Пока я понимаю только текстовые запросы. Напишите, например: Где дешевле купить молоко?",
    );
    return;
  }

  if (text === "/start" || text.startsWith("/start ")) {
    await sendTelegramText(env, message.chat.id, buildStartMessage(env));
    return;
  }

  const db = getDatabase(env);
  const products = await searchProducts(db, text, MAX_ASSISTANT_PRODUCTS);
  const replyText = await buildAssistantReply(env, text, products);
  await sendTelegramText(env, message.chat.id, replyText);
}

async function handleInlineQuery(query: TelegramInlineQuery, env: BotWorkerEnv): Promise<void> {
  const rawQuery = query.query.trim();

  if (!rawQuery) {
    await answerInlineQuery(env, query.id, [], true, 1);
    return;
  }

  const db = getDatabase(env);
  const products = await searchProducts(db, rawQuery, MAX_INLINE_PRODUCTS);
  const results = products.slice(0, MAX_INLINE_PRODUCTS).map((product) => ({
    type: "article",
    id: product.offerId,
    title: `${product.title} — ${formatMinorUnits(product.priceMinor)}`,
    description: [
      product.storeName,
      product.discountPercent !== null ? `скидка ${product.discountPercent}%` : null,
      product.available ? "в наличии" : "нет в наличии",
    ]
      .filter((value): value is string => Boolean(value))
      .join(" • "),
    thumb_url: product.imageUrl ?? undefined,
    url: product.url,
    hide_url: false,
    input_message_content: {
      message_text: buildInlineResultMessage(product),
      parse_mode: "HTML",
      disable_web_page_preview: false,
    },
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Открыть товар",
            url: product.url,
          },
        ],
      ],
    },
  }));

  await answerInlineQuery(env, query.id, results, true, 15);
}

function getDatabase(env: BotWorkerEnv) {
  const cacheKey = `${env.TURSO_DATABASE_URL}::${env.TURSO_AUTH_TOKEN.slice(0, 8)}`;
  if (!cachedDatabase || cachedDatabaseKey !== cacheKey) {
    cachedDatabase = createDatabase(env);
    cachedDatabaseKey = cacheKey;
  }

  return cachedDatabase;
}

async function searchProducts(
  db: ReturnType<typeof createDatabase>,
  query: string,
  limit: number,
): Promise<AssistantProductRow[]> {
  const intent = buildSearchIntent(query);
  const primaryMatches = intent.searchTerms.length
    ? await selectMatchingOffers(db, intent, limit)
    : [];

  if (primaryMatches.length >= Math.min(3, limit)) {
    return primaryMatches;
  }

  const fallbackMatches = await selectFallbackOffers(db, intent, limit);
  return dedupeOffers([...primaryMatches, ...fallbackMatches]).slice(0, limit);
}

async function selectMatchingOffers(
  db: ReturnType<typeof createDatabase>,
  intent: SearchIntent,
  limit: number,
): Promise<AssistantProductRow[]> {
  const predicates = [
    eq(currentOffer.available, true),
    isNotNull(currentOffer.priceMinor),
    ...intent.searchTerms.map((term) => like(canonicalProduct.searchText, `%${term}%`)),
  ];

  if (intent.budgetMinor !== null) {
    predicates.push(lte(currentOffer.priceMinor, Math.max(intent.budgetMinor, 100)));
  }

  const rows = await db
    .select({
      offerId: currentOffer.id,
      storeId: currentOffer.storeId,
      storeName: store.name,
      canonicalProductId: currentOffer.canonicalProductId,
      title: currentOffer.title,
      brand: canonicalProduct.brand,
      compositionText: currentOffer.compositionText,
      imageUrl: currentOffer.imageUrl,
      url: currentOffer.url,
      available: currentOffer.available,
      priceMinor: currentOffer.priceMinor,
      oldPriceMinor: currentOffer.oldPriceMinor,
      discountPercent: currentOffer.discountPercent,
      searchText: canonicalProduct.searchText,
    })
    .from(currentOffer)
    .innerJoin(canonicalProduct, eq(currentOffer.canonicalProductId, canonicalProduct.id))
    .innerJoin(store, eq(currentOffer.storeId, store.id))
    .where(and(...predicates))
    .orderBy(
      intent.wantsCheap || intent.budgetMinor !== null
        ? asc(currentOffer.priceMinor)
        : desc(sql<number>`coalesce(${currentOffer.discountPercent}, 0)`),
      asc(currentOffer.priceMinor),
      asc(currentOffer.title),
    )
    .limit(limit);

  return rows;
}

async function selectFallbackOffers(
  db: ReturnType<typeof createDatabase>,
  intent: SearchIntent,
  limit: number,
): Promise<AssistantProductRow[]> {
  const predicates = [eq(currentOffer.available, true), isNotNull(currentOffer.priceMinor)];

  if (intent.wantsHealthy) {
    predicates.push(isNotNull(currentOffer.compositionText));
  }

  if (intent.budgetMinor !== null) {
    predicates.push(lte(currentOffer.priceMinor, Math.max(Math.floor(intent.budgetMinor / 2), 150)));
  }

  const rows = await db
    .select({
      offerId: currentOffer.id,
      storeId: currentOffer.storeId,
      storeName: store.name,
      canonicalProductId: currentOffer.canonicalProductId,
      title: currentOffer.title,
      brand: canonicalProduct.brand,
      compositionText: currentOffer.compositionText,
      imageUrl: currentOffer.imageUrl,
      url: currentOffer.url,
      available: currentOffer.available,
      priceMinor: currentOffer.priceMinor,
      oldPriceMinor: currentOffer.oldPriceMinor,
      discountPercent: currentOffer.discountPercent,
      searchText: canonicalProduct.searchText,
    })
    .from(currentOffer)
    .innerJoin(canonicalProduct, eq(currentOffer.canonicalProductId, canonicalProduct.id))
    .innerJoin(store, eq(currentOffer.storeId, store.id))
    .where(and(...predicates))
    .orderBy(
      intent.wantsHealthy
        ? asc(currentOffer.priceMinor)
        : desc(sql<number>`coalesce(${currentOffer.discountPercent}, 0)`),
      asc(currentOffer.priceMinor),
      asc(currentOffer.title),
    )
    .limit(limit);

  return rows;
}

function dedupeOffers(rows: AssistantProductRow[]): AssistantProductRow[] {
  const seen = new Set<string>();
  const deduped: AssistantProductRow[] = [];

  for (const row of rows) {
    if (seen.has(row.offerId)) {
      continue;
    }

    seen.add(row.offerId);
    deduped.push(row);
  }

  return deduped;
}

function buildSearchIntent(query: string): SearchIntent {
  const normalizedQuery = normalizeQuery(query);
  const rawTerms = normalizedQuery
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  const searchTerms = rawTerms.filter(
    (part) =>
      !STOP_WORDS.has(part) &&
      !/^\d+$/.test(part) &&
      !["здоровую", "здоровый", "здоровая", "полезную", "дешевле", "дешево", "корзину"].includes(part),
  );

  return {
    normalizedQuery,
    searchTerms: [...new Set(searchTerms)],
    wantsHealthy: /(здоров|полез|натурал|без\s+сахар|состав)/.test(normalizedQuery),
    wantsCheap: /(дешев|выгод|эконом|акци|скид)/.test(normalizedQuery),
    budgetMinor: extractBudgetMinor(normalizedQuery),
  };
}

function extractBudgetMinor(query: string): number | null {
  const match = query.match(/(\d+(?:[.,]\d+)?)\s*(?:руб|рубля|рублей|byn|р)\b/);
  if (!match) {
    return null;
  }

  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  return Math.round(amount * 100);
}

async function buildAssistantReply(
  env: BotWorkerEnv,
  userQuery: string,
  products: AssistantProductRow[],
): Promise<string> {
  if (products.length === 0) {
    return [
      "Я не нашёл подходящих товаров по этому запросу.",
      "Попробуйте уточнить продукт, бренд или категорию, например:",
      "• Где дешевле купить молоко?",
      "• Найди сыр до 8 рублей",
      "• Собери полезную корзину на 20 рублей",
    ].join("\n");
  }

  try {
    return await queryGroqAssistant(env, userQuery, products);
  } catch (error) {
    console.error("Groq assistant call failed, falling back to direct summary", error);
    return buildFallbackAssistantReply(userQuery, products);
  }
}

async function queryGroqAssistant(
  env: BotWorkerEnv,
  userQuery: string,
  products: AssistantProductRow[],
): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Groq timeout"), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        temperature: 0.25,
        max_completion_tokens: 500,
        messages: [
          {
            role: "system",
            content: [
              "Ты Smart Grocery Assistant для Минска.",
              "Отвечай только на основе переданных товаров и не выдумывай позиции, цены или составы.",
              "Все цены пиши в белорусских рублях с двумя знаками после запятой.",
              "Если пользователь просит подобрать корзину, предложи 3-6 конкретных товаров и объясни выбор.",
              "Если данных мало, честно скажи об этом и дай следующий лучший вариант.",
              "Формат ответа: короткий заголовок, затем маркированный список и короткий вывод.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                query: userQuery,
                products: products.map((product) => ({
                  title: product.title,
                  store: product.storeName,
                  priceRub: formatMinorUnits(product.priceMinor),
                  oldPriceRub: formatMinorUnits(product.oldPriceMinor),
                  discountPercent: product.discountPercent,
                  available: product.available,
                  composition: product.compositionText,
                  url: product.url,
                })),
              },
              null,
              2,
            ),
          },
        ],
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) {
      throw new Error(
        `Groq API ${response.status}: ${payload.error?.message ?? JSON.stringify(payload)}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Groq returned an empty assistant message");
    }

    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function buildFallbackAssistantReply(
  userQuery: string,
  products: AssistantProductRow[],
): string {
  const lines = [
    `Подобрал варианты по запросу: ${userQuery}`,
    "",
    ...products.slice(0, 5).map((product, index) => {
      const extras = [
        `${product.storeName}`,
        product.discountPercent !== null ? `скидка ${product.discountPercent}%` : null,
        product.compositionText ? `состав: ${truncate(product.compositionText, 90)}` : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" • ");

      return `${index + 1}. ${product.title} — ${formatMinorUnits(product.priceMinor)}\n${extras}\n${product.url}`;
    }),
    "",
    "Если хотите, я могу сузить подборку по бюджету, составу или магазину.",
  ];

  return lines.join("\n");
}

async function sendTelegramText(
  env: BotWorkerEnv,
  chatId: number,
  text: string,
): Promise<void> {
  await callTelegramApi(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: false,
  });
}

async function answerInlineQuery(
  env: BotWorkerEnv,
  inlineQueryId: string,
  results: unknown[],
  isPersonal: boolean,
  cacheTime: number,
): Promise<void> {
  await callTelegramApi(env, "answerInlineQuery", {
    inline_query_id: inlineQueryId,
    results,
    is_personal: isPersonal,
    cache_time: cacheTime,
  });
}

async function callTelegramApi<T>(
  env: BotWorkerEnv,
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${env.BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let responseBody: TelegramApiEnvelope<T> | Record<string, unknown> | null = null;
  try {
    responseBody = (await response.json()) as TelegramApiEnvelope<T>;
  } catch (error) {
    console.error(`Telegram ${method} returned non-JSON response`, error);
  }

  const isOk = Boolean((responseBody as TelegramApiEnvelope<T> | null)?.ok);
  if (!response.ok || !isOk) {
    const description =
      (responseBody as TelegramApiEnvelope<T> | null)?.description ?? JSON.stringify(responseBody);
    throw new Error(`Telegram API ${method} failed with ${response.status}: ${description}`);
  }

  return (responseBody as TelegramApiEnvelope<T>).result as T;
}

function buildInlineResultMessage(product: AssistantProductRow): string {
  const parts = [
    `<b>${escapeHtml(product.title)}</b>`,
    `${escapeHtml(product.storeName)} — ${escapeHtml(formatMinorUnits(product.priceMinor))}`,
    product.discountPercent !== null
      ? `Скидка: ${escapeHtml(`${product.discountPercent}%`)}`
      : null,
    product.oldPriceMinor !== null
      ? `Старая цена: ${escapeHtml(formatMinorUnits(product.oldPriceMinor))}`
      : null,
    product.compositionText
      ? `Состав: ${escapeHtml(truncate(product.compositionText, 160))}`
      : null,
    product.url,
  ].filter((value): value is string => Boolean(value));

  return parts.join("\n");
}

function buildStartMessage(env: BotWorkerEnv): string {
  const inlineHint = env.BOT_USERNAME
    ? `В любом чате можно написать: @${env.BOT_USERNAME} сыр`
    : "В inline-режиме введите @ваш_бот сыр в любом чате.";

  return [
    "Привет! Я Smart Grocery Assistant для Минска.",
    "",
    "Что я умею:",
    "• искать, где дешевле купить продукт;",
    "• подбирать корзину под ваш бюджет;",
    "• учитывать состав и помогать с более полезным выбором;",
    "• работать в inline-режиме и скидывать карточки товаров в чат.",
    "",
    "Примеры запросов:",
    "• Где дешевле купить молоко?",
    "• Собери мне здоровую корзину на 20 рублей",
    "• Найди сыр до 8 рублей",
    "",
    `Inline: ${inlineHint}`,
    "",
    "Создано @AI_Nikitka93",
  ].join("\n");
}

function formatMinorUnits(minorUnits: number | null): string {
  if (minorUnits === null || Number.isNaN(minorUnits)) {
    return "цена не указана";
  }

  return `${(minorUnits / 100).toFixed(2)} руб`;
}

function normalizeQuery(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.,%-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isWebhookSecretValid(request: Request, env: BotWorkerEnv): boolean {
  const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
  return secret === env.WEBHOOK_SECRET;
}

function getWebhookPath(env: BotWorkerEnv): string {
  return env.TELEGRAM_WEBHOOK_PATH?.startsWith("/")
    ? env.TELEGRAM_WEBHOOK_PATH
    : "/webhook";
}

function getMissingBindings(env: BotWorkerEnv): string[] {
  const required: Array<keyof BotWorkerEnv> = [
    "BOT_TOKEN",
    "WEBHOOK_SECRET",
    "TURSO_DATABASE_URL",
    "TURSO_AUTH_TOKEN",
    "GROQ_API_KEY",
  ];

  return required.filter((key) => !env[key] || String(env[key]).trim().length === 0);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
