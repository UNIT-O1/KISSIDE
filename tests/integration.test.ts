// @vitest-environment node
// Whitepaper 9, integration: saved OSRM responses run end to end with the network mocked.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { SEGMENT_MAX_DISTANCE_M, SEGMENT_MAX_TIME_SEC } from '../src/config';
import { absorbShortBlocks, mergeBlocks } from '../src/core/merge';
import { segmentRoute } from '../src/core/segment';
import { summarize } from '../src/core/summary';
import { flattenAndTime } from '../src/core/timeline';
import { originLocalToUtc } from '../src/core/tz';
import { verdictFor } from '../src/core/verdict';
import { clearHttpCache } from '../src/services/http';
import { getRoute } from '../src/services/route';
import CITY from './fixtures/osrm-city-london.json';
import HIGHWAY from './fixtures/osrm-highway-madrid-zaragoza.json';
import MOUNTAIN from './fixtures/osrm-mountain-stelvio.json';
import { mockFetch } from './mockFetch';

type Osrm = {
  routes: {
    distance: number;
    duration: number;
    legs: { steps: { geometry: { coordinates: number[][] } }[] }[];
  }[];
};

const TRIPS: Record<'city' | 'highway' | 'mountain', Osrm> = {
  city: CITY, // King's Cross -> Westminster, 5 km, heads south
  highway: HIGHWAY, // Madrid -> Zaragoza, 313 km, heads north-east
  mountain: MOUNTAIN, // Bormio -> Prato over the Stelvio Pass
};

function endpoints(r: Osrm) {
  const coords = r.routes[0]!.legs.flatMap((l) => l.steps).flatMap((s) => s.geometry.coordinates);
  const [a, b] = [coords[0]!, coords.at(-1)!];
  return { from: { lat: a[1]!, lon: a[0]! }, to: { lat: b[1]!, lon: b[0]! } };
}

async function plan(trip: keyof typeof TRIPS, departureLocal: string) {
  const osrm = TRIPS[trip];
  mockFetch({ body: osrm });
  const { from, to } = endpoints(osrm);
  const steps = await getRoute(from, to);
  const points = flattenAndTime(steps);
  const departure = originLocalToUtc(from, departureLocal);
  const segments = segmentRoute(points);
  const verdicts = segments.map((s) => verdictFor(s, departure.utc));
  const blocks = absorbShortBlocks(mergeBlocks(segments, verdicts));
  return { osrm: osrm.routes[0]!, points, departure, segments, blocks, summary: summarize(blocks) };
}

beforeEach(() => clearHttpCache());
afterEach(() => vi.unstubAllGlobals());

describe.each(Object.keys(TRIPS) as (keyof typeof TRIPS)[])(
  '%s fixture: pipeline invariants',
  (trip) => {
    test('timed polyline matches the OSRM totals', async () => {
      const { osrm, points } = await plan(trip, '2026-06-21T12:00');
      expect(points.at(-1)!.cumTime).toBeCloseTo(osrm.duration, 0);
      expect(Math.abs(points.at(-1)!.cumDist - osrm.distance) / osrm.distance).toBeLessThan(0.01);
    });

    test('segments respect the caps and blocks cover the whole trip', async () => {
      const { osrm, segments, blocks } = await plan(trip, '2026-06-21T12:00');
      // Only a single leg that is itself over a cap (a 2-point segment) may exceed it.
      for (const s of segments.filter((seg) => seg.points.length > 2)) {
        expect(s.points.at(-1)!.cumDist - s.points[0]!.cumDist).toBeLessThanOrEqual(
          SEGMENT_MAX_DISTANCE_M,
        );
        expect(s.durationSec).toBeLessThanOrEqual(SEGMENT_MAX_TIME_SEC);
      }
      expect(blocks.reduce((a, b) => a + b.durationSec, 0)).toBeCloseTo(osrm.duration, 0);
      expect(blocks[0]!.startSec).toBe(0);
    });
  },
);

// Expected answers checked by hand against the route direction and where the sun is.
describe('sensible answers on real routes', () => {
  test('Madrid -> Zaragoza, summer morning: sun east/south-east, on the right -> sit left', async () => {
    const { summary, departure } = await plan('highway', '2026-06-21T09:00');
    expect(departure.timeZone).toBe('Europe/Madrid');
    expect(departure.utc.toISOString()).toBe('2026-06-21T07:00:00.000Z');
    expect(summary).toMatchObject({ avoidSide: 'left', leftSec: 0 });
    expect(summary.rightSec).toBeGreaterThan(3600);
  });

  test('Madrid -> Zaragoza, summer evening (sunset trip): sun west, on the left -> sit right, dark at the end', async () => {
    const { summary, blocks } = await plan('highway', '2026-06-21T18:30');
    expect(summary).toMatchObject({ avoidSide: 'right', rightSec: 0 });
    expect(blocks.some((b) => b.sunSide === 'left' && b.strong)).toBe(true);
    expect(blocks.at(-1)!.sunSide).toBe('dark');
  });

  test('Madrid -> Zaragoza, winter morning (sunrise trip): low sun south-east -> sit left, strong glare', async () => {
    const { summary, blocks } = await plan('highway', '2026-12-21T09:00');
    expect(summary.avoidSide).toBe('left');
    expect(blocks[0]).toMatchObject({ sunSide: 'right', strong: true });
  });

  test('London southbound at 08:00 in September: low sun in the east, on the left -> sit right', async () => {
    const { summary } = await plan('city', '2026-09-28T08:00');
    expect(summary.avoidSide).toBe('right');
  });

  test('London at 23:00: dark the whole way -> either', async () => {
    const { summary, blocks } = await plan('city', '2026-09-28T23:00');
    expect(summary.avoidSide).toBe('either');
    expect(blocks.map((b) => b.sunSide)).toEqual(['dark']);
  });

  test('Stelvio, morning and evening give opposite seats on the same winding road', async () => {
    const morning = await plan('mountain', '2026-07-15T07:00');
    clearHttpCache();
    const evening = await plan('mountain', '2026-07-15T17:30');
    expect(morning.departure.timeZone).toBe('Europe/Rome');
    expect(morning.summary.avoidSide).toBe('left');
    expect(evening.summary.avoidSide).toBe('right');
  });
});
