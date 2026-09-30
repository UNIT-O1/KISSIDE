import { describe, expect, test } from 'vitest';
import { renderTimeline } from '../src/ui/timeline';
import type { Block } from '../src/core/types';

function block(sunSide: Block['sunSide'], minutes: number, strong = false, startSec = 0): Block {
  return { sunSide, durationSec: minutes * 60, startSec, points: [], strong };
}

describe('renderTimeline', () => {
  test('letters follow the seat, not the sun side, and flip with mode', () => {
    const blocks = [
      block('right', 60),
      block('left', 60, false, 3600),
      block('none', 30, false, 7200),
    ];
    const el = document.createElement('div');

    renderTimeline(el, blocks, 'avoid');
    const avoidLetters = [...el.querySelectorAll('.timeline-rows .letter')].map(
      (n) => n.textContent,
    );
    expect(avoidLetters).toEqual(['L', 'R', '–']);

    renderTimeline(el, blocks, 'seek');
    const seekLetters = [...el.querySelectorAll('.timeline-rows .letter')].map(
      (n) => n.textContent,
    );
    expect(seekLetters).toEqual(['R', 'L', '–']);
  });

  test('fill pattern differs for strong glare, side sun, and neither (not colour alone)', () => {
    const blocks = [block('right', 60, true), block('left', 60, false), block('dark', 60)];
    const el = document.createElement('div');
    renderTimeline(el, blocks, 'avoid');
    const classes = [...el.querySelectorAll('.timeline-bar .seg')].map((n) => n.className);
    expect(classes).toEqual(['seg fill-strong', 'seg fill-side', 'seg fill-empty']);
  });

  test('the bar is decorative; rows carry the accessible information', () => {
    const el = document.createElement('div');
    renderTimeline(el, [block('right', 60)], 'avoid');
    expect(el.querySelector('.timeline-bar')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.timeline-rows')).not.toBeNull();
  });

  test('a short segment still shows its letter and duration in the row even if too narrow for the bar', () => {
    const blocks = [block('right', 1), block('left', 99)];
    const el = document.createElement('div');
    renderTimeline(el, blocks, 'avoid');
    const barSegs = [...el.querySelectorAll('.timeline-bar .seg')];
    expect(barSegs[0]!.textContent).toBe(''); // 1% is below the label threshold
    const rows = [...el.querySelectorAll('.timeline-rows li')];
    expect(rows[0]!.textContent).toContain('L');
    expect(rows[0]!.textContent).toContain('1m');
  });

  test('strong glare is called out in the row text, not just the fill pattern', () => {
    const el = document.createElement('div');
    renderTimeline(el, [block('left', 20, true)], 'avoid');
    expect(el.querySelector('.glare')!.textContent).toMatch(/glare/i);
  });

  test('legend explains the letters as text', () => {
    const el = document.createElement('div');
    renderTimeline(el, [block('right', 20)], 'avoid');
    expect(el.querySelector('.legend')!.textContent).toBe('L = sit leftR = sit right– = either');
  });

  test('an empty trip renders the heading without crashing', () => {
    const el = document.createElement('div');
    expect(() => renderTimeline(el, [], 'avoid')).not.toThrow();
    expect(el.querySelector('h2')!.textContent).toBe('Timeline');
  });
});
