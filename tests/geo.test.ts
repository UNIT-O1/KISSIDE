import { describe, expect, test } from 'vitest';
import { bearing, haversine, normalize360, normalizeAngle } from '../src/core/geo';

describe('geo', () => {
  test('normalizeAngle maps into (-180, 180]', () => {
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(720 + 45)).toBe(45);
  });

  test('normalize360 maps into [0, 360)', () => {
    expect(normalize360(-90)).toBe(270);
    expect(normalize360(360)).toBe(0);
  });

  test('bearing cardinal directions', () => {
    const o = { lat: 0, lon: 0 };
    expect(bearing(o, { lat: 1, lon: 0 })).toBeCloseTo(0, 6);
    expect(bearing(o, { lat: 0, lon: 1 })).toBeCloseTo(90, 6);
    expect(bearing(o, { lat: -1, lon: 0 })).toBeCloseTo(180, 6);
    expect(bearing(o, { lat: 0, lon: -1 })).toBeCloseTo(270, 6);
  });

  test('haversine: one degree of latitude is ~111.2 km', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
  });

  test('haversine: London to Paris is ~344 km', () => {
    const d = haversine({ lat: 51.5074, lon: -0.1278 }, { lat: 48.8566, lon: 2.3522 });
    expect(d / 1000).toBeCloseTo(344, -1);
  });
});
