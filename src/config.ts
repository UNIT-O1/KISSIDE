// All thresholds and magic numbers used by core/* live here (CLAUDE.md rule).
// Section references are to docs/sunside-whitepaper.md.

/** Whitepaper 4.3 (A1): heading drift since segment start that forces a new segment. */
export const HEADING_DRIFT_MAX_DEG = 18;

/** Whitepaper 4.3 (A2): max distance since segment start before forcing a new segment. */
export const SEGMENT_MAX_DISTANCE_M = 20_000;

/** Whitepaper 4.3 (A3): max elapsed time since segment start before forcing a new segment. */
export const SEGMENT_MAX_TIME_SEC = 20 * 60;

/** Whitepaper 4.3: minimum movement before an initial segment bearing is trusted. */
export const MIN_BEARING_MOVEMENT_M = 10;

/** The A1-A3 caps as one object, so tests can vary them (whitepaper 9: stability at +/-25%). */
export const DEFAULT_SEGMENT_LIMITS = {
  headingDriftDeg: HEADING_DRIFT_MAX_DEG,
  maxDistanceM: SEGMENT_MAX_DISTANCE_M,
  maxTimeSec: SEGMENT_MAX_TIME_SEC,
};
export type SegmentLimits = typeof DEFAULT_SEGMENT_LIMITS;

/** Mean Earth radius (IUGG), metres. Used by haversine. */
export const EARTH_RADIUS_M = 6_371_008.8;

/** Whitepaper 4.5 (A4): relative angle range (degrees) where the sun counts as hitting a side window. */
export const SIDE_WINDOW_MIN_DEG = 40;
export const SIDE_WINDOW_MAX_DEG = 140;

/** Whitepaper 4.5 (A5): elevation above which the sun is considered blocked by the roof ("overhead"). */
export const OVERHEAD_CUTOFF_ELEVATION_DEG = 58;

/** Whitepaper 4.5 (A6): elevation below which side-window sun is flagged as "strong" glare. */
export const STRONG_GLARE_ELEVATION_DEG = 20;

/** Whitepaper 4.8 (A7): exposure ratio one side needs over the other for a confident verdict. */
export const DOMINANCE_RATIO = 1.3;

/** Whitepaper 4.7 (A8): blocks shorter than this are absorbed into the longer neighbour. */
export const MIN_BLOCK_DURATION_SEC = 5 * 60;

/** Whitepaper 4.8 (v1.1, driver mode): elevation below which a sun-ahead condition is flagged for drivers. */
export const DRIVER_LOW_SUN_ELEVATION_DEG = 20;

/** Whitepaper 5.5: Nominatim usage policy - don't search on every keystroke. */
export const GEOCODE_DEBOUNCE_MS = 800;
export const GEOCODE_MIN_QUERY_LENGTH = 4;

/** Whitepaper 5.5: Nominatim allows roughly 1 request per second; requests are spaced this far apart. */
export const NOMINATIM_MIN_INTERVAL_MS = 1000;

/** Number of place candidates requested per geocode search. */
export const GEOCODE_RESULT_LIMIT = 5;

/** Whitepaper 5.5: network call timeout and retry budget for services/*. */
export const HTTP_TIMEOUT_MS = 8000;
export const HTTP_MAX_RETRIES = 1;

/** Wait before the retry, doubled per further attempt. At least 1 s so a retry to Nominatim stays within its limit. */
export const HTTP_RETRY_BACKOFF_MS = 1000;

/** In-memory response cache size (entries, oldest evicted first). Trips only ever need a handful. */
export const HTTP_CACHE_MAX_ENTRIES = 100;
