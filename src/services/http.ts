// The only module allowed to call fetch. Timeout, retry, cache, base URLs. Whitepaper 5.1, 5.5.
import {
  HTTP_CACHE_MAX_ENTRIES,
  HTTP_MAX_RETRIES,
  HTTP_RETRY_BACKOFF_MS,
  HTTP_TIMEOUT_MS,
} from '../config';

/** Provider base URLs. To put a caching proxy in front, change these and nothing else. */
export const BASE_URLS = {
  nominatim: 'https://nominatim.openstreetmap.org',
  osrm: 'https://router.project-osrm.org',
} as const;

export type HttpErrorKind = 'timeout' | 'network' | 'status' | 'invalid-json';

export class HttpError extends Error {
  constructor(
    readonly kind: HttpErrorKind,
    message: string,
    /** HTTP status, for kind 'status'. */
    readonly status?: number,
    /** Parsed JSON error body, if the server sent one (OSRM puts its error code here). */
    readonly body?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'HttpError';
  }
}

export type FetchJsonOptions = {
  timeoutMs?: number;
  maxRetries?: number;
  backoffMs?: number;
  headers?: Record<string, string>;
  /** Default true. Successful responses are cached by URL; failures are not. */
  cache?: boolean;
};

// Keyed by URL only: callers don't vary headers for the same URL.
// Holds promises, so concurrent calls for one URL share a single request.
const cache = new Map<string, Promise<unknown>>();

export function clearHttpCache(): void {
  cache.clear();
}

export function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const useCache = options.cache ?? true;
  if (useCache) {
    const hit = cache.get(url);
    if (hit) {
      cache.delete(url); // re-insert to mark as recently used
      cache.set(url, hit);
      return hit as Promise<T>;
    }
  }

  const request = withRetry(url, options);
  if (useCache) {
    cache.set(url, request);
    while (cache.size > HTTP_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
    request.catch(() => {
      if (cache.get(url) === request) cache.delete(url);
    });
  }
  return request as Promise<T>;
}

async function withRetry(url: string, options: FetchJsonOptions): Promise<unknown> {
  const {
    timeoutMs = HTTP_TIMEOUT_MS,
    maxRetries = HTTP_MAX_RETRIES,
    backoffMs = HTTP_RETRY_BACKOFF_MS,
    headers,
  } = options;

  for (let attempt = 0; ; attempt++) {
    try {
      return await attemptOnce(url, timeoutMs, headers);
    } catch (err) {
      if (attempt >= maxRetries || !isRetryable(err)) throw err;
      await sleep(backoffMs * 2 ** attempt);
    }
  }
}

async function attemptOnce(
  url: string,
  timeoutMs: number,
  headers: Record<string, string> = {},
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  let text: string;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json', ...headers },
      signal: controller.signal,
    });
    text = await res.text();
  } catch (err) {
    if (controller.signal.aborted) {
      throw new HttpError('timeout', `Timed out after ${timeoutMs} ms: ${url}`);
    }
    throw new HttpError('network', `Network error: ${url}`, undefined, undefined, { cause: err });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new HttpError('status', `HTTP ${res.status}: ${url}`, res.status, parseOrUndefined(text));
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new HttpError('invalid-json', `Response was not JSON: ${url}`, res.status, undefined, {
      cause: err,
    });
  }
}

/** Timeouts, network failures, rate limiting and server errors are worth one more try. */
function isRetryable(err: unknown): boolean {
  if (!(err instanceof HttpError)) return false;
  if (err.kind === 'timeout' || err.kind === 'network') return true;
  return err.kind === 'status' && (err.status === 429 || (err.status ?? 0) >= 500);
}

function parseOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
