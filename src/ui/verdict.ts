// Verdict hero display. Shows the RECOMMENDED (opposite of sun) side. Whitepaper 4.6, 6.4, 6.6.
import { seatForMode, type SunMode } from '../core/summary';
import type { Summary } from '../core/types';
import { formatDuration } from './format';

export function renderVerdict(
  container: HTMLElement,
  summary: Summary,
  totalSec: number,
  mode: SunMode,
): void {
  container.replaceChildren();
  container.className = 'verdict';
  container.setAttribute('aria-live', 'polite');

  const word = document.createElement('p');
  word.className = 'verdict-word';
  word.textContent = wordFor(seatForMode(summary.avoidSide, mode));

  const detail = document.createElement('p');
  detail.className = 'verdict-detail';
  detail.textContent = detailFor(summary, totalSec);

  container.append(word, detail);
}

function wordFor(seat: Summary['avoidSide']): string {
  switch (seat) {
    case 'left':
      return 'Sit LEFT';
    case 'right':
      return 'Sit RIGHT';
    case 'switch':
      return "It's close: plan to switch";
    case 'either':
      return "Doesn't matter";
  }
}

function detailFor(summary: Summary, totalSec: number): string {
  const { leftSec, rightSec } = summary;
  if (leftSec === 0 && rightSec === 0) return 'No direct sun on this trip.';
  if (leftSec === rightSec) {
    return `Sun hits both sides about equally over ${formatDuration(totalSec)}.`;
  }
  const side = rightSec > leftSec ? 'right' : 'left';
  const exposed = Math.max(leftSec, rightSec);
  return `Sun hits the ${side} side for ${formatDuration(exposed)} of ${formatDuration(totalSec)}.`;
}
