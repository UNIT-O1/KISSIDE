import { describe, expect, test } from 'vitest';
import { summarize } from '../src/core/summary';
import { classifySun, verdictFor } from '../src/core/verdict';
import type { Segment } from '../src/core/types';
import { analyze, drive } from './helpers';

const N = 0;
const E = 90;
const S = 180;
const W = 270;

describe('classifySun golden cases (whitepaper 9)', () => {
  test('heading north, sun in the east at 30 deg -> sun on the right', () => {
    const v = classifySun({ azimuth: 90, elevation: 30 }, N);
    expect(v.sunSide).toBe('right');
    expect(v.strong).toBe(false);
    expect(v.reason).toBe('Sun on the right, 30° high.');
  });

  test('heading east at sunrise -> sun ahead, no side preference', () => {
    const v = classifySun({ azimuth: 90, elevation: 3 }, E);
    expect(v.sunSide).toBe('none');
    expect(v.reason).toMatch(/ahead/);
  });

  test('heading west, afternoon sun in the west-south-west at 40 deg -> sun ahead', () => {
    expect(classifySun({ azimuth: 250, elevation: 40 }, W).sunSide).toBe('none');
  });

  test('heading south, afternoon sun in the west -> sun on the right', () => {
    expect(classifySun({ azimuth: 250, elevation: 40 }, S).sunSide).toBe('right');
  });

  test('heading south, morning sun in the east -> sun on the left', () => {
    expect(classifySun({ azimuth: 100, elevation: 30 }, S).sunSide).toBe('left');
  });

  test('elevation 70 deg -> overhead, no side', () => {
    const v = classifySun({ azimuth: 90, elevation: 70 }, N);
    expect(v.sunSide).toBe('none');
    expect(v.reason).toMatch(/roof/);
  });

  test('elevation -5 deg -> dark', () => {
    expect(classifySun({ azimuth: 90, elevation: -5 }, N).sunSide).toBe('dark');
  });

  test('sun behind -> no side preference', () => {
    const v = classifySun({ azimuth: 180, elevation: 30 }, N);
    expect(v.sunSide).toBe('none');
    expect(v.reason).toMatch(/behind/);
  });

  test('low side sun is strong glare', () => {
    const v = classifySun({ azimuth: 270, elevation: 10 }, N);
    expect(v).toMatchObject({ sunSide: 'left', strong: true });
  });

  test('side-window cone boundaries are inclusive at 40 and 140 deg', () => {
    expect(classifySun({ azimuth: 40, elevation: 30 }, N).sunSide).toBe('right');
    expect(classifySun({ azimuth: 39.9, elevation: 30 }, N).sunSide).toBe('none');
    expect(classifySun({ azimuth: 140, elevation: 30 }, N).sunSide).toBe('right');
    expect(classifySun({ azimuth: 140.1, elevation: 30 }, N).sunSide).toBe('none');
    expect(classifySun({ azimuth: 320, elevation: 30 }, N).sunSide).toBe('left');
  });

  test('overhead cutoff is exclusive at 58 deg and dark is inclusive at 0 deg', () => {
    expect(classifySun({ azimuth: 90, elevation: 58 }, N).sunSide).toBe('right');
    expect(classifySun({ azimuth: 90, elevation: 58.1 }, N).sunSide).toBe('none');
    expect(classifySun({ azimuth: 90, elevation: 0 }, N).sunSide).toBe('dark');
  });

  test('relative angle wraps correctly across north', () => {
    // Heading 350, sun at 80: sun is 90 deg to the right.
    expect(classifySun({ azimuth: 80, elevation: 30 }, 350).sunSide).toBe('right');
    // Heading 10, sun at 280: sun is 90 deg to the left.
    expect(classifySun({ azimuth: 280, elevation: 30 }, 10).sunSide).toBe('left');
  });
});

describe('verdictFor', () => {
  const northSegment = (startTime: number): Segment => {
    const lat = 0;
    return {
      points: [
        { lat, lon: 0, cumTime: startTime, cumDist: 0 },
        { lat: lat + 0.1, lon: 0, cumTime: startTime + 600, cumDist: 11_119 },
      ],
      startTime,
      endTime: startTime + 600,
      durationSec: 600,
      bearing: N,
    };
  };
  const midnight = new Date('2024-03-20T00:00:00Z');

  test('uses departure + segment offset for the sun time', () => {
    expect(verdictFor(northSegment(0), midnight).sunSide).toBe('dark');
    // 08:00 UTC at lon 0 on the equinox: sun low in the east, heading north -> right.
    expect(verdictFor(northSegment(8 * 3600), midnight).sunSide).toBe('right');
    // 16:00 UTC: sun low in the west -> left.
    expect(verdictFor(northSegment(16 * 3600), midnight).sunSide).toBe('left');
  });
});

describe('REGRESSION: prototype inverted-side bug (whitepaper 4.6)', () => {
  // The prototype saw the sun on the right and told the user to "sit right".
  // The sun side is tracked internally; the recommendation must be the OPPOSITE side.

  test('northbound morning drive: sun on the right, recommend sitting LEFT', () => {
    const route = drive({ lat: 40.4, lon: -3.7 }, [{ headingDeg: N, distM: 90_000 }], 25);
    const { blocks, summary } = analyze(route, new Date('2026-06-21T06:30:00Z'));

    expect(blocks.every((b) => b.sunSide === 'right')).toBe(true);
    expect(summary.rightSec).toBeGreaterThan(0);
    expect(summary.leftSec).toBe(0);
    expect(summary.avoidSide).toBe('left');
  });

  test('southbound morning drive: sun on the left, recommend sitting RIGHT', () => {
    const route = drive({ lat: 41.2, lon: -3.7 }, [{ headingDeg: S, distM: 90_000 }], 25);
    const { summary } = analyze(route, new Date('2026-06-21T06:30:00Z'));
    expect(summary.leftSec).toBeGreaterThan(0);
    expect(summary.avoidSide).toBe('right');
  });

  test('summarize never recommends the side the sun is on', () => {
    const verdict = classifySun({ azimuth: 90, elevation: 30 }, N);
    const summary = summarize([
      { sunSide: verdict.sunSide, durationSec: 3600, startSec: 0, points: [], strong: false },
    ]);
    expect(verdict.sunSide).toBe('right');
    expect(summary.avoidSide).not.toBe(verdict.sunSide);
    expect(summary.avoidSide).toBe('left');
  });
});
