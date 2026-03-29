import { createClient } from "@libsql/client";
import { and, asc, desc, eq, isNull, lt, ne, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import {
  canonicalProduct,
  currentOffer,
  parserCursor,
  priceHistory,
  store,
  type JsonObject,
} from "./schema";
import type { CanonicalCategory, CanonicalProduct, StoreName } from "../parsers/types";

const SQLITE_TIMESTAMP_LENGTH = 19;

export interface DatabaseEnv {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export interface StoreRegistryEntry {
  id: StoreName;
  name: string;
  parserKind: StoreName;
  baseUrl: string;
  sortOrder: number;
  metadata?: JsonObject;
}

export interface UpsertProductAndOfferInput {
  product: CanonicalProduct;
  observedAt?: string;
  parserRunId?: string | null;
  sourceCategoryId?: string | null;
  sourceCategorySlug?: string | null;
}

export interface OfferStateSnapshot {
  storeId: StoreName;
  canonicalProductId: string;
  currentOfferId: string;
  sourceProductId: string;
  available: boolean;
  priceMinor: number | null;
  oldPriceMinor: number | null;
  pricePerBaseUnitMinor: number | null;
  discountPercent: number | null;
  currencyCode: "BYN";
  rawPayload: JsonObject;
}

export interface UpsertProductAndOfferResult {
  storeId: StoreName;
  canonicalProductId: string;
  identityKey: string;
  currentOfferId: string;
  observedAt: string;
  state: OfferStateSnapshot;
}

export interface AppendPriceHistoryInput extends OfferStateSnapshot {
  observedAt: string;
  parserRunId?: string | null;
}

export interface AppendPriceHistoryResult {
  appended: boolean;
  snapshotKey: string | null;
}

export interface UpdateParserCursorInput {
  id: string;
  storeId: StoreName;
  parserName: string;
  cursorKind: "category" | "promo" | "bootstrap" | "repair";
  scopeKey: string;
  nextCursor?: string | null;
  page?: number;
  pageSize?: number | null;
  lastSeenItemKey?: string | null;
  watermark?: string | null;
  status?: "idle" | "running" | "completed" | "blocked";
  retryCount?: number;
  lockToken?: string | null;
  lockedUntil?: string | null;
  lastCompletedAt?: string | null;
  errorText?: string | null;
  metadata?: JsonObject;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParserCursorRecord {
  id: string;
  storeId: StoreName;
  parserName: string;
  cursorKind: "category" | "promo" | "bootstrap" | "repair";
  scopeKey: string;
  nextCursor: string | null;
  page: number;
  pageSize: number | null;
  lastSeenItemKey: string | null;
  watermark: string | null;
  status: "idle" | "running" | "completed" | "blocked";
  retryCount: number;
  lockToken: string | null;
  lockedUntil: string | null;
  lastCompletedAt: string | null;
  errorText: string | null;
  metadata: JsonObject;
  createdAt: string;
  updatedAt: string;
}

export function createDatabase(env: DatabaseEnv) {
  const client = createClient({
    url: env.TURSO_DATABASE_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, {
    schema: {
      store,
      canonicalProduct,
      currentOffer,
      priceHistory,
      parserCursor,
    },
  });
}

export type ParserDatabase = ReturnType<typeof createDatabase>;

export function toSqliteTimestamp(date: Date = new Date()): string {
  return date.toISOString().replace("T", " ").slice(0, SQLITE_TIMESTAMP_LENGTH);
}

export function toMinorUnits(value: number | null | undefined): number | null {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }

  return Math.round(value * 100);
}

export function buildCursorId(
  storeId: StoreName,
  cursorKind: UpdateParserCursorInput["cursorKind"],
  scopeKey: string,
): string {
  return `cursor:${storeId}:${cursorKind}:${scopeKey}`;
}

export async function syncStoreRegistry(
  db: ParserDatabase,
  stores: readonly StoreRegistryEntry[],
  now = toSqliteTimestamp(),
): Promise<void> {
  for (const item of stores) {
    await db
      .insert(store)
      .values({
        id: item.id,
        name: item.name,
        parserKind: item.parserKind,
        baseUrl: item.baseUrl,
        currencyCode: "BYN",
        city: "Minsk",
        countryCode: "BY",
        active: true,
        sortOrder: item.sortOrder,
        metadata: item.metadata ?? {},
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: store.id,
        set: {
          name: item.name,
          parserKind: item.parserKind,
          baseUrl: item.baseUrl,
          active: true,
          sortOrder: item.sortOrder,
          metadata: item.metadata ?? {},
          updatedAt: now,
        },
      });
  }
}

export async function ensureBootstrapCursors(
  db: ParserDatabase,
  stores: readonly StoreRegistryEntry[],
  pageSize: number,
  now = toSqliteTimestamp(),
): Promise<void> {
  for (const item of stores) {
    await updateParserCursor(db, {
      id: buildCursorId(item.id, "bootstrap", "root"),
      storeId: item.id,
      parserName: item.parserKind,
      cursorKind: "bootstrap",
      scopeKey: "root",
      page: 1,
      pageSize,
      status: "idle",
      metadata: {
        seededBy: "ensureBootstrapCursors",
        storeName: item.name,
        baseUrl: item.baseUrl,
      },
      createdAt: now,
      updatedAt: now,
    });
  }
}

export async function upsertCategoryCursor(
  db: ParserDatabase,
  storeId: StoreName,
  parserName: string,
  category: CanonicalCategory,
  pageSize: number,
  now = toSqliteTimestamp(),
): Promise<void> {
  await updateParserCursor(db, {
    id: buildCursorId(storeId, "category", category.id),
    storeId,
    parserName,
    cursorKind: "category",
    scopeKey: category.id,
    page: 1,
    pageSize,
    status: "idle",
    metadata: {
      categoryId: category.id,
      categorySlug: category.slug,
      categoryName: category.name,
      categoryUrl: category.url,
      featured: category.featured,
      parentId: category.parentId,
    },
    createdAt: now,
    updatedAt: now,
  });
}

export async function ensurePromoCursor(
  db: ParserDatabase,
  storeId: StoreName,
  parserName: string,
  pageSize: number,
  now = toSqliteTimestamp(),
): Promise<void> {
  await updateParserCursor(db, {
    id: buildCursorId(storeId, "promo", "main"),
    storeId,
    parserName,
    cursorKind: "promo",
    scopeKey: "main",
    page: 1,
    pageSize,
    status: "idle",
    metadata: {
      promoScope: "main",
    },
    createdAt: now,
    updatedAt: now,
  });
}

export async function claimNextParserCursor(
  db: ParserDatabase,
  now = toSqliteTimestamp(),
  lockTtlSeconds = 840,
): Promise<ParserCursorRecord | null> {
  const [candidate] = await db
    .select()
    .from(parserCursor)
    .where(
      and(
        ne(parserCursor.status, "blocked"),
        or(isNull(parserCursor.lockedUntil), lt(parserCursor.lockedUntil, now)),
      ),
    )
    .orderBy(
      asc(parserCursor.lastCompletedAt),
      asc(parserCursor.updatedAt),
      asc(parserCursor.createdAt),
      asc(parserCursor.id),
    )
    .limit(1);

  if (!candidate) {
    return null;
  }

  const lockToken = await stableHash(`lock:${candidate.id}:${now}`);
  const lockedUntil = toSqliteTimestamp(new Date(Date.now() + lockTtlSeconds * 1000));

  await updateParserCursor(db, {
    id: candidate.id,
    storeId: candidate.storeId,
    parserName: candidate.parserName,
    cursorKind: candidate.cursorKind,
    scopeKey: candidate.scopeKey,
    nextCursor: candidate.nextCursor,
    page: candidate.page,
    pageSize: candidate.pageSize,
    lastSeenItemKey: candidate.lastSeenItemKey,
    watermark: candidate.watermark,
    status: "running",
    retryCount: candidate.retryCount,
    lockToken,
    lockedUntil,
    lastCompletedAt: candidate.lastCompletedAt,
    errorText: null,
    metadata: asJsonObject(candidate.metadata),
    createdAt: candidate.createdAt,
    updatedAt: now,
  });

  return {
    ...candidate,
    lockToken,
    lockedUntil,
    status: "running",
    metadata: asJsonObject(candidate.metadata),
    updatedAt: now,
  };
}

export async function updateParserCursor(
  db: ParserDatabase,
  input: UpdateParserCursorInput,
): Promise<void> {
  const createdAt = input.createdAt ?? toSqliteTimestamp();
  const updatedAt = input.updatedAt ?? createdAt;

  await db
    .insert(parserCursor)
    .values({
      id: input.id,
      storeId: input.storeId,
      parserName: input.parserName,
      cursorKind: input.cursorKind,
      scopeKey: input.scopeKey,
      nextCursor: input.nextCursor ?? null,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? null,
      lastSeenItemKey: input.lastSeenItemKey ?? null,
      watermark: input.watermark ?? null,
      status: input.status ?? "idle",
      retryCount: input.retryCount ?? 0,
      lockToken: input.lockToken ?? null,
      lockedUntil: input.lockedUntil ?? null,
      lastCompletedAt: input.lastCompletedAt ?? null,
      errorText: input.errorText ?? null,
      metadata: input.metadata ?? {},
      createdAt,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: parserCursor.id,
      set: {
        storeId: input.storeId,
        parserName: input.parserName,
        cursorKind: input.cursorKind,
        scopeKey: input.scopeKey,
        nextCursor: input.nextCursor ?? null,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? null,
        lastSeenItemKey: input.lastSeenItemKey ?? null,
        watermark: input.watermark ?? null,
        status: input.status ?? "idle",
        retryCount: input.retryCount ?? 0,
        lockToken: input.lockToken ?? null,
        lockedUntil: input.lockedUntil ?? null,
        lastCompletedAt: input.lastCompletedAt ?? null,
        errorText: input.errorText ?? null,
        metadata: input.metadata ?? {},
        updatedAt,
      },
    });
}

export async function upsertProductAndOffer(
  db: ParserDatabase,
  input: UpsertProductAndOfferInput,
): Promise<UpsertProductAndOfferResult> {
  const observedAt = input.observedAt ?? toSqliteTimestamp();
  const product = input.product;
  const normalizedUnit = parseUnitDescriptor(product.unit);
  const priceMinor = toMinorUnits(product.price);
  const oldPriceMinor = toMinorUnits(product.oldPrice);
  const discountPercent =
    product.discountPercent === null || product.discountPercent === undefined
      ? oldPriceMinor !== null && priceMinor !== null && oldPriceMinor > priceMinor
        ? Math.round(((oldPriceMinor - priceMinor) / oldPriceMinor) * 100)
        : null
      : Math.round(product.discountPercent);
  const identityKey = buildIdentityKey(product, normalizedUnit);
  const canonicalProductId = await stableHash(`canonical:${identityKey}`);
  const compositionHash = product.composition
    ? await stableHash(`composition:${normalizeText(product.composition)}`)
    : null;
  const sourceCategoryId = input.sourceCategoryId ?? product.categoryIds[0] ?? null;
  const offerId = await stableHash(`offer:${product.source}:${product.id}`);
  const pricePerBaseUnitMinor =
    priceMinor === null ? null : computePricePerBaseUnitMinor(priceMinor, normalizedUnit);
  const canonicalCategoryKey = sourceCategoryId
    ? `${product.source}:${sourceCategoryId}`
    : null;

  await db
    .insert(canonicalProduct)
    .values({
      id: canonicalProductId,
      identityKey,
      displayName: product.name,
      normalizedName: normalizeText(product.name),
      searchText: buildSearchText(product),
      brand: normalizeOptionalText(product.brand),
      categoryKey: canonicalCategoryKey,
      taxonomyPath: sourceCategoryId ? [`${product.source}:${sourceCategoryId}`] : [],
      unitKind: normalizedUnit.unitKind,
      unitAmountBase: normalizedUnit.unitAmountBase,
      unitLabel: normalizedUnit.unitLabel,
      imageUrl: product.imageUrl,
      compositionText: product.composition,
      compositionHash,
      active: true,
      firstSeenAt: observedAt,
      lastSeenAt: observedAt,
      createdAt: observedAt,
      updatedAt: observedAt,
    })
    .onConflictDoUpdate({
      target: canonicalProduct.id,
      set: {
        identityKey,
        displayName: product.name,
        normalizedName: normalizeText(product.name),
        searchText: buildSearchText(product),
        brand: normalizeOptionalText(product.brand),
        categoryKey: canonicalCategoryKey,
        taxonomyPath: sourceCategoryId ? [`${product.source}:${sourceCategoryId}`] : [],
        unitKind: normalizedUnit.unitKind,
        unitAmountBase: normalizedUnit.unitAmountBase,
        unitLabel: normalizedUnit.unitLabel,
        imageUrl: product.imageUrl,
        compositionText: product.composition,
        compositionHash,
        active: true,
        lastSeenAt: observedAt,
        updatedAt: observedAt,
      },
    });

  const rawPayload = asJsonObject({
    parserRunId: input.parserRunId ?? null,
    canonical: product.raw ?? null,
    categoryIds: product.categoryIds,
  });

  await db
    .insert(currentOffer)
    .values({
      id: offerId,
      storeId: product.source,
      canonicalProductId,
      sourceProductId: product.id,
      sourceCategoryId,
      sourceCategorySlug: input.sourceCategorySlug ?? null,
      title: product.name,
      url: product.url,
      imageUrl: product.imageUrl,
      available: product.available,
      stockStatus: product.available ? "in_stock" : "out_of_stock",
      currencyCode: "BYN",
      priceMinor,
      oldPriceMinor,
      pricePerBaseUnitMinor,
      discountPercent,
      compositionText: product.composition,
      compositionHash,
      rawPayload,
      parserSeenAt: observedAt,
      firstSeenAt: observedAt,
      updatedAt: observedAt,
    })
    .onConflictDoUpdate({
      target: currentOffer.id,
      set: {
        canonicalProductId,
        sourceCategoryId,
        sourceCategorySlug: input.sourceCategorySlug ?? null,
        title: product.name,
        url: product.url,
        imageUrl: product.imageUrl,
        available: product.available,
        stockStatus: product.available ? "in_stock" : "out_of_stock",
        currencyCode: "BYN",
        priceMinor,
        oldPriceMinor,
        pricePerBaseUnitMinor,
        discountPercent,
        compositionText: product.composition,
        compositionHash,
        rawPayload,
        parserSeenAt: observedAt,
        updatedAt: observedAt,
      },
    });

  return {
    storeId: product.source,
    canonicalProductId,
    identityKey,
    currentOfferId: offerId,
    observedAt,
    state: {
      storeId: product.source,
      canonicalProductId,
      currentOfferId: offerId,
      sourceProductId: product.id,
      available: product.available,
      priceMinor,
      oldPriceMinor,
      pricePerBaseUnitMinor,
      discountPercent,
      currencyCode: "BYN",
      rawPayload,
    },
  };
}

export async function appendPriceHistoryIfNeeded(
  db: ParserDatabase,
  input: AppendPriceHistoryInput,
): Promise<AppendPriceHistoryResult> {
  const [latest] = await db
    .select({
      available: priceHistory.available,
      priceMinor: priceHistory.priceMinor,
      oldPriceMinor: priceHistory.oldPriceMinor,
      pricePerBaseUnitMinor: priceHistory.pricePerBaseUnitMinor,
      discountPercent: priceHistory.discountPercent,
    })
    .from(priceHistory)
    .where(
      and(
        eq(priceHistory.storeId, input.storeId),
        eq(priceHistory.sourceProductId, input.sourceProductId),
      ),
    )
    .orderBy(desc(priceHistory.observedAt), desc(priceHistory.id))
    .limit(1);

  const unchanged =
    latest !== undefined &&
    latest.available === input.available &&
    latest.priceMinor === input.priceMinor &&
    latest.oldPriceMinor === input.oldPriceMinor &&
    latest.pricePerBaseUnitMinor === input.pricePerBaseUnitMinor &&
    latest.discountPercent === input.discountPercent;

  if (unchanged) {
    return {
      appended: false,
      snapshotKey: null,
    };
  }

  const snapshotKey = await stableHash(
    [
      "price-history",
      input.storeId,
      input.sourceProductId,
      input.parserRunId ?? "manual",
      input.observedAt,
      input.available ? "1" : "0",
      input.priceMinor ?? "null",
      input.oldPriceMinor ?? "null",
      input.pricePerBaseUnitMinor ?? "null",
      input.discountPercent ?? "null",
    ].join("|"),
  );

  await db
    .insert(priceHistory)
    .values({
      snapshotKey,
      storeId: input.storeId,
      canonicalProductId: input.canonicalProductId,
      currentOfferId: input.currentOfferId,
      sourceProductId: input.sourceProductId,
      currencyCode: input.currencyCode,
      available: input.available,
      priceMinor: input.priceMinor,
      oldPriceMinor: input.oldPriceMinor,
      pricePerBaseUnitMinor: input.pricePerBaseUnitMinor,
      discountPercent: input.discountPercent,
      observedAt: input.observedAt,
      parserRunId: input.parserRunId ?? null,
      rawPayload: input.rawPayload,
    })
    .onConflictDoNothing({
      target: priceHistory.snapshotKey,
    });

  return {
    appended: true,
    snapshotKey,
  };
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[()]/g, " ")
    .replace(/[,/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = normalizeText(value);
  return normalized.length > 0 ? normalized : null;
}

function buildSearchText(product: CanonicalProduct): string {
  return [product.brand, product.name, product.unit]
    .map((item) => (item ? normalizeText(item) : null))
    .filter((item): item is string => Boolean(item))
    .join(" ");
}

interface NormalizedUnit {
  unitKind: string | null;
  unitAmountBase: number | null;
  unitLabel: string | null;
}

function parseUnitDescriptor(unit: string | null): NormalizedUnit {
  if (!unit) {
    return {
      unitKind: null,
      unitAmountBase: null,
      unitLabel: null,
    };
  }

  const normalized = normalizeText(unit);
  const match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(кг|kg|г|g|л|l|мл|ml|шт|pcs|pc|piece|уп|упак)/i);
  if (!match) {
    return {
      unitKind: null,
      unitAmountBase: null,
      unitLabel: normalized,
    };
  }

  const rawAmount = Number(match[1].replace(",", "."));
  const rawUnit = match[2].toLowerCase();

  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    return {
      unitKind: null,
      unitAmountBase: null,
      unitLabel: normalized,
    };
  }

  if (rawUnit === "кг" || rawUnit === "kg") {
    return { unitKind: "mass", unitAmountBase: Math.round(rawAmount * 1000), unitLabel: normalized };
  }

  if (rawUnit === "г" || rawUnit === "g") {
    return { unitKind: "mass", unitAmountBase: Math.round(rawAmount), unitLabel: normalized };
  }

  if (rawUnit === "л" || rawUnit === "l") {
    return {
      unitKind: "volume",
      unitAmountBase: Math.round(rawAmount * 1000),
      unitLabel: normalized,
    };
  }

  if (rawUnit === "мл" || rawUnit === "ml") {
    return { unitKind: "volume", unitAmountBase: Math.round(rawAmount), unitLabel: normalized };
  }

  return { unitKind: "count", unitAmountBase: Math.round(rawAmount), unitLabel: normalized };
}

function computePricePerBaseUnitMinor(
  priceMinor: number,
  normalizedUnit: NormalizedUnit,
): number | null {
  if (!normalizedUnit.unitAmountBase || normalizedUnit.unitAmountBase <= 0) {
    return null;
  }

  if (normalizedUnit.unitKind === "mass" || normalizedUnit.unitKind === "volume") {
    return Math.round((priceMinor * 100) / normalizedUnit.unitAmountBase);
  }

  return Math.round(priceMinor / normalizedUnit.unitAmountBase);
}

function buildIdentityKey(product: CanonicalProduct, normalizedUnit: NormalizedUnit): string {
  return [
    normalizeOptionalText(product.brand) ?? "generic",
    normalizeText(product.name),
    normalizedUnit.unitKind ?? "unknown",
    normalizedUnit.unitAmountBase ?? "na",
    normalizedUnit.unitLabel ?? "na",
  ].join("|");
}

function asJsonObject(value: unknown): JsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as JsonObject;
  }

  return { value: value ?? null };
}

async function stableHash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");

  return hex.slice(0, 32);
}
