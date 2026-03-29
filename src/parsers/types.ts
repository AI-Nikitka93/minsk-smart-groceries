export type StoreName = "green" | "edostavka" | "gippo" | "emall";

export type FetchLike = typeof fetch;

export interface RetryOptions {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
}

export interface RequestContext {
  fetch?: FetchLike;
  retry?: RetryOptions;
  headers?: HeadersInit;
}

export interface CanonicalCategory {
  source: StoreName;
  id: string;
  name: string;
  slug: string;
  url: string;
  parentId: string | null;
  featured: boolean;
  raw: unknown;
}

export interface CanonicalProduct {
  source: StoreName;
  id: string;
  name: string;
  price: number | null;
  oldPrice: number | null;
  discountPercent: number | null;
  composition: string | null;
  imageUrl: string | null;
  url: string;
  available: boolean;
  brand: string | null;
  unit: string | null;
  categoryIds: string[];
  raw: unknown;
}

export interface CategoryProductsRequest {
  categoryId?: string;
  categorySlug?: string;
  page?: number;
  pageSize?: number;
  cursor?: string | null;
  marketId?: string | number;
}

export interface PromoProductsRequest {
  page?: number;
  pageSize?: number;
  cursor?: string | null;
  marketId?: string | number;
  promoSlugs?: string[];
  maxSections?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number | null;
  totalPages: number | null;
  nextCursor: string | null;
  raw: unknown;
}

export interface StoreParser {
  getCategories(context?: RequestContext): Promise<CanonicalCategory[]>;
  getProductsByCategory(
    request: CategoryProductsRequest,
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>>;
  getPromoProducts(
    request?: PromoProductsRequest,
    context?: RequestContext,
  ): Promise<PaginatedResult<CanonicalProduct>>;
}
