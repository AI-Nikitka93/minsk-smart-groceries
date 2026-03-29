import {
  calculateDiscountPercent,
  dedupeBy,
  extractBuildId,
  fetchJsonWithRetry,
  fetchTextWithRetry,
  parseCategoryIdFromPath,
  parseNamedLinks,
  parsePage,
  pickFirstString,
  toAbsoluteUrl,
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

interface EdostavkaProduct {
  productId: number;
  productName: string;
  images: string[];
  pngImages: string[];
  price: {
    basePrice: number;
    discountedPrice: number;
    discountPercent: number | null;
  };
  restInformation?: {
    isAvailable?: boolean;
  } | null;
  description?: {
    composition?: string;
  } | null;
  legalInfo?: {
    trademarkName?: string;
    title?: string;
    manufacturerName?: string;
  } | null;
  quantityInfo?: {
    measure?: string;
  } | null;
}

interface EdostavkaListing {
  pageAmount: number;
  pageNumber: number;
  productsAmount: number;
  products: EdostavkaProduct[];
}

interface EdostavkaCategoryPage {
  pageProps: {
    listing: EdostavkaListing;
  };
}

interface EdostavkaActionsPage {
  pageProps: {
    actions: Array<{
      tagAlias: string;
      active: boolean;
    }>;
  };
}

interface EdostavkaActionPage {
  pageProps: {
    listing: EdostavkaListing;
  };
}

export interface EdostavkaParserOptions {
  baseUrl?: string;
  defaultPromoSections?: number;
  retry?: RetryOptions;
}

export class EdostavkaParser implements StoreParser {
  private readonly baseUrl: string;
  private readonly defaultPromoSections: number;
  private readonly retry?: RetryOptions;
  private buildIdPromise: Promise<string> | null = null;

  constructor(options: EdostavkaParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://edostavka.by";
    this.defaultPromoSections = options.defaultPromoSections ?? 3;
    this.retry = options.retry;
  }

  async getCategories(context?: RequestContext): Promise<CanonicalCategory[]> {
    const raw = await this.fetchNextDataRaw("index", {}, context);
    const links = parseNamedLinks(raw, "/category/");
    const categories: CanonicalCategory[] = [];

    for (const link of links) {
      const id = parseCategoryIdFromPath(link.href);

      if (!id) {
        continue;
      }

      categories.push({
        source: "edostavka",
        id,
        name: link.name,
        slug: id,
        url:
          toAbsoluteUrl(this.baseUrl, link.href) ??
          new URL(`/category/${id}`, this.baseUrl).toString(),
        parentId: null,
        featured: true,
        raw: link,
      });
    }

    return categories;
  }

  async getProductsByCategory(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    if (!request.categoryId) {
      throw new Error("Edostavka parser requires categoryId");
    }

    const page = parsePage(request.page, request.cursor, 1);
    const payload = await this.fetchNextDataJson<EdostavkaCategoryPage>(
      `category/${request.categoryId}`,
      { page },
      context,
    );
    const listing = payload.pageProps.listing;

    return {
      items: listing.products.map((item) => this.toCanonicalProduct(item, false)),
      page: listing.pageNumber,
      pageSize: listing.products.length,
      totalItems: listing.productsAmount,
      totalPages: listing.pageAmount,
      nextCursor: listing.pageNumber < listing.pageAmount ? String(listing.pageNumber + 1) : null,
      raw: payload,
    };
  }

  async getPromoProducts(
    request: PromoProductsRequest = {},
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const actions = await this.fetchNextDataJson<EdostavkaActionsPage>("actions", {}, context);
    const aliases =
      request.promoSlugs?.length
        ? request.promoSlugs
        : actions.pageProps.actions
            .filter((item) => item.active)
            .slice(0, request.maxSections ?? this.defaultPromoSections)
            .map((item) => item.tagAlias);

    const pages = await Promise.all(
      aliases.map((alias) =>
        this.fetchNextDataJson<EdostavkaActionPage>(`actions/${alias}`, { page }, context),
      ),
    );

    const items = dedupeBy(
      pages.flatMap((payload) =>
        payload.pageProps.listing.products.map((product) => this.toCanonicalProduct(product, true)),
      ),
      (item) => item.id,
    );
    const totalPages = Math.max(...pages.map((payload) => payload.pageProps.listing.pageAmount), 0);
    const totalItems = pages.reduce(
      (sum, payload) => sum + payload.pageProps.listing.productsAmount,
      0,
    );

    return {
      items,
      page,
      pageSize: items.length,
      totalItems,
      totalPages,
      nextCursor: page < totalPages ? String(page + 1) : null,
      raw: pages,
    };
  }

  private async fetchNextDataJson<T>(
    route: string,
    query: Record<string, string | number | undefined>,
    context?: RequestContext,
  ): Promise<T> {
    const buildId = await this.getBuildId(context);
    const url = new URL(`/_next/data/${buildId}/${route.replace(/^\//, "")}.json`, this.baseUrl);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    try {
      return await fetchJsonWithRetry<T>(url, {}, { ...context, retry: context?.retry ?? this.retry });
    } catch (error) {
      if (this.isBuildIdError(error)) {
        this.buildIdPromise = null;
        const refreshed = await this.getBuildId(context);
        const retryUrl = new URL(
          `/_next/data/${refreshed}/${route.replace(/^\//, "")}.json`,
          this.baseUrl,
        );

        for (const [key, value] of Object.entries(query)) {
          if (value !== undefined && value !== null && value !== "") {
            retryUrl.searchParams.set(key, String(value));
          }
        }

        return fetchJsonWithRetry<T>(retryUrl, {}, { ...context, retry: context?.retry ?? this.retry });
      }

      throw error;
    }
  }

  private async fetchNextDataRaw(
    route: string,
    query: Record<string, string | number | undefined>,
    context?: RequestContext,
  ): Promise<string> {
    const buildId = await this.getBuildId(context);
    const url = new URL(`/_next/data/${buildId}/${route.replace(/^\//, "")}.json`, this.baseUrl);

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    return fetchTextWithRetry(url, {}, { ...context, retry: context?.retry ?? this.retry });
  }

  private async getBuildId(context?: RequestContext): Promise<string> {
    if (!this.buildIdPromise) {
      this.buildIdPromise = this.loadBuildId(context);
    }

    return this.buildIdPromise;
  }

  private async loadBuildId(context?: RequestContext): Promise<string> {
    const html = await fetchTextWithRetry(this.baseUrl, {}, { ...context, retry: context?.retry ?? this.retry });
    return extractBuildId(html);
  }

  private isBuildIdError(error: unknown): boolean {
    return error instanceof Error && /HTTP 404/.test(error.message);
  }

  private toCanonicalProduct(item: EdostavkaProduct, forcedPromo: boolean): CanonicalProduct {
    const price = item.price.discountedPrice ?? item.price.basePrice ?? null;
    const oldPrice = item.price.basePrice > (price ?? 0) ? item.price.basePrice : null;

    return {
      source: "edostavka",
      id: String(item.productId),
      name: pickFirstString(item.productName) ?? String(item.productId),
      price,
      oldPrice,
      discountPercent: calculateDiscountPercent(price, oldPrice, item.price.discountPercent),
      composition: pickFirstString(item.description?.composition),
      imageUrl: pickFirstString(item.images[0], item.pngImages[0]),
      url: new URL(`/product/${item.productId}`, this.baseUrl).toString(),
      available: Boolean(item.restInformation?.isAvailable),
      brand: pickFirstString(
        item.legalInfo?.trademarkName,
        item.legalInfo?.title,
        item.legalInfo?.manufacturerName,
      ),
      unit: pickFirstString(item.quantityInfo?.measure),
      categoryIds: [],
      raw: { ...item, forcedPromo },
    };
  }
}

export const edostavkaParser = new EdostavkaParser();
