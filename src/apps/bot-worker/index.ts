import {
  and,
  asc,
  desc,
  eq,
  isNotNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { createDatabase } from "../../db/repositories";
import { canonicalProduct, currentOffer, store, userProfile } from "../../db/schema";

const APP_NAME = "smart-grocery-bot-worker";
const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";
const TELEGRAM_API_BASE = "https://api.telegram.org";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_ASSISTANT_PRODUCTS = 8;
const MAX_INLINE_PRODUCTS = 5;
const GROQ_TIMEOUT_MS = 7_000;
const PREPARED_FOOD_HINTS = new Set([
  "котлета",
  "стейк",
  "филе",
  "салат",
  "круассан",
  "слойка",
  "багет",
  "трубочки",
  "лепешка",
  "лепёшка",
  "соус",
  "сырники",
  "пицца",
  "бургер",
  "сэндвич",
  "сендвич",
  "ролл",
  "роллини",
]);
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
  "меня",
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
  "при",
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
  "купить",
  "купи",
  "найди",
  "найти",
  "покажи",
  "показать",
  "подбери",
  "подобрать",
  "подбор",
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
  "бюджет",
  "вкусный",
  "вкусная",
  "вкусное",
  "вкусные",
  "свежий",
  "свежая",
  "свежее",
  "свежие",
  "лучший",
  "лучшая",
  "лучшее",
  "лучшие",
  "хороший",
  "хорошая",
  "хорошее",
  "хорошие",
  "приготовить",
  "приготовь",
  "приготовит",
  "приготовлю",
  "приготовим",
  "ужин",
  "обед",
  "завтрак",
  "ужина",
  "обеда",
  "завтрака",
  "сделай",
  "сделать",
  "хочется",
  "нужно",
  "нужен",
  "нужна",
  "нужны",
  "день",
  "дня",
  "дней",
  "неделя",
  "неделю",
  "недели",
  "месяц",
  "месяца",
]);
const LOW_SIGNAL_BASKET_HINTS = new Set([
  "соус",
  "сладость",
  "слойка",
  "круассан",
  "язычки",
  "язычк",
  "трубочки",
  "роллини",
  "печенье",
  "конфеты",
  "батончик",
  "шоколад",
  "десерт",
]);
const DIAGNOSIS_RULES = [
  {
    key: "diabetes",
    label: "сахарный диабет",
    match: /диабет|сахарн/iu,
    hardBlockTerms: ["сгущ", "конфет", "шоколад", "торт", "печенье", "ваф", "мармелад"],
    cautionTerms: ["сахар", "сироп", "глюкоз", "фруктоз", "карамел", "сок", "нектар", "газир"],
    positiveTerms: ["без сахара", "цельнозерн", "греч", "овсян"],
  },
  {
    key: "hypertension",
    label: "гипертония",
    match: /гипертони|давлен|гипертенз/iu,
    hardBlockTerms: [],
    cautionTerms: [
      "соль",
      "натрий",
      "колбас",
      "сосиск",
      "ветчин",
      "бекон",
      "копчен",
      "чипс",
      "сухарик",
      "майонез",
      "маринад",
      "рассол",
      "консерв",
    ],
    positiveTerms: ["без соли", "с пониженным содержанием соли", "греч", "овсян"],
  },
  {
    key: "celiac",
    label: "целиакия / без глютена",
    match: /целиаки|глютен/iu,
    hardBlockTerms: ["глютен", "пшениц", "рожь", "ячмен", "манка", "булгур", "пшеничн", "мука"],
    cautionTerms: [],
    positiveTerms: ["без глютена", "gluten free", "рис", "греч"],
  },
  {
    key: "lactose_intolerance",
    label: "непереносимость лактозы",
    match: /лактоз|непереносимост.{0,12}молок/iu,
    hardBlockTerms: ["молок", "лактоз", "сливк", "сливоч", "сыворот", "сметан", "творог"],
    cautionTerms: ["йогурт", "сыр", "кефир"],
    positiveTerms: ["без лактозы", "растительн", "овсян", "соев"],
  },
  {
    key: "gastritis",
    label: "гастрит / чувствительный ЖКТ",
    match: /гастрит|язв|изжог|жкт/iu,
    hardBlockTerms: [],
    cautionTerms: ["остр", "перец", "уксус", "маринад", "копчен", "кисл", "газир", "майонез", "жарен"],
    positiveTerms: ["каша", "греч", "овсян", "рис"],
  },
] as const;
const EXPLICIT_DIET_TERMS = [
  { pattern: /без\s+глютен/iu, label: "без глютена", terms: ["глютен"] },
  { pattern: /без\s+лактоз/iu, label: "без лактозы", terms: ["лактоз", "молок"] },
  { pattern: /без\s+сахар/iu, label: "без сахара", terms: ["сахар", "сироп"] },
  { pattern: /без\s+молок/iu, label: "без молока", terms: ["молок", "сливк", "сыворот"] },
] as const;
type DiagnosisRule = (typeof DIAGNOSIS_RULES)[number];
type DiagnosisKey = DiagnosisRule["key"];

interface DiagnosisContext {
  keys: DiagnosisKey[];
  labels: string[];
  cautionLabels: string[];
  blockedIngredients: string[];
}

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
      role?: "assistant";
      tool_calls?: GroqToolCall[];
    };
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
  };
}

interface GroqToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

interface GroqChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: GroqToolCall[];
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
  matchScore?: number;
  matchKind?: "exact" | "prefix" | "stem" | "loose" | "fallback";
}

interface SearchIntent {
  normalizedQuery: string;
  searchTerms: string[];
  wantsHealthy: boolean;
  wantsCheap: boolean;
  budgetMinor: number | null;
  wantsBasket: boolean;
  wantsDiagnosisAdvice: boolean;
  diagnosisContext: DiagnosisContext;
  preferredStores: string[];
  excludedIngredients: string[];
  healthGoals: string[];
}

type PlannedAction = "search" | "find_cheapest" | "build_basket" | "diagnosis_safe";

interface UserProfilePatch {
  budgetMinor?: number | null;
  preferredStores?: string[];
  excludedIngredients?: string[];
  allergies?: string[];
  diagnoses?: string[];
  healthGoals?: string[];
}

interface BotRequestPlan {
  action: PlannedAction;
  catalogQueries: string[];
  budgetMinor: number | null;
  needsHealthy: boolean;
  needsDiagnosisAdvice: boolean;
  compareCheapest: boolean;
  wantsBasket: boolean;
  profileOnly: boolean;
  responseMode: "direct" | "assistant";
  profilePatch?: UserProfilePatch;
}

interface PersistedUserProfile {
  telegramUserId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  languageCode: string | null;
  budgetMinor: number | null;
  preferredStores: string[];
  excludedIngredients: string[];
  allergies: string[];
  diagnoses: string[];
  healthGoals: string[];
}

interface AgenticReply {
  text: string;
  parseMode?: string;
  replyMarkup?: Record<string, unknown>;
}

interface AgenticToolOutcome {
  name: string;
  payload: Record<string, unknown>;
  updatedProfile?: PersistedUserProfile | null;
  replyMarkup?: Record<string, unknown>;
  parseMode?: string;
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
  const persistedProfile = message.from ? await getPersistedUserProfile(db, message.from) : null;
  const agenticReply = await runAgenticAssistant(env, db, message, persistedProfile);
  if (agenticReply) {
    await sendTelegramText(
      env,
      message.chat.id,
      agenticReply.text,
      agenticReply.replyMarkup,
      agenticReply.parseMode,
    );
    return;
  }

  let queryForSearch = text;
  let intent = buildSearchIntent(queryForSearch, persistedProfile);
  let plan = await planUserRequestWithGroq(env, text, intent, persistedProfile);

  if (!plan) {
    plan = buildFallbackPlan(intent);
  }

  const fallbackProfilePatch = extractFallbackProfilePatch(text, intent);
  if (fallbackProfilePatch) {
    plan.profilePatch = mergeProfilePatches(plan.profilePatch, fallbackProfilePatch);
    if (!plan.profileOnly && intent.searchTerms.length === 0 && !plan.wantsBasket && !plan.compareCheapest) {
      plan.profileOnly = true;
    }
  }

  plan = reconcilePlanWithIntent(plan, intent);

  let effectiveProfile = persistedProfile;
  if (message.from && hasProfilePatch(plan.profilePatch)) {
    effectiveProfile = await upsertPersistedUserProfile(db, message.from, plan.profilePatch ?? {}, persistedProfile);
    intent = buildSearchIntent(queryForSearch, effectiveProfile);
    plan = reconcilePlanWithIntent(plan, intent);
  }

  if (isProfileUpdateOnlyQuery(text, plan, intent)) {
    await sendTelegramText(env, message.chat.id, buildProfileSavedMessage(effectiveProfile));
    return;
  }

  let products = await searchProductsForPlan(db, plan, intent);

  if (shouldAttemptAiRewrite(text, intent, products) && plan.catalogQueries.length <= 1) {
    const rewrittenQuery = await rewriteCatalogQueryWithGroq(env, text, intent);
    if (rewrittenQuery && normalizeQuery(rewrittenQuery) !== intent.normalizedQuery) {
      const rewrittenIntent = buildSearchIntent(rewrittenQuery);
      const rewrittenPlan = buildFallbackPlan(rewrittenIntent);
      const rewrittenProducts = await searchProductsForPlan(db, rewrittenPlan, rewrittenIntent);

      if (rewrittenProducts.length > 0) {
        queryForSearch = rewrittenQuery;
        intent = rewrittenIntent;
        plan = rewrittenPlan;
        products = rewrittenProducts;
      }
    }
  }

  if (plan.wantsBasket) {
    const basketResult = assembleBudgetBasket(products, plan.budgetMinor, intent);
    if (!basketResult.reliable) {
      await sendTelegramText(env, message.chat.id, buildBasketFollowUpMessage(text, basketResult.reason));
      return;
    }

    products = basketResult.items;
  }

  if (products.length === 0) {
    if (message.from && hasProfilePatch(plan.profilePatch) && intent.searchTerms.length === 0) {
      await sendTelegramText(env, message.chat.id, buildProfileSavedMessage(effectiveProfile));
      return;
    }

    if (plan.compareCheapest && intent.searchTerms.length > 0) {
      await sendTelegramText(
        env,
        message.chat.id,
        buildCheapestMissMessage(text, intent.searchTerms),
        buildCheapestMissKeyboard(intent.searchTerms),
      );
      return;
    }

    await sendTelegramText(
      env,
      message.chat.id,
      buildNoResultsMessage(text),
      buildNoResultsKeyboard(),
    );
      return;
  }

  const replyText = await buildAssistantReply(env, text, queryForSearch, products, intent, plan);
  await sendTelegramText(
    env,
    message.chat.id,
    replyText,
    undefined,
    shouldUseMarkdownReply(intent) ? "Markdown" : undefined,
  );
}

async function runAgenticAssistant(
  env: BotWorkerEnv,
  db: ReturnType<typeof createDatabase>,
  message: TelegramMessage,
  persistedProfile: PersistedUserProfile | null,
): Promise<AgenticReply | null> {
  const userQuery = message.text?.trim();
  if (!userQuery) {
    return null;
  }

  const tools = buildAgentToolSchemas();
  const messages: GroqChatMessage[] = [
    {
      role: "system",
      content: [
        "Ты главный AI-ассистент продуктового Telegram-бота для Минска.",
        "Твоя задача: понять сообщение пользователя и СНАЧАЛА вызвать подходящий инструмент, а уже потом отвечать.",
        "Не выдумывай товары, цены, составы, скидки, ссылки, профиль пользователя или диагнозы.",
        "Если пользователь сообщает предпочтения, бюджет, аллергию или диагноз, используй tool save_user_profile.",
        "Если пользователь спрашивает, где дешевле товар, используй tool find_cheapest_offer.",
        "Если пользователь просит обычный поиск товара или ссылки, используй tool search_products.",
        "Если пользователь просит корзину, используй tool build_budget_basket.",
        "Если пользователь спрашивает, что можно при диагнозе или хочет безопасный/здоровый вариант, используй tool analyze_composition.",
        "Если инструмент сообщает, что точного товара нет или корзина слабая, не притворяйся умным: честно попроси одно уточнение.",
        "Отвечай только по-русски.",
        "Формат ответа: короткий заголовок, затем список или 1-2 абзаца.",
        "Для товаров обязательно указывай цену, магазин и прямую ссылку.",
        "Используй Telegram Markdown, но без сложных конструкций.",
      ].join(" "),
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          query: userQuery,
          currentProfile: serializeProfileForModel(persistedProfile),
        },
        null,
        2,
      ),
    },
  ];

  let currentProfile = persistedProfile;
  let lastToolOutcome: AgenticToolOutcome | null = null;

  try {
    for (let iteration = 0; iteration < 4; iteration += 1) {
      const response = await callGroqWithTools(env, messages, tools);
      const assistantMessage = response.choices?.[0]?.message;
      if (!assistantMessage) {
        return lastToolOutcome ? buildAgenticFallbackReply(lastToolOutcome) : null;
      }

      messages.push({
        role: "assistant",
        content: assistantMessage.content ?? undefined,
        tool_calls: assistantMessage.tool_calls,
      });

      const toolCalls = assistantMessage.tool_calls ?? [];
      if (toolCalls.length === 0) {
        const finalText = assistantMessage.content?.trim();
        if (finalText && lastToolOutcome) {
          return {
            text: finalText,
            parseMode: lastToolOutcome?.parseMode ?? "Markdown",
            replyMarkup: lastToolOutcome?.replyMarkup,
          };
        }

        return lastToolOutcome ? buildAgenticFallbackReply(lastToolOutcome) : null;
      }

      for (const toolCall of toolCalls) {
        const outcome = await executeAgentToolCall(
          env,
          db,
          toolCall,
          message.from ?? null,
          currentProfile,
          userQuery,
        );
        if (outcome.updatedProfile) {
          currentProfile = outcome.updatedProfile;
        }
        lastToolOutcome = outcome;

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolCall.function.name,
          content: JSON.stringify(outcome.payload, null, 2),
        });
      }
    }
  } catch (error) {
    console.error("Agentic assistant failed; falling back to legacy flow", error);
    return lastToolOutcome ? buildAgenticFallbackReply(lastToolOutcome) : null;
  }

  return lastToolOutcome ? buildAgenticFallbackReply(lastToolOutcome) : null;
}

function buildAgentToolSchemas(): Record<string, unknown>[] {
  return [
    {
      type: "function",
      function: {
        name: "save_user_profile",
        description: "Сохраняет бюджет, диагнозы, аллергии, исключаемые ингредиенты и другие постоянные предпочтения пользователя.",
        parameters: {
          type: "object",
          properties: {
            budgetRub: { type: ["number", "null"] },
            preferredStores: { type: "array", items: { type: "string" } },
            excludedIngredients: { type: "array", items: { type: "string" } },
            allergies: { type: "array", items: { type: "string" } },
            diagnoses: { type: "array", items: { type: "string" } },
            healthGoals: { type: "array", items: { type: "string" } },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_products",
        description: "Ищет реальные товары по базе, когда пользователь просит найти продукт, варианты, ссылки или показать что есть.",
        parameters: {
          type: "object",
          properties: {
            productQuery: { type: "string" },
            limit: { type: "number" },
            healthy: { type: "boolean" },
            diagnosisAware: { type: "boolean" },
          },
          required: ["productQuery"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "find_cheapest_offer",
        description: "Находит только точные предложения для сценария 'где дешевле купить X'. Если точного совпадения нет, сообщает об этом.",
        parameters: {
          type: "object",
          properties: {
            productQuery: { type: "string" },
            limit: { type: "number" },
          },
          required: ["productQuery"],
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "build_budget_basket",
        description: "Собирает корзину под бюджет и ограничения. Если подборка слабая или мусорная, возвращает просьбу уточнить основу корзины.",
        parameters: {
          type: "object",
          properties: {
            budgetRub: { type: ["number", "null"] },
            durationDays: { type: ["number", "null"] },
            productQueries: { type: "array", items: { type: "string" } },
            healthy: { type: "boolean" },
            diagnosisAware: { type: "boolean" },
          },
          additionalProperties: false,
        },
      },
    },
    {
      type: "function",
      function: {
        name: "analyze_composition",
        description: "Подбирает товары для здорового/безопасного питания с учётом диагноза, состава и ограничений пользователя.",
        parameters: {
          type: "object",
          properties: {
            productQuery: { type: "string" },
            limit: { type: "number" },
          },
          required: ["productQuery"],
          additionalProperties: false,
        },
      },
    },
  ];
}

async function callGroqWithTools(
  env: BotWorkerEnv,
  messages: GroqChatMessage[],
  tools: Record<string, unknown>[],
): Promise<GroqChatCompletionResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Groq tool call timeout"), GROQ_TIMEOUT_MS);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        temperature: 0.2,
        max_completion_tokens: 800,
        tool_choice: "auto",
        tools,
        messages,
      }),
      signal: controller.signal,
    });

    const payload = (await response.json()) as GroqChatCompletionResponse;
    if (!response.ok) {
      throw new Error(`Groq tool call ${response.status}: ${payload.error?.message ?? JSON.stringify(payload)}`);
    }

    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function executeAgentToolCall(
  env: BotWorkerEnv,
  db: ReturnType<typeof createDatabase>,
  toolCall: GroqToolCall,
  telegramUser: TelegramUser | null,
  profile: PersistedUserProfile | null,
  userQuery: string,
): Promise<AgenticToolOutcome> {
  const args = parseToolArguments(toolCall.function.arguments);

  switch (toolCall.function.name) {
    case "save_user_profile":
      return executeSaveUserProfileTool(db, telegramUser, profile, args);
    case "search_products":
      return executeSearchProductsTool(db, profile, args);
    case "find_cheapest_offer":
      return executeFindCheapestTool(db, profile, args);
    case "build_budget_basket":
      return executeBuildBasketTool(db, profile, userQuery, args);
    case "analyze_composition":
      return executeAnalyzeCompositionTool(db, profile, args);
    default:
      return {
        name: toolCall.function.name,
        payload: {
          status: "error",
          message: `Unknown tool: ${toolCall.function.name}`,
        },
      };
  }
}

function parseToolArguments(rawArguments: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(rawArguments);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (error) {
    console.error("Failed to parse tool arguments", error, rawArguments);
  }

  return {};
}

async function executeSaveUserProfileTool(
  db: ReturnType<typeof createDatabase>,
  telegramUser: TelegramUser | null,
  profile: PersistedUserProfile | null,
  args: Record<string, unknown>,
): Promise<AgenticToolOutcome> {
  const patch = normalizeProfilePatch({
    budgetRub: typeof args.budgetRub === "number" ? args.budgetRub : null,
    preferredStores: Array.isArray(args.preferredStores) ? (args.preferredStores as string[]) : [],
    excludedIngredients: Array.isArray(args.excludedIngredients) ? (args.excludedIngredients as string[]) : [],
    allergies: Array.isArray(args.allergies) ? (args.allergies as string[]) : [],
    diagnoses: Array.isArray(args.diagnoses) ? (args.diagnoses as string[]) : [],
    healthGoals: Array.isArray(args.healthGoals) ? (args.healthGoals as string[]) : [],
  });

  if (!telegramUser || !patch) {
    const fallbackProfile = profile ?? null;
    return {
      name: "save_user_profile",
      payload: {
        status: "noop",
        profile: serializeProfileForModel(fallbackProfile),
        fallbackText: buildProfileSavedMessage(fallbackProfile),
      },
      updatedProfile: fallbackProfile,
    };
  }

  const updatedProfile = await upsertPersistedUserProfile(db, telegramUser, patch, profile);
  return {
    name: "save_user_profile",
    payload: {
      status: "ok",
      profile: serializeProfileForModel(updatedProfile),
      fallbackText: buildProfileSavedMessage(updatedProfile),
    },
    updatedProfile,
  };
}

async function executeSearchProductsTool(
  db: ReturnType<typeof createDatabase>,
  profile: PersistedUserProfile | null,
  args: Record<string, unknown>,
): Promise<AgenticToolOutcome> {
  const productQuery = typeof args.productQuery === "string" ? args.productQuery.trim() : "";
  const limit = clampToolLimit(args.limit);
  const healthy = args.healthy === true;
  const diagnosisAware = args.diagnosisAware === true;
  const intent = {
    ...buildSearchIntent(productQuery, profile),
    wantsHealthy: healthy || buildSearchIntent(productQuery, profile).wantsHealthy,
    wantsDiagnosisAdvice: diagnosisAware || buildSearchIntent(productQuery, profile).wantsDiagnosisAdvice,
  };
  const plan: BotRequestPlan = {
    action: diagnosisAware || healthy ? "diagnosis_safe" : "search",
    catalogQueries: [productQuery],
    budgetMinor: intent.budgetMinor,
    needsHealthy: intent.wantsHealthy,
    needsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
    compareCheapest: false,
    wantsBasket: false,
    profileOnly: false,
    responseMode: "assistant",
  };
  const products = productQuery ? await searchProductsForPlan(db, plan, intent) : [];

  return {
    name: "search_products",
    payload: {
      status: products.length > 0 ? "ok" : "no_results",
      query: productQuery,
      products: products.slice(0, limit).map(serializeProductForModel),
      fallbackText:
        products.length > 0
          ? buildDirectProductReply(productQuery, products.slice(0, limit), intent)
          : buildNoResultsMessage(productQuery),
    },
    replyMarkup: products.length > 0 ? undefined : buildNoResultsKeyboard(),
  };
}

async function executeFindCheapestTool(
  db: ReturnType<typeof createDatabase>,
  profile: PersistedUserProfile | null,
  args: Record<string, unknown>,
): Promise<AgenticToolOutcome> {
  const productQuery = typeof args.productQuery === "string" ? args.productQuery.trim() : "";
  const limit = clampToolLimit(args.limit);
  const intent = buildSearchIntent(productQuery, profile);
  const plan: BotRequestPlan = {
    action: "find_cheapest",
    catalogQueries: [productQuery],
    budgetMinor: null,
    needsHealthy: false,
    needsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
    compareCheapest: true,
    wantsBasket: false,
    profileOnly: false,
    responseMode: "assistant",
  };
  const products = productQuery ? await searchProductsForPlan(db, plan, intent) : [];

  return {
    name: "find_cheapest_offer",
    payload: {
      status: products.length > 0 ? "ok" : "needs_clarification",
      query: productQuery,
      exactMatchFound: products.length > 0,
      products: products.slice(0, limit).map(serializeProductForModel),
      fallbackText:
        products.length > 0
          ? buildCheapestReply(productQuery, products.slice(0, limit), intent)
          : buildCheapestMissMessage(productQuery, intent.searchTerms),
    },
    replyMarkup: products.length > 0 ? undefined : buildCheapestMissKeyboard(intent.searchTerms),
  };
}

async function executeBuildBasketTool(
  db: ReturnType<typeof createDatabase>,
  profile: PersistedUserProfile | null,
  userQuery: string,
  args: Record<string, unknown>,
): Promise<AgenticToolOutcome> {
  const rawQueries = Array.isArray(args.productQueries) ? normalizeStringList(args.productQueries as string[]) : [];
  const durationDays = typeof args.durationDays === "number" && Number.isFinite(args.durationDays) ? args.durationDays : null;
  const baseIntent = buildSearchIntent(rawQueries.join(" "), profile);
  const budgetMinor =
    typeof args.budgetRub === "number" && Number.isFinite(args.budgetRub) && args.budgetRub > 0
      ? Math.round(args.budgetRub * 100)
      : baseIntent.budgetMinor;
  const intent: SearchIntent = {
    ...baseIntent,
    budgetMinor,
    wantsBasket: true,
    wantsHealthy: args.healthy === true || baseIntent.wantsHealthy,
    wantsDiagnosisAdvice: args.diagnosisAware === true || baseIntent.wantsDiagnosisAdvice,
  };
  const queries = rawQueries.length > 0 ? rawQueries : buildFallbackBasketQueries(intent);
  const plan: BotRequestPlan = {
    action: "build_basket",
    catalogQueries: queries,
    budgetMinor,
    needsHealthy: intent.wantsHealthy,
    needsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
    compareCheapest: false,
    wantsBasket: true,
    profileOnly: false,
    responseMode: "assistant",
  };
  const products = await collectBasketSeedProducts(db, queries, intent);
  const basket = assembleBudgetBasket(products, budgetMinor, intent);

  return {
    name: "build_budget_basket",
    payload: {
      status: basket.reliable ? "ok" : "needs_clarification",
      query: userQuery,
      durationDays,
      budgetRub: budgetMinor !== null ? Number((budgetMinor / 100).toFixed(2)) : null,
      productQueries: queries,
      products: basket.items.map(serializeProductForModel),
      reason: basket.reason,
      fallbackText: basket.reliable
        ? buildBasketReply(userQuery, basket.items, budgetMinor, intent)
        : buildBasketFollowUpMessage(userQuery, basket.reason),
    },
  };
}

async function collectBasketSeedProducts(
  db: ReturnType<typeof createDatabase>,
  queries: string[],
  intent: SearchIntent,
): Promise<AssistantProductRow[]> {
  const combined: AssistantProductRow[] = [];

  for (const query of queries.slice(0, 8)) {
    const queryIntent: SearchIntent = {
      ...buildSearchIntent(query),
      budgetMinor: intent.budgetMinor,
      wantsBasket: true,
      wantsHealthy: intent.wantsHealthy,
      wantsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
      diagnosisContext: intent.diagnosisContext,
      preferredStores: intent.preferredStores,
      excludedIngredients: intent.excludedIngredients,
      healthGoals: intent.healthGoals,
    };
    const rows = await searchProducts(db, query, 8);
    const strictRows = filterBasketSeedMatches(rows, queryIntent);
    combined.push(...(strictRows.length > 0 ? strictRows.slice(0, 2) : rows.slice(0, 2)));
  }

  return dedupeOffers(combined);
}

async function executeAnalyzeCompositionTool(
  db: ReturnType<typeof createDatabase>,
  profile: PersistedUserProfile | null,
  args: Record<string, unknown>,
): Promise<AgenticToolOutcome> {
  const productQuery = typeof args.productQuery === "string" ? args.productQuery.trim() : "";
  const limit = clampToolLimit(args.limit);
  const baseIntent = buildSearchIntent(productQuery, profile);
  const intent: SearchIntent = {
    ...baseIntent,
    wantsHealthy: true,
    wantsDiagnosisAdvice: true,
  };
  const plan: BotRequestPlan = {
    action: "diagnosis_safe",
    catalogQueries: productQuery ? [productQuery] : [],
    budgetMinor: intent.budgetMinor,
    needsHealthy: true,
    needsDiagnosisAdvice: true,
    compareCheapest: false,
    wantsBasket: false,
    profileOnly: false,
    responseMode: "assistant",
  };
  const products = productQuery ? await searchProductsForPlan(db, plan, intent) : [];

  return {
    name: "analyze_composition",
    payload: {
      status: products.length > 0 ? "ok" : "needs_clarification",
      query: productQuery,
      diagnoses: intent.diagnosisContext.labels,
      products: products.slice(0, limit).map((product) => ({
        ...serializeProductForModel(product),
        reasons: buildSuitabilityReason(product, intent),
      })),
      fallbackText:
        products.length > 0
          ? buildFallbackAssistantReply(productQuery || "подбери безопасные варианты", products.slice(0, limit), intent, plan)
          : buildNoResultsMessage(productQuery || "здоровое питание"),
    },
    replyMarkup: products.length > 0 ? undefined : buildNoResultsKeyboard(),
  };
}

function clampToolLimit(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(8, Math.round(value)));
  }

  return 5;
}

function serializeProductForModel(product: AssistantProductRow): Record<string, unknown> {
  return {
    title: product.title,
    store: product.storeName,
    priceRub: formatMinorUnits(product.priceMinor),
    oldPriceRub: formatMinorUnits(product.oldPriceMinor),
    discountPercent: product.discountPercent,
    available: product.available,
    composition: product.compositionText,
    url: product.url,
    matchKind: product.matchKind ?? null,
    matchScore: product.matchScore ?? null,
  };
}

function serializeProfileForModel(profile: PersistedUserProfile | null): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }

  return {
    budgetRub: profile.budgetMinor !== null ? Number((profile.budgetMinor / 100).toFixed(2)) : null,
    preferredStores: profile.preferredStores,
    excludedIngredients: profile.excludedIngredients,
    allergies: profile.allergies,
    diagnoses: profile.diagnoses,
    healthGoals: profile.healthGoals,
  };
}

function buildAgenticFallbackReply(outcome: AgenticToolOutcome): AgenticReply {
  const fallbackText = typeof outcome.payload.fallbackText === "string"
    ? outcome.payload.fallbackText
    : "Я собрал данные, но не смог красиво сформулировать ответ. Попробуйте уточнить запрос.";

  return {
    text: fallbackText,
    parseMode: outcome.parseMode,
    replyMarkup: outcome.replyMarkup,
  };
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

async function getPersistedUserProfile(
  db: ReturnType<typeof createDatabase>,
  telegramUser: TelegramUser,
): Promise<PersistedUserProfile | null> {
  const [row] = await db
    .select()
    .from(userProfile)
    .where(eq(userProfile.telegramUserId, telegramUser.id))
    .limit(1);

  if (!row) {
    return null;
  }

  const settings = asPlainObject(row.notificationSettings);
  const profileContext = asPlainObject(settings.profileContext);

  return {
    telegramUserId: row.telegramUserId,
    username: row.username ?? null,
    firstName: row.firstName ?? null,
    lastName: row.lastName ?? null,
    languageCode: row.languageCode ?? null,
    budgetMinor: row.budgetMinor ?? null,
    preferredStores: asStringArray(row.preferredStores),
    excludedIngredients: asStringArray(row.excludedIngredients),
    allergies: asStringArray(row.allergies),
    diagnoses: asStringArray(profileContext.diagnoses),
    healthGoals: asStringArray(profileContext.healthGoals),
  };
}

async function upsertPersistedUserProfile(
  db: ReturnType<typeof createDatabase>,
  telegramUser: TelegramUser,
  patch: UserProfilePatch,
  previous: PersistedUserProfile | null,
): Promise<PersistedUserProfile> {
  const merged = mergeProfilePatch(previous, telegramUser, patch);
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  await db
    .insert(userProfile)
    .values({
      telegramUserId: telegramUser.id,
      username: merged.username,
      firstName: merged.firstName,
      lastName: merged.lastName,
      languageCode: merged.languageCode,
      timezone: "Europe/Minsk",
      budgetMinor: merged.budgetMinor,
      preferredStores: merged.preferredStores,
      excludedIngredients: merged.excludedIngredients,
      allergies: merged.allergies,
      dislikedCategories: [],
      notificationSettings: {
        profileContext: {
          diagnoses: merged.diagnoses,
          healthGoals: merged.healthGoals,
        },
      },
      botOptIn: true,
      channelOptIn: true,
      active: true,
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    })
    .onConflictDoUpdate({
      target: userProfile.telegramUserId,
      set: {
        username: merged.username,
        firstName: merged.firstName,
        lastName: merged.lastName,
        languageCode: merged.languageCode,
        budgetMinor: merged.budgetMinor,
        preferredStores: merged.preferredStores,
        excludedIngredients: merged.excludedIngredients,
        allergies: merged.allergies,
        notificationSettings: {
          profileContext: {
            diagnoses: merged.diagnoses,
            healthGoals: merged.healthGoals,
          },
        },
        updatedAt: now,
        lastSeenAt: now,
      },
    });

  return merged;
}

function resolveAssistantProductLimit(intent: SearchIntent): number {
  if (intent.wantsBasket || intent.wantsDiagnosisAdvice || intent.wantsHealthy) {
    return 16;
  }

  return MAX_ASSISTANT_PRODUCTS;
}

async function searchProductsForPlan(
  db: ReturnType<typeof createDatabase>,
  plan: BotRequestPlan,
  intent: SearchIntent,
): Promise<AssistantProductRow[]> {
  const limit = resolveAssistantProductLimit(intent);
  const rawQueries = [...plan.catalogQueries, ...intent.searchTerms];
  const queries = [...new Set(rawQueries.map((value) => normalizeQuery(value)).filter((value) => value.length > 0))]
    .filter((value) => buildSearchIntent(value).searchTerms.length > 0);

  if (queries.length === 0) {
    return rankOffers(await selectFallbackOffers(db, intent, limit * 2), intent).slice(0, limit);
  }

  const combined: AssistantProductRow[] = [];
  for (const query of queries.slice(0, 4)) {
    const rows = await searchProducts(db, query, limit);
    combined.push(...rows);
  }

  const deduped = dedupeOffers(combined);
  const ranked = rankOffers(deduped, intent);

  if (plan.compareCheapest) {
    const strictMatches = filterStrictCheapestMatches(ranked, intent);
    if (strictMatches.length === 0) {
      return [];
    }

    return strictMatches
      .slice()
      .sort((left, right) => {
        const leftPrice = left.priceMinor ?? Number.MAX_SAFE_INTEGER;
        const rightPrice = right.priceMinor ?? Number.MAX_SAFE_INTEGER;
        if (leftPrice !== rightPrice) {
          return leftPrice - rightPrice;
        }

        return (right.discountPercent ?? 0) - (left.discountPercent ?? 0);
      })
      .slice(0, limit);
  }

  if (ranked.length === 0 && intent.searchTerms.length > 0) {
    const approximateRows = await selectRelaxedOffers(db, intent, limit);
    if (approximateRows.length > 0) {
      return approximateRows.slice(0, limit).map((row) => ({
        ...row,
        matchKind: "loose",
        matchScore: row.matchScore ?? 20,
      }));
    }
  }

  if (ranked.length === 0) {
    const fallbackRows = await selectFallbackOffers(db, intent, limit * 3);
    const fallbackRanked = rankOffers(fallbackRows, intent);

    if (plan.wantsBasket || plan.compareCheapest || plan.needsDiagnosisAdvice || intent.wantsHealthy) {
      return fallbackRanked.slice(0, limit);
    }
  }

  return ranked.slice(0, limit);
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

  if (intent.searchTerms.length > 0) {
    if (primaryMatches.length > 0) {
      return rankOffers(primaryMatches, intent).slice(0, limit);
    }

    return rankOffers(await selectRelaxedOffers(db, intent, limit), intent).slice(0, limit);
  }

  const fallbackMatches = await selectFallbackOffers(db, intent, limit);
  return rankOffers(dedupeOffers([...primaryMatches, ...fallbackMatches]), intent).slice(0, limit);
}

async function selectMatchingOffers(
  db: ReturnType<typeof createDatabase>,
  intent: SearchIntent,
  limit: number,
): Promise<AssistantProductRow[]> {
  const predicates = [
    eq(currentOffer.available, true),
    isNotNull(currentOffer.priceMinor),
    ...intent.searchTerms.map((term) => buildTermLikePredicate(term)),
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

async function selectRelaxedOffers(
  db: ReturnType<typeof createDatabase>,
  intent: SearchIntent,
  limit: number,
): Promise<AssistantProductRow[]> {
  const termPredicates = intent.searchTerms.map((term) => buildTermLikePredicate(term));
  const relaxedTermPredicate =
    termPredicates.length === 1 ? termPredicates[0] : or(...termPredicates);

  const predicates = [
    eq(currentOffer.available, true),
    isNotNull(currentOffer.priceMinor),
    relaxedTermPredicate,
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

function rankOffers(rows: AssistantProductRow[], intent: SearchIntent): AssistantProductRow[] {
  const ranked = rows
    .map((row) => {
      const ranking = scoreOffer(row, intent);
      return {
        ...row,
        matchScore: ranking.score,
        matchKind: ranking.kind,
      };
    })
    .sort((left, right) => {
      const leftScore = left.matchScore ?? 0;
      const rightScore = right.matchScore ?? 0;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }

      const leftPrice = left.priceMinor ?? Number.MAX_SAFE_INTEGER;
      const rightPrice = right.priceMinor ?? Number.MAX_SAFE_INTEGER;
      if (leftPrice !== rightPrice) {
        return leftPrice - rightPrice;
      }

      return left.title.localeCompare(right.title, "ru");
    });

  return filterConfidentMatches(ranked, intent);
}

function scoreOffer(
  row: AssistantProductRow,
  intent: SearchIntent,
): { score: number; kind: NonNullable<AssistantProductRow["matchKind"]> } {
  if (intent.searchTerms.length === 0) {
    return { score: 10, kind: "fallback" };
  }

  const titleTokens = tokenizeWords(row.title);
  const searchTokens = tokenizeWords(row.searchText);
  let score = 0;
  let bestKind: NonNullable<AssistantProductRow["matchKind"]> = "fallback";

  for (const term of intent.searchTerms) {
    const variants = buildTermVariants(term);
    const titleMatch = evaluateTokens(titleTokens, term, variants);
    const searchMatch = evaluateTokens(searchTokens, term, variants);
    const bestMatch = titleMatch.score >= searchMatch.score ? titleMatch : searchMatch;
    score += bestMatch.score;

    if (compareMatchKind(bestMatch.kind, bestKind) > 0) {
      bestKind = bestMatch.kind;
    }
  }

  const hasExactTitleToken = intent.searchTerms.some((term) => {
    const acceptableExactForms = getAcceptableExactForms(term);
    return titleTokens.some((token) => acceptableExactForms.has(token));
  });

  if (!hasExactTitleToken && titleTokens.some((token) => PREPARED_FOOD_HINTS.has(token))) {
    score -= 35;
  }

  if (titleTokens.length <= 4) {
    score += 10;
  } else if (titleTokens.length >= 9) {
    score -= 10;
  }

  if (intent.preferredStores.includes(row.storeId)) {
    score += 18;
  }

  score += scoreMedicalSuitability(row, intent);

  return {
    score,
    kind: bestKind,
  };
}

function evaluateTokens(
  tokens: string[],
  term: string,
  variants: string[],
): { score: number; kind: NonNullable<AssistantProductRow["matchKind"]> } {
  const acceptableExactForms = getAcceptableExactForms(term);

  for (const token of tokens) {
    if (acceptableExactForms.has(token)) {
      return { score: 120, kind: "exact" };
    }
  }

  for (const token of tokens) {
    if (token.startsWith(term)) {
      return { score: 80, kind: "prefix" };
    }
  }

  for (const variant of variants) {
    if (variant.length < 4) {
      continue;
    }

    for (const token of tokens) {
      if (token.startsWith(variant)) {
        return { score: 55, kind: "stem" };
      }
    }
  }

  for (const token of tokens) {
    if (token.includes(term)) {
      return { score: 30, kind: "loose" };
    }
  }

  return { score: 0, kind: "fallback" };
}

function compareMatchKind(
  left: NonNullable<AssistantProductRow["matchKind"]>,
  right: NonNullable<AssistantProductRow["matchKind"]>,
): number {
  const order: Record<NonNullable<AssistantProductRow["matchKind"]>, number> = {
    fallback: 0,
    loose: 1,
    stem: 2,
    prefix: 3,
    exact: 4,
  };

  return order[left] - order[right];
}

function getAcceptableExactForms(term: string): Set<string> {
  const forms = new Set<string>([term]);

  if (term === "сыр") {
    for (const form of ["сыра", "сыре", "сыром", "сыру", "сыры"]) {
      forms.add(form);
    }
  }

  if (term === "масло") {
    for (const form of ["масла", "масле", "маслом"]) {
      forms.add(form);
    }
  }

  if (term === "молоко") {
    for (const form of ["молока", "молоке"]) {
      forms.add(form);
    }
  }

  return forms;
}

function buildTermVariants(term: string): string[] {
  const variants = new Set<string>([term]);

  if (term.length >= 5) {
    const trimmed = term.replace(/[аеиоуыэюяьй]+$/u, "");
    if (trimmed.length >= 4) {
      variants.add(trimmed);
    }
  }

  return [...variants];
}

function buildTermLikePredicate(term: string) {
  const likes = [like(canonicalProduct.searchText, `%${term}%`)];
  const variants = buildTermVariants(term).filter((variant) => variant !== term);

  for (const variant of variants) {
    likes.push(like(canonicalProduct.searchText, `%${variant}%`));
  }

  return likes.length === 1 ? likes[0] : or(...likes);
}

function filterConfidentMatches(
  rows: AssistantProductRow[],
  intent: SearchIntent,
): AssistantProductRow[] {
  if (intent.searchTerms.length !== 1) {
    return rows;
  }

  const [term] = intent.searchTerms;
  const exactForms = getAcceptableExactForms(term);
  const filtered = rows.filter((row) => {
    const titleTokens = tokenizeWords(row.title);
    const prepared = titleTokens.some((token) => PREPARED_FOOD_HINTS.has(token));
    const headTokens = titleTokens.slice(0, 2);
    const hasHeadExact = headTokens.some((token) => exactForms.has(token));
    const hasHeadPrefix = headTokens.some(
      (token) => token.startsWith(term) && !PREPARED_FOOD_HINTS.has(token),
    );
    const score = row.matchScore ?? 0;

    if (hasHeadExact || hasHeadPrefix) {
      return true;
    }

    if (!prepared && score >= 90) {
      return true;
    }

    return false;
  });

  return filtered.length > 0 ? filtered : [];
}

function filterStrictCheapestMatches(
  rows: AssistantProductRow[],
  intent: SearchIntent,
): AssistantProductRow[] {
  if (intent.searchTerms.length === 0) {
    return [];
  }

  const primaryTerm = intent.searchTerms[0];
  const exactForms = getAcceptableExactForms(primaryTerm);

  return rows.filter((row) => {
    const titleTokens = tokenizeWords(row.title);
    const headTokens = titleTokens.slice(0, 3);
    const prepared = titleTokens.some((token) => PREPARED_FOOD_HINTS.has(token));
    const hasHeadExact = headTokens.some((token) => exactForms.has(token));
    const hasHeadPrefix = headTokens.some((token) => token.startsWith(primaryTerm));

    if (hasHeadExact || hasHeadPrefix) {
      return true;
    }

    if (!prepared && row.matchKind === "exact" && (row.matchScore ?? 0) >= 120) {
      return true;
    }

    return false;
  });
}

function filterBasketSeedMatches(
  rows: AssistantProductRow[],
  intent: SearchIntent,
): AssistantProductRow[] {
  return filterStrictCheapestMatches(rows, intent).filter((row) => !shouldRejectBasketCandidate(row, intent));
}

function buildSearchIntent(query: string, profile?: PersistedUserProfile | null): SearchIntent {
  const normalizedQuery = normalizeQuery(query);
  const rawTerms = normalizedQuery
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);

  const searchTerms = rawTerms.filter(
    (part) =>
      !STOP_WORDS.has(part) &&
      !/^\d+$/.test(part) &&
      ![
        "здоровую",
        "здоровый",
        "здоровая",
        "полезную",
        "полезный",
        "дешевле",
        "дешево",
        "корзину",
        "корзина",
        "диагноз",
        "диабете",
        "диабет",
        "гипертонии",
        "гипертония",
      ].includes(part),
  );

  const queryDiagnosisContext = extractDiagnosisContext(normalizedQuery);
  const profileDiagnosisContext = profile ? extractDiagnosisContext(profile.diagnoses.join(" ")) : emptyDiagnosisContext();
  const diagnosisContext = mergeDiagnosisContexts(queryDiagnosisContext, profileDiagnosisContext);
  const excludedIngredients = [
    ...new Set([
      ...(profile?.excludedIngredients ?? []),
      ...(profile?.allergies ?? []),
      ...diagnosisContext.blockedIngredients,
    ]),
  ];

  return {
    normalizedQuery,
    searchTerms: [...new Set(searchTerms)],
    wantsHealthy: /(здоров|полез|натурал|без\s+сахар|состав|безопас)/.test(normalizedQuery),
    wantsCheap: /(дешев|выгод|эконом|акци|скид)/.test(normalizedQuery),
    budgetMinor: extractBudgetMinor(normalizedQuery) ?? profile?.budgetMinor ?? null,
    wantsBasket: /(корзин|на\s+\d+(?:[.,]\d+)?\s*(?:руб|рубля|рублей|byn|р)\b|на\s+недел|на\s+день|меню)/.test(
      normalizedQuery,
    ),
    wantsDiagnosisAdvice:
      diagnosisContext.keys.length > 0 || /(диагноз|можно\s+ли|что\s+можно|что\s+нельзя)/.test(normalizedQuery),
    diagnosisContext,
    preferredStores: profile?.preferredStores ?? [],
    excludedIngredients,
    healthGoals: profile?.healthGoals ?? [],
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
  queryForSearch: string,
  products: AssistantProductRow[],
  intent: SearchIntent,
  plan: BotRequestPlan,
): Promise<string> {
  if (shouldPreferDirectLinks(intent) && plan.responseMode === "direct") {
    return buildDirectProductReply(userQuery, products, intent);
  }

  try {
    return await queryGroqAssistant(env, userQuery, queryForSearch, products, intent, plan);
  } catch (error) {
    console.error("Groq assistant call failed, falling back to direct summary", error);
    return buildFallbackAssistantReply(userQuery, products, intent, plan);
  }
}

async function queryGroqAssistant(
  env: BotWorkerEnv,
  userQuery: string,
  queryForSearch: string,
  products: AssistantProductRow[],
  intent: SearchIntent,
  plan: BotRequestPlan,
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
              "Ты дружелюбный эксперт-нутрициолог и экономный покупатель для Минска.",
              "Отвечай только на основе переданных товаров и не выдумывай позиции, цены, составы, ссылки или скидки.",
              "Пиши так, будто ты одновременно сильный шоппер и аккуратный консультант по составу.",
              "Используй простой Telegram Markdown: короткий заголовок, затем маркированный список.",
              "Цены обязательно выделяй жирным через *...*.",
              "Для каждого рекомендованного товара обязательно указывай: название, цену, магазин и прямую ссылку из поля url.",
              "Если запрос про корзину, собери 3-6 конкретных товаров под бюджет и поясни, зачем каждый взят.",
              "Если action=build_basket, отвечай как личный продуктовый ассистент и не превращай корзину в случайный список соусов, сладостей или перекусов без логики.",
              "Если action=find_cheapest, сначала честно скажи, найдено ли точное совпадение товара. Если есть только похожие товары, прямо предупреди об этом.",
              "Если запрос про здоровое или безопасное питание, кратко анализируй состав, если он есть в базе.",
              "Если в запросе есть диагноз или ограничение, будь осторожен: не давай медицинских обещаний, не ставь диагноз и не говори что продукт лечит.",
              "Вместо этого объясняй, почему вариант выглядит более безопасным по составу: например меньше сахара, меньше соли, без глютена, без лактозы, короче состав, меньше лишних добавок.",
              "Если состава нет, честно пиши, что состав не указан и уверенность ниже.",
              "Если пользователь просит дешёвую корзину, старайся уложиться в бюджет по сумме цен из списка.",
              "Если у товара matchKind=loose, это неточное совпадение. Не выдавай его как точное без оговорки.",
              "Формат ответа: короткий заголовок, затем список товаров, затем короткий вывод в 1-2 предложениях.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                query: userQuery,
                catalogQueryUsed: queryForSearch,
                intent: {
                  action: plan.action,
                  profileOnly: plan.profileOnly,
                  wantsBasket: intent.wantsBasket,
                  wantsHealthy: intent.wantsHealthy,
                  wantsCheap: intent.wantsCheap,
                  wantsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
                  budgetRub: intent.budgetMinor !== null ? formatMinorUnits(intent.budgetMinor) : null,
                  diagnoses: intent.diagnosisContext.labels,
                  cautionLabels: intent.diagnosisContext.cautionLabels,
                  blockedIngredients: intent.diagnosisContext.blockedIngredients,
                  preferredStores: intent.preferredStores,
                  excludedIngredients: intent.excludedIngredients,
                  healthGoals: intent.healthGoals,
                },
                products: products.map((product) => ({
                  title: product.title,
                  store: product.storeName,
                  priceRub: formatMinorUnits(product.priceMinor),
                  oldPriceRub: formatMinorUnits(product.oldPriceMinor),
                  discountPercent: product.discountPercent,
                  available: product.available,
                  composition: product.compositionText,
                  url: product.url,
                  matchKind: product.matchKind ?? null,
                  matchScore: product.matchScore ?? null,
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
  intent: SearchIntent,
  plan: BotRequestPlan,
): string {
  if (plan.wantsBasket) {
    return buildBasketReply(userQuery, products, plan.budgetMinor, intent);
  }

  if (plan.compareCheapest) {
    return buildCheapestReply(userQuery, products, intent);
  }

  if (shouldPreferDirectLinks(intent)) {
    return buildDirectProductReply(userQuery, products, intent);
  }

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

function buildNoResultsMessage(userQuery: string): string {
  return [
    `Я пока не нашёл такой товар в базе: ${userQuery}`,
    "",
    "Могу сразу предложить что-то другое. Нажмите кнопку ниже или выберите похожий вариант:",
  ].join("\n");
}

function buildCheapestMissMessage(userQuery: string, searchTerms: string[]): string {
  const productHint = searchTerms.join(" ").trim() || userQuery;
  return [
    `Я не нашёл точного товара для запроса: ${userQuery}`,
    "",
    `Пока в базе нет уверенного точного совпадения для "${productHint}".`,
    "Попробуйте уточнить товар, например: масло сливочное, масло оливковое, молоко 2.5%, сыр гауда.",
  ].join("\n");
}

function buildCheapestMissKeyboard(searchTerms: string[]): Record<string, unknown> {
  const base = searchTerms[0] ?? "масло";
  return {
    keyboard: [
      [{ text: `${base} сливочное` }, { text: `${base} оливковое` }],
      [{ text: "молоко 2.5%" }, { text: "сыр гауда" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: "Уточните точный продукт для сравнения цен...",
  };
}

function buildNoResultsKeyboard(): Record<string, unknown> {
  return {
    keyboard: [
      [{ text: "молоко" }, { text: "сыр" }],
      [{ text: "масло" }, { text: "гречка" }],
      [{ text: "корзина на 25 рублей" }, { text: "что можно при диабете" }],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
    input_field_placeholder: "Выберите подсказку или введите другой товар...",
  };
}

function shouldPreferDirectLinks(intent: SearchIntent): boolean {
  return (
    intent.searchTerms.length > 0 &&
    !intent.wantsHealthy &&
    !intent.wantsDiagnosisAdvice &&
    !intent.wantsBasket &&
    intent.budgetMinor === null
  );
}

function buildBasketReply(
  userQuery: string,
  products: AssistantProductRow[],
  budgetMinor: number | null,
  intent: SearchIntent,
): string {
  const totalMinor = products.reduce((sum, product) => sum + (product.priceMinor ?? 0), 0);
  const heading =
    products.every((product) => product.matchKind === "loose")
      ? `Собрал предварительную корзину по похожим товарам для запроса: ${userQuery}`
      : budgetMinor !== null
        ? `Собрал корзину по запросу: ${userQuery}`
        : `Подобрал корзину по запросу: ${userQuery}`;

  const lines = [
    heading,
    budgetMinor !== null ? `Бюджет: ${formatMinorUnits(budgetMinor)}` : null,
    `Сумма корзины: ${formatMinorUnits(totalMinor)}`,
    "",
    ...products.slice(0, 6).map((product, index) => {
      const reasons = buildSuitabilityReason(product, intent);
      return [
        `${index + 1}. ${product.title}`,
        `Цена: ${formatMinorUnits(product.priceMinor)}`,
        `Магазин: ${product.storeName}`,
        reasons.length > 0 ? `Почему взял: ${reasons.join("; ")}` : null,
        `Ссылка: ${product.url}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n");
    }),
    "",
    budgetMinor !== null && totalMinor > budgetMinor
      ? "Корзина получилась чуть выше бюджета. Могу ужать её ещё сильнее."
      : "Если хотите, я могу собрать ещё более дешёвую, более полезную или более сытную корзину.",
  ].filter((value): value is string => Boolean(value));

  return lines.join("\n");
}

function buildBasketFollowUpMessage(userQuery: string, reason: string): string {
  return [
    `Пока не хочу собирать плохую корзину по запросу: ${userQuery}`,
    "",
    reason,
    "Уточните, пожалуйста, основу корзины. Например:",
    "• корзина на 3 дня из круп, курицы и овощей",
    "• бюджетная корзина без лактозы",
    "• корзина на неделю при диабете",
  ].join("\n");
}

function buildCheapestReply(
  userQuery: string,
  products: AssistantProductRow[],
  intent: SearchIntent,
): string {
  const heading = products.every((product) => product.matchKind === "loose")
    ? `Нашёл только похожие варианты по запросу: ${userQuery}`
    : `Нашёл, что дешевле по запросу: ${userQuery}`;
  const lines = [
    heading,
    "",
    ...products.slice(0, 5).map((product, index) => {
      const reasons = buildSuitabilityReason(product, intent);
      return [
        `${index + 1}. ${product.title}`,
        `Цена: ${formatMinorUnits(product.priceMinor)}`,
        `Магазин: ${product.storeName}`,
        product.discountPercent !== null ? `Скидка: ${product.discountPercent}%` : null,
        reasons.length > 0 ? `Примечание: ${reasons.join("; ")}` : null,
        `Ссылка: ${product.url}`,
      ]
        .filter((value): value is string => Boolean(value))
        .join("\n");
    }),
    "",
    "Если хотите, я могу отдельно сравнить состав, цену за единицу или собрать из этого корзину.",
  ];

  return lines.join("\n");
}

function buildDirectProductReply(
  userQuery: string,
  products: AssistantProductRow[],
  intent: SearchIntent,
): string {
  const heading = buildDirectReplyHeading(userQuery, intent);
  const lines = [
    heading,
    "",
    ...products.slice(0, 5).map((product, index) => buildDirectProductBlock(product, index + 1)),
    "",
    "Если хотите, я могу сузить поиск по цене, составу или конкретному продукту.",
  ];

  return lines.join("\n");
}

function buildDirectReplyHeading(userQuery: string, intent: SearchIntent): string {
  if (intent.searchTerms.length > 0) {
    return `Нашёл товары и прямые ссылки по запросу: ${userQuery}`;
  }

  if (intent.budgetMinor !== null && intent.wantsHealthy) {
    return `Нашёл варианты для более полезной корзины по запросу: ${userQuery}`;
  }

  if (intent.budgetMinor !== null) {
    return `Нашёл товары под ваш бюджет по запросу: ${userQuery}`;
  }

  if (intent.wantsHealthy) {
    return `Нашёл товары и прямые ссылки по запросу: ${userQuery}`;
  }

  if (intent.wantsCheap) {
    return `Нашёл выгодные варианты по запросу: ${userQuery}`;
  }

  return `Нашёл товары и прямые ссылки по запросу: ${userQuery}`;
}

function buildDirectProductBlock(product: AssistantProductRow, index: number): string {
  const details = [
    `${index}. ${product.title}`,
    `Цена: ${formatMinorUnits(product.priceMinor)}`,
    `Магазин: ${product.storeName}`,
    product.oldPriceMinor !== null ? `Старая цена: ${formatMinorUnits(product.oldPriceMinor)}` : null,
    product.discountPercent !== null ? `Скидка: ${product.discountPercent}%` : null,
    product.compositionText ? `Состав: ${truncate(product.compositionText, 140)}` : null,
    `Ссылка: ${product.url}`,
  ].filter((value): value is string => Boolean(value));

  return details.join("\n");
}

async function sendTelegramText(
  env: BotWorkerEnv,
  chatId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
  parseMode?: string,
): Promise<void> {
  try {
    await callTelegramApi(env, "sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
      reply_markup: replyMarkup,
      parse_mode: parseMode,
    });
  } catch (error) {
    if (!parseMode || !isTelegramParseModeError(error)) {
      throw error;
    }

    console.warn("Retrying Telegram sendMessage without parse mode after formatting error", error);
    await callTelegramApi(env, "sendMessage", {
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
      reply_markup: replyMarkup,
    });
  }
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
    `<b>Цена:</b> ${escapeHtml(formatMinorUnits(product.priceMinor))}`,
    `<b>Магазин:</b> ${escapeHtml(product.storeName)}`,
    product.discountPercent !== null
      ? `<b>Скидка:</b> ${escapeHtml(`${product.discountPercent}%`)}`
      : null,
    product.oldPriceMinor !== null
      ? `<b>Старая цена:</b> ${escapeHtml(formatMinorUnits(product.oldPriceMinor))}`
      : null,
    product.compositionText
      ? `<b>Состав:</b> ${escapeHtml(truncate(product.compositionText, 160))}`
      : null,
    `<b>Ссылка:</b> ${escapeHtml(product.url)}`,
  ].filter((value): value is string => Boolean(value));

  return parts.join("\n");
}

function buildStartMessage(env: BotWorkerEnv): string {
  const inlineHint = env.BOT_USERNAME
    ? `В любом чате можно написать: @${env.BOT_USERNAME} сыр`
    : "В inline-режиме введите @ваш_бот сыр в любом чате.";

  return [
    "Привет! Я Выгодная корзина Минск.",
    "",
    "Что я умею:",
    "• искать товары по запросу;",
    "• показывать цены и прямые ссылки на карточки товаров;",
    "• подбирать варианты под ваш бюджет;",
    "• собирать продуктовые корзины и объяснять выбор;",
    "• подсказывать более безопасные варианты по составу и ограничениям;",
    "• работать в inline-режиме и скидывать карточки товаров в чат.",
    "",
    "Примеры запросов:",
    "• Где дешевле купить молоко?",
    "• Найди сыр до 8 рублей",
    "• Покажи гречку и ссылки",
    "• Собери корзину на 20 рублей",
    "• Что можно при диабете из перекуса?",
    "• Где дешевле купить масло?",
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

function tokenizeWords(input: string): string[] {
  return normalizeQuery(input)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2);
}

function extractDiagnosisContext(normalizedQuery: string): DiagnosisContext {
  const matchedRules = DIAGNOSIS_RULES.filter((rule) => rule.match.test(normalizedQuery));
  const blockedIngredients = new Set<string>();
  const cautionLabels = new Set<string>();

  for (const rule of matchedRules) {
    for (const term of [...rule.hardBlockTerms, ...rule.cautionTerms]) {
      blockedIngredients.add(term);
    }

    cautionLabels.add(rule.label);
  }

  for (const explicitDietTerm of EXPLICIT_DIET_TERMS) {
    if (!explicitDietTerm.pattern.test(normalizedQuery)) {
      continue;
    }

    cautionLabels.add(explicitDietTerm.label);
    for (const term of explicitDietTerm.terms) {
      blockedIngredients.add(term);
    }
  }

  return {
    keys: matchedRules.map((rule) => rule.key),
    labels: matchedRules.map((rule) => rule.label),
    cautionLabels: [...cautionLabels],
    blockedIngredients: [...blockedIngredients],
  };
}

function emptyDiagnosisContext(): DiagnosisContext {
  return {
    keys: [],
    labels: [],
    cautionLabels: [],
    blockedIngredients: [],
  };
}

function mergeDiagnosisContexts(left: DiagnosisContext, right: DiagnosisContext): DiagnosisContext {
  return {
    keys: [...new Set([...left.keys, ...right.keys])],
    labels: [...new Set([...left.labels, ...right.labels])],
    cautionLabels: [...new Set([...left.cautionLabels, ...right.cautionLabels])],
    blockedIngredients: [...new Set([...left.blockedIngredients, ...right.blockedIngredients])],
  };
}

function buildFallbackPlan(intent: SearchIntent): BotRequestPlan {
  const fallbackQueries =
    intent.searchTerms.length > 0 ? intent.searchTerms : intent.wantsBasket ? buildFallbackBasketQueries(intent) : [];

  return {
    action: intent.wantsBasket
      ? "build_basket"
      : intent.wantsDiagnosisAdvice
        ? "diagnosis_safe"
        : intent.wantsCheap
          ? "find_cheapest"
          : "search",
    catalogQueries: fallbackQueries,
    budgetMinor: intent.budgetMinor,
      needsHealthy: intent.wantsHealthy,
      needsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
      compareCheapest: intent.wantsCheap,
      wantsBasket: intent.wantsBasket,
      profileOnly: false,
      responseMode:
        intent.wantsBasket || intent.wantsHealthy || intent.wantsDiagnosisAdvice ? "assistant" : "direct",
      profilePatch: undefined,
    };
}

function normalizeProfilePatch(
  patch:
    | {
        budgetRub?: number | null;
        preferredStores?: string[];
        excludedIngredients?: string[];
        allergies?: string[];
        diagnoses?: string[];
        healthGoals?: string[];
      }
    | undefined,
): UserProfilePatch | undefined {
  if (!patch || typeof patch !== "object") {
    return undefined;
  }

  const normalized: UserProfilePatch = {};

  if (typeof patch.budgetRub === "number" && Number.isFinite(patch.budgetRub) && patch.budgetRub > 0) {
    normalized.budgetMinor = Math.round(patch.budgetRub * 100);
  }

  if (Array.isArray(patch.preferredStores)) {
    normalized.preferredStores = normalizeStringList(patch.preferredStores);
  }

  if (Array.isArray(patch.excludedIngredients)) {
    normalized.excludedIngredients = normalizeStringList(patch.excludedIngredients);
  }

  if (Array.isArray(patch.allergies)) {
    normalized.allergies = normalizeStringList(patch.allergies);
  }

  if (Array.isArray(patch.diagnoses)) {
    normalized.diagnoses = normalizeStringList(patch.diagnoses);
  }

  if (Array.isArray(patch.healthGoals)) {
    normalized.healthGoals = normalizeStringList(patch.healthGoals);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function extractFallbackProfilePatch(query: string, intent: SearchIntent): UserProfilePatch | undefined {
  const patch: UserProfilePatch = {};

  if (intent.budgetMinor !== null) {
    patch.budgetMinor = intent.budgetMinor;
  }

  if (intent.diagnosisContext.labels.length > 0) {
    patch.diagnoses = intent.diagnosisContext.labels;
  }

  const lowered = normalizeQuery(query);
  const excludedIngredients: string[] = [];

  for (const explicitDietTerm of EXPLICIT_DIET_TERMS) {
    if (explicitDietTerm.pattern.test(lowered)) {
      excludedIngredients.push(...explicitDietTerm.terms);
    }
  }

  if (/аллерг/i.test(query)) {
    if (/молок|лактоз/i.test(query)) {
      excludedIngredients.push("лактоза", "молоко");
      patch.allergies = ["молоко"];
    }
    if (/глютен|пшениц/i.test(query)) {
      excludedIngredients.push("глютен", "пшеница");
      patch.allergies = [...(patch.allergies ?? []), "глютен"];
    }
  }

  if (excludedIngredients.length > 0) {
    patch.excludedIngredients = normalizeStringList(excludedIngredients);
  }

  return Object.keys(patch).length > 0 ? patch : undefined;
}

function mergeProfilePatches(
  left: UserProfilePatch | undefined,
  right: UserProfilePatch | undefined,
): UserProfilePatch | undefined {
  if (!left && !right) {
    return undefined;
  }

  return {
    budgetMinor: right?.budgetMinor ?? left?.budgetMinor,
    preferredStores: [...new Set([...(left?.preferredStores ?? []), ...(right?.preferredStores ?? [])])],
    excludedIngredients: [...new Set([...(left?.excludedIngredients ?? []), ...(right?.excludedIngredients ?? [])])],
    allergies: [...new Set([...(left?.allergies ?? []), ...(right?.allergies ?? [])])],
    diagnoses: [...new Set([...(left?.diagnoses ?? []), ...(right?.diagnoses ?? [])])],
    healthGoals: [...new Set([...(left?.healthGoals ?? []), ...(right?.healthGoals ?? [])])],
  };
}

function hasProfilePatch(patch: UserProfilePatch | undefined): boolean {
  return Boolean(patch && Object.keys(patch).length > 0);
}

function mergeProfilePatch(
  previous: PersistedUserProfile | null,
  telegramUser: TelegramUser,
  patch: UserProfilePatch,
): PersistedUserProfile {
  return {
    telegramUserId: telegramUser.id,
    username: telegramUser.username ?? previous?.username ?? null,
    firstName: telegramUser.first_name ?? previous?.firstName ?? null,
    lastName: previous?.lastName ?? null,
    languageCode: telegramUser.language_code ?? previous?.languageCode ?? null,
    budgetMinor: patch.budgetMinor ?? previous?.budgetMinor ?? null,
    preferredStores: [...new Set([...(previous?.preferredStores ?? []), ...(patch.preferredStores ?? [])])],
    excludedIngredients: [...new Set([...(previous?.excludedIngredients ?? []), ...(patch.excludedIngredients ?? [])])],
    allergies: [...new Set([...(previous?.allergies ?? []), ...(patch.allergies ?? [])])],
    diagnoses: [...new Set([...(previous?.diagnoses ?? []), ...(patch.diagnoses ?? [])])],
    healthGoals: [...new Set([...(previous?.healthGoals ?? []), ...(patch.healthGoals ?? [])])],
  };
}

function buildFallbackBasketQueries(intent: SearchIntent): string[] {
  const base = intent.wantsHealthy || intent.wantsDiagnosisAdvice
    ? ["гречка", "овсянка", "курица", "яйцо", "огурец", "помидор"]
    : ["гречка", "макароны", "курица", "сыр", "огурец", "хлеб"];

  const withDietBias = [...base];
  if (intent.diagnosisContext.keys.includes("diabetes")) {
    return ["гречка", "овсянка", "яйцо", "курица", "огурец", "помидор"];
  }

  if (intent.diagnosisContext.keys.includes("lactose_intolerance")) {
    return ["гречка", "курица", "яйцо", "огурец", "рис", "яблоко"];
  }

  if (intent.diagnosisContext.keys.includes("gastritis")) {
    return ["овсянка", "рис", "гречка", "курица", "банан", "яйцо"];
  }

  return withDietBias;
}

function reconcilePlanWithIntent(plan: BotRequestPlan, intent: SearchIntent): BotRequestPlan {
  const wantsBasket = plan.wantsBasket || intent.wantsBasket;
  const compareCheapest = plan.compareCheapest || intent.wantsCheap;
  const needsDiagnosisAdvice = plan.needsDiagnosisAdvice || intent.wantsDiagnosisAdvice;
  const needsHealthy = plan.needsHealthy || intent.wantsHealthy || needsDiagnosisAdvice;

  let action: PlannedAction = plan.action;
  if (wantsBasket) {
    action = "build_basket";
  } else if (compareCheapest) {
    action = "find_cheapest";
  } else if (needsDiagnosisAdvice) {
    action = "diagnosis_safe";
  }

  const catalogQueries = [...new Set([...plan.catalogQueries, ...intent.searchTerms])]
    .map((value) => normalizeQuery(value))
    .filter((value) => buildSearchIntent(value).searchTerms.length > 0);

  return {
    ...plan,
    action,
    catalogQueries,
    budgetMinor: plan.budgetMinor ?? intent.budgetMinor,
    needsHealthy,
    needsDiagnosisAdvice,
    compareCheapest,
    wantsBasket,
    profileOnly: plan.profileOnly,
    responseMode:
      wantsBasket || needsHealthy || needsDiagnosisAdvice || compareCheapest
        ? "assistant"
        : plan.responseMode,
  };
}

function isProfileUpdateOnlyQuery(
  text: string,
  plan: BotRequestPlan,
  intent: SearchIntent,
): boolean {
  return (
    hasProfilePatch(plan.profilePatch) &&
    !plan.wantsBasket &&
    !plan.compareCheapest &&
    (plan.profileOnly || looksLikeStandaloneProfileUpdate(text)) &&
    !/(найд|покаж|где|дешев|корзин|купит|ссылк|подбер|собер|что\s+можно|можно\s+ли)/iu.test(text)
  );
}

function looksLikeStandaloneProfileUpdate(text: string): boolean {
  const normalized = normalizeQuery(text);
  return (
    /\bу меня\b/u.test(normalized) ||
    /\bмой бюджет\b/u.test(normalized) ||
    /\bмне нельзя\b/u.test(normalized) ||
    /\bаллерг/u.test(normalized) ||
    /\bбез лактоз/u.test(normalized) ||
    /\bбез глютен/u.test(normalized) ||
    /\bне переношу\b/u.test(normalized) ||
    /\bисключи\b/u.test(normalized) ||
    /\bучти\b/u.test(normalized)
  );
}

function scoreMedicalSuitability(row: AssistantProductRow, intent: SearchIntent): number {
  const haystack = `${normalizeQuery(row.title)} ${normalizeQuery(row.compositionText ?? "")}`;
  let score = 0;

  if (matchesAnyTerm(haystack, intent.excludedIngredients)) {
    score -= 120;
  }

  for (const rule of DIAGNOSIS_RULES) {
    if (!intent.diagnosisContext.keys.includes(rule.key)) {
      continue;
    }

    if (matchesAnyTerm(haystack, rule.hardBlockTerms)) {
      score -= 90;
    }

    if (matchesAnyTerm(haystack, rule.cautionTerms)) {
      score -= 35;
    }

    if (matchesAnyTerm(haystack, rule.positiveTerms)) {
      score += 30;
    }
  }

  if (matchesAnyTerm(haystack, intent.diagnosisContext.blockedIngredients)) {
    score -= 25;
  }

  if ((intent.wantsHealthy || intent.wantsDiagnosisAdvice) && row.compositionText) {
    if (!/(е\d{3}|сахар|сироп|ароматиз|усилител|красител)/iu.test(row.compositionText)) {
      score += 10;
    }
  }

  return score;
}

function buildSuitabilityReason(product: AssistantProductRow, intent: SearchIntent): string[] {
  const haystack = `${normalizeQuery(product.title)} ${normalizeQuery(product.compositionText ?? "")}`;
  const reasons: string[] = [];

  if (intent.diagnosisContext.keys.length > 0) {
    for (const rule of DIAGNOSIS_RULES) {
      if (!intent.diagnosisContext.keys.includes(rule.key)) {
        continue;
      }

      if (matchesAnyTerm(haystack, rule.positiveTerms)) {
        reasons.push(`есть маркеры, которые выглядят лучше для сценария "${rule.label}"`);
      }

      if (!matchesAnyTerm(haystack, rule.cautionTerms) && !matchesAnyTerm(haystack, rule.hardBlockTerms)) {
        reasons.push(`нет явных тревожных маркеров для сценария "${rule.label}"`);
      }
    }
  }

  if (intent.wantsHealthy && product.compositionText) {
    if (!/(е\d{3}|ароматиз|усилител|красител)/iu.test(product.compositionText)) {
      reasons.push("в составе нет явных маркеров лишних добавок");
    }
  }

  if (product.discountPercent !== null && product.discountPercent >= 15) {
    reasons.push(`хорошая скидка ${product.discountPercent}%`);
  }

  if (reasons.length === 0 && product.priceMinor !== null) {
    reasons.push(`адекватная цена ${formatMinorUnits(product.priceMinor)}`);
  }

  return reasons.slice(0, 2);
}

function buildProfileSavedMessage(profile: PersistedUserProfile | null): string {
  if (!profile) {
    return "Запомнил ваши предпочтения. Теперь могу подбирать товары точнее.";
  }

  const parts = [
    "Запомнил ваш профиль.",
    profile.budgetMinor !== null ? `Бюджет: ${formatMinorUnits(profile.budgetMinor)}` : null,
    profile.diagnoses.length > 0 ? `Ограничения/диагнозы: ${profile.diagnoses.join(", ")}` : null,
    profile.allergies.length > 0 ? `Аллергии: ${profile.allergies.join(", ")}` : null,
    profile.excludedIngredients.length > 0
      ? `Исключаемые ингредиенты: ${profile.excludedIngredients.join(", ")}`
      : null,
    profile.preferredStores.length > 0 ? `Любимые магазины: ${profile.preferredStores.join(", ")}` : null,
    "",
    "Теперь можно просто писать вроде: `собери корзину на неделю` или `что можно на перекус`.",
  ].filter((value): value is string => Boolean(value));

  return parts.join("\n");
}

function isTelegramParseModeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  return /parse entities|can't parse entities|parse mode/i.test(error.message);
}

function matchesAnyTerm(haystack: string, terms: readonly string[]): boolean {
  return terms.some((term) => haystack.includes(term));
}

function shouldUseMarkdownReply(intent: SearchIntent): boolean {
  return intent.wantsHealthy || intent.wantsDiagnosisAdvice || intent.wantsBasket;
}

function shouldAttemptAiRewrite(
  originalQuery: string,
  intent: SearchIntent,
  products: AssistantProductRow[],
): boolean {
  if (products.length > 0 && intent.searchTerms.length > 0 && originalQuery.trim().split(/\s+/).length <= 3) {
    return false;
  }

  return (
    products.length === 0 ||
    intent.searchTerms.length === 0 ||
    originalQuery.trim().split(/\s+/).length >= 4 ||
    intent.wantsBasket ||
    intent.wantsDiagnosisAdvice
  );
}

async function planUserRequestWithGroq(
  env: BotWorkerEnv,
  userQuery: string,
  intent: SearchIntent,
  profile: PersistedUserProfile | null,
): Promise<BotRequestPlan | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Groq planner timeout"), 4_500);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        temperature: 0,
        max_completion_tokens: 220,
        messages: [
          {
            role: "system",
            content: [
              "Ты planner для Telegram-бота по продуктам.",
              "Верни только JSON без пояснений.",
              "Формат: {\"action\":\"search|find_cheapest|build_basket|diagnosis_safe\",\"catalogQueries\":[\"...\"],\"budgetRub\":number|null,\"needsHealthy\":boolean,\"needsDiagnosisAdvice\":boolean,\"compareCheapest\":boolean,\"wantsBasket\":boolean,\"profileOnly\":boolean,\"responseMode\":\"direct|assistant\",\"profilePatch\":{\"budgetRub\":number|null,\"preferredStores\":[\"...\"],\"excludedIngredients\":[\"...\"],\"allergies\":[\"...\"],\"diagnoses\":[\"...\"],\"healthGoals\":[\"...\"]}}.",
              "catalogQueries должны быть короткими и пригодными для поиска по каталогу, без лишних слов.",
              "Если пользователь просит собрать корзину, action=build_basket.",
              "Если пользователь просит корзину без явных товаров, synthesize 4-8 разумных продуктовых запросов для корзины, а не оставляй catalogQueries пустым.",
              "Если пользователь ищет где дешевле, action=find_cheapest.",
              "Если пользователь ищет где дешевле, выделяй только ядро товара, например `масло`, `молоко`, `сыр`, без слов `где`, `купить`, `дешевле`.",
              "Если пользователь спрашивает что можно при диагнозе или ограничении, action=diagnosis_safe.",
              "Если это обычный запрос на поиск товара, action=search.",
              "Не выдумывай бренды и продукты, которых нет в запросе.",
              "Если пользователь сообщает постоянные предпочтения или ограничения, заполни profilePatch.",
              "Если сообщение только обновляет профиль пользователя и не требует немедленного поиска, поставь profileOnly=true.",
              "Если пользователь не обновляет профиль, верни profilePatch как пустой объект.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                query: userQuery,
                extractedIntent: {
                  searchTerms: intent.searchTerms,
                  wantsHealthy: intent.wantsHealthy,
                  wantsCheap: intent.wantsCheap,
                  budgetRub: intent.budgetMinor !== null ? Number((intent.budgetMinor / 100).toFixed(2)) : null,
                  wantsBasket: intent.wantsBasket,
                  wantsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
                  diagnosisLabels: intent.diagnosisContext.labels,
                  preferredStores: intent.preferredStores,
                  excludedIngredients: intent.excludedIngredients,
                  healthGoals: intent.healthGoals,
                  storedProfile: profile,
                },
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
        `Groq planner ${response.status}: ${payload.error?.message ?? JSON.stringify(payload)}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }

    const parsed = extractJsonObject<{
      action?: PlannedAction;
      catalogQueries?: string[];
      budgetRub?: number | null;
      needsHealthy?: boolean;
      needsDiagnosisAdvice?: boolean;
      compareCheapest?: boolean;
      wantsBasket?: boolean;
      profileOnly?: boolean;
      responseMode?: "direct" | "assistant";
      profilePatch?: {
        budgetRub?: number | null;
        preferredStores?: string[];
        excludedIngredients?: string[];
        allergies?: string[];
        diagnoses?: string[];
        healthGoals?: string[];
      };
    }>(content);

    if (!parsed?.action || !isPlannedAction(parsed.action)) {
      return null;
    }

    return {
      action: parsed.action,
      catalogQueries: Array.isArray(parsed.catalogQueries)
        ? parsed.catalogQueries.map((value) => normalizeQuery(String(value))).filter((value) => value.length > 0)
        : intent.searchTerms,
      budgetMinor:
        typeof parsed.budgetRub === "number" && Number.isFinite(parsed.budgetRub) && parsed.budgetRub > 0
          ? Math.round(parsed.budgetRub * 100)
          : intent.budgetMinor,
      needsHealthy: parsed.needsHealthy ?? intent.wantsHealthy,
      needsDiagnosisAdvice: parsed.needsDiagnosisAdvice ?? intent.wantsDiagnosisAdvice,
      compareCheapest:
        parsed.compareCheapest ?? (parsed.action === "find_cheapest" ? true : intent.wantsCheap),
      wantsBasket: parsed.wantsBasket ?? (parsed.action === "build_basket" ? true : intent.wantsBasket),
      profileOnly: parsed.profileOnly ?? false,
      responseMode:
        parsed.responseMode ??
        (parsed.action === "search" && !intent.wantsHealthy && !intent.wantsDiagnosisAdvice ? "direct" : "assistant"),
      profilePatch: normalizeProfilePatch(parsed.profilePatch),
    };
  } catch (error) {
    console.error("Groq planner failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function rewriteCatalogQueryWithGroq(
  env: BotWorkerEnv,
  userQuery: string,
  intent: SearchIntent,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("Groq rewrite timeout"), 4_500);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL,
        temperature: 0,
        max_completion_tokens: 120,
        messages: [
          {
            role: "system",
            content: [
              "Ты преобразуешь пользовательский запрос к Telegram-боту в короткий поисковый запрос для каталога продуктов.",
              "Нужно вернуть только JSON без пояснений: {\"catalogQuery\":\"...\"}.",
              "Используй только продукты или категории, которые прямо следуют из запроса.",
              "Не выдумывай бренды, диагнозы и составы.",
              "Если запрос про корзину или диагноз, оставь только продуктовые опоры: например 'гречка курица йогурт'.",
              "Если явных продуктовых опор нет, верни пустую строку.",
            ].join(" "),
          },
          {
            role: "user",
            content: JSON.stringify(
              {
                query: userQuery,
                searchTerms: intent.searchTerms,
                wantsBasket: intent.wantsBasket,
                wantsDiagnosisAdvice: intent.wantsDiagnosisAdvice,
                wantsHealthy: intent.wantsHealthy,
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
        `Groq query rewrite ${response.status}: ${payload.error?.message ?? JSON.stringify(payload)}`,
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) {
      return null;
    }

    const parsed = extractJsonObject<{ catalogQuery?: string }>(content);
    const catalogQuery = parsed?.catalogQuery?.trim();
    return catalogQuery && catalogQuery.length > 0 ? catalogQuery : null;
  } catch (error) {
    console.error("Groq query rewrite failed", error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJsonObject<T>(input: string): T | null {
  const match = input.match(/\{[\s\S]*\}/u);
  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function normalizeStringList(values: string[]): string[] {
  return [...new Set(values.map((value) => normalizeQuery(String(value))).filter((value) => value.length > 0))];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => normalizeQuery(String(item))).filter((item) => item.length > 0)
    : [];
}

function asPlainObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function isPlannedAction(value: unknown): value is PlannedAction {
  return value === "search" || value === "find_cheapest" || value === "build_basket" || value === "diagnosis_safe";
}

function assembleBudgetBasket(
  products: AssistantProductRow[],
  budgetMinor: number | null,
  intent: SearchIntent,
): { items: AssistantProductRow[]; reliable: boolean; reason: string } {
  const sorted = products
    .slice()
    .filter((product) => !shouldRejectBasketCandidate(product, intent))
    .sort((left, right) => scoreBasketCandidate(right, intent) - scoreBasketCandidate(left, intent));
  const picked: AssistantProductRow[] = [];
  const usedFamilies = new Set<string>();
  let total = 0;

  for (const product of sorted) {
    if (product.priceMinor === null) {
      continue;
    }

    const family = inferProductFamily(product.title);
    const fitsBudget = budgetMinor === null || total + product.priceMinor <= budgetMinor;
    const familyAlreadyUsed = family !== "other" && usedFamilies.has(family);

    if (!fitsBudget && picked.length > 0) {
      continue;
    }

    if (familyAlreadyUsed && picked.length >= 3) {
      continue;
    }

    picked.push(product);
    total += product.priceMinor;
    if (family !== "other") {
      usedFamilies.add(family);
    }

    if (picked.length >= 5) {
      break;
    }
  }

  if (picked.length === 0) {
    return {
      items: [],
      reliable: false,
      reason: "В базе мало подходящих базовых продуктов для уверенной корзины. Лучше уточнить основу рациона или тип корзины.",
    };
  }

  const quality = assessBasketQuality(picked, budgetMinor, intent);
  if (!quality.reliable) {
    return {
      items: [],
      reliable: false,
      reason: quality.reason,
    };
  }

  return {
    items: picked,
    reliable: true,
    reason: "",
  };
}

function scoreBasketCandidate(row: AssistantProductRow, intent: SearchIntent): number {
  const base = row.matchScore ?? 0;
  const priceScore = row.priceMinor !== null ? Math.max(0, 4000 - row.priceMinor) / 40 : 0;
  const discountScore = row.discountPercent ?? 0;
  const medicalScore = scoreMedicalSuitability(row, intent);
  return base + priceScore + discountScore + medicalScore;
}

function shouldRejectBasketCandidate(row: AssistantProductRow, intent: SearchIntent): boolean {
  const haystack = normalizeQuery(`${row.title} ${row.compositionText ?? ""}`);
  const hasLowSignalHint = [...LOW_SIGNAL_BASKET_HINTS].some((hint) => haystack.includes(hint));
  const isPreparedFood = tokenizeWords(row.title).some((token) => PREPARED_FOOD_HINTS.has(token));

  if (!hasLowSignalHint && !isPreparedFood) {
    return false;
  }

  if (intent.wantsHealthy || intent.wantsDiagnosisAdvice || intent.diagnosisContext.keys.length > 0) {
    return true;
  }

  return hasLowSignalHint;
}

function assessBasketQuality(
  items: AssistantProductRow[],
  budgetMinor: number | null,
  intent: SearchIntent,
): { reliable: boolean; reason: string } {
  const families = new Set(items.map((item) => inferProductFamily(item.title)).filter((family) => family !== "other"));
  const totalMinor = items.reduce((sum, item) => sum + (item.priceMinor ?? 0), 0);

  if (items.length < 3) {
    return {
      reliable: false,
      reason: "Сейчас нашлось слишком мало внятных позиций для полноценной корзины.",
    };
  }

  if (families.size < 2) {
    return {
      reliable: false,
      reason: "Подборка получилась слишком однотипной. Нужны хотя бы 2-3 базовые категории продуктов.",
    };
  }

  if (budgetMinor !== null && totalMinor < Math.floor(budgetMinor * 0.35)) {
    return {
      reliable: false,
      reason: "Подборка заняла слишком маленькую долю бюджета и выглядит как неполная корзина, а не реальный набор продуктов.",
    };
  }

  if ((intent.wantsHealthy || intent.wantsDiagnosisAdvice) && items.some((item) => shouldRejectBasketCandidate(item, intent))) {
    return {
      reliable: false,
      reason: "Среди найденных позиций слишком много спорных или случайных товаров для полезной корзины.",
    };
  }

  return {
    reliable: true,
    reason: "",
  };
}

function inferProductFamily(title: string): string {
  const haystack = normalizeQuery(title);
  const families: Array<[string, string[]]> = [
    ["grain", ["греч", "рис", "овся", "каша", "макарон", "круп", "хлоп"]],
    ["dairy", ["молок", "сыр", "йогурт", "кефир", "творог"]],
    ["protein", ["кур", "индей", "говяд", "рыб", "яйц", "филе"]],
    ["vegetable", ["овощ", "огур", "томат", "помид", "капуст", "морков"]],
    ["fruit", ["яблок", "банан", "груш", "ягод", "апельсин"]],
    ["drink", ["вода", "чай", "сок", "напит"]],
  ];

  for (const [family, markers] of families) {
    if (markers.some((marker) => haystack.includes(marker))) {
      return family;
    }
  }

  return "other";
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
