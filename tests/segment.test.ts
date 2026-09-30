import { describe, expect, test } from 'vitest';
import {
  DEFAULT_SEGMENT_LIMITS,
  SEGMENT_MAX_DISTANCE_M,
  SEGMENT_MAX_TIME_SEC,
} from '../src/config';
import { normalizeAngle } from '../src/core/geo';
import { segmentRoute } from '../src/core/segment';
import type { TimedPoint } from '../src/core/types';
import { analyze, drive } from './helpers';

const ORIGIN = { lat: 10, lon: 20 };

describe('segmentRoute', () => {
  test('fewer than two points -> no segments', () => {
    expect(segmentRoute([])).toEqual([]);
    expect(segmentRoute([{ ...ORIGIN, cumTime: 0, cumDist: 0 }])).toEqual([]);
  });

  test('straight fast road is split only by the distance cap', () => {
    const route = drive(ORIGIN, [{ headingDeg: 0, distM: 60_000 }], 25); // 800 s per 20 km
    const segs = segmentRoute(route);
    expect(segs).toHaveLength(3);
    for (const s of segs) {
      expect(s.points.at(-1)!.cumDist - s.points[0]!.cumDist).toBeLessThanOrEqual(
        SEGMENT_MAX_DISTANCE_M,
      );
      expect(s.bearing).toBeCloseTo(0, 1);
    }
  });

  test('straight slow road is split only by the time cap', () => {
    const route = drive(ORIGIN, [{ headingDeg: 0, distM: 18_000 }], 5); // 3600 s total
    const segs = segmentRoute(route);
    expect(segs).toHaveLength(3);
    for (const s of segs) expect(s.durationSec).toBeLessThanOrEqual(SEGMENT_MAX_TIME_SEC);
  });

  test('a 90 deg turn splits into northbound and eastbound segments', () => {
    const route = drive(
      ORIGIN,
      [
        { headingDeg: 0, distM: 5_000 },
        { headingDeg: 90, distM: 5_000 },
      ],
      15,
    );
    const segs = segmentRoute(route);
    expect(segs.length).toBeGreaterThanOrEqual(2);
    // Drift is measured from the segment start (4.3), so the split lands a little past the corner.
    expect(segs[0]!.bearing).toBeLessThan(DEFAULT_SEGMENT_LIMITS.headingDriftDeg + 1);
    expect(Math.abs(normalizeAngle(segs.at(-1)!.bearing - 90))).toBeLessThan(5);
  });

  test('a gentle curve under the drift limit stays one segment', () => {
    // 3 deg/km over 8 km = 24 deg of heading change; chord drift from the start is ~12 deg.
    const route = drive(ORIGIN, [{ headingDeg: 0, distM: 8_000, turnPerKmDeg: 3 }], 20);
    expect(segmentRoute(route)).toHaveLength(1);
  });

  test('jitter within 10 m of the start does not set the initial bearing', () => {
    const jitter: TimedPoint[] = [
      { lat: 10, lon: 20, cumTime: 0, cumDist: 0 },
      { lat: 10.00003, lon: 20.00003, cumTime: 1, cumDist: 4 }, // ~4.6 m north-east
      { lat: 9.99997, lon: 19.99997, cumTime: 2, cumDist: 8 }, // ~4.6 m south-west
      { lat: 10, lon: 20, cumTime: 3, cumDist: 12 },
    ];
    const north = drive(ORIGIN, [{ headingDeg: 0, distM: 3_000 }], 20)
      .slice(1)
      .map((p) => ({ ...p, cumTime: p.cumTime + 3, cumDist: p.cumDist + 12 }));
    const segs = segmentRoute([...jitter, ...north]);
    expect(segs).toHaveLength(1);
    expect(segs[0]!.bearing).toBeCloseTo(0, 0);
  });

  test('segments share boundary points so time is continuous', () => {
    const route = drive(
      ORIGIN,
      [
        { headingDeg: 0, distM: 30_000 },
        { headingDeg: 120, distM: 10_000 },
        { headingDeg: 250, distM: 10_000 },
      ],
      20,
    );
    const segs = segmentRoute(route);
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i]!.startTime).toBe(segs[i - 1]!.endTime);
      expect(segs[i]!.points[0]).toBe(segs[i - 1]!.points.at(-1));
    }
    expect(segs[0]!.startTime).toBe(0);
    expect(segs.at(-1)!.endTime).toBe(route.at(-1)!.cumTime);
    const total = segs.reduce((a, s) => a + s.durationSec, 0);
    expect(total).toBeCloseTo(route.at(-1)!.cumTime, 6);
  });

  test('one leg longer than the cap still yields a segment (no infinite loop)', () => {
    const pts: TimedPoint[] = [
      { lat: 0, lon: 0, cumTime: 0, cumDist: 0 },
      { lat: 0.5, lon: 0, cumTime: 2000, cumDist: 55_597 },
      { lat: 1, lon: 0, cumTime: 4000, cumDist: 111_195 },
    ];
    const segs = segmentRoute(pts);
    expect(segs).toHaveLength(2);
    expect(segs[1]!.endTime).toBe(4000);
  });
});

describe('stability (whitepaper 9): verdict unchanged when A1-A3 vary by +/-25%', () => {
  // A winding two-hour trip: north with wiggles, a turn east, then south-east.
  const route = drive(
    { lat: 40.4, lon: -3.7 },
    [
      { headingDeg: 355, distM: 40_000, turnPerKmDeg: 0.5 },
      { headingDeg: 15, distM: 40_000, turnPerKmDeg: -0.6 },
      { headingDeg: 80, distM: 30_000 },
      { headingDeg: 140, distM: 40_000, turnPerKmDeg: 0.3 },
    ],
    21,
  );
  const departure = new Date('2026-06-21T06:00:00Z');
  const baseline = analyze(route, departure).summary.avoidSide;

  const factors = [0.75, 1, 1.25];
  const cases = factors.flatMap((h) => factors.flatMap((d) => factors.map((t) => [h, d, t])));

  test('baseline gives a confident answer', () => {
    expect(baseline).toBe('left');
  });

  test.each(cases)('drift x%s, distance x%s, time x%s', (h, d, t) => {
    const limits = {
      headingDriftDeg: DEFAULT_SEGMENT_LIMITS.headingDriftDeg * h!,
      maxDistanceM: DEFAULT_SEGMENT_LIMITS.maxDistanceM * d!,
      maxTimeSec: DEFAULT_SEGMENT_LIMITS.maxTimeSec * t!,
    };
    expect(analyze(route, departure, limits).summary.avoidSide).toBe(baseline);
  });
});
