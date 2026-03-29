import {
  buildCursorId,
  appendPriceHistoryIfNeeded,
  claimNextParserCursor,
  createDatabase,
  ensureBootstrapCursors,
  ensurePromoCursor,
  syncStoreRegistry,
  toSqliteTimestamp,
  updateParserCursor,
  upsertCategoryCursor,
  upsertProductAndOffer,
  type ParserCursorRecord,
  type StoreRegistryEntry,
} from "../../db/repositories";
import { edostavkaParser } from "../../parsers/edostavka";
import { emallParser } from "../../parsers/emall";
import { gippoParser } from "../../parsers/gippo";
import { greenParser } from "../../parsers/green";
import type { CanonicalProduct, StoreName, StoreParser } from "../../parsers/types";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException?(): void;
}

interface ScheduledController {
  readonly cron: string;
  readonly scheduledTime: number;
  readonly type: "scheduled";
  noRetry?(): void;
}

interface ParserWorkerEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
  PARSER_PAGE_SIZE?: string;
  PARSER_LOCK_TTL_SECONDS?: string;
}

interface ParserRunSummary {
  status: "ok" | "noop" | "error";
  storeId: StoreName | null;
  cursorId: string | null;
  cursorKind: ParserCursorRecord["cursorKind"] | null;
  processed: number;
  historyAppends: number;
  failed: number;
  nextPage: number | null;
  nextCursor: string | null;
  message: string;
  at: string;
}

const STORE_REGISTRY: readonly StoreRegistryEntry[] = [
  {
    id: "green",
    name: "Green",
    parserKind: "green",
    baseUrl: "https://green-dostavka.by",
    sortOrder: 10,
  },
  {
    id: "edostavka",
    name: "Edostavka",
    parserKind: "edostavka",
    baseUrl: "https://edostavka.by",
    sortOrder: 20,
  },
  {
    id: "gippo",
    name: "Gippo",
    parserKind: "gippo",
    baseUrl: "https://gippo-market.by",
    sortOrder: 30,
  },
  {
    id: "emall",
    name: "Emall",
    parserKind: "emall",
    baseUrl: "https://emall.by",
    sortOrder: 40,
  },
] as const;

const PARSERS: Record<StoreName, StoreParser> = {
  green: greenParser,
  edostavka: edostavkaParser,
  gippo: gippoParser,
  emall: emallParser,
};

const DEFAULT_PAGE_SIZE = 24;
const DEFAULT_LOCK_TTL_SECONDS = 14 * 60;
const MAX_CURSOR_RETRIES = 2;

export default {
  async scheduled(
    controller: ScheduledController,
    env: ParserWorkerEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const runPromise = runScheduledShard(controller, env);
    ctx.waitUntil(runPromise);
    await runPromise;
  },

  async fetch(_request: Request, env: ParserWorkerEnv): Promise<Response> {
    const now = toSqliteTimestamp();
    const pageSize = readPositiveInteger(env.PARSER_PAGE_SIZE, DEFAULT_PAGE_SIZE);
    const lockTtlSeconds = readPositiveInteger(
      env.PARSER_LOCK_TTL_SECONDS,
      DEFAULT_LOCK_TTL_SECONDS,
    );

    return Response.json({
      ok: true,
      service: "parser-worker",
      at: now,
      pageSize,
      lockTtlSeconds,
      stores: STORE_REGISTRY.map((item) => item.id),
      configured: Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN),
    });
  },
};

async function runScheduledShard(
  controller: ScheduledController,
  env: ParserWorkerEnv,
): Promise<ParserRunSummary> {
  ensureDatabaseEnv(env);

  const db = createDatabase(env);
  const scheduledAt = toSqliteTimestamp(new Date(controller.scheduledTime));
  const pageSize = readPositiveInteger(env.PARSER_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const lockTtlSeconds = readPositiveInteger(
    env.PARSER_LOCK_TTL_SECONDS,
    DEFAULT_LOCK_TTL_SECONDS,
  );

  await syncStoreRegistry(db, STORE_REGISTRY, scheduledAt);
  await ensureBootstrapCursors(db, STORE_REGISTRY, pageSize, scheduledAt);

  const shard = await claimNextParserCursor(db, scheduledAt, lockTtlSeconds);
  if (!shard) {
    return {
      status: "noop",
      storeId: null,
      cursorId: null,
      cursorKind: null,
      processed: 0,
      historyAppends: 0,
      failed: 0,
      nextPage: null,
      nextCursor: null,
      message: "No available parser cursor shard",
      at: scheduledAt,
    };
  }

  const parser = PARSERS[shard.storeId];
  const parserRunId = `${shard.storeId}:${shard.id}:${controller.scheduledTime}`;

  try {
    if (shard.cursorKind === "bootstrap") {
      return await runBootstrapShard(db, parser, shard, pageSize, scheduledAt);
    }

    if (shard.cursorKind === "category") {
      return await runCategoryShard(db, parser, shard, pageSize, scheduledAt, parserRunId);
    }

    if (shard.cursorKind === "promo") {
      return await runPromoShard(db, parser, shard, pageSize, scheduledAt, parserRunId);
    }

    throw new Error(`Unsupported parser cursor kind: ${shard.cursorKind}`);
  } catch (error) {
    const retryCount = shard.retryCount + 1;
    const blocked = retryCount > MAX_CURSOR_RETRIES;

    await updateParserCursor(db, {
      id: shard.id,
      storeId: shard.storeId,
      parserName: shard.parserName,
      cursorKind: shard.cursorKind,
      scopeKey: shard.scopeKey,
      nextCursor: shard.nextCursor,
      page: shard.page,
      pageSize: shard.pageSize,
      lastSeenItemKey: shard.lastSeenItemKey,
      watermark: shard.watermark,
      status: blocked ? "blocked" : "idle",
      retryCount,
      lockToken: null,
      lockedUntil: null,
      lastCompletedAt: shard.lastCompletedAt,
      errorText: toErrorMessage(error),
      metadata: {
        ...shard.metadata,
        lastFailureAt: scheduledAt,
        lastFailureReason: toErrorMessage(error),
      },
      createdAt: shard.createdAt,
      updatedAt: scheduledAt,
    });

    if (blocked && typeof controller.noRetry === "function") {
      controller.noRetry();
    }

    throw error;
  }
}

async function runBootstrapShard(
  db: ReturnType<typeof createDatabase>,
  parser: StoreParser,
  shard: ParserCursorRecord,
  pageSize: number,
  observedAt: string,
): Promise<ParserRunSummary> {
  const categories = await parser.getCategories();

  for (const category of categories) {
    await upsertCategoryCursor(
      db,
      shard.storeId,
      shard.parserName,
      category,
      pageSize,
      observedAt,
    );
  }

  await ensurePromoCursor(db, shard.storeId, shard.parserName, pageSize, observedAt);
  await updateParserCursor(db, {
    id: shard.id,
    storeId: shard.storeId,
    parserName: shard.parserName,
    cursorKind: shard.cursorKind,
    scopeKey: shard.scopeKey,
    nextCursor: null,
    page: 1,
    pageSize,
    lastSeenItemKey: categories[categories.length - 1]?.id ?? null,
    watermark: observedAt,
    status: "completed",
    retryCount: 0,
    lockToken: null,
    lockedUntil: null,
    lastCompletedAt: observedAt,
    errorText: null,
    metadata: {
      ...shard.metadata,
      categoryCount: categories.length,
      bootstrapFinishedAt: observedAt,
      seededPromoCursorId: buildCursorId(shard.storeId, "promo", "main"),
    },
    createdAt: shard.createdAt,
    updatedAt: observedAt,
  });

  return {
    status: "ok",
    storeId: shard.storeId,
    cursorId: shard.id,
    cursorKind: shard.cursorKind,
    processed: categories.length,
    historyAppends: 0,
    failed: 0,
    nextPage: 1,
    nextCursor: null,
    message: `Bootstrapped ${categories.length} categories`,
    at: observedAt,
  };
}

async function runCategoryShard(
  db: ReturnType<typeof createDatabase>,
  parser: StoreParser,
  shard: ParserCursorRecord,
  pageSize: number,
  observedAt: string,
  parserRunId: string,
): Promise<ParserRunSummary> {
  const result = await parser.getProductsByCategory(
    {
      categoryId: shard.scopeKey,
      page: shard.page,
      pageSize: shard.pageSize ?? pageSize,
      cursor: shard.nextCursor,
    },
    {},
  );

  return processOfferPage({
    db,
    shard,
    pageSize,
    observedAt,
    parserRunId,
    products: result.items,
    nextCursor: result.nextCursor,
    currentPage: result.page,
    metadataPatch: {
      categoryId: shard.scopeKey,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      lastResultPageSize: result.items.length,
    },
  });
}

async function runPromoShard(
  db: ReturnType<typeof createDatabase>,
  parser: StoreParser,
  shard: ParserCursorRecord,
  pageSize: number,
  observedAt: string,
  parserRunId: string,
): Promise<ParserRunSummary> {
  const result = await parser.getPromoProducts(
    {
      page: shard.page,
      pageSize: shard.pageSize ?? pageSize,
      cursor: shard.nextCursor,
    },
    {},
  );

  return processOfferPage({
    db,
    shard,
    pageSize,
    observedAt,
    parserRunId,
    products: result.items,
    nextCursor: result.nextCursor,
    currentPage: result.page,
    metadataPatch: {
      promoScope: shard.scopeKey,
      totalItems: result.totalItems,
      totalPages: result.totalPages,
      lastResultPageSize: result.items.length,
    },
  });
}

async function processOfferPage(input: {
  db: ReturnType<typeof createDatabase>;
  shard: ParserCursorRecord;
  pageSize: number;
  observedAt: string;
  parserRunId: string;
  products: CanonicalProduct[];
  nextCursor: string | null;
  currentPage: number;
  metadataPatch: Record<string, unknown>;
}): Promise<ParserRunSummary> {
  let processed = 0;
  let historyAppends = 0;
  let failed = 0;
  let lastSeenItemKey: string | null = null;

  for (const product of input.products) {
    try {
      const upserted = await upsertProductAndOffer(input.db, {
        product,
        observedAt: input.observedAt,
        parserRunId: input.parserRunId,
        sourceCategoryId:
          input.shard.cursorKind === "category" ? input.shard.scopeKey : product.categoryIds[0] ?? null,
        sourceCategorySlug: readStringMetadata(input.shard.metadata, "categorySlug"),
      });

      const history = await appendPriceHistoryIfNeeded(input.db, {
        ...upserted.state,
        observedAt: input.observedAt,
        parserRunId: input.parserRunId,
      });

      processed += 1;
      lastSeenItemKey = product.id;
      if (history.appended) {
        historyAppends += 1;
      }
    } catch (error) {
      failed += 1;
      console.error("[parser-worker] product shard save failed", {
        shardId: input.shard.id,
        storeId: input.shard.storeId,
        productId: product.id,
        message: toErrorMessage(error),
      });
    }
  }

  const hasNext = Boolean(input.nextCursor);
  const nextPage = hasNext ? parseCursorPage(input.nextCursor, input.currentPage + 1) : 1;

  await updateParserCursor(input.db, {
    id: input.shard.id,
    storeId: input.shard.storeId,
    parserName: input.shard.parserName,
    cursorKind: input.shard.cursorKind,
    scopeKey: input.shard.scopeKey,
    nextCursor: input.nextCursor,
    page: nextPage,
    pageSize: input.pageSize,
    lastSeenItemKey,
    watermark: input.observedAt,
    status: hasNext ? "idle" : "completed",
    retryCount: 0,
    lockToken: null,
    lockedUntil: null,
    lastCompletedAt: hasNext ? input.shard.lastCompletedAt : input.observedAt,
    errorText: null,
    metadata: {
      ...input.shard.metadata,
      ...input.metadataPatch,
      lastProcessedCount: processed,
      lastFailedCount: failed,
      lastHistoryAppends: historyAppends,
      lastObservedAt: input.observedAt,
    },
    createdAt: input.shard.createdAt,
    updatedAt: input.observedAt,
  });

  return {
    status: "ok",
    storeId: input.shard.storeId,
    cursorId: input.shard.id,
    cursorKind: input.shard.cursorKind,
    processed,
    historyAppends,
    failed,
    nextPage,
    nextCursor: input.nextCursor,
    message: hasNext
      ? `Processed page ${input.currentPage}, next page ${nextPage}`
      : `Processed final page ${input.currentPage}`,
    at: input.observedAt,
  };
}

function parseCursorPage(cursor: string | null, fallback: number): number {
  if (!cursor) {
    return fallback;
  }

  const parsed = Number(cursor);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveInteger(input: string | undefined, fallback: number): number {
  if (!input) {
    return fallback;
  }

  const parsed = Number(input);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function ensureDatabaseEnv(env: ParserWorkerEnv): void {
  if (!env.TURSO_DATABASE_URL) {
    throw new Error("Missing TURSO_DATABASE_URL");
  }

  if (!env.TURSO_AUTH_TOKEN) {
    throw new Error("Missing TURSO_AUTH_TOKEN");
  }
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function readStringMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}
