// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HTTP_CACHE_MAX_ENTRIES, HTTP_RETRY_BACKOFF_MS, HTTP_TIMEOUT_MS } from '../src/config';
import { HttpError, clearHttpCache, fetchJson } from '../src/services/http';
import { mockFetch } from './mockFetch';

const URL_A = 'https://example.test/a';
const URL_B = 'https://example.test/b';

beforeEach(() => {
  clearHttpCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchJson', () => {
  test('returns parsed JSON and asks for JSON', async () => {
    const fetch = mockFetch({ body: { ok: 1 } });
    await expect(fetchJson(URL_A)).resolves.toEqual({ ok: 1 });
    const init = fetch.mock.calls[0]![1]!;
    expect((init.headers as Record<string, string>).Accept).toBe('application/json');
  });

  test('caches successful responses by URL', async () => {
    const fetch = mockFetch({ body: { n: 1 } });
    await fetchJson(URL_A);
    await expect(fetchJson(URL_A)).resolves.toEqual({ n: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    await fetchJson(URL_B);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('concurrent calls for one URL share a single request', async () => {
    const fetch = mockFetch({ body: 1 });
    await Promise.all([fetchJson(URL_A), fetchJson(URL_A), fetchJson(URL_A)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('cache: false always fetches', async () => {
    const fetch = mockFetch({ body: 1 });
    await fetchJson(URL_A, { cache: false });
    await fetchJson(URL_A, { cache: false });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('failures are not cached', async () => {
    const fetch = mockFetch({ status: 404, body: {} }, { body: { ok: true } });
    await expect(fetchJson(URL_A)).rejects.toBeInstanceOf(HttpError);
    await expect(fetchJson(URL_A)).resolves.toEqual({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('the oldest entry is evicted when the cache is full', async () => {
    const fetch = mockFetch({ body: 1 });
    for (let i = 0; i <= HTTP_CACHE_MAX_ENTRIES; i++) await fetchJson(`${URL_A}?${i}`);
    expect(fetch).toHaveBeenCalledTimes(HTTP_CACHE_MAX_ENTRIES + 1);
    await fetchJson(`${URL_A}?${HTTP_CACHE_MAX_ENTRIES}`); // newest: still cached
    expect(fetch).toHaveBeenCalledTimes(HTTP_CACHE_MAX_ENTRIES + 1);
    await fetchJson(`${URL_A}?0`); // oldest: evicted
    expect(fetch).toHaveBeenCalledTimes(HTTP_CACHE_MAX_ENTRIES + 2);
  });
});

describe('retry with backoff', () => {
  test('retries once after the backoff on a 5xx, then succeeds', async () => {
    const fetch = mockFetch({ status: 503, text: 'busy' }, { body: { ok: true } });
    const result = fetchJson(URL_A);
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await expect(result).resolves.toEqual({ ok: true });
  });

  test('gives up after one retry', async () => {
    const fetch = mockFetch({ status: 502, text: '' });
    const result = expect(fetchJson(URL_A)).rejects.toMatchObject({ kind: 'status', status: 502 });
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS * 10);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('retries a 429 (rate limited)', async () => {
    const fetch = mockFetch({ status: 429, text: '' }, { body: 1 });
    const result = fetchJson(URL_A);
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS);
    await expect(result).resolves.toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('does not retry other 4xx, and keeps the JSON error body', async () => {
    const fetch = mockFetch({ status: 400, body: { code: 'InvalidValue' } });
    await expect(fetchJson(URL_A)).rejects.toMatchObject({
      kind: 'status',
      status: 400,
      body: { code: 'InvalidValue' },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('retries a network failure', async () => {
    const fetch = mockFetch(new TypeError('Failed to fetch'), { body: 1 });
    const result = fetchJson(URL_A);
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS);
    await expect(result).resolves.toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('a network failure on both attempts is reported as kind "network"', async () => {
    mockFetch(new TypeError('Failed to fetch'));
    const result = expect(fetchJson(URL_A)).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS);
    await result;
  });

  test('does not retry a response that is not JSON', async () => {
    const fetch = mockFetch({ text: '<html>' });
    await expect(fetchJson(URL_A)).rejects.toMatchObject({ kind: 'invalid-json' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('timeout', () => {
  test('aborts after the timeout, retries once, then reports kind "timeout"', async () => {
    const fetch = mockFetch('hang');
    const result = expect(fetchJson(URL_A)).rejects.toMatchObject({ kind: 'timeout' });

    await vi.advanceTimersByTimeAsync(HTTP_TIMEOUT_MS - 1);
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch.mock.calls[0]![1]!.signal!.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS + HTTP_TIMEOUT_MS);
    await result;
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('a timeout followed by a good answer succeeds', async () => {
    mockFetch('hang', { body: 'late but fine' });
    const result = fetchJson(URL_A, { timeoutMs: 100 });
    await vi.advanceTimersByTimeAsync(100 + HTTP_RETRY_BACKOFF_MS);
    await expect(result).resolves.toBe('late but fine');
  });
});
