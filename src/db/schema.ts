import { relations, sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * Today: 2026-03-29
 *
 * Drizzle + Turso bootstrap:
 * 1. Add packages:
 *    `npm install drizzle-orm @libsql/client`
 *    `npm install -D drizzle-kit dotenv typescript`
 * 2. Create `drizzle.config.ts` in the project root:
 *    `import { defineConfig } from "drizzle-kit";`
 *    `import "dotenv/config";`
 *    `export default defineConfig({
 *       dialect: "turso",
 *       schema: "./src/db/schema.ts",
 *       out: "./drizzle",
 *       dbCredentials: {
 *         url: process.env.TURSO_DATABASE_URL!,
 *         authToken: process.env.TURSO_AUTH_TOKEN!,
 *       },
 *     });`
 * 3. Create `.env` with `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
 * 4. Initialize or sync schema:
 *    `npx drizzle-kit push`
 *
 * Notes:
 * - Money is stored in integer minor units (`*_minor`) to avoid float rounding.
 * - `price_history` is append-only by design. Only INSERT new snapshots.
 */

const storeKinds = ["green", "edostavka", "gippo", "emall"] as const;
const currencyCodes = ["BYN"] as const;
const offerStockStatuses = ["in_stock", "out_of_stock", "limited", "unknown"] as const;
const promoCandidateStatuses = [
  "new",
  "queued",
  "published",
  "rejected",
  "expired",
] as const;
const promoCandidateReasons = [
  "discount_drop",
  "new_promo",
  "basket_value",
  "manual_review",
  "reprice",
] as const;
const publishStatuses = ["published", "skipped", "failed"] as const;
const publishEntityTypes = ["promo_candidate", "offer", "digest"] as const;
const compositionStatuses = ["ready", "error", "stale"] as const;
const compositionVerdicts = ["healthy", "balanced", "caution", "unknown"] as const;
const parserCursorKinds = ["category", "promo", "bootstrap", "repair"] as const;
const parserCursorStatuses = ["idle", "running", "completed", "blocked"] as const;

export type JsonObject = Record<string, unknown>;

export const store = sqliteTable(
  "store",
  {
    id: text("id", { enum: storeKinds }).primaryKey(),
    name: text("name").notNull(),
    parserKind: text("parser_kind", { enum: storeKinds }).notNull(),
    baseUrl: text("base_url").notNull(),
    currencyCode: text("currency_code", { enum: currencyCodes }).notNull().default("BYN"),
    city: text("city").notNull().default("Minsk"),
    countryCode: text("country_code").notNull().default("BY"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    metadata: text("metadata", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("store_parser_kind_uidx").on(table.parserKind),
    index("store_active_sort_idx").on(table.active, table.sortOrder),
  ],
);

export const canonicalProduct = sqliteTable(
  "canonical_product",
  {
    id: text("id").primaryKey(),
    identityKey: text("identity_key").notNull(),
    displayName: text("display_name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    searchText: text("search_text").notNull(),
    brand: text("brand"),
    categoryKey: text("category_key"),
    taxonomyPath: text("taxonomy_path", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    unitKind: text("unit_kind"),
    unitAmountBase: integer("unit_amount_base"),
    unitLabel: text("unit_label"),
    imageUrl: text("image_url"),
    compositionText: text("composition_text"),
    compositionHash: text("composition_hash"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    firstSeenAt: text("first_seen_at").notNull().default(sql`(current_timestamp)`),
    lastSeenAt: text("last_seen_at").notNull().default(sql`(current_timestamp)`),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("canonical_product_identity_key_uidx").on(table.identityKey),
    index("canonical_product_search_idx").on(table.searchText),
    index("canonical_product_category_idx").on(table.categoryKey, table.active),
    index("canonical_product_brand_name_idx").on(table.brand, table.normalizedName),
    index("canonical_product_composition_hash_idx").on(table.compositionHash),
    check(
      "canonical_product_unit_amount_base_nonnegative_chk",
      sql`${table.unitAmountBase} IS NULL OR ${table.unitAmountBase} >= 0`,
    ),
  ],
);

export const currentOffer = sqliteTable(
  "current_offer",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id", { enum: storeKinds })
      .notNull()
      .references(() => store.id, { onDelete: "cascade", onUpdate: "cascade" }),
    canonicalProductId: text("canonical_product_id")
      .notNull()
      .references(() => canonicalProduct.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sourceProductId: text("source_product_id").notNull(),
    sourceCategoryId: text("source_category_id"),
    sourceCategorySlug: text("source_category_slug"),
    title: text("title").notNull(),
    url: text("url").notNull(),
    imageUrl: text("image_url"),
    available: integer("available", { mode: "boolean" }).notNull().default(true),
    stockStatus: text("stock_status", { enum: offerStockStatuses })
      .notNull()
      .default("unknown"),
    currencyCode: text("currency_code", { enum: currencyCodes }).notNull().default("BYN"),
    priceMinor: integer("price_minor"),
    oldPriceMinor: integer("old_price_minor"),
    pricePerBaseUnitMinor: integer("price_per_base_unit_minor"),
    discountPercent: integer("discount_percent"),
    compositionText: text("composition_text"),
    compositionHash: text("composition_hash"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<JsonObject>(),
    parserSeenAt: text("parser_seen_at").notNull().default(sql`(current_timestamp)`),
    firstSeenAt: text("first_seen_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("current_offer_store_source_uidx").on(table.storeId, table.sourceProductId),
    index("current_offer_product_price_idx").on(
      table.canonicalProductId,
      table.available,
      table.priceMinor,
    ),
    index("current_offer_store_price_idx").on(table.storeId, table.available, table.priceMinor),
    index("current_offer_discount_idx").on(
      table.available,
      table.discountPercent,
      table.priceMinor,
    ),
    index("current_offer_store_category_price_idx").on(
      table.storeId,
      table.sourceCategoryId,
      table.available,
      table.priceMinor,
    ),
    index("current_offer_price_per_unit_idx").on(
      table.available,
      table.pricePerBaseUnitMinor,
      table.priceMinor,
    ),
    index("current_offer_parser_seen_idx").on(table.parserSeenAt),
    index("current_offer_composition_hash_idx").on(table.compositionHash),
    check(
      "current_offer_price_minor_nonnegative_chk",
      sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`,
    ),
    check(
      "current_offer_old_price_minor_nonnegative_chk",
      sql`${table.oldPriceMinor} IS NULL OR ${table.oldPriceMinor} >= 0`,
    ),
    check(
      "current_offer_price_per_unit_nonnegative_chk",
      sql`${table.pricePerBaseUnitMinor} IS NULL OR ${table.pricePerBaseUnitMinor} >= 0`,
    ),
    check(
      "current_offer_discount_percent_range_chk",
      sql`${table.discountPercent} IS NULL OR (${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100)`,
    ),
  ],
);

export const priceHistory = sqliteTable(
  "price_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    snapshotKey: text("snapshot_key").notNull(),
    storeId: text("store_id", { enum: storeKinds })
      .notNull()
      .references(() => store.id, { onDelete: "cascade", onUpdate: "cascade" }),
    canonicalProductId: text("canonical_product_id")
      .notNull()
      .references(() => canonicalProduct.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    currentOfferId: text("current_offer_id").references(() => currentOffer.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    sourceProductId: text("source_product_id").notNull(),
    currencyCode: text("currency_code", { enum: currencyCodes }).notNull().default("BYN"),
    available: integer("available", { mode: "boolean" }).notNull(),
    priceMinor: integer("price_minor"),
    oldPriceMinor: integer("old_price_minor"),
    pricePerBaseUnitMinor: integer("price_per_base_unit_minor"),
    discountPercent: integer("discount_percent"),
    observedAt: text("observed_at").notNull().default(sql`(current_timestamp)`),
    parserRunId: text("parser_run_id"),
    rawPayload: text("raw_payload", { mode: "json" }).$type<JsonObject>(),
  },
  (table) => [
    uniqueIndex("price_history_snapshot_key_uidx").on(table.snapshotKey),
    index("price_history_store_source_observed_idx").on(
      table.storeId,
      table.sourceProductId,
      table.observedAt,
    ),
    index("price_history_product_observed_idx").on(
      table.canonicalProductId,
      table.observedAt,
    ),
    index("price_history_offer_observed_idx").on(table.currentOfferId, table.observedAt),
    index("price_history_discount_observed_idx").on(
      table.discountPercent,
      table.observedAt,
    ),
    index("price_history_observed_idx").on(table.observedAt),
    check(
      "price_history_price_minor_nonnegative_chk",
      sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`,
    ),
    check(
      "price_history_old_price_minor_nonnegative_chk",
      sql`${table.oldPriceMinor} IS NULL OR ${table.oldPriceMinor} >= 0`,
    ),
    check(
      "price_history_price_per_unit_nonnegative_chk",
      sql`${table.pricePerBaseUnitMinor} IS NULL OR ${table.pricePerBaseUnitMinor} >= 0`,
    ),
    check(
      "price_history_discount_percent_range_chk",
      sql`${table.discountPercent} IS NULL OR (${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100)`,
    ),
  ],
);

export const promoCandidate = sqliteTable(
  "promo_candidate",
  {
    id: text("id").primaryKey(),
    candidateKey: text("candidate_key").notNull(),
    storeId: text("store_id", { enum: storeKinds })
      .notNull()
      .references(() => store.id, { onDelete: "cascade", onUpdate: "cascade" }),
    canonicalProductId: text("canonical_product_id")
      .notNull()
      .references(() => canonicalProduct.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    currentOfferId: text("current_offer_id")
      .notNull()
      .references(() => currentOffer.id, { onDelete: "cascade", onUpdate: "cascade" }),
    status: text("status", { enum: promoCandidateStatuses }).notNull().default("new"),
    reason: text("reason", { enum: promoCandidateReasons }).notNull(),
    score: integer("score").notNull().default(0),
    discountPercent: integer("discount_percent"),
    priceMinor: integer("price_minor"),
    oldPriceMinor: integer("old_price_minor"),
    detectedAt: text("detected_at").notNull().default(sql`(current_timestamp)`),
    expiresAt: text("expires_at"),
    publishedAt: text("published_at"),
    payload: text("payload", { mode: "json" }).$type<JsonObject>(),
  },
  (table) => [
    uniqueIndex("promo_candidate_candidate_key_uidx").on(table.candidateKey),
    index("promo_candidate_status_score_idx").on(table.status, table.score, table.detectedAt),
    index("promo_candidate_store_status_idx").on(table.storeId, table.status, table.detectedAt),
    index("promo_candidate_product_idx").on(table.canonicalProductId, table.detectedAt),
    index("promo_candidate_expires_idx").on(table.expiresAt),
    check("promo_candidate_score_nonnegative_chk", sql`${table.score} >= 0`),
    check(
      "promo_candidate_discount_percent_range_chk",
      sql`${table.discountPercent} IS NULL OR (${table.discountPercent} >= 0 AND ${table.discountPercent} <= 100)`,
    ),
    check(
      "promo_candidate_price_minor_nonnegative_chk",
      sql`${table.priceMinor} IS NULL OR ${table.priceMinor} >= 0`,
    ),
    check(
      "promo_candidate_old_price_minor_nonnegative_chk",
      sql`${table.oldPriceMinor} IS NULL OR ${table.oldPriceMinor} >= 0`,
    ),
  ],
);

export const publishLog = sqliteTable(
  "publish_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    dedupeKey: text("dedupe_key").notNull(),
    channelKey: text("channel_key").notNull(),
    entityType: text("entity_type", { enum: publishEntityTypes }).notNull(),
    entityId: text("entity_id").notNull(),
    status: text("status", { enum: publishStatuses }).notNull().default("published"),
    publishedAt: text("published_at").notNull().default(sql`(current_timestamp)`),
    telegramChatId: integer("telegram_chat_id", { mode: "number" }),
    telegramMessageId: integer("telegram_message_id"),
    payload: text("payload", { mode: "json" }).$type<JsonObject>(),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
  },
  (table) => [
    uniqueIndex("publish_log_dedupe_key_uidx").on(table.dedupeKey),
    index("publish_log_entity_idx").on(table.entityType, table.entityId, table.publishedAt),
    index("publish_log_channel_status_idx").on(table.channelKey, table.status, table.publishedAt),
    index("publish_log_published_idx").on(table.publishedAt),
  ],
);

export const compositionProfile = sqliteTable(
  "composition_profile",
  {
    id: text("id").primaryKey(),
    compositionHash: text("composition_hash").notNull(),
    profileVersion: text("profile_version").notNull(),
    model: text("model").notNull(),
    status: text("status", { enum: compositionStatuses }).notNull().default("ready"),
    verdict: text("verdict", { enum: compositionVerdicts }).notNull().default("unknown"),
    healthScore: integer("health_score"),
    sourceText: text("source_text").notNull(),
    normalizedText: text("normalized_text"),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    flags: text("flags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    nutrients: text("nutrients", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    responseJson: text("response_json", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    summary: text("summary"),
    errorText: text("error_text"),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    lastUsedAt: text("last_used_at").notNull().default(sql`(current_timestamp)`),
    expiresAt: text("expires_at"),
  },
  (table) => [
    uniqueIndex("composition_profile_hash_version_uidx").on(
      table.compositionHash,
      table.profileVersion,
    ),
    index("composition_profile_hash_idx").on(table.compositionHash),
    index("composition_profile_status_expires_idx").on(table.status, table.expiresAt),
    index("composition_profile_last_used_idx").on(table.lastUsedAt),
    check(
      "composition_profile_health_score_range_chk",
      sql`${table.healthScore} IS NULL OR (${table.healthScore} >= 0 AND ${table.healthScore} <= 100)`,
    ),
  ],
);

export const userProfile = sqliteTable(
  "user_profile",
  {
    telegramUserId: integer("telegram_user_id", { mode: "number" }).primaryKey(),
    username: text("username"),
    firstName: text("first_name"),
    lastName: text("last_name"),
    languageCode: text("language_code"),
    timezone: text("timezone").notNull().default("Europe/Minsk"),
    budgetMinor: integer("budget_minor"),
    householdSize: integer("household_size"),
    preferredStores: text("preferred_stores", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    excludedIngredients: text("excluded_ingredients", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    allergies: text("allergies", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    dislikedCategories: text("disliked_categories", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`(json_array())`),
    notificationSettings: text("notification_settings", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    botOptIn: integer("bot_opt_in", { mode: "boolean" }).notNull().default(true),
    channelOptIn: integer("channel_opt_in", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [
    uniqueIndex("user_profile_username_uidx").on(table.username),
    index("user_profile_active_seen_idx").on(table.active, table.lastSeenAt),
    index("user_profile_budget_idx").on(table.active, table.budgetMinor),
    check(
      "user_profile_budget_minor_nonnegative_chk",
      sql`${table.budgetMinor} IS NULL OR ${table.budgetMinor} >= 0`,
    ),
    check(
      "user_profile_household_size_positive_chk",
      sql`${table.householdSize} IS NULL OR ${table.householdSize} > 0`,
    ),
  ],
);

export const parserCursor = sqliteTable(
  "parser_cursor",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id", { enum: storeKinds })
      .notNull()
      .references(() => store.id, { onDelete: "cascade", onUpdate: "cascade" }),
    parserName: text("parser_name").notNull(),
    cursorKind: text("cursor_kind", { enum: parserCursorKinds }).notNull(),
    scopeKey: text("scope_key").notNull(),
    nextCursor: text("next_cursor"),
    page: integer("page").notNull().default(1),
    pageSize: integer("page_size"),
    lastSeenItemKey: text("last_seen_item_key"),
    watermark: text("watermark"),
    status: text("status", { enum: parserCursorStatuses }).notNull().default("idle"),
    retryCount: integer("retry_count").notNull().default(0),
    lockToken: text("lock_token"),
    lockedUntil: text("locked_until"),
    lastCompletedAt: text("last_completed_at"),
    errorText: text("error_text"),
    metadata: text("metadata", { mode: "json" })
      .$type<JsonObject>()
      .notNull()
      .default(sql`'{}'`),
    createdAt: text("created_at").notNull().default(sql`(current_timestamp)`),
    updatedAt: text("updated_at").notNull().default(sql`(current_timestamp)`),
  },
  (table) => [
    uniqueIndex("parser_cursor_scope_uidx").on(
      table.storeId,
      table.parserName,
      table.cursorKind,
      table.scopeKey,
    ),
    index("parser_cursor_status_idx").on(table.storeId, table.status, table.updatedAt),
    index("parser_cursor_lock_idx").on(table.lockedUntil, table.status),
    index("parser_cursor_completed_idx").on(table.lastCompletedAt),
    check("parser_cursor_page_positive_chk", sql`${table.page} > 0`),
    check(
      "parser_cursor_page_size_positive_chk",
      sql`${table.pageSize} IS NULL OR ${table.pageSize} > 0`,
    ),
    check("parser_cursor_retry_count_nonnegative_chk", sql`${table.retryCount} >= 0`),
  ],
);

export const storeRelations = relations(store, ({ many }) => ({
  currentOffers: many(currentOffer),
  priceHistory: many(priceHistory),
  promoCandidates: many(promoCandidate),
  parserCursors: many(parserCursor),
}));

export const canonicalProductRelations = relations(canonicalProduct, ({ many }) => ({
  currentOffers: many(currentOffer),
  priceHistory: many(priceHistory),
  promoCandidates: many(promoCandidate),
}));

export const currentOfferRelations = relations(currentOffer, ({ one, many }) => ({
  store: one(store, {
    fields: [currentOffer.storeId],
    references: [store.id],
  }),
  canonicalProduct: one(canonicalProduct, {
    fields: [currentOffer.canonicalProductId],
    references: [canonicalProduct.id],
  }),
  priceHistory: many(priceHistory),
  promoCandidates: many(promoCandidate),
}));

export const priceHistoryRelations = relations(priceHistory, ({ one }) => ({
  store: one(store, {
    fields: [priceHistory.storeId],
    references: [store.id],
  }),
  canonicalProduct: one(canonicalProduct, {
    fields: [priceHistory.canonicalProductId],
    references: [canonicalProduct.id],
  }),
  currentOffer: one(currentOffer, {
    fields: [priceHistory.currentOfferId],
    references: [currentOffer.id],
  }),
}));

export const promoCandidateRelations = relations(promoCandidate, ({ one }) => ({
  store: one(store, {
    fields: [promoCandidate.storeId],
    references: [store.id],
  }),
  canonicalProduct: one(canonicalProduct, {
    fields: [promoCandidate.canonicalProductId],
    references: [canonicalProduct.id],
  }),
  currentOffer: one(currentOffer, {
    fields: [promoCandidate.currentOfferId],
    references: [currentOffer.id],
  }),
}));

export const parserCursorRelations = relations(parserCursor, ({ one }) => ({
  store: one(store, {
    fields: [parserCursor.storeId],
    references: [store.id],
  }),
}));

