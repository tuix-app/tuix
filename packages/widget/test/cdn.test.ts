// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ tuix: { init: vi.fn(), identify: vi.fn(), open: vi.fn(), close: vi.fn(), config: vi.fn(), destroy: vi.fn() }, openFromLoader: vi.fn(), settingsFromLoader: vi.fn() }));
vi.mock('../src/index', () => sdk);

it('replays the loader queue, keeping a queued report filter and activation times', async () => {
  const scope = window as Window & { tuix?: { (command: string, value?: unknown): unknown; q?: unknown[][]; loaded?: boolean } };
  const filter = { show: 'verify', involving: 'me' };
  scope.tuix = Object.assign(() => {}, { q: [['init', { project: 'queued' }], ['identify', { id: 'a' }], ['open', filter, 120], ['comment', undefined, 130], ['settings', undefined, undefined], ['bogus', 1]] });
  await import('../src/cdn');
  expect(sdk.tuix.init).toHaveBeenCalledWith({ project: 'queued' });
  expect(sdk.tuix.identify).toHaveBeenCalledWith({ id: 'a' });
  expect(sdk.openFromLoader.mock.calls).toEqual([[120, 'reports', filter], [130, 'comment']]);
  expect(sdk.settingsFromLoader).toHaveBeenCalledOnce();
  expect(scope.tuix.loaded).toBe(true);
  // After loading, the public queue function passes the filter straight through.
  scope.tuix('open', { show: 'all' });
  expect(sdk.tuix.open).toHaveBeenCalledWith({ show: 'all' });
});
