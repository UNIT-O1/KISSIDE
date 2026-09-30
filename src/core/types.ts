// Shared types for core/*. Whitepaper 5.4 "Key interfaces (contract for Claude Code)".

export type LatLon = { lat: number; lon: number };

/** A point along the route with cumulative time (s) and distance (m) from trip start. */
export type TimedPoint = LatLon & { cumTime: number; cumDist: number };

export type Segment = {
  points: TimedPoint[];
  startTime: number;
  endTime: number;
  durationSec: number;
  bearing: number;
};

export type SunSide = 'left' | 'right' | 'none' | 'dark';

export type Verdict = { sunSide: SunSide; strong: boolean; reason: string };

export type Block = {
  sunSide: SunSide;
  durationSec: number;
  startSec: number;
  points: LatLon[];
  strong: boolean;
};

export type Summary = {
  /** The seat that AVOIDS the sun (opposite the more exposed side), or no single answer. */
  avoidSide: 'left' | 'right' | 'either' | 'switch';
  /** Seconds with the SUN on the left / right side of the vehicle. */
  leftSec: number;
  rightSec: number;
  switches: number;
};

/**
 * One leg of a route (an OSRM step, whitepaper 4.2). Lives in core because core may not
 * import from services; services/route.ts imports it from here.
 */
export type RouteStep = {
  geometry: LatLon[];
  distance: number; // metres
  duration: number; // seconds
};
