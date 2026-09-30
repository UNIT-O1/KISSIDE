import { describe, expect, test } from 'vitest';
import { renderVerdict } from '../src/ui/verdict';
import type { Summary } from '../src/core/types';

function summary(over: Partial<Summary>): Summary {
  return { avoidSide: 'either', leftSec: 0, rightSec: 0, switches: 0, ...over };
}

describe('renderVerdict', () => {
  test('sun mostly on the right -> "Sit LEFT" in avoid mode', () => {
    const el = document.createElement('div');
    renderVerdict(el, summary({ avoidSide: 'left', rightSec: 7800, leftSec: 0 }), 11_000, 'avoid');
    expect(el.querySelector('.verdict-word')!.textContent).toBe('Sit LEFT');
    expect(el.querySelector('.verdict-detail')!.textContent).toBe(
      'Sun hits the right side for 2h 10m of 3h 3m.',
    );
  });

  test('seek mode flips the seat but not the sun description', () => {
    const el = document.createElement('div');
    renderVerdict(el, summary({ avoidSide: 'left', rightSec: 7800 }), 11_000, 'seek');
    expect(el.querySelector('.verdict-word')!.textContent).toBe('Sit RIGHT');
    expect(el.querySelector('.verdict-detail')!.textContent).toContain('Sun hits the right side');
  });

  test('switch and either are not affected by mode', () => {
    const el = document.createElement('div');
    renderVerdict(el, summary({ avoidSide: 'switch', leftSec: 100, rightSec: 90 }), 200, 'seek');
    expect(el.querySelector('.verdict-word')!.textContent).toBe("It's close: plan to switch");

    renderVerdict(el, summary({ avoidSide: 'either' }), 600, 'seek');
    expect(el.querySelector('.verdict-word')!.textContent).toBe("Doesn't matter");
    expect(el.querySelector('.verdict-detail')!.textContent).toBe('No direct sun on this trip.');
  });

  test('is announced via a live region (whitepaper 6.6)', () => {
    const el = document.createElement('div');
    renderVerdict(el, summary({ avoidSide: 'right', leftSec: 50 }), 50, 'avoid');
    expect(el.getAttribute('aria-live')).toBe('polite');
  });

  test('an equal split says so', () => {
    const el = document.createElement('div');
    renderVerdict(
      el,
      summary({ avoidSide: 'switch', leftSec: 6000, rightSec: 6000 }),
      12_000,
      'avoid',
    );
    expect(el.querySelector('.verdict-detail')!.textContent).toBe(
      'Sun hits both sides about equally over 3h 20m.',
    );
  });

  test('re-rendering replaces the previous content', () => {
    const el = document.createElement('div');
    renderVerdict(el, summary({ avoidSide: 'left', rightSec: 100 }), 100, 'avoid');
    renderVerdict(el, summary({ avoidSide: 'right', leftSec: 100 }), 100, 'avoid');
    expect(el.querySelectorAll('.verdict-word')).toHaveLength(1);
    expect(el.querySelector('.verdict-word')!.textContent).toBe('Sit RIGHT');
  });
});
