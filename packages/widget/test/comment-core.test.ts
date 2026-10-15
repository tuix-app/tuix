import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
import { mount } from '../src/core';
import { preferenceEvent, savePreferences } from '../src/preferences';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); sessionStorage.clear(); localStorage.clear(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('opens comment selection, composes in the sidebar, and Escape discards the selection while closing everything', async () => {
  vi.useFakeTimers();
  mocks.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, network: false, console: false } } : path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  const host = document.createElement('tuix-widget'), target = document.createElement('button'); target.textContent = 'Save';
  document.body.append(host, target);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  core = mount(root, launcher, { project: 'comment-test', capture: { screenshot: false } }, { id: 'user', name: 'User' }, vi.fn());
  core.comment!(); await vi.advanceTimersByTimeAsync(200);
  // Comment mode shows no sidebar: a hint, a page frame and the launcher ring mark it.
  expect(root.querySelector('.panel')).toBeNull();
  expect(root.querySelector('.picker-hint')?.textContent).toContain('Leave a comment');
  expect(launcher.dataset.mode).toBe('comment');
  expect(launcher.getAttribute('aria-pressed')).toBe('true');
  await vi.advanceTimersByTimeAsync(10000);
  expect(root.querySelector('.picker-hint')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  root.querySelector<HTMLElement>('.pick-surface')!.click(); await vi.advanceTimersByTimeAsync(50);
  const textarea = root.querySelector<HTMLTextAreaElement>('.panel.composer textarea')!;
  textarea.value = 'Keep my comment'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(50);
  [...root.querySelectorAll('button')].find(button => button.textContent === 'Change element')!.click();
  await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  root.querySelector<HTMLElement>('.pick-surface')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Keep my comment');
  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  root.querySelector('textarea')!.dispatchEvent(tab);
  expect(tab.defaultPrevented).toBe(false);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.advanceTimersByTimeAsync(50); expect(root.querySelector('.panel')).toBeNull(); expect(root.querySelector('.pick-surface')).toBeNull();
  expect(launcher.dataset.mode).toBeUndefined();
  expect(launcher.hasAttribute('aria-pressed')).toBe(false);
  core.comment!(); await vi.advanceTimersByTimeAsync(50);
  // Nothing is stored: the next launcher click starts picking again, never the old composer.
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  expect(sessionStorage.length).toBe(0);
  core.close(); core.open(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pick-surface')).toBeNull();
});

let panel = vi.fn();
const setup = async () => {
  vi.useFakeTimers(); panel = vi.fn();
  mocks.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, network: false, console: false } } : path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  const host = document.createElement('tuix-widget'), target = document.createElement('button'); target.textContent = 'Save';
  document.body.append(host, target);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  core = mount(root, launcher, { project: 'comment-test', capture: { screenshot: false } }, { id: 'user', name: 'User' }, panel);
  return root;
};
const pick = async (root: ShadowRoot) => { await vi.advanceTimersByTimeAsync(10200); root.querySelector<HTMLElement>('.pick-surface')!.click(); await vi.advanceTimersByTimeAsync(50); };
const type = async (root: ShadowRoot, text: string) => { const textarea = root.querySelector<HTMLTextAreaElement>('.composer textarea')!; textarea.value = text; textarea.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(50); };

it.each(['x', 'escape', 'launcher'])('closing the composer with %s discards the selection so the next comment starts picking', async how => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Half written');
  expect(root.querySelector('.composer')).not.toBeNull();
  if (how === 'x') root.querySelector<HTMLElement>('.composer .icon-button')!.click();
  else if (how === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  else core!.close();
  await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  await pick(root);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('');
});

it('writes nothing to sessionStorage while composing', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Private words');
  expect(Object.keys(sessionStorage)).toEqual([]);
  expect(root.textContent).not.toContain('draft');
});

it('keeps the text and reuses the idempotency key after a failed submit', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Retry me');
  const keys: string[] = []; let fail = true;
  mocks.request.mockImplementation(async (path: string, _method?: string, body?: { idempotency_key: string; locators: unknown }) => {
    if (path === '/issues' && body) { keys.push(body.idempotency_key); if (fail) throw new Error('503'); return { id: 'i1', number: 1, title: 'Retry me', status: 'open', state: 'open', reporter: true, locators: body.locators as never, author: { name: 'User' }, comment_count: 0, inserted_at: '', updated_at: '', comments: [] }; }
    return path.startsWith('/issues?') ? { issues: [] } : { notifications: [] };
  });
  const send = () => root.querySelector<HTMLFormElement>('.composer form')!.requestSubmit();
  send(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Retry me');
  expect(root.querySelector('.composer .error')).not.toBeNull();
  fail = false; send(); await vi.advanceTimersByTimeAsync(100);
  expect(keys).toHaveLength(2); expect(keys[1]).toBe(keys[0]);
  expect(root.querySelector('.composer')).toBeNull();
});

it('hides a visible composer behind settings, keeps it in memory, and returns to it from the launcher or Reports', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Keep me');
  const launcher = root.querySelector('button')!;
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer, .panel, .pick-surface, .picker-hint')).toBeNull();
  expect(launcher.getAttribute('aria-expanded')).toBe('false');
  expect(panel).toHaveBeenLastCalledWith(false);
  // Escape belongs to the settings flyout now; the hidden composer survives it.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  // The launcher returns to the composer, text intact, and the SDK hears about it once.
  panel.mockClear();
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Keep me');
  expect(launcher.getAttribute('aria-expanded')).toBe('true');
  expect(panel.mock.calls).toEqual([[true]]);
  // So does the Reports dot.
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  panel.mockClear();
  core!.open(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Keep me');
  expect(root.querySelector('.page-reports')).toBeNull();
  expect(panel.mock.calls).toEqual([[true]]);
  // X while it is visible closes and discards it.
  root.querySelector<HTMLElement>('.composer .icon-button')!.click(); await vi.advanceTimersByTimeAsync(50);
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});

it('keeps a composer that is choosing another element, and keeps nothing for reports or bare selection', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Half way');
  [...root.querySelectorAll('button')].find(button => button.textContent === 'Change element')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pick-surface, .composer')).toBeNull();
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Half way');
  core!.close(); await vi.advanceTimersByTimeAsync(50);
  core!.open(); await vi.advanceTimersByTimeAsync(50);
  expect(core!.suspend!()).toBe(false);
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(core!.suspend!()).toBe(false);
  // A closed widget has nothing to hide either.
  core!.close(); await vi.advanceTimersByTimeAsync(50);
  expect(core!.suspend!()).toBe(false);
});

it('discards a hidden composer when its page changes', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Old page');
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  history.pushState({}, '', '/elsewhere'); await vi.advanceTimersByTimeAsync(200);
  // The hidden sidebar closed with it: nothing left marking the new page.
  expect(root.querySelector('.composer, .panel, .pick-surface, .pin')).toBeNull();
  expect(panel).toHaveBeenLastCalledWith(false);
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  history.replaceState({}, '', '/');
  // Let the route change settle, so no Preact effect is left queued on fake timers for the next test.
  await vi.advanceTimersByTimeAsync(50);
});

it('drops a composer hidden behind settings when a filter asks for the report list', async () => {
  const root = await setup(); core!.comment!(); await pick(root); await type(root, 'Hidden draft');
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  // A capsule segment (or the host's tuix.open(filter)) shows the filtered list, not the hidden composer.
  panel.mockClear();
  core!.open({ scope: 'all', show: 'verify', involving: 'me' }); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.page-reports [data-filter=show] [data-value=verify]')!.getAttribute('aria-pressed')).toBe('true');
  // The SDK hears about the shown panel once.
  expect(panel.mock.calls).toEqual([[true]]);
  // Nothing was kept: the launcher starts picking again.
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});

it('applies an open filter to this view only and leaves the stored preferences alone', async () => {
  const root = await setup();
  const stored = () => JSON.parse(localStorage.getItem('tuix:preferences:comment-test') ?? 'null');
  const choice = (filter: string, value: string) => root.querySelector<HTMLButtonElement>(`.page-reports [data-filter=${filter}] [data-value=${value}]`)!;
  // Markers ask only when the panel opens, so the latest list request is the panel's.
  const listed = () => new URLSearchParams(mocks.request.mock.calls.map(([path]) => path as string).filter(path => path.startsWith('/issues?')).pop()!.split('?')[1]);
  core!.open({ scope: 'all', show: 'verify', involving: 'me' }); await vi.advanceTimersByTimeAsync(100);
  expect(choice('show', 'verify').getAttribute('aria-pressed')).toBe('true');
  expect(choice('involving', 'me').getAttribute('aria-pressed')).toBe('true');
  expect(stored()).toBeNull();
  // Choosing Show saves Show only: Pages and Involving stay the person's own, and this view keeps its filter.
  choice('show', 'all').click(); await vi.advanceTimersByTimeAsync(100);
  expect(stored()).toEqual({ scope: 'page', show: 'all', involving: 'everyone', environment: '', hideClosed: true });
  expect(choice('show', 'all').getAttribute('aria-pressed')).toBe('true');
  expect(choice('involving', 'me').getAttribute('aria-pressed')).toBe('true');
  // Hide closed is on by default: All asks for every unresolved report.
  expect(Object.fromEntries(listed())).toEqual({ scope: 'all', show: 'unresolved', involving: 'me' });
  // Choosing the stored value still replaces the view's own.
  choice('involving', 'everyone').click(); await vi.advanceTimersByTimeAsync(100);
  expect(stored()).toEqual({ scope: 'page', show: 'all', involving: 'everyone', environment: '', hideClosed: true });
  expect(choice('involving', 'everyone').getAttribute('aria-pressed')).toBe('true');
  expect(Object.fromEntries(listed())).toEqual({ scope: 'all', show: 'unresolved', involving: 'everyone' });
  // Pages chosen in settings replaces the view's Pages too.
  savePreferences('comment-test', { scope: 'page' }); await vi.advanceTimersByTimeAsync(100);
  expect(listed().get('route_key')).toBe('/');
  expect(listed().has('scope')).toBe(false);
  // A marker change is not a filter choice; and a new filter replaces the whole view filter.
  core!.open({ show: 'verify' }); await vi.advanceTimersByTimeAsync(100);
  window.dispatchEvent(new CustomEvent(preferenceEvent)); await vi.advanceTimersByTimeAsync(100);
  expect(choice('show', 'verify').getAttribute('aria-pressed')).toBe('true');
  expect(Object.fromEntries(listed())).toMatchObject({ show: 'verify', involving: 'everyone', route_key: '/' });
  expect(stored()).toEqual({ scope: 'page', show: 'all', involving: 'everyone', environment: '', hideClosed: true });
});

/** A report marked on the setup's Save button. */
const marked = () => {
  const target = document.body.querySelector('button')!; target.dataset.testid = 'save';
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 20, y: 40, width: 40, height: 20, left: 20, top: 40, right: 60, bottom: 60 } as DOMRect);
  const report = { id: 'r1', number: 7, title: 'Save overlaps', body: 'Save overlaps', status: 'open', state: 'open', type: 'bug', env_name: 'uat', url: location.origin + location.pathname, locators: { testid: '[data-testid="save"]' }, author: { name: 'Anna' }, comments: [], allowed_states: [], inserted_at: '2026-09-22T12:00:00Z' };
  mocks.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, network: false, console: false } } : path.startsWith('/issues?') ? { issues: [report] } : path === '/issues/r1' ? report : { notifications: [] });
};

it('draws no markers and stops the list poll while a composer is hidden behind settings', async () => {
  const root = await setup(); marked();
  core!.comment!(); await pick(root); await type(root, 'Hidden draft');
  expect(root.querySelector('.pin')).not.toBeNull();
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  // Hidden counts as closed, as it does for the SDK: no pins under the flyout, no list poll.
  expect(root.querySelector('.pin')).toBeNull();
  const lists = () => mocks.request.mock.calls.filter(([path]) => String(path).startsWith('/issues?')).length, before = lists();
  await vi.advanceTimersByTimeAsync(61000);
  expect(lists()).toBe(before);
  expect(root.querySelector('.pin')).toBeNull();
  // Returning to the composer brings the markers back.
  core!.comment!(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Hidden draft');
  expect(root.querySelector('.pin')).not.toBeNull();
  expect(lists()).toBeGreaterThan(before);
});

it('drops a composer hidden behind settings when a kept-visible marker opens its report', async () => {
  // Keep visible when closed: the markers stay while the composer is hidden, so one can be chosen.
  localStorage.setItem('tuix:markers:comment-test', 'on:dot');
  const root = await setup(); marked();
  core!.comment!(); await pick(root); await type(root, 'Hidden draft');
  expect(core!.suspend!()).toBe(true); await vi.advanceTimersByTimeAsync(50);
  root.querySelector<HTMLButtonElement>('.pin')!.click(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.thread-body')!.textContent).toBe('Save overlaps');
  expect(panel).toHaveBeenLastCalledWith(true);
  core!.comment!(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});
