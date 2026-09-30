// Overall recommendation and switch count across blocks. Whitepaper 4.6, 4.8.
// SIGN CONVENTION: blocks carry the SUN side; the seat that avoids the sun is the OPPOSITE side.
// The prototype recommended the sun side itself; the regression tests pin this.
import { DOMINANCE_RATIO } from '../config';
import type { Block, Summary } from './types';

type Side = 'left' | 'right';
export type SunMode = 'avoid' | 'seek';

export function oppositeSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

export function summarize(blocks: Block[]): Summary {
  let leftSec = 0;
  let rightSec = 0;
  for (const b of blocks) {
    if (b.sunSide === 'left') leftSec += b.durationSec;
    if (b.sunSide === 'right') rightSec += b.durationSec;
  }

  let avoidSide: Summary['avoidSide'];
  if (leftSec === 0 && rightSec === 0) avoidSide = 'either';
  else if (rightSec >= DOMINANCE_RATIO * leftSec) avoidSide = oppositeSide('right');
  else if (leftSec >= DOMINANCE_RATIO * rightSec) avoidSide = oppositeSide('left');
  else avoidSide = 'switch';

  return { avoidSide, leftSec, rightSec, switches: countSwitches(blocks) };
}

/** Seat changes: changes of sun side between consecutive side-exposed blocks (none/dark ignored). */
function countSwitches(blocks: Block[]): number {
  let switches = 0;
  let current: Side | null = null;
  for (const b of blocks) {
    if (b.sunSide !== 'left' && b.sunSide !== 'right') continue;
    if (current && current !== b.sunSide) switches++;
    current = b.sunSide;
  }
  return switches;
}

/** Seat to show for a given mode. "Seek the sun" is a pure view flip of the avoid seat (4.6). */
export function seatForMode(avoidSide: Summary['avoidSide'], mode: SunMode): Summary['avoidSide'] {
  if (mode === 'avoid' || avoidSide === 'either' || avoidSide === 'switch') return avoidSide;
  return oppositeSide(avoidSide);
}
