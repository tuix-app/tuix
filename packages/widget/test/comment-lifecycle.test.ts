// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), screenshot: vi.fn(), capture: vi.fn(),
  refresh: undefined as undefined | (() => Promise<void>) }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
vi.mock('../src/screenshot', () => ({ screenshot: mocks.screenshot }));
vi.mock('../src/capture', () => ({ startCapture: mocks.capture }));
vi.mock('../src/live', () => ({ liveUpdates: (_api: unknown, refresh: () => Promise<void>) => {
  mocks.refresh = refresh; return { stop() {} };
} }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(async () => {
  core?.destroy(); core = undefined; history.replaceState({}, '', '/');
  // Flush Preact's shared after-paint queue before replacing the fake clock.
  await vi.advanceTimersByTimeAsync(200);
  mocks.refresh = undefined;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetAllMocks(); document.body.replaceChildren();
});
const options = { telemetry: false, capture: { screenshot: false, network: false, console: false } };
function fixture() {
  vi.useFakeTimers();
  mocks.capture.mockReturnValue({ stop() {}, snapshot: () => ({ console_log: [], network_log: [] }) });
  const host = document.createElement('tuix-widget'), target = document.createElement('button');
  target.id = 'target'; target.textContent = 'Save'; document.body.append(host, target);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); root.append(launcher);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  core = mount(root, launcher, { project: 'lifecycle' }, { id: 'reviewer', name: 'Reviewer' }, () => {});
  return root;
}
const tick = () => vi.advanceTimersByTimeAsync(200);

it('cannot select or capture before remote settings arrive, and stays disabled when denied', async () => {
  let allow!: (value: object) => void;
  mocks.request.mockImplementation((path: string) => path === '/config' ? new Promise(resolve => { allow = resolve; }) : Promise.resolve({ issues: [] }));
  const root = fixture(); core!.comment!(); await tick();
  expect(root.querySelector('.picker-hint')).not.toBeNull();
  expect(root.querySelector('.pick-surface')).toBeNull();
  expect(mocks.screenshot).not.toHaveBeenCalled();
  expect(mocks.capture).not.toHaveBeenCalled();
  allow({ ...options, enabled: false }); await tick();
  expect(root.querySelector('.pick-surface')).toBeNull();
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.textContent).toContain('disabled');
  expect(mocks.screenshot).not.toHaveBeenCalled();
});

it('keeps in-memory compositions out of other pages and cancels screenshots from the previous page', async () => {
  history.replaceState({}, '', '/invoices/123');
  mocks.request.mockImplementation(async (path: string) => path === '/config'
    ? { ...options, capture: { ...options.capture, screenshot: true } } : path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  let finish!: (value: Blob) => void;
  mocks.screenshot.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(null);
  const root = fixture(); core!.comment!(); await tick();
  root.querySelector<HTMLDivElement>('.pick-surface')!.click(); await tick();
  const input = root.querySelector<HTMLTextAreaElement>('textarea')!;
  input.value = 'Invoice 123 draft'; input.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  history.pushState({}, '', '/invoices/456'); await tick();
  finish(new Blob(['old screenshot'], { type: 'image/png' })); await tick();
  expect(root.querySelector('.composer')).toBeNull();
  core!.comment!(); await tick();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  expect(root.querySelector('.composer')).toBeNull();
  root.querySelector<HTMLDivElement>('.pick-surface')!.click(); await tick();
  expect(root.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('');
  expect(root.querySelector('.composer img')).toBeNull();
  history.pushState({}, '', '/invoices/123'); await tick();
  core!.comment!(); await tick();
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});

it('handles Escape immediately after painting, before passive effects load configuration', async () => {
  mocks.request.mockReturnValue(new Promise(() => {}));
  const root = fixture(); core!.comment!();
  // Flush the render microtask, not animation frames/passive effects.
  await Promise.resolve(); await Promise.resolve();
  expect(root.querySelector('.picker-hint')).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await Promise.resolve(); await Promise.resolve();
  expect(root.querySelector('.panel,.picker-hint')).toBeNull();
});

it('does not let an older configuration response re-enable capture', async () => {
  const pending: ((value: object) => void)[] = [];
  let configured = false;
  mocks.request.mockImplementation((path: string) => {
    if (path === '/config') {
      if (!configured) { configured = true; return Promise.resolve(options); }
      return new Promise(resolve => pending.push(resolve));
    }
    return Promise.resolve(path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  });
  fixture(); core!.open(); await tick();
  const earlier = mocks.refresh!(); await tick();
  const later = mocks.refresh!(); await tick();
  expect(pending).toHaveLength(2);
  pending[1](options); await later; await tick();
  pending[0]({ ...options, capture: { screenshot: true, network: true, console: true } }); await earlier; await tick();
  expect(mocks.capture.mock.calls.every(([capture]) => capture.network === false && capture.console === false)).toBe(true);
});

it('switching to reports cancels a pending thread response', async () => {
  const issue = { id: 'first', number: 1, title: 'First report', body: 'Old thread', status: 'open', state: 'open', type: 'bug',
    author: { name: 'Reviewer' }, inserted_at: '2026-09-22T12:00:00Z', locators: {} };
  let finish!: (value: object) => void;
  mocks.request.mockImplementation((path: string) => {
    if (path === '/config') return Promise.resolve(options);
    if (path.startsWith('/issues?')) return Promise.resolve({ issues: [issue] });
    if (path === '/issues/first') return new Promise(resolve => { finish = resolve; });
    return Promise.resolve({ notifications: [] });
  });
  const root = fixture(); core!.open(); await tick();
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await tick();
  core!.open(); await tick();
  finish(issue); await tick();
  expect(root.querySelector('.thread-body')).toBeNull();
  expect(root.querySelector('.page-reports')).not.toBeNull();
});
