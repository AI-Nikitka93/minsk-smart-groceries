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

interface EmallImage {
  original_url_png?: string;
  original_url_webp?: string;
}

interface EmallOffer {
  id: number;
  name: string;
  images: EmallImage[];
  max_available_count?: number;
  stock?: number;
  measure?: {
    measure?: string;
  } | null;
  price: {
    discount: number;
    old_price: number;
    price: number;
  };
  preview_properties?: Array<{
    name?: string;
    title?: string;
    value?: string;
  }>;
  seller?: {
    name?: string;
  } | null;
}

interface EmallCategoryPage {
  pageProps: {
    listing: {
      offers: EmallOffer[];
      pagination: {
        current_page: number;
        total_pages: number;
        count: number;
      };
    };
  };
}

interface EmallActionsPage {
  pageProps: {
    promotions: Array<{
      url: string;
    }>;
  };
}

interface EmallActionDetailPage {
  pageProps: {
    pagination?: {
      current_page: number;
      total_pages: number;
      count: number;
    };
    listing: {
      offers?: EmallOffer[];
      search_resource?: {
        offers: EmallOffer[];
      };
    };
  };
}

export interface EmallParserOptions {
  baseUrl?: string;
  defaultPromoSections?: number;
  retry?: RetryOptions;
}

export class EmallParser implements StoreParser {
  private readonly baseUrl: string;
  private readonly defaultPromoSections: number;
  private readonly retry?: RetryOptions;
  private buildIdPromise: Promise<string> | null = null;

  constructor(options: EmallParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://emall.by";
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
        source: "emall",
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
      throw new Error("Emall parser requires categoryId");
    }

    const page = parsePage(request.page, request.cursor, 1);
    const payload = await this.fetchNextDataJson<EmallCategoryPage>(
      `category/${request.categoryId}`,
      { page },
      context,
    );
    const listing = payload.pageProps.listing;

    return {
      items: listing.offers.map((offer) => this.toCanonicalProduct(offer, false)),
      page: listing.pagination.current_page,
      pageSize: listing.offers.length,
      totalItems: listing.pagination.count,
      totalPages: listing.pagination.total_pages,
      nextCursor:
        listing.pagination.current_page < listing.pagination.total_pages
          ? String(listing.pagination.current_page + 1)
          : null,
      raw: payload,
    };
  }

  async getPromoProducts(
    request: PromoProductsRequest = {},
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const actions = await this.fetchNextDataJson<EmallActionsPage>("actions", {}, context);
    const slugs =
      request.promoSlugs?.length
        ? request.promoSlugs
        : actions.pageProps.promotions
            .slice(0, request.maxSections ?? this.defaultPromoSections)
            .map((item) => item.url);

    const pages = await Promise.all(
      slugs.map((slug) =>
        this.fetchNextDataJson<EmallActionDetailPage>(`actions/${slug}`, { page }, context),
      ),
    );

    const items = dedupeBy(
      pages.flatMap((payload) =>
        this.getActionOffers(payload).map((offer) => this.toCanonicalProduct(offer, true)),
      ),
      (item) => item.id,
    );
    const totalPages = Math.max(
      ...pages.map((payload) => payload.pageProps.pagination?.total_pages ?? 0),
      0,
    );
    const totalItems = pages.reduce(
      (sum, payload) => sum + (payload.pageProps.pagination?.count ?? 0),
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

  private getActionOffers(payload: EmallActionDetailPage): EmallOffer[] {
    return (
      payload.pageProps.listing.search_resource?.offers ??
      payload.pageProps.listing.offers ??
      []
    );
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

  private toCanonicalProduct(offer: EmallOffer, forcedPromo: boolean): CanonicalProduct {
    const price = offer.price.price ?? null;
    const oldPrice = offer.price.old_price > (price ?? 0) ? offer.price.old_price : null;

    return {
      source: "emall",
      id: String(offer.id),
      name: pickFirstString(offer.name) ?? String(offer.id),
      price,
      oldPrice,
      discountPercent: calculateDiscountPercent(price, oldPrice, offer.price.discount),
      composition: this.extractComposition(offer),
      imageUrl: pickFirstString(
        offer.images[0]?.original_url_webp,
        offer.images[0]?.original_url_png,
      ),
      url: new URL(`/product/${offer.id}`, this.baseUrl).toString(),
      available: Math.max(offer.stock ?? 0, offer.max_available_count ?? 0) > 0,
      brand: pickFirstString(offer.seller?.name),
      unit: pickFirstString(offer.measure?.measure),
      categoryIds: [],
      raw: { ...offer, forcedPromo },
    };
  }

  private extractComposition(offer: EmallOffer): string | null {
    const property = offer.preview_properties?.find((item) => {
      const name = `${item.name ?? ""} ${item.title ?? ""}`.toLowerCase();
      return name.includes("состав") || name.includes("composition");
    });

    return pickFirstString(property?.value);
  }
}

export const emallParser = new EmallParser();
