import {
  appendQuery,
  calculateDiscountPercent,
  centsToUnitPrice,
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

interface GreenCategoryNode {
  id: number;
  parentId: number | null;
  title: string;
  slug: string;
  children: GreenCategoryNode[];
}

interface GreenProductStoreData {
  price: number | null;
  sale: number | null;
  priceWithSale: number | null;
  previousPrice: number | null;
  isActive: boolean;
}

interface GreenProduct {
  id: number;
  title: string;
  slug: string;
  categoriesIds: number[];
  quantityLabel: string | null;
  volume: string | null;
  previewFile: {
    id: number;
    filename: string;
    version: number | null;
  } | null;
  storeProduct: GreenProductStoreData | null;
  filters: Array<{
    key: string;
  }>;
  brand?: {
    title: string;
  } | null;
  limitInOrder?: number | null;
}

interface GreenProductsResponse {
  skip: number;
  limit: number;
  items: GreenProduct[];
}

export interface GreenParserOptions {
  baseUrl?: string;
  apiBaseUrl?: string;
  staticDomain?: string;
  storeId?: number;
  defaultPageSize?: number;
  retry?: RetryOptions;
}

export class GreenParser implements StoreParser {
  private readonly baseUrl: string;
  private readonly apiBaseUrl: string;
  private readonly staticDomain: string;
  private readonly storeId: number;
  private readonly defaultPageSize: number;
  private readonly retry?: RetryOptions;

  constructor(options: GreenParserOptions = {}) {
    this.baseUrl = options.baseUrl ?? "https://green-dostavka.by";
    this.apiBaseUrl = options.apiBaseUrl ?? `${this.baseUrl}/api/v1`;
    this.staticDomain = options.staticDomain ?? "https://io.activecloud.com/static-green-market";
    this.storeId = options.storeId ?? 2;
    this.defaultPageSize = options.defaultPageSize ?? 48;
    this.retry = options.retry;
  }

  async getCategories(context?: RequestContext): Promise<CanonicalCategory[]> {
    const categories = await fetchJsonWithRetry<GreenCategoryNode[]>(
      `${this.apiBaseUrl}/categories/`,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    const flattened: CanonicalCategory[] = [];

    const walk = (nodes: GreenCategoryNode[], parentId: string | null) => {
      for (const node of nodes) {
        flattened.push({
          source: "green",
          id: String(node.id),
          name: node.title,
          slug: node.slug,
          url: new URL(`/catalog/${node.slug}/`, this.baseUrl).toString(),
          parentId,
          featured: parentId === null,
          raw: node,
        });

        walk(node.children ?? [], String(node.id));
      }
    };

    walk(categories, null);
    return flattened;
  }

  async getProductsByCategory(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const pageSize = request.pageSize ?? this.defaultPageSize;
    const categoryId = await this.resolveCategoryId(request, context);

    if (!categoryId) {
      throw new Error("Green parser requires categoryId or categorySlug");
    }

    const url = appendQuery(new URL(`${this.apiBaseUrl}/products`), {
      storeId: this.storeId,
      categoryId,
      limit: pageSize,
      skip: (page - 1) * pageSize,
    });

    const response = await fetchJsonWithRetry<GreenProductsResponse>(
      url,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return {
      items: response.items.map((item) => this.toCanonicalProduct(item, false)),
      page,
      pageSize: response.limit,
      totalItems: null,
      totalPages: null,
      nextCursor: response.items.length >= pageSize ? String(page + 1) : null,
      raw: response,
    };
  }

  async getPromoProducts(
    request: PromoProductsRequest = {},
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>> {
    const page = parsePage(request.page, request.cursor, 1);
    const pageSize = request.pageSize ?? this.defaultPageSize;
    const url = appendQuery(new URL(`${this.apiBaseUrl}/products/special-offers`), {
      storeId: this.storeId,
      limit: pageSize,
      skip: (page - 1) * pageSize,
    });

    const response = await fetchJsonWithRetry<GreenProductsResponse>(
      url,
      {},
      { ...context, retry: context?.retry ?? this.retry },
    );

    return {
      items: response.items.map((item) => this.toCanonicalProduct(item, true)),
      page,
      pageSize: response.limit,
      totalItems: null,
      totalPages: null,
      nextCursor: response.items.length >= pageSize ? String(page + 1) : null,
      raw: response,
    };
  }

  private async resolveCategoryId(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<string | null> {
    if (request.categoryId) {
      return request.categoryId;
    }

    if (!request.categorySlug) {
      return null;
    }

    const categories = await this.getCategories(context);
    return categories.find((item) => item.slug === request.categorySlug)?.id ?? null;
  }

  private toCanonicalProduct(item: GreenProduct, forcedPromo: boolean): CanonicalProduct {
    const activePrice = centsToUnitPrice(
      item.storeProduct?.priceWithSale ?? item.storeProduct?.price ?? null,
    );
    const oldPrice = centsToUnitPrice(item.storeProduct?.previousPrice ?? null);
    const normalizedOldPrice =
      oldPrice && activePrice !== null && oldPrice > activePrice ? oldPrice : null;

    const imageUrl = item.previewFile
      ? `${this.staticDomain}/1400x1400-${item.previewFile.filename}?id=${item.previewFile.id}${
          item.previewFile.version ? `&version=${item.previewFile.version}` : ""
        }`
      : null;

    return {
      source: "green",
      id: String(item.id),
      name: compactText(item.title) ?? String(item.id),
      price: activePrice,
      oldPrice: normalizedOldPrice,
      discountPercent: calculateDiscountPercent(
        activePrice,
        normalizedOldPrice,
        item.storeProduct?.sale ?? null,
      ),
      composition: null,
      imageUrl,
      url: new URL(`/product/${item.slug}/`, this.baseUrl).toString(),
      available: Boolean(item.storeProduct?.isActive && (item.limitInOrder ?? 0) > 0),
      brand: pickFirstString(item.brand?.title),
      unit: pickFirstString(item.quantityLabel, item.volume),
      categoryIds: item.categoriesIds.map(String),
      raw: { ...item, forcedPromo },
    };
  }
}

export const greenParser = new GreenParser();
