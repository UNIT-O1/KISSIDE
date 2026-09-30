// Flattens route steps into a single timed polyline. Whitepaper 4.2, A9.
import { haversine } from './geo';
import type { RouteStep, TimedPoint } from './types';

/**
 * Time at each point is interpolated by distance within its step (constant speed per step).
 * cumDist is the measured polyline length. Repeated points (OSRM repeats the joining point
 * between steps) collapse into one, keeping the later time.
 */
export function flattenAndTime(steps: RouteStep[]): TimedPoint[] {
  const out: TimedPoint[] = [];
  let stepStartTime = 0;

  for (const step of steps) {
    const geom = step.geometry;
    const legs = geom.slice(1).map((p, i) => haversine(geom[i]!, p));
    const stepLen = legs.reduce((a, b) => a + b, 0);

    let into = 0;
    geom.forEach((p, i) => {
      if (i > 0) into += legs[i - 1]!;
      const fraction = stepLen > 0 ? into / stepLen : i === geom.length - 1 ? 1 : 0;
      const cumTime = stepStartTime + fraction * step.duration;
      const last = out[out.length - 1];

      if (last && last.lat === p.lat && last.lon === p.lon) {
        last.cumTime = Math.max(last.cumTime, cumTime);
        return;
      }
      const cumDist = last ? last.cumDist + haversine(last, p) : 0;
      out.push({ lat: p.lat, lon: p.lon, cumTime, cumDist });
    });

    stepStartTime += step.duration;
  }

  return out;
}
