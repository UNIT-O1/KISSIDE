// Merges same-side segments into blocks and absorbs short blocks. Whitepaper 4.7.
import { MIN_BLOCK_DURATION_SEC } from '../config';
import type { Block, LatLon, Segment, Verdict } from './types';

/** Merges consecutive segments that share a sun side into blocks. verdicts[i] belongs to segments[i]. */
export function mergeBlocks(segments: Segment[], verdicts: Verdict[]): Block[] {
  const blocks = segments.map((seg, i): Block => {
    const v = verdicts[i]!;
    return {
      sunSide: v.sunSide,
      durationSec: seg.durationSec,
      startSec: seg.startTime,
      points: seg.points.map(({ lat, lon }) => ({ lat, lon })),
      strong: v.strong,
    };
  });
  return mergeAdjacent(blocks);
}

/**
 * Absorbs blocks shorter than MIN_BLOCK_DURATION_SEC into their longer neighbour, shortest first,
 * re-merging equal neighbours after each step. A lone block is always kept.
 */
export function absorbShortBlocks(
  blocks: Block[],
  minDurationSec: number = MIN_BLOCK_DURATION_SEC,
): Block[] {
  let out = mergeAdjacent(blocks);
  for (;;) {
    let idx = -1;
    out.forEach((b, i) => {
      if (b.durationSec < minDurationSec && (idx < 0 || b.durationSec < out[idx]!.durationSec)) {
        idx = i;
      }
    });
    if (idx < 0 || out.length < 2) return out;

    const prev = out[idx - 1];
    const next = out[idx + 1];
    const target = !next || (prev && prev.durationSec >= next.durationSec) ? idx - 1 : idx + 1;
    const [a, b] = target < idx ? [out[target]!, out[idx]!] : [out[idx]!, out[target]!];
    const keep = out[target]!;
    const merged: Block = { ...join(a, b), sunSide: keep.sunSide, strong: keep.strong };
    const lo = Math.min(idx, target);
    out = mergeAdjacent([...out.slice(0, lo), merged, ...out.slice(lo + 2)]);
  }
}

function mergeAdjacent(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    const last = out[out.length - 1];
    if (last && last.sunSide === b.sunSide) out[out.length - 1] = join(last, b);
    else out.push({ ...b, points: [...b.points] });
  }
  return out;
}

/** Joins two consecutive same-side blocks. `strong` if any part was strong. */
function join(a: Block, b: Block): Block {
  const first = b.points[0];
  const tail = a.points[a.points.length - 1];
  const skipShared = first && tail && samePoint(first, tail);
  return {
    sunSide: a.sunSide,
    durationSec: a.durationSec + b.durationSec,
    startSec: a.startSec,
    points: [...a.points, ...(skipShared ? b.points.slice(1) : b.points)],
    strong: a.strong || b.strong,
  };
}

function samePoint(p: LatLon, q: LatLon): boolean {
  return p.lat === q.lat && p.lon === q.lon;
}
