// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import type { Core } from '../src/types';

let core: Core | undefined;
afterEach(() => {
  core?.destroy(); core = undefined;
  history.replaceState({}, '', '/'); localStorage.clear();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks();
  document.body.replaceChildren();
});

function fixture(context?: Record<string, unknown>) {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const report = {
    id: 'issue', number: 7, title: 'Save', body: 'Please check', status: 'open', state: 'open',
    type: 'bug', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' },
    author: { name: 'Reporter' }, comments: [], comment_count: 0,
  };
  const data = { reports: [report] };
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    // Real HTTP responses have new object identities, even when nothing changed.
    if (path.startsWith('/issues?')) return JSON.parse(JSON.stringify({ issues: data.reports }));
    return { notifications: [] };
  });
  const pane = document.createElement('section');
  const target = document.createElement('button');
  target.dataset.testid = 'save'; target.textContent = 'Save'; pane.append(target);
  const host = document.createElement('tuix-widget'), launcher = document.createElement('button');
  document.body.append(pane, host, launcher);
  const root = host.attachShadow({ mode: 'closed' });
  const rect = { x: 100, y: 200, width: 40, height: 20 } as DOMRect;
  const measure = vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => rect);
  const queries = vi.spyOn(document, 'querySelectorAll');
  const searches = () => queries.mock.calls.filter(([selector]) => selector === '[data-testid="save"]').length;
  core = mount(root, launcher, { project: 'refresh-fixture', context }, { id: 'reviewer', name: 'Reviewer' }, () => {});
  core.open();
  return { root, pane, target, rect, measure, queries, searches, data, report };
}

it('does not serialize host context while comparing settings responses', async () => {
  const toJSON = vi.fn(() => { throw new Error('Host context is not serializable'); });
  const f = fixture({ toJSON });
  await vi.advanceTimersByTimeAsync(60100);
  expect(f.root.querySelector('.pin')).not.toBeNull();
  expect(toJSON).not.toHaveBeenCalled();
});

it('does no marker work for host mutations or unchanged minute-poll responses', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  expect(f.root.querySelector('.pin')).not.toBeNull();
  f.queries.mockClear(); f.measure.mockClear();
  const requests = mock.request.mock.calls.length;
  for (let i = 0; i < 10; i++) {
    f.pane.dataset.tick = String(i);
    f.pane.append(document.createElement('span'));
    f.target.firstChild!.textContent = `Save ${i}`;
    await vi.advanceTimersByTimeAsync(250);
  }
  await vi.advanceTimersByTimeAsync(60000);
  expect(mock.request.mock.calls.length).toBeGreaterThan(requests);
  expect(f.searches()).toBe(0);
  expect(f.measure).not.toHaveBeenCalled();
  expect(f.root.querySelector<HTMLElement>('.pin')!.style.top).toBe('196px');
});

it('coalesces nested scrolling and resizing into one position update without searching', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  f.queries.mockClear(); f.measure.mockClear();
  f.rect.y = 300;
  for (let i = 0; i < 20; i++) {
    f.pane.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
  }
  await vi.advanceTimersByTimeAsync(40);
  expect(f.root.querySelector<HTMLElement>('.pin')!.style.top).toBe('296px');
  expect(f.measure).toHaveBeenCalledOnce();
  expect(f.searches()).toBe(0);
});

it('resolves replaced content on the explicit host event without fetching reports', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  const replacement = f.target.cloneNode(true) as HTMLElement;
  vi.spyOn(replacement, 'getBoundingClientRect').mockReturnValue({ ...f.rect, y: 350 } as DOMRect);
  f.target.replaceWith(replacement);
  await vi.advanceTimersByTimeAsync(500);
  expect(f.root.querySelector<HTMLElement>('.pin')!.style.top).toBe('196px');
  f.queries.mockClear();
  const requests = mock.request.mock.calls.length;
  window.dispatchEvent(new Event('tuix:refresh-markers'));
  await vi.advanceTimersByTimeAsync(100);
  expect(f.root.querySelector<HTMLElement>('.pin')!.style.top).toBe('346px');
  expect(f.searches()).toBe(1);
  expect(mock.request).toHaveBeenCalledTimes(requests);
});

it('updates changed report content without resolving unchanged locators, and removes finished reports', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  f.queries.mockClear();
  f.report.number = 9;
  await vi.advanceTimersByTimeAsync(60100);
  expect(f.root.querySelector('.pin')!.getAttribute('aria-label')).toContain('#9 ');
  expect(f.searches()).toBe(0);
  f.report.state = 'done';
  await vi.advanceTimersByTimeAsync(60100);
  expect(f.root.querySelector('.pin')).toBeNull();
});

it('resolves new reports after synchronization and after URL navigation', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  f.data.reports = [{ ...f.report, id: 'second', number: 8 }];
  f.queries.mockClear();
  await vi.advanceTimersByTimeAsync(60100);
  expect(f.root.querySelector('.pin')!.getAttribute('aria-label')).toContain('#8 ');
  expect(f.searches()).toBe(1);
  f.data.reports = [{ ...f.report, url: location.origin + '/other' }];
  f.queries.mockClear();
  history.pushState({}, '', '/other');
  await vi.advanceTimersByTimeAsync(250);
  expect(f.root.querySelector('.pin')).not.toBeNull();
  expect(f.searches()).toBe(1);
  expect(mock.request.mock.calls.some(([path]) => String(path).includes('page_url=' + encodeURIComponent(location.origin + '/other')))).toBe(true);
});

it('resolves a changed locator for an existing report', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  const other = document.createElement('button');
  other.dataset.testid = 'other'; other.textContent = 'Other';
  f.pane.append(other);
  vi.spyOn(other, 'getBoundingClientRect').mockReturnValue({ ...f.rect, y: 400 } as DOMRect);
  f.report.locators = { testid: '[data-testid="other"]' };
  await vi.advanceTimersByTimeAsync(60100);
  expect(f.root.querySelector<HTMLElement>('.pin')!.style.top).toBe('396px');
});

it('removes event listeners and cancels pending marker work on close and destroy', async () => {
  const f = fixture();
  await vi.advanceTimersByTimeAsync(250);
  core!.close(); await vi.advanceTimersByTimeAsync(100);
  f.queries.mockClear(); f.measure.mockClear();
  window.dispatchEvent(new Event('tuix:refresh-markers'));
  f.pane.dispatchEvent(new Event('scroll')); window.dispatchEvent(new Event('resize'));
  await vi.advanceTimersByTimeAsync(100);
  expect(f.searches()).toBe(0); expect(f.measure).not.toHaveBeenCalled();
  core!.open(); await vi.advanceTimersByTimeAsync(250);
  f.queries.mockClear(); f.measure.mockClear();
  window.dispatchEvent(new Event('tuix:refresh-markers'));
  f.pane.dispatchEvent(new Event('scroll'));
  core!.destroy(); core = undefined;
  window.dispatchEvent(new Event('tuix:refresh-markers'));
  window.dispatchEvent(new Event('resize'));
  await vi.advanceTimersByTimeAsync(100);
  expect(f.searches()).toBe(0); expect(f.measure).not.toHaveBeenCalled();
  expect(f.root.childNodes).toHaveLength(0);
});
