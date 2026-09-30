import { describe, expect, test } from 'vitest';
import { haversine } from '../src/core/geo';
import { flattenAndTime } from '../src/core/timeline';
import type { RouteStep } from '../src/core/types';

const A = { lat: 0, lon: 0 };
const B = { lat: 0.01, lon: 0 }; // ~1112 m north of A
const C = { lat: 0.03, lon: 0 }; // ~2224 m north of B
const D = { lat: 0.03, lon: 0.01 };

describe('flattenAndTime', () => {
  test('empty route -> no points', () => {
    expect(flattenAndTime([])).toEqual([]);
  });

  test('time is interpolated by distance within a step (constant speed)', () => {
    const steps: RouteStep[] = [{ geometry: [A, B, C], distance: 3336, duration: 300 }];
    const pts = flattenAndTime(steps);
    expect(pts.map((p) => p.cumTime)).toEqual([0, expect.closeTo(100, 6), 300]);
    expect(pts[2]!.cumDist).toBeCloseTo(haversine(A, B) + haversine(B, C), 6);
  });

  test('steps chain in time, and the repeated joining point is dropped', () => {
    const steps: RouteStep[] = [
      { geometry: [A, B], distance: 1112, duration: 60 },
      { geometry: [B, C, D], distance: 3336, duration: 240 },
    ];
    const pts = flattenAndTime(steps);
    expect(pts).toHaveLength(4);
    expect(pts[1]).toMatchObject({ ...B, cumTime: 60 });
    expect(pts.at(-1)!.cumTime).toBe(300);
  });

  test('each step keeps its own speed', () => {
    // Step 1 is slow (1112 m in 200 s), step 2 is fast (2224 m in 100 s).
    const steps: RouteStep[] = [
      { geometry: [A, B], distance: 1112, duration: 200 },
      { geometry: [B, C], distance: 2224, duration: 100 },
    ];
    const pts = flattenAndTime(steps);
    expect(pts.map((p) => p.cumTime)).toEqual([0, 200, 300]);
  });

  test('a zero-length step with a duration (a wait) pushes later points back', () => {
    const steps: RouteStep[] = [
      { geometry: [A, B], distance: 1112, duration: 60 },
      { geometry: [B, B], distance: 0, duration: 30 },
      { geometry: [B, C], distance: 2224, duration: 120 },
    ];
    const pts = flattenAndTime(steps);
    expect(pts).toHaveLength(3);
    expect(pts[1]).toMatchObject({ ...B, cumTime: 90 });
    expect(pts[2]!.cumTime).toBe(210);
  });

  test('cumTime and cumDist never decrease', () => {
    const steps: RouteStep[] = [
      { geometry: [A, B, C], distance: 3336, duration: 300 },
      { geometry: [C, D], distance: 1112, duration: 60 },
    ];
    const pts = flattenAndTime(steps);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.cumTime).toBeGreaterThanOrEqual(pts[i - 1]!.cumTime);
      expect(pts[i]!.cumDist).toBeGreaterThanOrEqual(pts[i - 1]!.cumDist);
    }
  });
});
