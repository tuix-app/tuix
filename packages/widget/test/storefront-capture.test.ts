// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.example.test/"}
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), init: vi.fn(), capture: vi.fn() }));
vi.mock('../src/index', () => ({ tuix: { init: mock.init, identify() {} } }));
vi.mock('../src/api', () => ({ Api: class {
  environment = 'production'; request = mock.request; destroy() {}
}, ApiError: class extends Error {} }));
vi.mock('../src/capture', () => ({ startCapture: mock.capture }));
import { activateStorefront } from '../src/storefront';
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); vi.useRealTimers(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
it('keeps Shopify diagnostics off by default and applies administrator enablement on refresh', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  let diagnostics = false;
  mock.capture.mockReturnValue({ stop() {}, snapshot: () => ({ console_log: [], network_log: [] }) });
  mock.request.mockImplementation(async (path: string) => {
    if (path.startsWith('/shopify/reviewer/')) return {
      token: 'dummy', session: 's'.repeat(43), user: { id: 'reviewer', name: 'Reviewer' },
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      settings: {position:'bottom-left', theme:{accent:'#ffffff'}},
    };
    if (path === '/config') return { position: diagnostics ? 'bottom-right' : 'bottom-left', theme: {accent: diagnostics ? '#123456' : '#ffffff'}, telemetry: false, capture: { screenshot: true, console: diagnostics, network: diagnostics } };
    if (path.startsWith('/issues?')) return { issues: [] };
    if (path === '/notifications') return { notifications: [] };
    return {};
  });
  expect(await activateStorefront({ project: 'fixture', session: 's'.repeat(43), template: 'index', handle: '' })).toBe(true);
  const host = document.createElement('div'); document.body.append(host);
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(host.attachShadow({ mode: 'closed' }), launcher, mock.init.mock.calls[0][0], { id: 'reviewer', name: 'Reviewer', reviewerSession: 's'.repeat(43) }, () => {});
  await vi.advanceTimersByTimeAsync(200);
  expect(mock.capture).not.toHaveBeenCalled();
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect(mock.capture).toHaveBeenLastCalledWith(expect.objectContaining({ console: false, network: false }));
  expect(launcher.style.left).toBe('16px');
  diagnostics = true;
  await vi.advanceTimersByTimeAsync(60100);
  expect(mock.capture).toHaveBeenLastCalledWith(expect.objectContaining({ console: true, network: true }));
  expect(launcher.style.right).toBe('16px'); expect(launcher.style.left).toBe('');
  expect(launcher.style.background).toBe('');
});
