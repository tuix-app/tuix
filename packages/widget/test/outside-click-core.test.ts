// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ request: vi.fn(), screenshot: vi.fn(), capture: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
vi.mock('../src/screenshot', () => ({ screenshot: mocks.screenshot }));
vi.mock('../src/capture', () => ({ startCapture: mocks.capture }));
vi.mock('../src/live', () => ({ liveUpdates: () => ({ stop() {} }) }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(async () => {
  core?.destroy(); core = undefined;
  await vi.advanceTimersByTimeAsync(200);
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetAllMocks(); document.body.replaceChildren();
});
const options = { telemetry: false, capture: { screenshot: false, network: false, console: false } };
function fixture() {
  vi.useFakeTimers();
  mocks.capture.mockReturnValue({ stop() {}, snapshot: () => ({ console_log: [], network_log: [] }) });
  mocks.request.mockImplementation(async (path: string) => path === '/config' ? options : path.startsWith('/issues?') ? { issues: [] } : { notifications: [] });
  const host = document.createElement('tuix-widget'), target = document.createElement('button');
  target.id = 'target'; target.textContent = 'Save'; document.body.append(host, target);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); root.append(launcher);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  const panel = vi.fn();
  core = mount(root, launcher, { project: 'outside' }, { id: 'reviewer', name: 'Reviewer' }, panel);
  return { root, target, panel };
}
const tick = () => vi.advanceTimersByTimeAsync(200);
/** A press and a click, as a pointer makes them; `from` takes the press, `to` the click. */
function press(from: Element, to = from) {
  from.dispatchEvent(new Event('pointerdown', { bubbles: true, composed: true }));
  to.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
}

it('a click on the page closes the sidebar and leaves the focus to the page', async () => {
  const { root, target, panel } = fixture(); core!.open(); await tick();
  expect(root.querySelector('.panel')).not.toBeNull();
  press(root.querySelector('.panel')!); await tick();
  expect(root.querySelector('.panel')).not.toBeNull();
  press(target); await tick();
  expect(root.querySelector('.panel')).toBeNull();
  expect(panel).toHaveBeenLastCalledWith(false, true);
});

it('a selection dragged out of the sidebar keeps it open', async () => {
  const { root, target } = fixture(); core!.open(); await tick();
  press(root.querySelector('.panel')!, target); await tick();
  expect(root.querySelector('.panel')).not.toBeNull();
});

it('comment mode ignores clicks on the page', async () => {
  const { root, target } = fixture(); core!.comment!(); await tick();
  press(target); await tick();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});

it('a comment being written is set aside with its text, and comes back', async () => {
  const { root, target, panel } = fixture(); core!.comment!(); await tick();
  root.querySelector<HTMLDivElement>('.pick-surface')!.click(); await tick();
  const input = root.querySelector<HTMLTextAreaElement>('textarea')!;
  input.value = 'Button is grey'; input.dispatchEvent(new Event('input', { bubbles: true })); await tick();
  press(target); await tick();
  expect(root.querySelector('.composer')).toBeNull();
  expect(panel).toHaveBeenLastCalledWith(false, true);
  core!.comment!(); await tick();
  expect(root.querySelector<HTMLTextAreaElement>('.composer textarea')!.value).toBe('Button is grey');
});
