import type {
  FetchLike,
  RequestContext,
  RetryOptions,
} from "./types";

const DEFAULT_RETRY: Required<RetryOptions> = {
  attempts: 4,
  baseDelayMs: 400,
  maxDelayMs: 4_000,
  jitterMs: 200,
};

const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpStatusError extends Error {
  readonly status: number;
  readonly url: string;
  readonly responseText: string;

  constructor(status: number, url: string, responseText: string) {
    super(`HTTP ${status} for ${url}`);
    this.name = "HttpStatusError";
    this.status = status;
    this.url = url;
    this.responseText = responseText;
  }
}

export interface NamedLink {
  name: string;
  href: string;
}

export function mergeHeaders(
  base?: HeadersInit,
  extra?: HeadersInit,
): Headers {
  const headers = new Headers(base);

  for (const [key, value] of new Headers(extra).entries()) {
    headers.set(key, value);
  }

  if (!headers.has("accept")) {
    headers.set("accept", "application/json, text/plain, */*");
  }

  if (!headers.has("accept-language")) {
    headers.set("accept-language", "ru-BY,ru;q=0.9,en;q=0.8");
  }

  return headers;
}

export function getFetch(context?: RequestContext, fallback?: FetchLike): FetchLike {
  return context?.fetch ?? fallback ?? fetch;
}

export function getRetryOptions(context?: RequestContext, fallback?: RetryOptions) {
  return {
    ...DEFAULT_RETRY,
    ...(fallback ?? {}),
    ...(context?.retry ?? {}),
  };
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(response: Response, attempt: number, retry: Required<RetryOptions>) {
  const retryAfterHeader = response.headers.get("retry-after");

  if (retryAfterHeader) {
    const seconds = Number(retryAfterHeader);

    if (Number.isFinite(seconds)) {
      return Math.min(seconds * 1_000, retry.maxDelayMs);
    }

    const dateMillis = Date.parse(retryAfterHeader);

    if (Number.isFinite(dateMillis)) {
      return Math.min(Math.max(dateMillis - Date.now(), retry.baseDelayMs), retry.maxDelayMs);
    }
  }

  const jitter = Math.floor(Math.random() * retry.jitterMs);
  return Math.min(retry.baseDelayMs * 2 ** attempt + jitter, retry.maxDelayMs);
}

function isRetriableStatus(status: number): boolean {
  return RETRYABLE_STATUSES.has(status);
}

export async function fetchTextWithRetry(
  input: string | URL,
  init: RequestInit = {},
  context?: RequestContext,
): Promise<string> {
  const fetcher = getFetch(context);
  const retry = getRetryOptions(context);
  const url = input.toString();

  for (let attempt = 0; attempt < retry.attempts; attempt += 1) {
    const response = await fetcher(url, {
      ...init,
      headers: mergeHeaders(init.headers, context?.headers),
    });

    if (response.ok) {
      return response.text();
    }

    const responseText = await response.text();

    if (attempt + 1 >= retry.attempts || !isRetriableStatus(response.status)) {
      throw new HttpStatusError(response.status, url, responseText);
    }

    await sleep(getRetryAfterMs(response, attempt, retry));
  }

  throw new Error(`Exhausted retries for ${url}`);
}

export async function fetchJsonWithRetry<T>(
  input: string | URL,
  init: RequestInit = {},
  context?: RequestContext,
): Promise<T> {
  const text = await fetchTextWithRetry(input, init, context);
  return JSON.parse(text) as T;
}

export function parsePage(requestPage?: number, cursor?: string | null, fallback = 1): number {
  const raw = cursor ?? requestPage;
  const page = typeof raw === "string" ? Number(raw) : raw;

  if (!Number.isFinite(page) || !page || page < 1) {
    return fallback;
  }

  return Math.floor(page);
}

export function appendQuery(
  url: URL,
  params: Record<string, string | number | boolean | null | undefined>,
): URL {
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.set(key, String(value));
  }

  return url;
}

export function appendMany(
  url: URL,
  key: string,
  values: Array<string | number | null | undefined>,
): URL {
  for (const value of values) {
    if (value === undefined || value === null || value === "") {
      continue;
    }

    url.searchParams.append(key, String(value));
  }

  return url;
}

export function toAbsoluteUrl(baseUrl: string, pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) {
    return null;
  }

  return new URL(pathOrUrl, baseUrl).toString();
}

export function extractBuildId(html: string): string {
  const match = html.match(/"buildId":"([^"]+)"/);

  if (!match) {
    throw new Error("Could not extract Next.js buildId from page HTML");
  }

  return match[1];
}

export function dedupeBy<T>(items: T[], pickKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    const key = pickKey(item);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(item);
  }

  return result;
}

export function compactText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const compact = value
    .replace(/\\u0026/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  return compact.length > 0 ? compact : null;
}

export function calculateDiscountPercent(
  price: number | null,
  oldPrice: number | null,
  explicit?: number | null,
): number | null {
  if (explicit !== undefined && explicit !== null && Number.isFinite(explicit) && explicit > 0) {
    return Math.round(explicit);
  }

  if (
    price === null ||
    oldPrice === null ||
    !Number.isFinite(price) ||
    !Number.isFinite(oldPrice) ||
    oldPrice <= 0 ||
    price >= oldPrice
  ) {
    return null;
  }

  return Math.round(((oldPrice - price) / oldPrice) * 100);
}

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(",", ".").replace(/[^\d.-]+/g, "");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export function centsToUnitPrice(value: unknown): number | null {
  const amount = toNumber(value);

  if (amount === null) {
    return null;
  }

  return Math.round((amount / 100) * 100) / 100;
}

export function parseNamedLinks(raw: string, relativePrefix: string): NamedLink[] {
  const escapedPrefix = relativePrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `"name":"([^"]+)"[\\s\\S]{0,400}?"url":"(${escapedPrefix}[^"]+)"`,
    "g",
  );

  const matches: NamedLink[] = [];

  for (const match of raw.matchAll(pattern)) {
    const name = compactText(match[1]);
    const href = compactText(match[2])?.replace(/&amp;/g, "&");

    if (!name || !href) {
      continue;
    }

    matches.push({ name, href });
  }

  return dedupeBy(matches, (item) => item.href);
}

export function parseCategoryIdFromPath(path: string): string | null {
  const match = path.match(/\/category\/([^/?#]+)/);
  return match ? match[1] : null;
}

export function pickFirstString(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const compact = compactText(value);

    if (compact) {
      return compact;
    }
  }

  return null;
}
