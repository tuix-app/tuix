import { afterEach, expect, it, vi } from 'vitest';
import { frameBatch } from '../src/frame-batch';

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function frames() {
  let id = 0;
  const pending = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { pending.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => pending.delete(key));
  return () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(0)); };
}

it('yields even for cheap work and publishes ordered results only when complete', () => {
  const tick = frames(), complete = vi.fn(), map = vi.fn((n: number) => n * 2);
  vi.spyOn(performance, 'now').mockReturnValue(0);
  frameBatch(Array.from({ length: 20 }, (_, i) => i), map, complete);
  expect(map).not.toHaveBeenCalled();
  tick(); expect(map).toHaveBeenCalledTimes(8); expect(complete).not.toHaveBeenCalled();
  tick(); expect(map).toHaveBeenCalledTimes(16);
  tick(); expect(complete).toHaveBeenCalledExactlyOnceWith(Array.from({ length: 20 }, (_, i) => i * 2));
});

it('yields after expensive work and drops cancelled partial results', () => {
  const tick = frames(), complete = vi.fn();
  let time = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => time);
  const map = vi.fn((n: number) => { time += 9; return n; });
  const cancel = frameBatch([1, 2, 3], map, complete);
  tick(); expect(map).toHaveBeenCalledTimes(1);
  cancel(); tick(); expect(map).toHaveBeenCalledTimes(1); expect(complete).not.toHaveBeenCalled();
  frameBatch([4], map, complete); tick(); expect(complete).toHaveBeenCalledExactlyOnceWith([4]);
});

it('cancels before starting and completes empty inputs on a frame', () => {
  const tick = frames(), complete = vi.fn();
  frameBatch([1], n => n, complete)(); tick(); expect(complete).not.toHaveBeenCalled();
  frameBatch([], n => n, complete); tick(); expect(complete).toHaveBeenCalledExactlyOnceWith([]);
});
