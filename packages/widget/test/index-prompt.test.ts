// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({
  request: vi.fn(), loaded: false, mounts: [] as { sync: ReturnType<typeof vi.fn>; suppress: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn>; options: { onCheck: (id: string) => void; isOpen: () => boolean } }[],
  hooks: undefined as undefined | { engaged?: () => void }, onPanel: undefined as undefined | ((active: boolean) => void), core: undefined as undefined | Record<string, ReturnType<typeof vi.fn>>, count: 0,
}));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
vi.mock('../src/verify-prompt', () => {
  mock.loaded = true;
  return { mountVerifyPrompt: (_root: unknown, _launcher: unknown, _config: unknown, options: never) => {
    const fake = { sync: vi.fn(), suppress: vi.fn(), destroy: vi.fn(), options }; mock.mounts.push(fake); return fake;
  } };
});
vi.mock('../src/core', () => ({ mount: (_root: unknown, _launcher: unknown, _config: unknown, _user: unknown, onPanel: (active: boolean) => void, _started: unknown, hooks: { engaged?: () => void }) => {
  mock.hooks = hooks; mock.onPanel = onPanel;
  mock.core = { open: vi.fn(() => onPanel(true)), comment: vi.fn(), close: vi.fn(), destroy: vi.fn(), openIssue: vi.fn(() => onPanel(true)), settings: vi.fn() };
  return mock.core;
} }));
import { tuix, settingsFromLoader } from '../src/index';
let name = 0, project = '';
let toVerify = 0;
beforeEach(() => {
  vi.useFakeTimers(); project = 'wiring-' + name++; toVerify = 0; mock.mounts.length = 0; mock.hooks = undefined; mock.core = undefined;
  mock.request.mockReset(); mock.request.mockImplementation(async (path: string) => path.startsWith('/me/summary') ? { to_verify: toVerify, assigned_active: 0 } : { notifications: [], issues: [] });
  localStorage.setItem('tuix:active:' + project, String(Date.now()));
});
afterEach(() => { tuix.destroy(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); document.body.replaceChildren(); history.replaceState({}, '', '/'); });
async function start(pinned = false) {
  if (pinned) localStorage.setItem('tuix:markers:' + project, 'on:dot');
  tuix.init({ project }); tuix.identify({ id: 'u', name: 'U' });
  await vi.advanceTimersByTimeAsync(1500);
}
/** A remounted widget loads its summary again once the page is idle. */
async function remount() { tuix.config({}); await vi.advanceTimersByTimeAsync(1500); }

it('loads the card only once there is something to verify, and keeps one card across later summaries', async () => {
  await start();
  expect(mock.request).toHaveBeenCalledWith('/me/summary');
  expect(mock.loaded).toBe(false); expect(mock.mounts.length).toBe(0);
  toVerify = 2; await remount();
  expect(mock.loaded).toBe(true); expect(mock.mounts.length).toBe(1);
  expect(mock.mounts[0].sync).toHaveBeenLastCalledWith(2);
});

it('suppresses the card when the panel opens, Settings opens or a chat window opens', async () => {
  toVerify = 1; await start(true);
  expect(mock.mounts.length).toBe(1);
  const [card] = mock.mounts;
  // A chat window beside a pin reports itself through the core's hook.
  expect(mock.hooks?.engaged).toBeTypeOf('function');
  mock.hooks!.engaged!(); expect(card.suppress).toHaveBeenCalledTimes(1);
  card.suppress.mockClear();
  settingsFromLoader(); expect(card.suppress).toHaveBeenCalled();
  card.suppress.mockClear();
  void tuix.open(); await vi.advanceTimersByTimeAsync(10);
  expect(card.suppress).toHaveBeenCalled();
});

it('Check it opens the report even when the core is not loaded yet, and the panel is then open for the card', async () => {
  toVerify = 1; await start();
  expect(mock.core).toBeUndefined();
  mock.mounts[0].options.onCheck('report-1');
  await vi.advanceTimersByTimeAsync(10);
  expect(mock.core!.openIssue).toHaveBeenCalledWith('report-1');
  expect(mock.core!.open).not.toHaveBeenCalled();
  expect(mock.mounts[0].options.isOpen()).toBe(true);
  // With the core loaded, a second Check it goes straight to it.
  mock.mounts[0].options.onCheck('report-2');
  expect(mock.core!.openIssue).toHaveBeenLastCalledWith('report-2');
});

it('keeps the card away for the page load after config() or identify() remount the widget', async () => {
  toVerify = 1; await start();
  mock.mounts[0].options.onCheck('r'); await vi.advanceTimersByTimeAsync(10);
  expect(mock.mounts[0].suppress).toHaveBeenCalled();
  mock.mounts.length = 0;
  await remount();
  tuix.identify({ id: 'u', name: 'U' }); await vi.advanceTimersByTimeAsync(1500);
  expect(mock.mounts.length).toBe(0);
});
