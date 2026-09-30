import { describe, expect, test } from 'vitest';
import { absorbShortBlocks, mergeBlocks } from '../src/core/merge';
import { summarize } from '../src/core/summary';
import type { Segment, Verdict } from '../src/core/types';
import { blocks } from './helpers';

const sides = (bs: { sunSide: string; durationSec: number }[]) =>
  bs.map((b) => [b.sunSide, b.durationSec / 60]);

describe('mergeBlocks', () => {
  const seg = (start: number, end: number, lat0: number, lat1: number): Segment => ({
    points: [
      { lat: lat0, lon: 0, cumTime: start, cumDist: 0 },
      { lat: lat1, lon: 0, cumTime: end, cumDist: 0 },
    ],
    startTime: start,
    endTime: end,
    durationSec: end - start,
    bearing: 0,
  });
  const v = (sunSide: Verdict['sunSide'], strong = false): Verdict => ({
    sunSide,
    strong,
    reason: '',
  });

  test('consecutive same-side segments merge, sharing their boundary point', () => {
    const segs = [seg(0, 600, 0, 1), seg(600, 1200, 1, 2), seg(1200, 1500, 2, 3)];
    const out = mergeBlocks(segs, [v('right'), v('right', true), v('left')]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      sunSide: 'right',
      startSec: 0,
      durationSec: 1200,
      strong: true,
    });
    expect(out[0]!.points.map((p) => p.lat)).toEqual([0, 1, 2]);
    expect(out[1]).toMatchObject({ sunSide: 'left', startSec: 1200, durationSec: 300 });
  });

  test('no segments -> no blocks', () => {
    expect(mergeBlocks([], [])).toEqual([]);
  });
});

describe('absorbShortBlocks (whitepaper 4.7)', () => {
  test('a 2-minute flip inside a long block disappears', () => {
    const out = absorbShortBlocks(blocks(['left', 30], ['right', 2], ['left', 30]));
    expect(sides(out)).toEqual([['left', 62]]);
    expect(summarize(out).switches).toBe(0);
  });

  test('the longer neighbour wins', () => {
    const out = absorbShortBlocks(blocks(['left', 10], ['none', 3], ['right', 40]));
    expect(sides(out)).toEqual([
      ['left', 10],
      ['right', 43],
    ]);
    expect(out[1]!.startSec).toBe(10 * 60);
  });

  test('a short block at the start or end joins its only neighbour', () => {
    expect(sides(absorbShortBlocks(blocks(['dark', 4], ['right', 30])))).toEqual([['right', 34]]);
    expect(sides(absorbShortBlocks(blocks(['right', 30], ['none', 1])))).toEqual([['right', 31]]);
  });

  test('blocks of exactly 5 minutes are kept', () => {
    const out = absorbShortBlocks(blocks(['left', 20], ['right', 5], ['left', 20]));
    expect(sides(out)).toEqual([
      ['left', 20],
      ['right', 5],
      ['left', 20],
    ]);
  });

  test('a single short block is kept', () => {
    expect(sides(absorbShortBlocks(blocks(['right', 3])))).toEqual([['right', 3]]);
  });

  test('shortest goes first, and neighbours re-merge after each absorption', () => {
    // The 1-min 'none' goes into right (4) first, making right 5 min, which then survives.
    const out = absorbShortBlocks(
      blocks(['left', 20], ['right', 4], ['none', 1], ['left', 3], ['right', 20]),
    );
    // left 3 < 5 is absorbed next into its longer neighbour (right 20).
    expect(sides(out)).toEqual([
      ['left', 20],
      ['right', 28],
    ]);
    expect(summarize(out).switches).toBe(1);
  });

  test('consecutive no-preference blocks merge', () => {
    const out = absorbShortBlocks(blocks(['none', 10], ['none', 10], ['right', 20]));
    expect(sides(out)).toEqual([
      ['none', 20],
      ['right', 20],
    ]);
  });

  test('a strong sliver absorbed into another side does not mark it strong', () => {
    const input = blocks(['none', 30], ['left', 2], ['none', 30]);
    input[1]!.strong = true;
    expect(absorbShortBlocks(input)[0]!.strong).toBe(false);
  });

  test('durations are conserved', () => {
    const input = blocks(['left', 7], ['right', 1], ['none', 2], ['left', 9], ['dark', 4]);
    const total = (bs: typeof input) => bs.reduce((a, b) => a + b.durationSec, 0);
    expect(total(absorbShortBlocks(input))).toBe(total(input));
  });
});
