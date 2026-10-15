// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
import { mount } from '../src/core';
import { mountSettings } from '../src/settings';
import type { Core } from '../src/types';
let core: Core | undefined, settings: ReturnType<typeof mountSettings> | undefined;
afterEach(() => { settings?.destroy(); core?.destroy(); core = settings = undefined; document.body.replaceChildren(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function touchDevice() {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('hover: none') || query.includes('reduce') }));
}

it('previews a tapped element without acting on the page, offers its parent, and composes on confirm', async () => {
  vi.useFakeTimers(); touchDevice();
  mocks.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  const section = document.createElement('section'), link = document.createElement('a');
  link.href = '#elsewhere'; link.textContent = 'Open details'; link.dataset.testid = 'details'; section.append(link);
  const host = document.createElement('tuix-widget'); document.body.append(section, host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [link, section] });
  core = mount(root, launcher, { project: 'touch', capture: { screenshot: false }, lang: 'en' }, { id: 'u', name: 'U' }, vi.fn());
  core.comment!(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pick-surface.touch')).not.toBeNull();
  expect(root.querySelector('.picker-hint')?.textContent).toContain('Tap an element');

  const tap = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
  const hostClick = vi.fn(); link.addEventListener('click', hostClick);
  link.dispatchEvent(tap); await vi.advanceTimersByTimeAsync(50);
  expect(tap.defaultPrevented).toBe(true);
  expect(hostClick).not.toHaveBeenCalled();
  expect(root.querySelector('.composer')).toBeNull();
  expect(root.querySelector('.pick-confirm strong')?.textContent).toBe('a · details');

  root.querySelector<HTMLButtonElement>('[data-action="pick-parent"]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pick-confirm strong')?.textContent).toBe('section');
  root.querySelector<HTMLButtonElement>('[data-action="pick-confirm"]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.composer')).not.toBeNull();
  expect(root.querySelector('.pick-confirm')).toBeNull();

  core.close(); await vi.advanceTimersByTimeAsync(50);
  const after = new MouseEvent('click', { bubbles: true, cancelable: true });
  link.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

it('keeps the settings control visible on touch while feedback is open', () => {
  vi.useFakeTimers(); touchDevice();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  settings = mountSettings(root, launcher, { project: 'touch' }, vi.fn(), vi.fn());
  const toggle = root.querySelector('#tuix-settings-toggle')!;
  expect(toggle.classList.contains('revealed')).toBe(false);
  settings.active(true);
  expect(toggle.classList.contains('revealed')).toBe(true);
  vi.advanceTimersByTime(1000);
  expect(toggle.classList.contains('revealed')).toBe(true);
  settings.active(false); vi.advanceTimersByTime(500);
  expect(toggle.classList.contains('revealed')).toBe(false);
});
