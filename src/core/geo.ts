// Pure geometry helpers. No DOM, no fetch. Whitepaper 5.3 / A14.
import { EARTH_RADIUS_M } from '../config';
import type { LatLon } from './types';

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Normalizes an angle in degrees into [0, 360). */
export function normalize360(deg: number): number {
  const r = deg % 360;
  return r < 0 ? r + 360 : r;
}

/** Normalizes an angle in degrees into (-180, 180]. */
export function normalizeAngle(deg: number): number {
  const r = normalize360(deg);
  return r > 180 ? r - 360 : r;
}

/** Initial great-circle bearing from a to b, in degrees, 0 = north, clockwise, [0, 360). */
export function bearing(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalize360(toDeg(Math.atan2(y, x)));
}

/** Great-circle distance between a and b, in metres. */
export function haversine(a: LatLon, b: LatLon): number {
  const Δφ = toRad(b.lat - a.lat);
  const Δλ = toRad(b.lon - a.lon);
  const h =
    Math.sin(Δφ / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
