// macOS reports shared system/GPU memory, not just the model file size.
export function swapMiB(text) {
  const used = text.match(/used\s*=\s*([\d.]+)([KMG])/u);
  return used
    ? Number(used[1]) * { K: 1 / 1024, M: 1, G: 1024 }[used[2]]
    : null;
}
export function memoryStopReason(before, current) {
  const initialSwap = swapMiB(before.swap),
    nowSwap = swapMiB(current.swap);
  const free = current.pressure.match(/free percentage:\s*(\d+)%/u);
  if (
    (initialSwap !== null &&
      nowSwap !== null &&
      nowSwap - initialSwap >= 1024) ||
    (free && Number(free[1]) < 10)
  )
    return "Memory limit: swap grew by at least 1 GiB or system memory free fell below 10%. Remaining cases were not run.";
  return null;
}
