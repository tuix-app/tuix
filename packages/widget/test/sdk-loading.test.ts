// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => {
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  return { gate, finish, mount: vi.fn((..._args: unknown[]) => ({ open: vi.fn(), comment: vi.fn(), close: vi.fn(), destroy: vi.fn() })) };
});
vi.mock('../src/core', async () => { await mock.gate; return { mount: mock.mount }; });
import { tuix } from '../src/index';
afterEach(() => { tuix.destroy(); vi.restoreAllMocks(); });

it('uses the latest activation when reopened during a deferred core import', async () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(100);
  tuix.init({ project: 'fixture' }); tuix.identify({ id: 'fixture', name: 'Fixture' });
  const first = tuix.open();
  tuix.close();
  now.mockReturnValue(60100);
  const second = tuix.open();
  mock.finish(); await Promise.all([first, second]);
  expect(mock.mount).toHaveBeenCalledTimes(1);
  expect(mock.mount.mock.calls[0][5]).toBe(60100);
});

it('preserves valid loader timing and rejects invalid or future timestamps', async () => {
  const { openFromLoader } = await import('../src/index');
  vi.spyOn(performance, 'now').mockReturnValue(5000);
  for (const [input, expected] of [[100, 100], [-1, 5000], [Infinity, 5000], [6000, 5000], ['100', 5000]]) {
    mock.mount.mockClear();
    tuix.init({ project: 'fixture' }); tuix.identify({ id: 'fixture', name: 'Fixture' });
    await openFromLoader(input);
    expect(mock.mount.mock.calls[0][5]).toBe(expected);
    tuix.destroy();
  }
});
it('keeps launcher comment intent separate from public report browsing', async () => {
  let root!: ShadowRoot; const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { root = attach.call(this, options); return root; });
  tuix.init({ project: 'launcher' }); tuix.identify({ id: 'fixture', name: 'Fixture' });
  root.querySelector<HTMLButtonElement>('#tuix-launcher')!.click();
  await vi.waitFor(() => expect(mock.mount.mock.results[mock.mount.mock.results.length - 1]?.value.comment).toHaveBeenCalledOnce());
  tuix.close(); await tuix.open();
  expect(mock.mount.mock.results[mock.mount.mock.results.length - 1].value.open).toHaveBeenCalledOnce();
});

it('closes an open feedback panel when the settings dot opens, and the launcher still toggles correctly', async () => {
  let root!: ShadowRoot; const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { root = attach.call(this, options); return root; });
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  let panel!: (active: boolean) => void; const order: string[] = [];
  mock.mount.mockImplementationOnce((...args: unknown[]) => {
    panel = args[4] as typeof panel;
    return { open: vi.fn(), comment: vi.fn(), destroy: vi.fn(), close: vi.fn(() => { order.push('core.close'); panel(false); }) };
  });
  tuix.init({ project: 'exclusive' }); tuix.identify({ id: 'fixture', name: 'Fixture' });
  const launcher = root.querySelector<HTMLButtonElement>('#tuix-launcher')!, flyout = root.querySelector<HTMLElement>('#tuix-settings')!;
  const toggle = root.querySelector<HTMLButtonElement>('#tuix-settings-toggle')!, reports = root.querySelector<HTMLButtonElement>('#tuix-reports-toggle')!;
  launcher.dispatchEvent(new MouseEvent('mouseenter')); toggle.dispatchEvent(new MouseEvent('mouseenter')); reports.dispatchEvent(new MouseEvent('mouseenter'));
  expect(fetch).not.toHaveBeenCalled();
  launcher.click();
  await vi.waitFor(() => expect(mock.mount).toHaveBeenCalled());
  const core = mock.mount.mock.results[mock.mount.mock.results.length - 1].value;
  panel(true);
  toggle.click();
  expect(order).toEqual(['core.close']);
  expect(flyout.hidden).toBe(false);
  expect(root.activeElement).toBe(toggle);
  // The panel is closed, so the next launcher click opens rather than closes.
  launcher.click(); await vi.waitFor(() => expect(core.comment).toHaveBeenCalledTimes(2));
  expect(flyout.hidden).toBe(true);
  // Reports closes the flyout.
  toggle.click(); expect(flyout.hidden).toBe(false);
  reports.click(); await vi.waitFor(() => expect(core.open).toHaveBeenCalled());
  expect(flyout.hidden).toBe(true);
  vi.unstubAllGlobals();
});

function captureRoot() {
  const handle: { root?: ShadowRoot } = {}; const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { handle.root = attach.call(this, options); return handle.root; });
  return handle;
}
/** A fake API origin answering identify and the summary. */
function api(summary: object = { to_verify: 2, assigned_active: 3 }) {
  const fetch = vi.fn(async (url: string, _init?: RequestInit) => ({ ok: true, status: 200, json: async () => url.endsWith('/identify') ? { token: 'token' } : summary }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
const summaries = (fetch: ReturnType<typeof api>) => fetch.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/v1/me/summary');
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

it('keeps an untouched browser idle and ignores an activity mark older than 30 days', async () => {
  const fetch = api();
  tuix.init({ project: 'fresh', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
  await settle();
  localStorage.setItem('tuix:active:stale', String(Date.now() - 31 * 24 * 60 * 60 * 1000));
  tuix.init({ project: 'stale', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
  await settle();
  localStorage.setItem('tuix:active:hidden', String(Date.now()));
  tuix.init({ project: 'hidden', api: 'https://api.example.test', launcher: false }); tuix.identify({ id: 'a', name: 'A' });
  await settle();
  expect(fetch).not.toHaveBeenCalled();
  expect(mock.mount).not.toHaveBeenCalled();
  localStorage.clear(); vi.unstubAllGlobals();
});

it('fetches the summary once for a returning browser without mounting the core, and a segment opens filtered Reports', async () => {
  mock.mount.mockClear();
  const handle = captureRoot(), fetch = api();
  localStorage.setItem('tuix:active:returning', String(Date.now() - 1000));
  tuix.init({ project: 'returning', api: 'https://api.example.test', lang: 'en' }); tuix.identify({ id: 'a', name: 'A' });
  const capsule = handle.root!.querySelector<HTMLElement>('.tuix-summary')!;
  // jsdom has no requestIdleCallback: the fallback waits for load, then a one-second settle.
  await vi.waitFor(() => expect(capsule.hidden).toBe(false), { timeout: 3000 });
  expect(capsule.getAttribute('role')).toBe('group');
  expect(capsule.getAttribute('aria-label')).toBe('Reports waiting for you');
  expect(summaries(fetch)).toHaveLength(1);
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'GET', headers: { 'x-tuix-widget': '2', authorization: 'Bearer token' } });
  expect(mock.mount).not.toHaveBeenCalled();
  expect(capsule.textContent).toBe('To verify2Open3');
  capsule.querySelector<HTMLButtonElement>('[data-summary=verify]')!.click();
  await vi.waitFor(() => expect(mock.mount).toHaveBeenCalledOnce());
  const core = mock.mount.mock.results[0].value;
  await vi.waitFor(() => expect(core.open).toHaveBeenCalledWith({ scope: 'all', show: 'verify', involving: 'me' }));
  // The core shares the summary's API client: one identify for both.
  expect((mock.mount.mock.calls[0][6] as { api: unknown }).api).toBeDefined();
  // Closing the panel refreshes the counts.
  const panel = mock.mount.mock.calls[0][4] as (active: boolean) => void;
  panel(true); panel(false);
  await vi.waitFor(() => expect(summaries(fetch)).toHaveLength(2));
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/identify'))).toHaveLength(1);
  localStorage.clear(); vi.unstubAllGlobals();
});

it('asks for the summary with the Environment filter of the list the capsule opens', async () => {
  vi.useFakeTimers();
  try {
    const handle = captureRoot(), fetch = api();
    // jsdom serves the page from localhost: a local session sends its stored Environment preference.
    localStorage.setItem('tuix:active:envs', String(Date.now() - 1000));
    localStorage.setItem('tuix:preferences:envs', JSON.stringify({ environment: 'local' }));
    tuix.init({ project: 'envs', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
    await vi.advanceTimersByTimeAsync(1100);
    expect(summaries(fetch).map(([url]) => new URL(String(url)).search)).toEqual(['?environments=local']);
    // Changing Environment in the flyout refreshes the counts with the new filter; the default sends none.
    const select = handle.root!.querySelector<HTMLSelectElement>('select')!;
    select.value = 'uat'; select.dispatchEvent(new Event('change'));
    select.value = ''; select.dispatchEvent(new Event('change'));
    await vi.advanceTimersByTimeAsync(10);
    expect(summaries(fetch).map(([url]) => new URL(String(url)).search)).toEqual(['?environments=local', '?environments=uat', '']);
    tuix.destroy(); fetch.mockClear();
    // Outside a local session the preference does not apply (the list ignores it too).
    tuix.init({ project: 'envs', api: 'https://api.example.test', environment: 'production' }); tuix.identify({ id: 'a', name: 'A' });
    await vi.advanceTimersByTimeAsync(1100);
    expect(summaries(fetch).map(([url]) => new URL(String(url)).search)).toEqual(['']);
  } finally { vi.useRealTimers(); localStorage.clear(); vi.unstubAllGlobals(); }
});

it('loads the core for the settings flyout without opening a panel, and settings hides a composer instead of closing it', async () => {
  mock.mount.mockClear();
  const handle = captureRoot(), fetch = api();
  const settings = vi.fn(), suspend = vi.fn(() => true), close = vi.fn();
  let panel!: (active: boolean) => void;
  mock.mount.mockImplementationOnce((...args: unknown[]) => { panel = args[4] as typeof panel; return { open: vi.fn(), comment: vi.fn(), close, destroy: vi.fn(), settings, suspend }; });
  tuix.init({ project: 'flyout', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
  const root = handle.root!, toggle = root.querySelector<HTMLButtonElement>('#tuix-settings-toggle')!;
  toggle.click();
  await vi.waitFor(() => expect(settings).toHaveBeenCalledWith(true));
  const [, , , , , started, hooks] = mock.mount.mock.calls[0] as unknown[];
  expect(started).toBeUndefined();
  expect((hooks as { updates: HTMLElement }).updates).toBe(root.querySelector('#tuix-settings .tuix-settings-updates'));
  const core = mock.mount.mock.results[0].value;
  expect(core.open).not.toHaveBeenCalled(); expect(core.comment).not.toHaveBeenCalled();
  toggle.click(); expect(settings).toHaveBeenLastCalledWith(false);
  // Composing: the launcher opened the core; settings now asks it to hide the composer.
  root.querySelector<HTMLButtonElement>('#tuix-launcher')!.click();
  await vi.waitFor(() => expect(core.comment).toHaveBeenCalledOnce());
  panel(true);
  suspend.mockImplementationOnce(() => { panel(false); return true; });
  const focus = vi.spyOn(HTMLElement.prototype, 'focus');
  toggle.click();
  expect(suspend).toHaveBeenCalledOnce(); expect(close).not.toHaveBeenCalled();
  expect(root.querySelector<HTMLElement>('#tuix-settings')!.hidden).toBe(false);
  // Hiding is not closing: focus goes straight to the Settings dot, not back to the host first, and the counts are not refetched.
  expect(focus.mock.contexts).toEqual([toggle]);
  await settle();
  expect(summaries(fetch)).toHaveLength(0);
  // The launcher then returns to the composer through the core's comment entry.
  root.querySelector<HTMLButtonElement>('#tuix-launcher')!.click();
  await vi.waitFor(() => expect(core.comment).toHaveBeenCalledTimes(2));
  expect(close).not.toHaveBeenCalled();
  // A real close afterwards refreshes the counts as usual.
  panel(true); panel(false);
  await vi.waitFor(() => expect(summaries(fetch)).toHaveLength(1));
  // The reply dot's hook opens settings.
  (hooks as { openSettings: () => void }).openSettings();
  expect(root.querySelector<HTMLElement>('#tuix-settings')!.hidden).toBe(false);
  vi.unstubAllGlobals();
});

it('forwards only known filter values from the public API and the loader queue', async () => {
  mock.mount.mockClear(); api();
  tuix.init({ project: 'filters' }); tuix.identify({ id: 'a', name: 'A' });
  await tuix.open({ show: 'verify', involving: 'nobody', bogus: true } as never);
  const core = mock.mount.mock.results[0].value;
  expect(core.open).toHaveBeenLastCalledWith({ show: 'verify' });
  const { openFromLoader } = await import('../src/index');
  await openFromLoader(undefined, 'reports', { scope: 'all', involving: 'me' });
  expect(core.open).toHaveBeenLastCalledWith({ scope: 'all', involving: 'me' });
  await openFromLoader(undefined, 'reports', 'verify');
  expect(core.open).toHaveBeenLastCalledWith(undefined);
  vi.unstubAllGlobals();
});

it('fetches the summary when the page is idle, or after load and a settle without requestIdleCallback', async () => {
  vi.useFakeTimers();
  try {
    const fetch = api();
    // With requestIdleCallback the idle callback decides.
    let idle: (() => void) | undefined;
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => { idle = callback; return 1; });
    vi.stubGlobal('cancelIdleCallback', () => {});
    localStorage.setItem('tuix:active:idle', String(Date.now() - 1000));
    tuix.init({ project: 'idle', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
    idle!(); await vi.advanceTimersByTimeAsync(10);
    expect(summaries(fetch)).toHaveLength(1);
    tuix.destroy(); fetch.mockClear();
    // Without it (older WebKit) the request waits for the load event, then one second.
    vi.stubGlobal('requestIdleCallback', undefined);
    const state = vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading');
    tuix.init({ project: 'idle', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetch).not.toHaveBeenCalled();
    state.mockReturnValue('complete'); window.dispatchEvent(new Event('load'));
    await vi.advanceTimersByTimeAsync(900);
    expect(fetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(summaries(fetch)).toHaveLength(1);
    // Tearing down before load cancels the wait.
    tuix.destroy(); fetch.mockClear(); state.mockReturnValue('loading');
    tuix.init({ project: 'idle', api: 'https://api.example.test' }); tuix.identify({ id: 'a', name: 'A' });
    tuix.destroy();
    window.dispatchEvent(new Event('load')); await vi.advanceTimersByTimeAsync(2000);
    expect(fetch).not.toHaveBeenCalled();
  } finally { vi.useRealTimers(); localStorage.clear(); vi.unstubAllGlobals(); }
});
