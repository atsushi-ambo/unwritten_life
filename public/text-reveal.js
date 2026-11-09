export function revealEnabled(saved, reducedMotion) {
  return saved === 'on' ? true : saved === 'off' ? false : !reducedMotion;
}
export function revealCount(length, elapsed, skipped = false) {
  if (skipped || length <= 0) return length;
  const duration = Math.min(5000, length * 25);
  return Math.min(length, Math.floor(length * Math.max(0, elapsed) / duration));
}
