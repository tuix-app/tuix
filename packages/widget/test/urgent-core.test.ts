// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mock = vi.hoisted(() => ({ request: vi.fn(), environment: 'uat' }));
vi.mock('../src/api', () => ({ Api: class { environment = mock.environment; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.request.mockReset(); document.body.replaceChildren(); });

const base = { id: 'issue', number: 3, title: 'Totals overflow', body: 'Totals overflow', status: 'open', state: 'open', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' }, author: { name: 'Me' }, comment_count: 0, comments: [], inserted_at: '2026-09-22T12:00:00Z', updated_at: '2026-09-22T12:00:00Z' };

async function open(initial: Record<string, unknown>) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  let current: Record<string, unknown> = { ...base, ...initial };
  mock.request.mockImplementation(async (path: string, _method?: string, body?: Record<string, unknown>) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [current], next_before: null };
    if (path === '/issues/issue') return current;
    if (path === '/issues/issue/urgent') { current = { ...current, urgent: body!.urgent }; return current; }
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'urgent', lang: 'en' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  return root;
}

it('marks an urgent report in the list and offers no toggle to someone who may not change it', async () => {
  const root = await open({ urgent: true });
  expect(root.querySelector('.issue-item .urgent-mark')!.textContent).toBe('Urgent');
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.meta .urgent-mark')!.textContent).toBe('Urgent');
  expect(root.querySelector('[data-action=urgent]')).toBeNull();
});

it('shows no mark on a report without urgent, as an older server sends it', async () => {
  const root = await open({});
  expect(root.querySelector('.issue-item .urgent-mark')).toBeNull();
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('[data-action=urgent]')).toBeNull();
});

it('marks and clears urgent through the urgent route when the server says the caller may', async () => {
  const root = await open({ can_set_urgent: true });
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  const toggle = () => root.querySelector<HTMLButtonElement>('[data-action=urgent]')!;
  expect(toggle().textContent).toBe('Mark urgent');
  toggle().click(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/urgent', 'POST', { urgent: true });
  expect(toggle().textContent).toBe('Clear urgent');
  expect(root.querySelector('.meta .urgent-mark')).not.toBeNull();
  toggle().click(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/urgent', 'POST', { urgent: false });
  expect(toggle().textContent).toBe('Mark urgent');
});
