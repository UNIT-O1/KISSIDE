import { describe, expect, test } from 'vitest';
import { seatForMode, summarize } from '../src/core/summary';
import { blocks } from './helpers';

describe('summarize (whitepaper 4.8)', () => {
  test('sun mostly on the right -> sit left', () => {
    const s = summarize(blocks(['right', 130], ['none', 20], ['left', 35]));
    expect(s).toEqual({ avoidSide: 'left', leftSec: 35 * 60, rightSec: 130 * 60, switches: 1 });
  });

  test('sun mostly on the left -> sit right', () => {
    expect(summarize(blocks(['left', 60], ['right', 20])).avoidSide).toBe('right');
  });

  test('only one side exposed -> sit on the other', () => {
    expect(summarize(blocks(['left', 6])).avoidSide).toBe('right');
  });

  test('exactly 1.3x is enough to be confident', () => {
    expect(summarize(blocks(['right', 13], ['left', 10])).avoidSide).toBe('left');
  });

  test('a near-even split -> plan to switch', () => {
    expect(summarize(blocks(['right', 55], ['left', 45])).avoidSide).toBe('switch');
    expect(summarize(blocks(['right', 12], ['left', 10])).avoidSide).toBe('switch');
  });

  test('no side exposure -> either', () => {
    expect(summarize(blocks(['none', 60], ['dark', 60])).avoidSide).toBe('either');
    expect(summarize([]).avoidSide).toBe('either');
  });

  test('switches count side changes and ignore none/dark in between', () => {
    expect(summarize(blocks(['right', 20], ['none', 10], ['right', 20])).switches).toBe(0);
    expect(summarize(blocks(['right', 20], ['dark', 10], ['left', 20])).switches).toBe(1);
    expect(summarize(blocks(['left', 9], ['right', 9], ['left', 9], ['right', 9])).switches).toBe(
      3,
    );
  });
});

describe('seatForMode (whitepaper 4.6 toggle)', () => {
  test('avoid shows the avoid seat; seek flips left/right', () => {
    expect(seatForMode('left', 'avoid')).toBe('left');
    expect(seatForMode('left', 'seek')).toBe('right');
    expect(seatForMode('right', 'seek')).toBe('left');
  });

  test('either and switch are unchanged by the toggle', () => {
    expect(seatForMode('either', 'seek')).toBe('either');
    expect(seatForMode('switch', 'seek')).toBe('switch');
  });
});
