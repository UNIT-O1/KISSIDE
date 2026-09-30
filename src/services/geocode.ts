// Nominatim geocoding (swappable provider). Whitepaper 5.5.
// Usage policy: at most ~1 request/s, no per-keystroke autocomplete, results cached.
import {
  GEOCODE_DEBOUNCE_MS,
  GEOCODE_MIN_QUERY_LENGTH,
  GEOCODE_RESULT_LIMIT,
  HTTP_CACHE_MAX_ENTRIES,
  NOMINATIM_MIN_INTERVAL_MS,
} from '../config';
import type { LatLon } from '../core/types';
import { BASE_URLS, HttpError, fetchJson } from './http';

export type GeocodeResult = LatLon & { displayName: string };

// Keyed by normalised query, so "Zaragoza " and "zaragoza" share an entry and a cache hit
// never uses up a Nominatim request slot.
const cache = new Map<string, Promise<GeocodeResult[]>>();
let nextSlotAt = 0;

export function clearGeocodeCache(): void {
  cache.clear();
  nextSlotAt = 0;
}

export function geocodeUrl(query: string): string {
  const params = new URLSearchParams({
    format: 'jsonv2',
    limit: String(GEOCODE_RESULT_LIMIT),
    q: query,
  });
  return `${BASE_URLS.nominatim}/search?${params}`;
}

/** Explicit search (e.g. on submit). An empty list means the place wasn't found. */
export function geocode(query: string): Promise<GeocodeResult[]> {
  const key = normalize(query);
  if (!key) return Promise.resolve([]);

  const hit = cache.get(key);
  if (hit) return hit;

  const request = (async () => {
    await waitForSlot();
    const raw = await fetchJson<unknown>(geocodeUrl(key), { cache: false });
    return parsePlaces(raw, geocodeUrl(key));
  })();
  cache.set(key, request);
  while (cache.size > HTTP_CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  request.catch(() => {
    if (cache.get(key) === request) cache.delete(key);
  });
  return request;
}

export type Suggester = {
  /** Call on every keystroke; requests only go out after a pause, for long enough queries. */
  input(text: string): void;
  /** Drops any pending request and ignores results still in flight. */
  cancel(): void;
};

/**
 * Debounced autocomplete. Only the latest input's results are delivered; queries shorter than
 * GEOCODE_MIN_QUERY_LENGTH report an empty list straight away without a request.
 */
export function createSuggester(
  onResults: (query: string, results: GeocodeResult[]) => void,
  onError: (err: unknown) => void = () => {},
): Suggester {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    generation++;
  };

  return {
    input(text) {
      cancel();
      const query = text.trim();
      if ([...query].length < GEOCODE_MIN_QUERY_LENGTH) {
        onResults(query, []);
        return;
      }
      const mine = generation;
      timer = setTimeout(() => {
        geocode(query).then(
          (results) => mine === generation && onResults(query, results),
          (err) => mine === generation && onError(err),
        );
      }, GEOCODE_DEBOUNCE_MS);
    },
    cancel,
  };
}

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Spaces request starts at least NOMINATIM_MIN_INTERVAL_MS apart, queueing if needed. */
async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextSlotAt);
  nextSlotAt = startAt + NOMINATIM_MIN_INTERVAL_MS;
  if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now));
}

function parsePlaces(raw: unknown, url: string): GeocodeResult[] {
  if (!Array.isArray(raw)) {
    throw new HttpError('invalid-json', `Unexpected geocoder response: ${url}`);
  }
  return raw.flatMap((place: { lat?: unknown; lon?: unknown; display_name?: unknown }) => {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    const displayName = place.display_name;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || typeof displayName !== 'string') {
      return [];
    }
    return [{ lat, lon, displayName }];
  });
}
