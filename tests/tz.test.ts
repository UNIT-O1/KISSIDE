import { describe, expect, test } from 'vitest';
import { originLocalToUtc } from '../src/core/tz';

const LONDON = { lat: 51.5074, lon: -0.1278 };
const NEW_YORK = { lat: 40.7128, lon: -74.006 };
const DELHI = { lat: 28.6139, lon: 77.209 };
const SYDNEY = { lat: -33.8688, lon: 151.2093 };

describe('originLocalToUtc (whitepaper 4.9)', () => {
  test('London summer time (BST, UTC+1)', () => {
    const r = originLocalToUtc(LONDON, '2026-07-01T09:00');
    expect(r).toMatchObject({ timeZone: 'Europe/London', usedDeviceZone: false });
    expect(r.utc.toISOString()).toBe('2026-07-01T08:00:00.000Z');
  });

  test('London winter time (GMT, UTC+0)', () => {
    expect(originLocalToUtc(LONDON, '2026-01-10T09:00').utc.toISOString()).toBe(
      '2026-01-10T09:00:00.000Z',
    );
  });

  test('New York winter (EST, UTC-5)', () => {
    const r = originLocalToUtc(NEW_YORK, '2026-01-15T12:00');
    expect(r.timeZone).toBe('America/New_York');
    expect(r.utc.toISOString()).toBe('2026-01-15T17:00:00.000Z');
  });

  test('Delhi half-hour offset (IST, UTC+5:30)', () => {
    const r = originLocalToUtc(DELHI, '2026-09-28T14:30');
    expect(r.timeZone).toBe('Asia/Kolkata');
    expect(r.utc.toISOString()).toBe('2026-09-28T09:00:00.000Z');
  });

  test('southern hemisphere DST: Sydney in January (AEDT, UTC+11)', () => {
    expect(originLocalToUtc(SYDNEY, '2026-01-15T08:00').utc.toISOString()).toBe(
      '2026-01-14T21:00:00.000Z',
    );
  });

  test('crossing the date line backwards: New York late evening is next day UTC', () => {
    expect(originLocalToUtc(NEW_YORK, '2026-07-04T22:15:30').utc.toISOString()).toBe(
      '2026-07-05T02:15:30.000Z',
    );
  });

  test('the first hour after a DST change resolves to the new offset', () => {
    // US clocks go forward at 02:00 on 2026-03-08; 03:30 local is EDT (UTC-4).
    expect(originLocalToUtc(NEW_YORK, '2026-03-08T03:30').utc.toISOString()).toBe(
      '2026-03-08T07:30:00.000Z',
    );
    // The hour before: 01:30 local is still EST (UTC-5).
    expect(originLocalToUtc(NEW_YORK, '2026-03-08T01:30').utc.toISOString()).toBe(
      '2026-03-08T06:30:00.000Z',
    );
  });

  test('the result is independent of the device time zone', () => {
    // Same wall time in two places gives two different instants.
    const london = originLocalToUtc(LONDON, '2026-07-01T09:00').utc.getTime();
    const delhi = originLocalToUtc(DELHI, '2026-07-01T09:00').utc.getTime();
    expect((london - delhi) / 3_600_000).toBe(4.5);
  });

  test('falls back to the device zone if the lookup fails', () => {
    const r = originLocalToUtc({ lat: 100, lon: 0 }, '2026-07-01T09:00');
    expect(r.usedDeviceZone).toBe(true);
    expect(r.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  test('rejects malformed input', () => {
    expect(() => originLocalToUtc(LONDON, '01/07/2026 09:00')).toThrow(/Invalid/);
  });
});
