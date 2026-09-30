// OSRM driving route (swappable provider). Whitepaper 5.5.
import type { LatLon, RouteStep } from '../core/types';
import { BASE_URLS, HttpError, fetchJson } from './http';

export type RouteErrorKind = 'no-route' | 'bad-response';

export class RouteError extends Error {
  constructor(
    readonly kind: RouteErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RouteError';
  }
}

type OsrmStep = { distance: number; duration: number; geometry: { coordinates: number[][] } };
type OsrmResponse = { code?: string; routes?: { legs?: { steps?: OsrmStep[] }[] }[] };

// NoRoute: points can't be connected by road. NoSegment: a point is too far from any road.
const NO_ROUTE_CODES = new Set(['NoRoute', 'NoSegment']);

export function routeUrl(from: LatLon, to: LatLon): string {
  // OSRM takes lon,lat (not lat,lon).
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  return `${BASE_URLS.osrm}/route/v1/driving/${coords}?overview=false&steps=true&geometries=geojson`;
}

/** Steps of the fastest driving route, in travel order. Responses are cached by http.ts. */
export async function getRoute(from: LatLon, to: LatLon): Promise<RouteStep[]> {
  const url = routeUrl(from, to);
  let res: OsrmResponse;
  try {
    res = await fetchJson<OsrmResponse>(url);
  } catch (err) {
    // OSRM reports routing failures as HTTP 400 with a JSON body.
    if (err instanceof HttpError && isNoRoute(err.body)) {
      throw new RouteError('no-route', `No driving route between these places: ${url}`);
    }
    throw err;
  }

  if (isNoRoute(res)) throw new RouteError('no-route', `No driving route: ${url}`);
  const legs = res.code === 'Ok' ? res.routes?.[0]?.legs : undefined;
  if (!Array.isArray(legs))
    throw new RouteError('bad-response', `Unexpected OSRM response: ${url}`);

  const steps = legs.flatMap((leg) => leg.steps ?? []).map(toRouteStep);
  if (steps.some((s) => s === null)) {
    throw new RouteError('bad-response', `Malformed OSRM step: ${url}`);
  }
  return steps as RouteStep[];
}

function toRouteStep(step: OsrmStep): RouteStep | null {
  const coords = step?.geometry?.coordinates;
  if (
    !Number.isFinite(step?.distance) ||
    !Number.isFinite(step?.duration) ||
    !Array.isArray(coords)
  ) {
    return null;
  }
  const geometry: LatLon[] = [];
  for (const c of coords) {
    const [lon, lat] = c;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    geometry.push({ lat: lat!, lon: lon! });
  }
  return { geometry, distance: step.distance, duration: step.duration };
}

function isNoRoute(body: unknown): boolean {
  const code = (body as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && NO_ROUTE_CODES.has(code);
}
