import {
  appendQuery,
  calculateDiscountPercent,
  compactText,
  fetchJsonWithRetry,
  parsePage,
  pickFirstString,
} from "./shared";
import type {
  CanonicalCategory,
  CanonicalProduct,
  CategoryProductsRequest,
  PaginatedResult,
  PromoProductsRequest,
  RequestContext,
  RetryOptions,
  StoreParser,
} from "./types";

interface GippoInitialDataResponse {
  market_id: number;
}

interface GippoCategory {
  id: string;
  parent_id: string | null;
  title: string;
  slug: string;
  featured: boolean;
}

interface GippoMeta {
  current_page: number;
  last_page: number;
  total: number;
  per_page: number;
}

interface GippoProposal {
  price: number;
  max_qty: number;
  is_promo?: number;
  promo_price_before?: string | number | null;
}

interface GippoMarket {
  proposal?: GippoProposal | null;
}

interface GippoPropertyValue {
  value?: string | number | null;
}

interface GippoProduct {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  images: string[];
  short_name_uom?: string | null;
  breadcrumbs?: Array<{
    title: string;
    slug: string;
  }>;
  properties?: Record<string, GippoPropertyValue>;
  markets?: GippoMarket | GippoMarket[] | null;
}

interface GippoProductsResponse {
  data: GippoProduct[];
  meta: GippoMeta;
}

export interface GippoParserOptions {
  baseUrl?: string;
  apiBaseUrl?: string;
  defaultPageSize?: number;
  retry?: RetryOptions;
}

export class GippoParser implements StoreParser {
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly defaultPageSize: number;
  private readonly retry?: RetryOptions;
  private marketIdPromise: Promise<number> | null = null;

  constructor(options: GippoParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://gippo-market.by";
    this.apiBaseUrl = options.apiBaseUrl ?? "https://app.willesden.by/api";
    this.defaultPageSize = options.defaultPageSize ?? 12;
    this.retry = options.retry;
  }

  async getCategories(context?: RequestContext): Promise<CanonicalCategory[]> {
    const marketId = await this.resolveMarketId(undefined, context);
    const url = appendQuery(new URL(`${this.apiBaseUrl}/guest/shop/categories`), {
      market_id: marketId,
    });
    const categories = await fetchJsonWithRetry<GippoCategory[]>(
      url,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return categories.map((category) => ({
      source: "gippo",
      id: category.id,
      name: category.title,
      slug: category.slug,
      url: new URL(`/${category.slug}`, this.baseUrl).toString(),
      parentId: category.parent_id,
      featured: category.featured,
      raw: category,
    }));
  }

  async getProductsByCategory(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const pageSize = request.pageSize ?? this.defaultPageSize;
    const marketId = await this.resolveMarketId(request.marketId, context);
    const category = await this.resolveCategoryReference(request, context);

    if (!category.categoryId && !category.categorySlug) {
      throw new Error("Gippo parser requires categoryId or categorySlug");
    }

    const url = appendQuery(new URL(`${this.apiBaseUrl}/guest/shop/products`), {
      market_id: marketId,
      page,
      per_page: pageSize,
      "filter[categories][id]": category.categoryId,
      "filter[categories][slug]": category.categorySlug,
    });

    const response = await fetchJsonWithRetry<GippoProductsResponse>(
      url,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return {
      items: response.data.map((item) => this.toCanonicalProduct(item, false)),
      page: response.meta.current_page,
      pageSize: response.meta.per_page,
      totalItems: response.meta.total,
      totalPages: response.meta.last_page,
      nextCursor:
        response.meta.current_page < response.meta.last_page
          ? String(response.meta.current_page + 1)
          : null,
      raw: response,
    };
  }

  async getPromoProducts(
    request: PromoProductsRequest = {},
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const pageSize = request.pageSize ?? this.defaultPageSize;
    const marketId = await this.resolveMarketId(request.marketId, context);
    const url = appendQuery(new URL(`${this.apiBaseUrl}/guest/shop/products`), {
      market_id: marketId,
      page,
      per_page: pageSize,
      "filter[promo]": 1,
    });

    const response = await fetchJsonWithRetry<GippoProductsResponse>(
      url,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return {
      items: response.data.map((item) => this.toCanonicalProduct(item, true)),
      page: response.meta.current_page,
      pageSize: response.meta.per_page,
      totalItems: response.meta.total,
      totalPages: response.meta.last_page,
      nextCursor:
        response.meta.current_page < response.meta.last_page
          ? String(response.meta.current_page + 1)
          : null,
      raw: response,
    };
  }

  private async resolveMarketId(
    explicitMarketId: string | number | undefined,
    context?: RequestContext,
  ): Promise<number> {
    if (explicitMarketId !== undefined && explicitMarketId !== null && explicitMarketId !== "") {
      return Number(explicitMarketId);
    }

    if (!this.marketIdPromise) {
      this.marketIdPromise = this.loadMarketId(context);
    }

    return this.marketIdPromise;
  }

  private async loadMarketId(context?: RequestContext): Promise<number> {
    const response = await fetchJsonWithRetry<GippoInitialDataResponse>(
      `${this.apiBaseUrl}/guest/initial-data`,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return response.market_id;
  }

  private async resolveCategoryReference(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<{ categoryId?: string; categorySlug?: string }> {
    if (request.categorySlug || request.categoryId) {
      return {
        categoryId: request.categoryId,
        categorySlug: request.categorySlug,
      };
    }

    const categories = await this.getCategories(context);
    const match = categories.find((item) => item.id === request.categoryId);

    return {
      categoryId: match?.id,
      categorySlug: match?.slug,
    };
  }

  private toCanonicalProduct(item: GippoProduct, forcedPromo: boolean): CanonicalProduct {
    const market = Array.isArray(item.markets) ? item.markets[0] : item.markets;
    const proposal = market?.proposal ?? null;
    const price = proposal?.price ?? null;
    const oldPriceCandidate =
      proposal?.promo_price_before !== null && proposal?.promo_price_before !== undefined
        ? Number(proposal.promo_price_before)
        : null;
    const oldPrice =
      oldPriceCandidate !== null &&
      Number.isFinite(oldPriceCandidate) &&
      oldPriceCandidate > (price ?? 0)
        ? oldPriceCandidate
        : null;

    return {
      source: "gippo",
      id: item.id,
      name: compactText(item.title) ?? item.id,
      price,
      oldPrice,
      discountPercent: calculateDiscountPercent(price, oldPrice),
      composition: pickFirstString(
        item.description,
        typeof item.properties?.description?.value === "string"
          ? item.properties.description.value
          : null,
      ),
      imageUrl: pickFirstString(item.images[0]),
      url: new URL(`/search/${encodeURIComponent(item.title)}`, this.baseUrl).toString(),
      available: (proposal?.max_qty ?? 0) > 0,
      brand: pickFirstString(
        typeof item.properties?.brandText?.value === "string"
          ? item.properties.brandText.value
          : null,
      ),
      unit: pickFirstString(item.short_name_uom),
      categoryIds: item.breadcrumbs?.map((crumb) => crumb.slug) ?? [],
      raw: { ...item, forcedPromo },
    };
  }
}

export const gippoParser = new GippoParser();
