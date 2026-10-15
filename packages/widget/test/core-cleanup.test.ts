// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), destroy: vi.fn(), stop: vi.fn(), failUnmount: false }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy = mock.destroy; } }));
vi.mock('../src/live', () => ({ liveUpdates: () => ({ stop: mock.stop }) }));
vi.mock('preact', async importOriginal => {
  const actual = await importOriginal<typeof import('preact')>();
  return { ...actual, render: (...args: Parameters<typeof actual.render>) => {
    if (args[0] === null && mock.failUnmount) throw Error('unmount fixture');
    return actual.render(...args);
  } };
});
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; mock.failUnmount = false; vi.restoreAllMocks(); vi.resetAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); document.body.replaceChildren(); });

it('invokes API teardown, restores real capture hooks and clears timers despite transport and unmount failures', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const hostFetch = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal('fetch', hostFetch);
  const hostConsole = console.error;
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: true, network: true } };
    if (path.startsWith('/issues?')) return { issues: [] };
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture' }, { id: 'alice', name: 'Alice' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(250);
  expect(window.fetch).not.toBe(hostFetch);
  expect(console.error).not.toBe(hostConsole);
  mock.stop.mockImplementation(() => { throw Error('transport fixture'); });
  mock.failUnmount = true;
  expect(() => core!.destroy()).not.toThrow();
  expect(mock.destroy).toHaveBeenCalledOnce();
  expect(mock.stop).toHaveBeenCalled();
  expect(window.fetch).toBe(hostFetch);
  expect(console.error).toBe(hostConsole);
  expect(root.childNodes).toHaveLength(0);
  const requests = mock.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120000);
  expect(mock.request).toHaveBeenCalledTimes(requests);
  expect(vi.getTimerCount()).toBe(0);
  core.destroy(); expect(mock.destroy).toHaveBeenCalledOnce();
});
