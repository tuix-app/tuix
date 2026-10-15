/** Yield between small batches; cancellation also suppresses completion. */
export function frameBatch<T, R>(items: readonly T[], map: (item: T) => R, complete: (results: R[]) => void): () => void {
  let index = 0, cancelled = false;
  const results: R[] = [];
  const step = () => {
    if (cancelled) return;
    const start = performance.now();
    let count = 0;
    while (index < items.length && !cancelled) {
      results.push(map(items[index++]));
      if (++count >= 8 || performance.now() - start >= 8) break;
    }
    if (cancelled) return;
    if (index < items.length) frame = requestAnimationFrame(step);
    else complete(results);
  };
  let frame = requestAnimationFrame(step);
  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
