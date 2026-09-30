// Sun-side verdict for one segment. Whitepaper 4.5, 4.6.
// This tracks the side the SUN is on. The recommended seat is the opposite (see summary.ts).
import {
  OVERHEAD_CUTOFF_ELEVATION_DEG,
  SIDE_WINDOW_MAX_DEG,
  SIDE_WINDOW_MIN_DEG,
  STRONG_GLARE_ELEVATION_DEG,
} from '../config';
import { normalizeAngle } from './geo';
import { sunPosition, type SunPosition } from './sun';
import type { LatLon, Segment, Verdict } from './types';

/** heading in degrees (0 = north). Positive relative angle = sun to the right of travel. */
export function classifySun(sun: SunPosition, heading: number): Verdict {
  const el = Math.round(sun.elevation);
  if (sun.elevation <= 0) {
    return { sunSide: 'dark', strong: false, reason: 'Sun is below the horizon.' };
  }
  if (sun.elevation > OVERHEAD_CUTOFF_ELEVATION_DEG) {
    return { sunSide: 'none', strong: false, reason: `Sun is ${el}° high; the roof blocks it.` };
  }

  const rel = normalizeAngle(sun.azimuth - heading);
  const abs = Math.abs(rel);
  if (abs >= SIDE_WINDOW_MIN_DEG && abs <= SIDE_WINDOW_MAX_DEG) {
    const sunSide = rel > 0 ? 'right' : 'left';
    const strong = sun.elevation < STRONG_GLARE_ELEVATION_DEG;
    const glare = strong ? ' Low sun, strong glare.' : '';
    return { sunSide, strong, reason: `Sun on the ${sunSide}, ${el}° high.${glare}` };
  }

  const where = abs < SIDE_WINDOW_MIN_DEG ? 'ahead' : 'behind';
  return { sunSide: 'none', strong: false, reason: `Sun ${where}, ${el}° high.` };
}

/** departureUtc is the trip's start instant; segment times are seconds relative to it. */
export function verdictFor(segment: Segment, departureUtc: Date): Verdict {
  const midTime = (segment.startTime + segment.endTime) / 2;
  const at = pointAtTime(segment, midTime);
  const instant = new Date(departureUtc.getTime() + midTime * 1000);
  return classifySun(sunPosition(at.lat, at.lon, instant), segment.bearing);
}

function pointAtTime(segment: Segment, t: number): LatLon {
  const pts = segment.points;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (b.cumTime >= t) {
      const span = b.cumTime - a.cumTime;
      const f = span > 0 ? (t - a.cumTime) / span : 0;
      return { lat: a.lat + f * (b.lat - a.lat), lon: a.lon + f * (b.lon - a.lon) };
    }
  }
  return pts[pts.length - 1]!;
}
