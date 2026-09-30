// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { GEOCODE_DEBOUNCE_MS, NOMINATIM_MIN_INTERVAL_MS } from '../src/config';
import { clearGeocodeCache, createSuggester, geocode } from '../src/services/geocode';
import { HttpError } from '../src/services/http';
import EMPTY from './fixtures/nominatim-empty.json';
import ZARAGOZA from './fixtures/nominatim-zaragoza.json';
import { calledUrls, deferred, mockFetch } from './mockFetch';

// Request spacing is module state keyed to the clock, so each test starts an hour later.
let clock = Date.UTC(2030, 0, 1);
beforeEach(() => {
  clearGeocodeCache();
  vi.useFakeTimers();
  vi.setSystemTime((clock += 3_600_000));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('geocode', () => {
  test('parses a real Nominatim response into lat/lon numbers', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const results = await geocode('Zaragoza');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toEqual({
      lat: expect.closeTo(41.69, 1),
      lon: expect.closeTo(-0.91, 1),
      displayName: expect.stringContaining('Zaragoza'),
    });

    const url = calledUrls(fetch)[0]!;
    expect(url.origin).toBe('https://nominatim.openstreetmap.org');
    expect(url.pathname).toBe('/search');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      format: 'jsonv2',
      limit: '5',
      q: 'zaragoza',
    });
  });

  test('an unknown place gives an empty list, not an error', async () => {
    mockFetch({ body: EMPTY });
    await expect(geocode('qqzxqqzxnowhere')).resolves.toEqual([]);
  });

  test('a blank query makes no request', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    await expect(geocode('   ')).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('results are cached per normalised query', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    await geocode('Zaragoza');
    await geocode('  zaragoza ');
    await geocode('ZARAGOZA');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('requests are spaced at least 1 s apart', async () => {
    const fetch = mockFetch({ body: EMPTY });
    const all = Promise.all([geocode('Aaaa'), geocode('Bbbb'), geocode('Cccc')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS - 1);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS);
    expect(fetch).toHaveBeenCalledTimes(3);
    await all;
    expect(calledUrls(fetch).map((u) => u.searchParams.get('q'))).toEqual(['aaaa', 'bbbb', 'cccc']);
  });

  test('a cache hit does not use up a request slot', async () => {
    const fetch = mockFetch({ body: EMPTY });
    await geocode('Aaaa');
    await geocode('Aaaa'); // cached
    const b = geocode('Bbbb');
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS);
    await b;
    expect(fetch).toHaveBeenCalledTimes(2); // B went at +1 s, not +2 s
  });

  test('a failed search is not cached', async () => {
    const fetch = mockFetch({ status: 403, text: 'blocked' }, { body: ZARAGOZA });
    await expect(geocode('Zaragoza')).rejects.toBeInstanceOf(HttpError);
    const retry = geocode('Zaragoza');
    await vi.advanceTimersByTimeAsync(NOMINATIM_MIN_INTERVAL_MS);
    await expect(retry).resolves.toHaveLength((ZARAGOZA as unknown[]).length);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test('malformed entries are dropped', async () => {
    mockFetch({
      body: [
        { lat: 'x', lon: '1', display_name: 'bad lat' },
        { lat: '1', lon: '2' },
        { lat: '10.5', lon: '-20.25', display_name: 'Good' },
      ],
    });
    await expect(geocode('Good')).resolves.toEqual([
      { lat: 10.5, lon: -20.25, displayName: 'Good' },
    ]);
  });

  test('a response that is not a list is an error', async () => {
    mockFetch({ body: { error: 'nope' } });
    await expect(geocode('Zaragoza')).rejects.toMatchObject({ kind: 'invalid-json' });
  });
});

describe('createSuggester (debounced autocomplete)', () => {
  test(`waits ${GEOCODE_DEBOUNCE_MS} ms after the last keystroke`, async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const onResults = vi.fn();
    const s = createSuggester(onResults);
    s.input('Zara');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS - 1);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith('Zara', expect.any(Array));
  });

  test('typing restarts the wait, and only the final text is searched', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const onResults = vi.fn();
    const s = createSuggester(onResults);
    s.input('Zara');
    await vi.advanceTimersByTimeAsync(500);
    s.input('Zarag');
    await vi.advanceTimersByTimeAsync(500);
    s.input('Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calledUrls(fetch)[0]!.searchParams.get('q')).toBe('zaragoza');
    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith('Zaragoza', expect.any(Array));
  });

  test('fewer than 4 characters never searches, and clears suggestions', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const onResults = vi.fn();
    const s = createSuggester(onResults);
    s.input('Zar');
    s.input('  ab  ');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS * 5);
    expect(fetch).not.toHaveBeenCalled();
    expect(onResults).toHaveBeenLastCalledWith('ab', []);
  });

  test('shortening the text below 4 characters cancels a pending search', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const s = createSuggester(vi.fn());
    s.input('Zara');
    await vi.advanceTimersByTimeAsync(400);
    s.input('Zar');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS * 5);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('results for older text are ignored once newer text arrives', async () => {
    const slow = deferred(ZARAGOZA);
    mockFetch(slow.reply, { body: EMPTY });
    const onResults = vi.fn();
    const s = createSuggester(onResults);

    s.input('Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS); // first request in flight
    s.input('Qqzxqqzx');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS + NOMINATIM_MIN_INTERVAL_MS);
    slow.resolve();
    await vi.advanceTimersByTimeAsync(0);

    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onResults).toHaveBeenCalledWith('Qqzxqqzx', []);
  });

  test('cancel() drops a pending search', async () => {
    const fetch = mockFetch({ body: ZARAGOZA });
    const s = createSuggester(vi.fn());
    s.input('Zaragoza');
    s.cancel();
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS * 2);
    expect(fetch).not.toHaveBeenCalled();
  });

  test('errors go to onError', async () => {
    mockFetch({ status: 403, text: '' });
    const onResults = vi.fn();
    const onError = vi.fn();
    createSuggester(onResults, onError).input('Zaragoza');
    await vi.advanceTimersByTimeAsync(GEOCODE_DEBOUNCE_MS);
    expect(onError).toHaveBeenCalledWith(expect.any(HttpError));
    expect(onResults).not.toHaveBeenCalled();
  });
});
