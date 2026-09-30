import { describe, expect, test } from 'vitest';
import { sunPosition } from '../src/core/sun';

const MIN = 60_000;

/** Samples one UTC day at 1-minute steps and returns the highest sun. */
function solarNoon(lat: number, lon: number, dayIso: string) {
  const t0 = Date.parse(`${dayIso}T00:00:00Z`);
  let best = { time: t0, ...sunPosition(lat, lon, new Date(t0)) };
  for (let t = t0; t < t0 + 1440 * MIN; t += MIN) {
    const p = sunPosition(lat, lon, new Date(t));
    if (p.elevation > best.elevation) best = { time: t, ...p };
  }
  return best;
}

/** First minute of the UTC day at which the sun is above the horizon. */
function sunrise(lat: number, lon: number, dayIso: string) {
  const t0 = Date.parse(`${dayIso}T00:00:00Z`);
  for (let t = t0; t < t0 + 1440 * MIN; t += MIN) {
    const p = sunPosition(lat, lon, new Date(t));
    if (p.elevation > 0) return { time: t, ...p };
  }
  throw new Error('no sunrise');
}

// Maximum declination = obliquity of the ecliptic, ~23.44 deg.
const OBLIQUITY = 23.44;
const LONDON = { lat: 51.5074, lon: -0.1278 };

describe('sunPosition', () => {
  test('equinox solar noon at the equator is ~90 deg elevation', () => {
    const noon = solarNoon(0, 0, '2024-03-20');
    expect(noon.elevation).toBeGreaterThan(89.3);
  });

  test('equinox solar noon at lon 0 is ~12:07 UTC (equation of time ~ -7 min)', () => {
    const noon = solarNoon(0, 0, '2024-03-20');
    const minutes = (noon.time - Date.parse('2024-03-20T12:00:00Z')) / MIN;
    expect(minutes).toBeGreaterThan(5);
    expect(minutes).toBeLessThan(10);
  });

  test('equinox sunrise at the equator is due east (~90 deg azimuth)', () => {
    const rise = sunrise(0, 0, '2024-03-20');
    expect(rise.azimuth).toBeCloseTo(90, 0);
    // Sunrise around 06:07 UTC at lon 0 (geometric, no refraction).
    const hour = (rise.time - Date.parse('2024-03-20T00:00:00Z')) / 3_600_000;
    expect(hour).toBeGreaterThan(5.9);
    expect(hour).toBeLessThan(6.3);
  });

  test('London winter solstice noon elevation = 90 - lat - obliquity', () => {
    const noon = solarNoon(LONDON.lat, LONDON.lon, '2024-12-21');
    expect(noon.elevation).toBeCloseTo(90 - LONDON.lat - OBLIQUITY, 0);
    expect(noon.azimuth).toBeCloseTo(180, 0);
  });

  test('London summer solstice noon elevation = 90 - lat + obliquity', () => {
    const noon = solarNoon(LONDON.lat, LONDON.lon, '2024-06-20');
    expect(noon.elevation).toBeCloseTo(90 - LONDON.lat + OBLIQUITY, 0);
  });

  test('southern hemisphere: Sydney December noon sun is due north', () => {
    const noon = solarNoon(-33.87, 151.21, '2024-12-21');
    expect(noon.elevation).toBeCloseTo(90 - (33.87 - OBLIQUITY), 0);
    const fromNorth = Math.min(noon.azimuth, 360 - noon.azimuth);
    expect(fromNorth).toBeLessThan(2);
  });

  test('azimuth runs east in the morning and west in the afternoon (northern mid-latitude)', () => {
    const morning = sunPosition(LONDON.lat, LONDON.lon, new Date('2024-06-20T07:00:00Z'));
    const evening = sunPosition(LONDON.lat, LONDON.lon, new Date('2024-06-20T17:00:00Z'));
    expect(morning.azimuth).toBeGreaterThan(60);
    expect(morning.azimuth).toBeLessThan(120);
    expect(evening.azimuth).toBeGreaterThan(240);
    expect(evening.azimuth).toBeLessThan(300);
  });

  test('sun is below the horizon at midnight in London in winter', () => {
    const p = sunPosition(LONDON.lat, LONDON.lon, new Date('2024-12-21T00:00:00Z'));
    expect(p.elevation).toBeLessThan(-40);
  });

  test('azimuth is always in [0, 360)', () => {
    for (let h = 0; h < 24; h++) {
      const p = sunPosition(-33.87, 151.21, new Date(Date.UTC(2024, 11, 21, h)));
      expect(p.azimuth).toBeGreaterThanOrEqual(0);
      expect(p.azimuth).toBeLessThan(360);
    }
  });
});
