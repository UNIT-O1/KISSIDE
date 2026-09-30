// URL-hash state for shareable links. Whitepaper 5.7.
import type { TripInput } from './form';

export function encodeTripToHash(trip: TripInput): string {
  throw new Error(`not implemented (milestone 5): encodeTripToHash(${JSON.stringify(trip)})`);
}

export function decodeTripFromHash(hash: string): TripInput | null {
  throw new Error(`not implemented (milestone 5): decodeTripFromHash(${hash})`);
}
