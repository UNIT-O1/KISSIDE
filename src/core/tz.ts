// Resolves the departure instant from an origin-local wall-clock time. Whitepaper 4.9, A13.
import tzlookup from 'tz-lookup';
import type { LatLon } from './types';

export type DepartureInstant = {
  utc: Date;
  timeZone: string;
  /** True if the origin zone couldn't be found and the device zone was used (UI shows a notice). */
  usedDeviceZone: boolean;
};

const LOCAL_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** localDateTime is a datetime-local value ("YYYY-MM-DDTHH:mm[:ss]") at the origin's zone. */
export function originLocalToUtc(origin: LatLon, localDateTime: string): DepartureInstant {
  const m = LOCAL_DATETIME.exec(localDateTime);
  if (!m) throw new Error(`Invalid local date-time: "${localDateTime}"`);
  const [y, mo, d, h, mi, s] = m.slice(1).map((v) => Number(v ?? 0)) as number[];

  let timeZone: string;
  let usedDeviceZone = false;
  try {
    timeZone = tzlookup(origin.lat, origin.lon);
  } catch {
    timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    usedDeviceZone = true;
  }

  // Treat the wall-clock time as if it were UTC, then subtract the zone's offset. The second
  // pass uses the offset at the corrected instant, which fixes guesses that straddle a DST change.
  const wallAsUtc = Date.UTC(y!, mo! - 1, d!, h!, mi!, s!);
  let utc = wallAsUtc - offsetMs(timeZone, wallAsUtc);
  utc = wallAsUtc - offsetMs(timeZone, utc);

  return { utc: new Date(utc), timeZone, usedDeviceZone };
}

/** Offset of timeZone from UTC at the given instant, in ms (e.g. +3_600_000 for UTC+1). */
function offsetMs(timeZone: string, instant: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  const local = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return local - Math.floor(instant / 1000) * 1000;
}
