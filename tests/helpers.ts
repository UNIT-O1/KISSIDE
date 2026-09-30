import { DEFAULT_SEGMENT_LIMITS, EARTH_RADIUS_M, type SegmentLimits } from '../src/config';
import { toDeg, toRad } from '../src/core/geo';
import { absorbShortBlocks, mergeBlocks } from '../src/core/merge';
import { segmentRoute } from '../src/core/segment';
import { summarize } from '../src/core/summary';
import type { Block, LatLon, Summary, TimedPoint } from '../src/core/types';
import { verdictFor } from '../src/core/verdict';

/** Point reached by travelling distM from start on the given initial bearing. */
export function destination(start: LatLon, bearingDeg: number, distM: number): LatLon {
  const δ = distM / EARTH_RADIUS_M;
  const θ = toRad(bearingDeg);
  const φ1 = toRad(start.lat);
  const λ1 = toRad(start.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: toDeg(λ2) };
}

export type Leg = { headingDeg: number; distM: number; turnPerKmDeg?: number };

/** Timed polyline driven at constant speed, sampled every stepM, following the given legs. */
export function drive(start: LatLon, legs: Leg[], speedMps: number, stepM = 100): TimedPoint[] {
  const pts: TimedPoint[] = [{ ...start, cumTime: 0, cumDist: 0 }];
  let here = start;
  let dist = 0;
  for (const leg of legs) {
    let heading = leg.headingDeg;
    for (let d = 0; d < leg.distM; d += stepM) {
      here = destination(here, heading, stepM);
      dist += stepM;
      pts.push({ ...here, cumTime: dist / speedMps, cumDist: dist });
      heading += ((leg.turnPerKmDeg ?? 0) * stepM) / 1000;
    }
  }
  return pts;
}

export function block(sunSide: Block['sunSide'], minutes: number, startSec = 0): Block {
  return { sunSide, durationSec: minutes * 60, startSec, points: [], strong: false };
}

/** Consecutive blocks with correct start times, from [side, minutes] pairs. */
export function blocks(...spec: [Block['sunSide'], number][]): Block[] {
  let t = 0;
  return spec.map(([side, min]) => {
    const b = block(side, min, t);
    t += min * 60;
    return b;
  });
}

/** core pipeline from timed points to summary, with the network stages skipped. */
export function analyze(
  points: TimedPoint[],
  departureUtc: Date,
  limits: SegmentLimits = DEFAULT_SEGMENT_LIMITS,
): { blocks: Block[]; summary: Summary } {
  const segments = segmentRoute(points, limits);
  const verdicts = segments.map((s) => verdictFor(s, departureUtc));
  const merged = absorbShortBlocks(mergeBlocks(segments, verdicts));
  return { blocks: merged, summary: summarize(merged) };
}
