// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
import { tuix } from '../src/index';
const types = ['keydown', 'keypress', 'keyup'];
let shortcut: ((event: Event) => void) | undefined;
afterEach(async () => {
  tuix.destroy(); await vi.advanceTimersByTimeAsync(200);
  for (const type of types) { document.removeEventListener(type, shortcut!); window.removeEventListener(type, shortcut!); }
  history.replaceState({}, '', '/'); localStorage.clear(); document.body.replaceChildren();
  vi.useRealTimers(); vi.restoreAllMocks(); mocks.request.mockReset();
});
const report = { id: '00000000-0000-4000-8000-000000000003', number: 3, title: 'Save overlaps', body: 'Save overlaps', status: 'open', state: 'open', type: 'bug', env_name: 'uat', url: location.origin + '/', locators: {}, author: { name: 'Anna' }, comments: [], allowed_states: [], inserted_at: '2026-10-09T10:00:00Z' };
/** Real keys are composed: they leave the shadow root, retargeted to <tuix-widget>. */
const press = (target: Element, key: string, init: KeyboardEventInit = {}) => { for (const type of types) target.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true, composed: true, cancelable: true, ...init })); };

it('keeps keys pressed in the widget from the page, while Escape and the panel shortcuts still work', async () => {
  vi.useFakeTimers();
  mocks.request.mockImplementation(async (path: string, method = 'GET') => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } }
    : path.startsWith('/issues?') ? { issues: [], next_before: null } : path === '/issues/' + report.id || (path === '/issues' && method === 'POST') ? report : { notifications: [] });
  let root!: ShadowRoot; const attach = Element.prototype.attachShadow;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { root = attach.call(this, options); return root; });
  // A host shortcut handler in the bubble phase, on the document and the window, as the dashboard's j/k keys are.
  // It must see nothing pressed in the widget but Escape.
  const seen: string[] = [];
  shortcut = event => { seen.push(event.type + ' ' + (event as KeyboardEvent).key); };
  for (const type of types) { document.addEventListener(type, shortcut); window.addEventListener(type, shortcut); }
  const target = document.createElement('button'); target.textContent = 'Save'; document.body.append(target);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  // A report link opens its thread and the reply box.
  history.replaceState({}, '', '/?tuix=' + report.id);
  tuix.init({ project: 'keys', lang: 'en' }); tuix.identify({ id: 'a', name: 'A' });
  await vi.waitFor(() => expect(root.querySelector('.mention-field textarea')).not.toBeNull());
  const reply = root.querySelector<HTMLTextAreaElement>('.mention-field textarea')!;
  press(reply, ' '); press(reply, 'j');
  // The settings flyout shares the shadow root: its Environment select (local development) is a field too.
  press(root.querySelector('.settings-flyout select')!, 'j');
  expect(seen).toEqual([]);
  // Keys pressed on its buttons stay in the widget too: a host that cancels Space or Enter would stop them activating.
  press(root.querySelector('#tuix-launcher')!, ' '); press(root.querySelector('#tuix-settings-toggle')!, 'Enter');
  press(root.querySelector('.panel button')!, 'Tab');
  expect(seen).toEqual([]);
  // Escape from a field still reaches the page, and the panel's own capture handler still closes it.
  seen.length = 0; press(reply, 'Escape'); await vi.advanceTimersByTimeAsync(50);
  expect(seen).toEqual(types.flatMap(type => [type + ' Escape', type + ' Escape']));
  expect(root.querySelector('.panel')).toBeNull();
  // The composer: a space typed in it stays in the widget, and Ctrl+Enter still sends it.
  root.querySelector<HTMLButtonElement>('#tuix-launcher')!.click(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLElement>('.pick-surface')!.click(); await vi.advanceTimersByTimeAsync(50);
  const body = root.querySelector<HTMLTextAreaElement>('.composer textarea')!;
  seen.length = 0; press(body, ' ');
  body.value = 'Save overlaps'; body.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  press(body, 'Enter', { ctrlKey: true }); await vi.advanceTimersByTimeAsync(100);
  expect(seen).toEqual([]);
  expect(mocks.request).toHaveBeenCalledWith('/issues', 'POST', expect.objectContaining({ body: 'Save overlaps' }));
});
