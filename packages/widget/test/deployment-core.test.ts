// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class {
  environment = 'uat';
  request = mock.request;
  destroy() {}
} }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('waits for activation and fresh enabled settings, then reports once across reopen and polling', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  let enabled = false;
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { enabled, telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [] };
    if (path === '/notifications') return { notifications: [] };
    return {};
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture', release: 'build-42' }, { id: 'fixture', name: 'Fixture' }, () => {});
  await vi.advanceTimersByTimeAsync(200);
  expect(mock.request).not.toHaveBeenCalled();
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect(mock.request.mock.calls.filter(([path]) => path === '/releases')).toHaveLength(0);
  core.close(); await vi.advanceTimersByTimeAsync(200);
  enabled = true;
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect(mock.request.mock.calls.filter(([path]) => path === '/releases')).toEqual([['/releases', 'POST', { release: 'build-42' }]]);
  await vi.advanceTimersByTimeAsync(60100);
  core.close(); await vi.advanceTimersByTimeAsync(200);
  const requests = mock.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120000);
  expect(mock.request).toHaveBeenCalledTimes(requests);
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect(mock.request.mock.calls.filter(([path]) => path === '/releases')).toHaveLength(1);
});
