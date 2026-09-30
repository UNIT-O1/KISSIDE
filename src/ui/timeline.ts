// Timeline of side changes: letters (L/R/-) plus fill pattern, not colour alone. Whitepaper 6.4, 6.6.
import { oppositeSide, seatForMode, type SunMode } from '../core/summary';
import type { Block } from '../core/types';
import { formatDuration, formatElapsed } from './format';

type Letter = 'L' | 'R' | '–'; // – = either

// Below this share of the bar's width, a letter would be unreadable; the row list underneath
// always has the full text regardless.
const MIN_LABEL_SHARE = 0.06;

function letterFor(block: Block, mode: SunMode): Letter {
  if (block.sunSide !== 'left' && block.sunSide !== 'right') return '–';
  const seat = seatForMode(oppositeSide(block.sunSide), mode);
  return seat === 'left' ? 'L' : 'R';
}

export function renderTimeline(container: HTMLElement, blocks: Block[], mode: SunMode): void {
  container.replaceChildren();

  const heading = document.createElement('h2');
  heading.textContent = 'Timeline';
  container.append(heading);

  const totalSec = blocks.reduce((a, b) => a + b.durationSec, 0);
  if (totalSec === 0 || blocks.length === 0) return;

  const bar = document.createElement('div');
  bar.className = 'timeline-bar';
  bar.setAttribute('aria-hidden', 'true'); // decorative; the rows below carry the information

  for (const b of blocks) {
    const share = b.durationSec / totalSec;
    const seg = document.createElement('span');
    seg.className = `seg ${fillClass(b)}`;
    seg.style.width = `${share * 100}%`;
    if (share >= MIN_LABEL_SHARE) seg.textContent = letterFor(b, mode);
    bar.append(seg);
  }
  container.append(bar);

  const legend = document.createElement('p');
  legend.className = 'legend';
  legend.append(span('L = sit left'), span('R = sit right'), span('– = either'));
  container.append(legend);

  const rows = document.createElement('ul');
  rows.className = 'timeline-rows';
  for (const b of blocks) {
    const li = document.createElement('li');
    const time = document.createElement('span');
    time.className = 'mono';
    time.textContent = formatElapsed(b.startSec);
    const letter = document.createElement('span');
    letter.className = 'letter';
    letter.textContent = letterFor(b, mode);
    const duration = document.createElement('span');
    duration.className = 'mono';
    duration.textContent = formatDuration(b.durationSec);
    li.append(time, letter, duration);
    if (b.strong) {
      const glare = document.createElement('span');
      glare.className = 'glare';
      glare.textContent = 'Low sun, strong glare';
      li.append(glare);
    }
    rows.append(li);
  }
  container.append(rows);
}

function fillClass(b: Block): string {
  if (b.sunSide !== 'left' && b.sunSide !== 'right') return 'fill-empty';
  return b.strong ? 'fill-strong' : 'fill-side';
}

function span(text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.textContent = text;
  return el;
}
