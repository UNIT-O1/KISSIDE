// @vitest-environment node
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { HTTP_RETRY_BACKOFF_MS } from '../src/config';
import { HttpError, clearHttpCache } from '../src/services/http';
import { RouteError, getRoute, routeUrl } from '../src/services/route';
import CITY from './fixtures/osrm-city-london.json';
import NO_ROUTE from './fixtures/osrm-no-route.json'; // real HTTP 400 body, Honolulu -> Los Angeles
import { calledUrls, mockFetch } from './mockFetch';

const KINGS_CROSS = { lat: 51.5308, lon: -0.1238 };
const WESTMINSTER = { lat: 51.4995, lon: -0.1248 };

beforeEach(() => {
  clearHttpCache();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('routeUrl', () => {
  test('puts coordinates in OSRM lon,lat order and asks for step geometry', () => {
    const url = new URL(routeUrl(KINGS_CROSS, WESTMINSTER));
    expect(url.origin).toBe('https://router.project-osrm.org');
    expect(url.pathname).toBe('/route/v1/driving/-0.1238,51.5308;-0.1248,51.4995');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      overview: 'false',
      steps: 'true',
      geometries: 'geojson',
    });
  });
});

describe('getRoute', () => {
  test('maps a real OSRM response to steps with lat/lon (not lon/lat)', async () => {
    mockFetch({ body: CITY });
    const steps = await getRoute(KINGS_CROSS, WESTMINSTER);
    expect(steps).toHaveLength(CITY.routes[0]!.legs[0]!.steps.length);

    // London is at lat ~51.5, lon ~-0.1. A swap would put it in the Southern Ocean.
    for (const s of steps) {
      for (const p of s.geometry) {
        expect(p.lat).toBeGreaterThan(51.4);
        expect(p.lat).toBeLessThan(51.6);
        expect(Math.abs(p.lon)).toBeLessThan(0.3);
      }
    }
    expect(steps[0]!.geometry[0]!.lat).toBeCloseTo(KINGS_CROSS.lat, 2);
    expect(steps.at(-1)!.geometry.at(-1)!.lat).toBeCloseTo(WESTMINSTER.lat, 2);
  });

  test('step durations and distances add up to the route totals', async () => {
    mockFetch({ body: CITY });
    const steps = await getRoute(KINGS_CROSS, WESTMINSTER);
    const route = CITY.routes[0]!;
    expect(steps.reduce((a, s) => a + s.duration, 0)).toBeCloseTo(route.duration, 0);
    expect(steps.reduce((a, s) => a + s.distance, 0)).toBeCloseTo(route.distance, 0);
  });

  test('the same trip twice is fetched once', async () => {
    const fetch = mockFetch({ body: CITY });
    await getRoute(KINGS_CROSS, WESTMINSTER);
    await getRoute(KINGS_CROSS, WESTMINSTER);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(calledUrls(fetch)).toHaveLength(1);
  });

  test('"NoRoute" (HTTP 400) becomes RouteError no-route, without a retry', async () => {
    const fetch = mockFetch({ status: 400, body: NO_ROUTE });
    await expect(
      getRoute({ lat: 21.3, lon: -157.86 }, { lat: 34.05, lon: -118.24 }),
    ).rejects.toEqual(expect.objectContaining({ name: 'RouteError', kind: 'no-route' }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('"NoSegment" (no road near a point) is also no-route', async () => {
    mockFetch({
      status: 400,
      body: { code: 'NoSegment', message: 'Could not find a matching segment' },
    });
    await expect(getRoute(KINGS_CROSS, WESTMINSTER)).rejects.toMatchObject({ kind: 'no-route' });
  });

  test('other OSRM errors pass through as HttpError', async () => {
    mockFetch({
      status: 400,
      body: { code: 'InvalidValue', message: 'Invalid coordinate value.' },
    });
    const err = await getRoute(KINGS_CROSS, WESTMINSTER).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err).not.toBeInstanceOf(RouteError);
  });

  test('an unexpected response shape is RouteError bad-response', async () => {
    mockFetch({ body: { code: 'Ok', routes: [] } });
    await expect(getRoute(KINGS_CROSS, WESTMINSTER)).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  test('a step with bad coordinates is RouteError bad-response', async () => {
    mockFetch({
      body: {
        code: 'Ok',
        routes: [
          {
            legs: [
              { steps: [{ distance: 10, duration: 1, geometry: { coordinates: [[0, 'x']] } }] },
            ],
          },
        ],
      },
    });
    await expect(getRoute(KINGS_CROSS, WESTMINSTER)).rejects.toMatchObject({
      kind: 'bad-response',
    });
  });

  test('a server error is retried once', async () => {
    const fetch = mockFetch({ status: 503, text: 'overloaded' }, { body: CITY });
    const result = getRoute(KINGS_CROSS, WESTMINSTER);
    await vi.advanceTimersByTimeAsync(HTTP_RETRY_BACKOFF_MS);
    await expect(result).resolves.toHaveLength(CITY.routes[0]!.legs[0]!.steps.length);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
