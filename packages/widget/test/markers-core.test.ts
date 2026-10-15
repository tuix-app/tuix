// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), panel: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import { mountSettings } from '../src/settings';
import { preferenceEvent, readPreferences } from '../src/preferences';
import type { Core } from '../src/types';
let core: Core | undefined;
let settings: ReturnType<typeof mountSettings> | undefined;
afterEach(() => {
  settings?.destroy(); settings = undefined;
  core?.destroy(); core = undefined; localStorage.clear();
  history.replaceState({}, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren();
});

const issue = { id: 'issue', number: 7, title: 'Save is hidden', body: 'Save is hidden', status: 'open', state: 'open', type: 'bug', severity: 'major', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' }, author: { name: 'Reporter' }, own: false, comment_count: 0, comments: [], inserted_at: new Date().toISOString() };

function fixture(capture = { screenshot: false, console: false, network: false }) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture };
    if (path.startsWith('/issues?')) return { issues: [issue] };
    if (path === '/issues/issue') return issue;
    return { notifications: [] };
  });
  const target = document.createElement('button');
  target.dataset.testid = 'save'; target.textContent = 'Save';
  document.body.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 200, width: 40, height: 20 } as DOMRect);
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture' }, { id: 'reviewer', name: 'Reviewer' }, mock.panel);
  settings = mountSettings(root, launcher, { project: 'fixture' }, () => core!.open(), () => window.dispatchEvent(new CustomEvent(preferenceEvent)));
  return root;
}
async function choose(root: ShadowRoot, setting: string, value: string) {
  const element = root.querySelector<HTMLElement>(`[data-setting="${setting}"]${setting === 'pinned' ? '' : `[data-value="${value}"]`}`)!;
  element.click();
  await vi.advanceTimersByTimeAsync(50);
}

it('centres both marker styles on the element and keeps the chosen one after the sidebar closes', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const dot = root.querySelector<HTMLElement>('.pin')!;
  expect(dot.style.left).toBe('106px');
  expect(dot.style.top).toBe('196px');
  expect(root.querySelector('.marker')).toBeNull();

  await choose(root, 'markers', 'border');
  const outline = root.querySelector<HTMLElement>('.marker')!;
  expect([outline.style.left, outline.style.top, outline.style.width, outline.style.height]).toEqual(['100px', '200px', '40px', '20px']);
  expect(outline.getAttribute('aria-hidden')).toBe('true');
  expect(root.querySelector('.pin')).toBeNull();

  await choose(root, 'markers', 'dot');
  await choose(root, 'pinned', 'on');
  expect(localStorage.getItem('tuix:markers:fixture')).toBe('on:dot');

  core!.close(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.panel')).toBeNull();
  expect(root.querySelector('.pin')).not.toBeNull();
  expect(mock.panel).toHaveBeenLastCalledWith(false);

  root.querySelector<HTMLButtonElement>('.pin')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(root.querySelector('.thread-body')?.textContent).toBe('Save is hidden');
  // The host SDK owns the launcher's open state, so a marker-opened sidebar must report itself.
  expect(mock.panel).toHaveBeenLastCalledWith(true);
});

it('stays idle without the preference and draws stored markers without opening the sidebar or capturing', async () => {
  const hostFetch = vi.fn().mockResolvedValue(new Response());
  vi.stubGlobal('fetch', hostFetch);
  const hostConsole = console.error;
  const idle = fixture({ screenshot: false, console: true, network: true });
  await vi.advanceTimersByTimeAsync(120000);
  expect(mock.request).not.toHaveBeenCalled();
  expect(idle.querySelector('.pin')).toBeNull();
  core!.destroy(); core = undefined; document.body.replaceChildren();

  localStorage.setItem('tuix:markers:fixture', 'on:border');
  const root = fixture({ screenshot: false, console: true, network: true });
  await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.marker')).not.toBeNull();
  expect(root.querySelector('.panel')).toBeNull();
  // Markers alone never instrument the host application.
  expect(window.fetch).toBe(hostFetch);
  expect(console.error).toBe(hostConsole);

  core!.open(); await vi.advanceTimersByTimeAsync(200);
  expect(window.fetch).not.toBe(hostFetch);
  expect(console.error).not.toBe(hostConsole);
});

it('reconciles navigation that happened while markers and the sidebar were inactive', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  core!.close(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.panel')).toBeNull();

  history.pushState({}, '', '/invoices/1044');
  mock.request.mockClear();
  core!.open(); await vi.advanceTimersByTimeAsync(200);

  expect(mock.request.mock.calls.some(([path]) =>
    String(path).includes('route_key=%2Finvoices%2F%3Aparam')
  )).toBe(true);
});
it('does not reuse a concrete-page marker when a normalized route stays the same', async () => {
  history.replaceState({}, '', '/invoices/123');
  const root = fixture();
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [{ ...issue, url: location.origin + '/invoices/123' }] };
    return { notifications: [] };
  });
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pin')).not.toBeNull();
  history.pushState({}, '', '/invoices/456');
  await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pin')).toBeNull();
  expect(mock.request.mock.calls.some(([path]) => {
    const query = new URL(String(path), location.origin).searchParams;
    return query.get('page_url') === location.origin + '/invoices/456' && query.get('route_key') === '/invoices/:param';
  })).toBe(true);
});

it('does not draw markers for reports with no concrete URL', async () => {
  const root = fixture();
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [{ ...issue, url: undefined }] };
    return { notifications: [] };
  });
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pin')).toBeNull();
});

it('does not reload all-page reports when current-page markers refresh', async () => {
  localStorage.setItem('tuix:preferences:fixture', JSON.stringify({ scope: 'all', show: 'all' }));
  fixture(); core!.open(); await vi.advanceTimersByTimeAsync(200);
  const reportRequests = () => mock.request.mock.calls.filter(([path]) => String(path).includes('scope=all')).length;
  expect(reportRequests()).toBe(1);
  await vi.advanceTimersByTimeAsync(60100);
  expect(mock.request.mock.calls.filter(([path]) => String(path).includes('page_url=')).length).toBeGreaterThan(1);
  expect(reportRequests()).toBe(1);
});

it('opens a thread from a dot while comment mode is selecting', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLButtonElement>('.pin')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.thread-body')).not.toBeNull();
  expect(root.querySelector('[data-action="add-comment"]')).toBeNull();
  expect(root.querySelector('.toolbar')).toBeNull();
  root.querySelector<HTMLButtonElement>('.panel .content > button')!.click(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLButtonElement>('[data-action="add-comment"]')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pick-surface')).not.toBeNull();
  expect(root.querySelector('.panel')).toBeNull();
  root.querySelector<HTMLButtonElement>('.pin')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.pick-surface')).toBeNull();
  expect(root.querySelector('.thread-body')?.textContent).toBe('Save is hidden');
});

const done = { ...issue, id: '00000000-0000-4000-8000-000000000008', number: 8, title: 'Fixed already', body: 'Fixed already', status: 'resolved', state: 'done' };
/** The server filters by `show` (Tuix.Widget.Issues): All is every state, unresolved leaves out Done, Won't fix and Closed. */
function closedFixture() {
  const root = fixture();
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: new URLSearchParams(path.split('?')[1]).get('show') === 'all' ? [issue, done] : [issue], next_before: null };
    if (path === '/issues/' + done.id) return done;
    return { notifications: [] };
  });
  return root;
}

it('keeps closed reports out of the lists until Hide closed is turned off, and never pins them', async () => {
  localStorage.setItem('tuix:preferences:fixture', JSON.stringify({ show: 'all' }));
  const root = closedFixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const listed = () => [...root.querySelectorAll('.issue-item strong')].map(title => title.textContent);
  const shows = () => mock.request.mock.calls.map(([path]) => String(path)).filter(path => path.startsWith('/issues?')).map(path => new URLSearchParams(path.split('?')[1]).get('show'));
  expect(listed()).toEqual(['Save is hidden']);
  expect(new Set(shows())).toEqual(new Set(['unresolved']));
  expect(root.querySelectorAll('.pin')).toHaveLength(1);
  const hide = root.querySelector<HTMLInputElement>('.settings-flyout [data-setting=hide-closed]')!;
  expect(hide.checked).toBe(true);
  // Turning it off shows them at once; markers still show only unresolved reports.
  mock.request.mockClear(); hide.click(); await vi.advanceTimersByTimeAsync(100);
  expect(listed()).toEqual(['Save is hidden', 'Fixed already']);
  expect(shows()).toEqual(['all']);
  expect(root.querySelectorAll('.pin')).toHaveLength(1);
  // An open thread of a closed report stays open when Hide closed comes back on; the list then leaves it out again.
  root.querySelectorAll<HTMLButtonElement>('.issue-item')[1].click(); await vi.advanceTimersByTimeAsync(200);
  hide.click(); await vi.advanceTimersByTimeAsync(100);
  expect(readPreferences('fixture').hideClosed).toBe(true);
  expect(root.querySelector('.thread-body')?.textContent).toBe('Fixed already');
  root.querySelector<HTMLButtonElement>('.panel .content > button')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(listed()).toEqual(['Save is hidden']);
});

it('opens a report link to a closed report while Hide closed is on', async () => {
  history.replaceState({}, '', '/?tuix=' + done.id);
  const root = closedFixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  expect(readPreferences('fixture').hideClosed).toBe(true);
  expect(root.querySelector('.thread-body')?.textContent).toBe('Fixed already');
});

// jsdom has no onpointer* handlers, so Preact would listen for "PointerEnter"; with them it listens for "pointerenter" as in browsers.
for (const name of ['onpointerenter', 'onpointerleave']) if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true, configurable: true });

function pointer(type: string, init: { clientX?: number; clientY?: number; pointerType?: string } = {}) {
  const event = new MouseEvent(type, { bubbles: type !== 'pointerenter' && type !== 'pointerleave', composed: true, clientX: init.clientX, clientY: init.clientY });
  Object.defineProperty(event, 'pointerType', { value: init.pointerType ?? 'mouse' });
  return event;
}
/** Moves the pointer over the page every frame (16ms) for `ms`. */
async function sweep(points: [number, number][], ms: number) {
  for (let elapsed = 0, index = 0; elapsed < ms; elapsed += 16, index++) {
    const [clientX, clientY] = points[index % points.length];
    document.body.dispatchEvent(pointer('pointermove', { clientX, clientY }));
    await vi.advanceTimersByTimeAsync(16);
  }
}
const cardShown = (root: ShadowRoot) => !!root.querySelector('.marker-card');

it('shows a hover card with the start of the description over a dot, and keeps it while the pointer is on it', async () => {
  const root = fixture();
  Object.assign(issue, { excerpt: 'Save is hidden\nbelow the fold <b>on mobile</b>' });
  try {
    core!.open(); await vi.advanceTimersByTimeAsync(200);
    const dot = root.querySelector<HTMLButtonElement>('.pin')!;
    // The card replaces the native tooltip.
    expect(dot.hasAttribute('title')).toBe(false);

    dot.dispatchEvent(pointer('pointerenter', { pointerType: 'touch' })); await vi.advanceTimersByTimeAsync(300);
    expect(cardShown(root)).toBe(false);

    dot.dispatchEvent(pointer('pointerenter')); await vi.advanceTimersByTimeAsync(100);
    expect(cardShown(root)).toBe(false);
    await vi.advanceTimersByTimeAsync(100);
    const card = root.querySelector<HTMLElement>('.marker-card')!;
    expect(card.getAttribute('role')).toBe('tooltip');
    expect(card.querySelector('.marker-card-meta')!.textContent).toBe('#7 · Open');
    // Text, never HTML.
    expect(card.querySelector('.marker-card-body')!.textContent).toBe('Save is hidden\nbelow the fold <b>on mobile</b>');
    expect(card.querySelector('b')).toBeNull();
    expect(dot.getAttribute('aria-describedby')).toBe(card.id);
    // Below the 28px dot (top 196), centred on it and inside the viewport.
    expect(card.dataset.placement).toBe('below');
    expect(card.style.top).toBe('232px');

    // The card lets clicks through, so the pointer is found on it by position: there it stays; off it, it goes.
    vi.spyOn(card, 'getBoundingClientRect').mockReturnValue({ left: 8, right: 328, top: 232, bottom: 300, width: 320, height: 68 } as DOMRect);
    dot.dispatchEvent(pointer('pointerleave'));
    await sweep([[100, 250], [110, 260]], 500);
    expect(cardShown(root)).toBe(true);
    await sweep([[600, 600], [610, 610]], 300);
    expect(cardShown(root)).toBe(false);
    expect(dot.hasAttribute('aria-describedby')).toBe(false);
  } finally { delete (issue as { excerpt?: string }).excerpt; }
});

it('shows the card at once for keyboard focus, closes only the card with Escape, and falls back to the title', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const dot = root.querySelector<HTMLButtonElement>('.pin')!;
  dot.dispatchEvent(new FocusEvent('focus')); await vi.advanceTimersByTimeAsync(200);
  // A server without excerpts: the title.
  expect(root.querySelector('.marker-card-body')!.textContent).toBe('Save is hidden');
  // Escape dismisses the card and leaves the sidebar open; a second one closes the sidebar as before.
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  expect(cardShown(root)).toBe(false);
  expect(root.querySelector('.panel')).not.toBeNull();
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.panel')).toBeNull();

  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const again = root.querySelector<HTMLButtonElement>('.pin')!;
  again.dispatchEvent(new FocusEvent('focus')); await vi.advanceTimersByTimeAsync(50);
  expect(cardShown(root)).toBe(true);
  again.dispatchEvent(new FocusEvent('blur')); await vi.advanceTimersByTimeAsync(50);
  expect(cardShown(root)).toBe(false);
});

it('shows an outline marker\'s card while the pointer moves over the marked element, with the sidebar closed', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  await choose(root, 'markers', 'border');
  await choose(root, 'pinned', 'on');
  core!.close(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.marker')).not.toBeNull();

  // Moving inside the element's box (100,200 40×20) the whole time: the card shows after the hover delay anyway.
  await sweep([[110, 205], [130, 215]], 200);
  const card = root.querySelector<HTMLElement>('.marker-card')!;
  expect(card.querySelector('.marker-card-body')!.textContent).toBe('Save is hidden');
  expect(card.style.top).toBe('228px');

  // Moving off it, still moving: it hides.
  await sweep([[400, 500], [420, 520]], 200);
  expect(cardShown(root)).toBe(false);
});

it('drops the card when its marker goes, and does not bring it back by itself', async () => {
  const root = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const target = document.querySelector<HTMLElement>('[data-testid="save"]')!;
  const dot = root.querySelector<HTMLButtonElement>('.pin')!;
  dot.dispatchEvent(pointer('pointerenter')); await vi.advanceTimersByTimeAsync(200);
  expect(cardShown(root)).toBe(true);

  // Scrolled out of the viewport: the marker and its card go.
  vi.mocked(target.getBoundingClientRect).mockReturnValue({ x: 100, y: -500, width: 40, height: 20 } as DOMRect);
  document.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.pin')).toBeNull();
  expect(cardShown(root)).toBe(false);

  // Back in view, with no pointer on it: no card.
  vi.mocked(target.getBoundingClientRect).mockReturnValue({ x: 100, y: 200, width: 40, height: 20 } as DOMRect);
  document.dispatchEvent(new Event('scroll')); await vi.advanceTimersByTimeAsync(500);
  expect(root.querySelector('.pin')).not.toBeNull();
  expect(cardShown(root)).toBe(false);
});
