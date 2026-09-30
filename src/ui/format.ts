// Text formatting for the UI. Whitepaper 6.4 uses "2h 10m" and elapsed "H:MM" (monospace).

/** "2h 10m" or "45m". */
export function formatDuration(sec: number): string {
  const totalMin = Math.round(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Elapsed time since departure, as "H:MM" (no leading zero on hours). */
export function formatElapsed(sec: number): string {
  const totalMin = Math.floor(sec / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}
