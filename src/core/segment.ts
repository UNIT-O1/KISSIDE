// Splits a timed polyline into chunks of ~constant heading. Whitepaper 4.3.
import { DEFAULT_SEGMENT_LIMITS, MIN_BEARING_MOVEMENT_M, type SegmentLimits } from '../config';
import { bearing, haversine, normalizeAngle } from './geo';
import type { Segment, TimedPoint } from './types';

/**
 * A segment ends at the point before the one that breaks a limit, and the next segment starts
 * there, so segments share boundary points and time is continuous. If a single leg breaks a
 * limit on its own, the segment keeps that leg (points are never interpolated).
 */
export function segmentRoute(
  points: TimedPoint[],
  limits: SegmentLimits = DEFAULT_SEGMENT_LIMITS,
): Segment[] {
  const segments: Segment[] = [];
  if (points.length < 2) return segments;

  let s = 0;
  let initialBearing: number | null = null;
  let lastBearing = 0;

  const close = (e: number) => {
    const pts = points.slice(s, e + 1);
    const first = pts[0]!;
    const last = pts[pts.length - 1]!;
    // Stationary segments (e.g. a stop) inherit the previous heading.
    if (haversine(first, last) > MIN_BEARING_MOVEMENT_M) lastBearing = bearing(first, last);
    segments.push({
      points: pts,
      startTime: first.cumTime,
      endTime: last.cumTime,
      durationSec: last.cumTime - first.cumTime,
      bearing: lastBearing,
    });
  };

  for (let i = 1; i < points.length; i++) {
    const start = points[s]!;
    const p = points[i]!;

    let drift = 0;
    if (haversine(start, p) > MIN_BEARING_MOVEMENT_M) {
      const b = bearing(start, p);
      if (initialBearing === null) initialBearing = b;
      else drift = Math.abs(normalizeAngle(b - initialBearing));
    }

    const exceeded =
      drift > limits.headingDriftDeg ||
      p.cumDist - start.cumDist > limits.maxDistanceM ||
      p.cumTime - start.cumTime > limits.maxTimeSec;
    if (!exceeded) continue;

    const end = i - 1 > s ? i - 1 : i;
    close(end);
    s = end;
    initialBearing = null;
    i = s; // re-examine the points after the new start
  }

  if (s < points.length - 1) close(points.length - 1);
  return segments;
}
