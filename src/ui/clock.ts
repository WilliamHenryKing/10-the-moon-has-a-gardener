/** Round the whole duration first, so a medal can never read 1:60. */
export function clock(seconds: number) {
  const total = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
