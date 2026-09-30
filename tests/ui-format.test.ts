import { describe, expect, test } from 'vitest';
import { formatDuration, formatElapsed } from '../src/ui/format';

describe('formatDuration', () => {
  test('hours and minutes', () => {
    expect(formatDuration(2 * 3600 + 10 * 60)).toBe('2h 10m');
  });
  test('minutes only', () => {
    expect(formatDuration(45 * 60)).toBe('45m');
  });
  test('zero', () => {
    expect(formatDuration(0)).toBe('0m');
  });
  test('rounds to the nearest minute', () => {
    expect(formatDuration(89)).toBe('1m');
    expect(formatDuration(29)).toBe('0m');
  });
  test('minutes rounding up to a full hour carries over', () => {
    expect(formatDuration(59 * 60 + 45)).toBe('1h 0m');
  });
});

describe('formatElapsed', () => {
  test('pads minutes but not hours', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(65 * 60)).toBe('1:05');
    expect(formatElapsed(12 * 3600 + 5 * 60)).toBe('12:05');
  });
  test('truncates, does not round', () => {
    expect(formatElapsed(3599)).toBe('0:59');
  });
});
