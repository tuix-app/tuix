// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), panel: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
// Marker resolution runs in frame batches; counting them shows when the markers are resolved again.
vi.mock('../src/frame-batch', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/frame-batch')>();
  return { ...actual, frameBatch: vi.fn(actual.frameBatch) };
});
import { frameBatch } from '../src/frame-batch';
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
// Browsers have `onpointerenter` and its siblings on elements, which tells Preact the event's casing; jsdom does not.
for (const name of ['onpointerenter', 'onpointerleave']) if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true, configurable: true });
afterEach(() => {
  core?.destroy(); core = undefined; localStorage.clear();
  history.replaceState({}, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren();
});

const report = (number: number, extra: Record<string, unknown> = {}) => ({
  id: 'issue-' + number, number, title: 'Save is hidden ' + number, body: 'Body', status: 'open', state: 'open', type: 'bug', severity: 'major', env_name: 'uat', url: location.origin + '/',
  locators: { testid: `[data-testid="t${number}"]` }, author: { name: 'Reporter' }, own: false, comment_count: 1, comments: [], inserted_at: new Date().toISOString(),
  latest_comment: { author: { name: 'Anna' }, team: true, body: 'We are looking into it.', inserted_at: new Date().toISOString() }, unread: false, ...extra,
});
type Box = [number, number, number, number];
/**
 * A page with one element per report (at `boxes[number]`), the widget mounted with markers of `style` drawn without the sidebar,
 * and a server that answers the list with `reports`. Fake timers drive the hover delays.
 */
async function page(reports: ReturnType<typeof report>[], boxes: Record<number, Box>, style = 'dot', options: { touch?: boolean; lang?: 'en' | 'pl'; notifications?: unknown[] } = {}) {
  vi.useFakeTimers();
  // jsdom does not scroll; opening a report scrolls its element into view.
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: options.touch ? query.includes('hover: none') : query.includes('reduce') }));
  localStorage.setItem('tuix:markers:hover', 'on:' + style);
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: reports };
    if (path.startsWith('/issues/')) return reports.find(item => path === '/issues/' + item.id) ?? reports[0];
    return { notifications: options.notifications ?? [] };
  });
  for (const { number } of reports) {
    const target = document.createElement('button');
    target.dataset.testid = 't' + number; target.textContent = 'Target ' + number;
    document.body.append(target);
    const [x, y, width, height] = boxes[number];
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x, y, width, height } as DOMRect);
  }
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'hover', lang: options.lang }, { id: 'reviewer', name: 'Reviewer' }, mock.panel);
  await vi.advanceTimersByTimeAsync(300);
  return { root, host };
}
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const card = (root: ShadowRoot) => root.querySelector<HTMLElement>('.hover-card');
const enter = (element: Element) => element.dispatchEvent(new Event('pointerenter'));
const leave = (element: Element) => element.dispatchEvent(new Event('pointerleave'));
/** A pointer move on the page (or, with `over`, on tuix itself) as the window sees it. */
const move = (x: number, y: number, over?: Element) => (over ?? document.body).dispatchEvent(Object.assign(new MouseEvent('pointermove', { bubbles: true, composed: true, clientX: x, clientY: y }), { pointerType: 'mouse' }));

it('replaces the dot title with a card after a short delay, and keeps it while the pointer travels in', async () => {
  const { root } = await page([report(7, { unread: true })], { 7: [100, 200, 40, 20] });
  const dot = root.querySelector<HTMLElement>('.pin')!;
  expect(dot.hasAttribute('title')).toBe(false);
  mock.request.mockClear();

  enter(dot); await wait(150);
  expect(card(root)).toBeNull();
  await wait(60);
  const shown = card(root)!;
  expect(shown.querySelector('.card-title strong')?.textContent).toBe('#7 Save is hidden 7');
  expect(shown.querySelector('.status')?.textContent).toBe('Open');
  expect(shown.querySelector('.card-reply')?.textContent).toBe('Team We are looking into it.');
  expect(shown.querySelector('.unread-dot')).not.toBeNull();
  expect(dot.getAttribute('aria-describedby')).toBe(shown.id);
  // Beside the dot (right of its 28px square), inside the viewport.
  expect(Number.parseInt(shown.style.left)).toBe(106 + 28 + 10);

  // The pointer leaves the dot but reaches the card inside the linger time: it stays.
  leave(dot); await wait(100); enter(shown); await wait(500);
  expect(card(root)).not.toBeNull();
  leave(shown); await wait(150);
  expect(card(root)).not.toBeNull();
  await wait(100);
  expect(card(root)).toBeNull();
  // Showing a card reads the list the markers already loaded: no request per hover.
  expect(mock.request).not.toHaveBeenCalled();
});

it('shows only one card, never before the delay when the pointer just passes, and gives up when it leaves early', async () => {
  const { root } = await page([report(1), report(2)], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] });
  const [first, second] = root.querySelectorAll<HTMLElement>('.pin');
  enter(first); await wait(100); leave(first); await wait(400);
  expect(card(root)).toBeNull();

  enter(first); await wait(250);
  expect(root.querySelectorAll('.hover-card')).toHaveLength(1);
  leave(first); enter(second); await wait(250);
  expect(root.querySelectorAll('.hover-card')).toHaveLength(1);
  expect(card(root)!.querySelector('strong')?.textContent).toBe('#2 Save is hidden 2');
});

it('opens on keyboard focus at once and closes on Escape, blur and page scroll', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const dot = root.querySelector<HTMLElement>('.pin')!;
  dot.dispatchEvent(new Event('focus'));
  await wait(50);
  expect(card(root)).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(50);
  expect(card(root)).toBeNull();

  dot.dispatchEvent(new Event('focus')); await wait(50);
  dot.dispatchEvent(new Event('blur')); await wait(250);
  expect(card(root)).toBeNull();

  dot.dispatchEvent(new Event('focus')); await wait(50);
  expect(card(root)).not.toBeNull();
  window.dispatchEvent(new Event('scroll')); await wait(50);
  expect(card(root)).toBeNull();
});

it('opens the report from the card as a click on the dot does, and the card goes away', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  enter(root.querySelector('.pin')!); await wait(250);
  card(root)!.click(); await wait(200);
  // The report opens in a window beside the element (chat-core.test.ts); the sidebar stays closed.
  expect(root.querySelector('.chat-window')?.textContent).toContain('Body');
  expect(card(root)).toBeNull();
  expect(mock.panel).not.toHaveBeenCalledWith(true);
  expect(mock.request.mock.calls.some(([path]) => path === '/issues/issue-7')).toBe(true);
});

it('hides the card when the sidebar opens', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)).not.toBeNull();
  core!.open(); await wait(200);
  expect(card(root)).toBeNull();
});

it('hit-tests outlines and fills against the pointer, picks the smallest box where they overlap, and lets clicks through', async () => {
  for (const style of ['border', 'fill']) {
    const { root } = await page([report(1), report(2)], { 1: [100, 100, 400, 300], 2: [150, 150, 60, 40] }, style);
    expect(root.querySelector('.pin')).toBeNull();
    // Only the larger box.
    move(450, 350); await wait(40);
    expect(card(root)).toBeNull();
    await wait(200);
    expect(card(root)!.querySelector('strong')?.textContent).toBe('#1 Save is hidden 1');
    // Overlap: the smaller box wins.
    move(160, 160); await wait(40);
    await wait(250);
    expect(card(root)!.querySelector('strong')?.textContent).toBe('#2 Save is hidden 2');
    // Leaving every box closes the card after the linger time.
    move(900, 700); await wait(100);
    expect(card(root)).not.toBeNull();
    await wait(150);
    expect(card(root)).toBeNull();
    // The overlays stay decorative: no tab stop, nothing for a screen reader.
    expect(root.querySelector('.marker')!.getAttribute('aria-hidden')).toBe('true');
    core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();
  }
});

it('keeps an outline card open while the pointer travels to it, and closes it once the pointer is away from both', async () => {
  const { root } = await page([report(1)], { 1: [100, 100, 200, 100] }, 'border');
  move(150, 150); await wait(300);
  const shown = card(root)!;
  expect(shown).not.toBeNull();
  // The pointer leaves the box for the gap: the card lingers, and the pointer reaches it in time.
  move(320, 150); await wait(100);
  expect(card(root)).not.toBeNull();
  enter(shown); await wait(500);
  expect(card(root)).not.toBeNull();
  // Over the card the page sees the widget host, which is not a move off the marker.
  move(340, 150, shown); await wait(500);
  expect(card(root)).not.toBeNull();
  leave(shown); await wait(150);
  expect(card(root)).not.toBeNull();
  await wait(100);
  expect(card(root)).toBeNull();
});

it('hit-tests once per frame and only while outlines or fills are drawn, and removes the listener on cleanup', async () => {
  const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener');
  const moves = () => add.mock.calls.filter(([type]) => type === 'pointermove');
  const dots = await page([report(1)], { 1: [100, 100, 200, 100] }, 'dot');
  expect(dots.root.querySelector('.pin')).not.toBeNull();
  expect(moves()).toHaveLength(0);
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  await page([report(1)], { 1: [100, 100, 200, 100] }, 'border');
  expect(moves()).toHaveLength(1);
  expect(moves()[0][2]).toMatchObject({ passive: true });
  const raf = vi.spyOn(window, 'requestAnimationFrame');
  for (let i = 0; i < 20; i++) move(150 + i, 150);
  expect(raf).toHaveBeenCalledTimes(1);
  await wait(20);
  core!.destroy(); core = undefined;
  expect(remove.mock.calls.some(([type]) => type === 'pointermove')).toBe(true);
});

it('shows no card and listens to no pointer on touch-first devices; a tap still opens the report', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] }, 'dot', { touch: true });
  const dot = root.querySelector<HTMLButtonElement>('.pin')!;
  enter(dot); dot.dispatchEvent(new Event('focus')); await wait(500);
  expect(card(root)).toBeNull();
  dot.click(); await wait(200);
  expect(root.querySelector('.thread-body')).not.toBeNull();
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  await page([report(7)], { 7: [100, 200, 40, 20] }, 'fill', { touch: true });
  expect(add.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0);
});

it('does not show a card while selecting an element for a new comment', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  core!.comment!(); await wait(200);
  enter(root.querySelector('.pin')!); await wait(500);
  expect(card(root)).toBeNull();
});

it('shows what it has when an older server sends no reply or unread fields, and says so when there are no replies', async () => {
  const bare = report(7);
  delete (bare as Partial<typeof bare>).latest_comment; delete (bare as Partial<typeof bare>).unread;
  const { root } = await page([bare, report(8, { latest_comment: null })], { 7: [100, 200, 40, 20], 8: [400, 200, 40, 20] });
  const [older, silent] = root.querySelectorAll<HTMLElement>('.pin');
  enter(older); await wait(250);
  expect(card(root)!.querySelector('.card-reply')).toBeNull();
  expect(card(root)!.querySelector('.unread-dot')).toBeNull();
  expect(card(root)!.querySelector('.card-title strong')?.textContent).toBe('#7 Save is hidden 7');
  leave(older); enter(silent); await wait(250);
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('No replies yet');
});

it('reads an older server unread state from the updates list, and clears the dot once the report is read', async () => {
  const update = { id: 'n1', issue_id: 'issue-7', kind: 'member_reply', inserted_at: new Date().toISOString(), issue: null };
  const { root } = await page([report(7, { unread: undefined })], { 7: [100, 200, 40, 20] }, 'dot', { notifications: [update] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.querySelector('.unread-dot')).not.toBeNull();
  expect(card(root)!.getAttribute('aria-label')).toContain('New updates');

  // Opening the report acknowledges it, and the server then lists it as read.
  let read = false;
  mock.request.mockImplementation(async (path: string) => {
    if (path.endsWith('/read')) read = true;
    return path.startsWith('/issues?') ? { issues: [report(7, { unread: !read })] } : path === '/issues/issue-7' ? report(7) : { notifications: [] };
  });
  card(root)!.click(); await wait(200);
  expect(root.querySelector('.chat-window')).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(50);
  expect(root.querySelector('.chat-window')).toBeNull();
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)).not.toBeNull();
  expect(card(root)!.querySelector('.unread-dot')).toBeNull();
});

it('flags the server unread state, and the moved note on an orphan marker', async () => {
  const orphan = report(7, { unread: true, locators: { testid: '[data-testid="gone"]', rect: { x: 100, y: 200, w: 40, h: 20 } } });
  const { root } = await page([orphan], { 7: [0, 0, 0, 0] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.querySelector('.unread-dot')).not.toBeNull();
  expect(card(root)!.textContent).toContain('Element moved');
});

it('renders titles and replies as text, never HTML', async () => {
  const hostile = report(7, { title: '<img src=x onerror=alert(1)>', latest_comment: { author: { name: '<b>Anna</b>' }, team: false, body: '<script>alert(2)</script> hi', inserted_at: new Date().toISOString() } });
  const { root } = await page([hostile], { 7: [100, 200, 40, 20] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.querySelector('img, script, b')).toBeNull();
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('<b>Anna</b> <script>alert(2)</script> hi');
});

it('keeps the card inside the viewport, beside the marker or below it when the sides are full', async () => {
  const { root } = await page([report(1), report(2)], { 1: [innerWidth - 60, 20, 40, 20], 2: [10, innerHeight - 40, innerWidth - 20, 30] });
  const [edge, wide] = root.querySelectorAll<HTMLElement>('.pin');
  enter(edge); await wait(250);
  let shown = card(root)!;
  expect(Number.parseInt(shown.style.left) + 272).toBeLessThanOrEqual(innerWidth - 8);
  expect(Number.parseInt(shown.style.left) + 272).toBeLessThanOrEqual(Number.parseInt(edge.style.left));
  leave(edge); await wait(250);
  expect(card(root)).toBeNull();
  // The dot sits at the bottom edge of a full-width element: the card moves up and stays on screen.
  enter(wide); await wait(250);
  shown = card(root)!;
  expect(Number.parseInt(shown.style.top) + 132).toBeLessThanOrEqual(innerHeight - 8);
  expect(Number.parseInt(shown.style.top)).toBeGreaterThanOrEqual(8);
});

it('places a tall card, with its turn line and a long reply, inside the viewport by its measured height', async () => {
  // jsdom lays nothing out: the card reports a height as a browser would for a card that wraps onto more lines than the first-frame guess.
  const height = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('hover-card') ? 220 : 0; });
  const { root } = await page([report(1, { turn: 'reporter', latest_comment: { author: { name: 'Anna' }, team: true, body: 'Long reply. '.repeat(30), inserted_at: new Date().toISOString() } })], { 1: [10, innerHeight - 40, innerWidth - 20, 30] });
  enter(root.querySelector('.pin')!); await wait(250);
  const shown = card(root)!;
  expect(Number.parseInt(shown.style.top) + 220).toBeLessThanOrEqual(innerHeight - 8);
  expect(Number.parseInt(shown.style.top)).toBeGreaterThanOrEqual(8);
  height.mockRestore();
});

it('does not resolve the markers again when a report is read, and still redraws its card', async () => {
  const { root } = await page([report(7, { unread: true })], { 7: [100, 200, 40, 20] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.querySelector('.unread-dot')).not.toBeNull();
  leave(root.querySelector('.pin')!); await wait(250);
  // Reading acknowledges the report. Neither the list nor the settings (a new settings object re-resolves too) are read again before the card is drawn.
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return new Promise(() => {});
    if (path.startsWith('/issues?')) return new Promise(() => {});
    if (path.startsWith('/issues/')) return report(7);
    return { notifications: [] };
  });
  vi.mocked(frameBatch).mockClear();
  root.querySelector<HTMLElement>('.pin')!.click(); await wait(200);
  expect(root.querySelector('.chat-window')).not.toBeNull();
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(300);
  expect(frameBatch).not.toHaveBeenCalled();
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)).not.toBeNull();
  expect(card(root)!.querySelector('.unread-dot')).toBeNull();
});

it('keeps every marker while the list is fetched again and resolved over several frames', async () => {
  const reports = Array.from({ length: 12 }, (_, index) => report(index + 1)), boxes: Record<number, Box> = {};
  for (const { number } of reports) boxes[number] = [20 + number * 30, 100, 20, 20];
  const { root } = await page(reports, boxes);
  expect(root.querySelectorAll('.pin').length).toBe(12);
  // Each list answer carries fresh locator objects, so the markers are resolved again; more than a frame batch (8) of reports takes more than one frame. The settings stay as they were, so nothing else restarts the resolution.
  mock.request.mockImplementation(async (path: string) => path.startsWith('/issues?') ? { issues: structuredClone(reports) } : path === '/config' ? new Promise(() => {}) : { notifications: [] });
  vi.mocked(frameBatch).mockClear();
  const counts: number[] = [];
  await wait(55_000);
  for (let elapsed = 0; elapsed < 12_000; elapsed += 4) { await wait(4); counts.push(root.querySelectorAll('.pin').length); }
  expect(frameBatch).toHaveBeenCalled();
  expect(Math.min(...counts)).toBe(12);
});

it('speaks Polish', async () => {
  const { root } = await page([report(8, { latest_comment: null })], { 8: [100, 200, 40, 20] }, 'dot', { lang: 'pl' });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('Brak odpowiedzi');
  expect(card(root)!.querySelector('.status')?.textContent).toBe('Otwarte');
});

it('names a team reply "Team" in the viewer language, and a person by name', async () => {
  const { root } = await page([report(7, { latest_comment: { author: { name: 'Team' }, team: true, body: 'Looking.', inserted_at: new Date().toISOString() } }), report(8, { latest_comment: { author: { name: 'Anna' }, team: false, body: 'Hi.', inserted_at: new Date().toISOString() } })], { 7: [100, 200, 40, 20], 8: [400, 200, 40, 20] }, 'dot', { lang: 'pl' });
  const [team, person] = root.querySelectorAll<HTMLElement>('.pin');
  enter(team); await wait(250);
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('Zespół Looking.');
  expect(card(root)!.getAttribute('aria-label')).toContain('Zespół: Looking.');
  leave(team); enter(person); await wait(250);
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('Anna Hi.');
});

it('closes an outline card once the pointer moves onto the sidebar, and not before the linger time', async () => {
  const { root } = await page([report(1)], { 1: [100, 100, 600, 100] }, 'border');
  core!.open(); await wait(300);
  const panel = root.querySelector<HTMLElement>('.panel')!;
  move(150, 150); await wait(300);
  expect(card(root)).not.toBeNull();
  move(500, 150, panel); await wait(100);
  expect(card(root)).not.toBeNull();
  await wait(150);
  expect(card(root)).toBeNull();
  // A pointer move queued for the box does not reopen it from the panel.
  move(150, 150); move(500, 150, panel); await wait(500);
  expect(card(root)).toBeNull();
});

it('lets Escape dismiss only the card while the sidebar is open', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  core!.open(); await wait(300);
  const dot = root.querySelector<HTMLElement>('.pin')!;
  dot.dispatchEvent(new Event('focus')); await wait(50);
  expect(card(root)).not.toBeNull();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(50);
  expect(card(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(300);
  expect(root.querySelector('.panel')).toBeNull();
});

it('hands keyboard focus back to the dot when its card closes under it, without reopening the card', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const dot = root.querySelector<HTMLElement>('.pin')!;
  dot.focus(); await wait(50);
  expect(card(root)).not.toBeNull();
  card(root)!.focus();
  expect(root.activeElement).toBe(card(root));
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); await wait(500);
  expect(card(root)).toBeNull();
  expect(root.activeElement).toBe(dot);
});

it('shows no card for a report that is still sending, and a click cannot open it', async () => {
  const { root } = await page([report(2)], { 2: [400, 400, 100, 50] }, 'border');
  const target = document.createElement('button'); document.body.append(target);
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 100, width: 200, height: 100 } as DOMRect);
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [target] });
  let finish: (value: unknown) => void = () => {};
  mock.request.mockImplementation(async (path: string, method?: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path === '/issues' && method === 'POST') return new Promise(resolve => { finish = resolve; });
    return path.startsWith('/issues?') ? { issues: [report(2)] } : { notifications: [] };
  });
  core!.comment!(); await wait(10200);
  root.querySelector<HTMLElement>('.pick-surface')!.click(); await wait(50);
  const textarea = root.querySelector<HTMLTextAreaElement>('.composer textarea')!;
  textarea.value = 'Brand new'; textarea.dispatchEvent(new Event('input', { bubbles: true })); await wait(50);
  root.querySelector<HTMLFormElement>('.composer form')!.requestSubmit(); await wait(100);
  expect(root.querySelector('.marker')).not.toBeNull();
  mock.request.mockClear();
  move(150, 150); await wait(500);
  expect(card(root)).toBeNull();
  move(420, 420); await wait(300);
  expect(card(root)!.querySelector('strong')?.textContent).toBe('#2 Save is hidden 2');
  expect(mock.request.mock.calls.some(([path]) => String(path).startsWith('/issues/') && path !== '/issues/issue-2')).toBe(false);
  finish({ id: 'new', number: 9, title: 'Brand new', status: 'open', state: 'open', reporter: true, locators: {}, author: { name: 'Reviewer' }, comment_count: 0, inserted_at: '', updated_at: '', comments: [] });
  await wait(100);
});

it('puts the card beside the pointer when the marked element fills the screen, so clicks on the element still reach it', async () => {
  const { root } = await page([report(1)], { 1: [0, 0, innerWidth, innerHeight] }, 'fill');
  move(300, 300); await wait(300);
  const shown = card(root)!, left = Number.parseInt(shown.style.left), top = Number.parseInt(shown.style.top);
  expect(left).toBeGreaterThan(300);
  expect(top).toBeGreaterThan(300);
  expect(left + 272).toBeLessThanOrEqual(innerWidth - 8);
  expect(top + 132).toBeLessThanOrEqual(innerHeight - 8);
  // Near the bottom right corner it flips to the other side of the pointer.
  leave(shown); move(innerWidth - 20, innerHeight - 20); await wait(500);
  const flipped = card(root)!;
  expect(Number.parseInt(flipped.style.left) + 272).toBeLessThanOrEqual(innerWidth - 20);
  expect(Number.parseInt(flipped.style.top) + 132).toBeLessThanOrEqual(innerHeight - 20);
});

it('closes the card when its report is no longer drawn, and installs the pointer listener only while a marker is', async () => {
  const add = vi.spyOn(window, 'addEventListener');
  const { root } = await page([], {}, 'border');
  expect(add.mock.calls.filter(([type]) => type === 'pointermove')).toHaveLength(0);
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const dots = await page([report(7)], { 7: [100, 200, 40, 20] });
  enter(dots.root.querySelector('.pin')!); await wait(250);
  expect(card(dots.root)).not.toBeNull();
  // The page changes under a shown card: its report is no longer drawn, so the card goes with it and does not come back with the page.
  history.pushState({}, '', '/elsewhere'); await wait(500);
  expect(card(dots.root)).toBeNull();
  history.pushState({}, '', '/'); await wait(500);
  expect(dots.root.querySelector('.pin')).not.toBeNull();
  expect(card(dots.root)).toBeNull();
  void root;
});

it('shows the start of the description, whole, when there is no reply, and the reply once there is one', async () => {
  // A title longer than the card's line: the title row would cut it, so the number stands alone and the description carries the sentence, the title on a line of its own (blank lines folded away).
  const long = 'The checkout button overlaps the cookie banner on iPhone SE';
  const excerpt = `${long}\n\n  below the fold <b>on mobile</b> and the footer overlaps it`;
  const { root } = await page([report(1, { title: long, latest_comment: null, excerpt }), report(2, { latest_comment: null, excerpt: 'Save is hidden 2' }), report(3, { excerpt: 'Not shown: the reply is newer' }), report(4, { latest_comment: null })], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20], 3: [700, 200, 40, 20], 4: [900, 200, 40, 20] });
  const [first, second, third, fourth] = root.querySelectorAll<HTMLElement>('.pin');
  enter(first); await wait(250);
  expect(card(root)!.querySelector('.card-title strong')?.textContent).toBe('#1');
  expect(card(root)!.querySelector('.card-excerpt')?.textContent).toBe(`${long}\nbelow the fold <b>on mobile</b> and the footer overlaps it`);
  expect(card(root)!.querySelector('b')).toBeNull();
  expect(card(root)!.getAttribute('aria-label')).toContain(`#1 ${long} below the fold <b>on mobile</b>`);
  expect(card(root)!.getAttribute('aria-label')).not.toContain('No replies yet');
  // A one-line report shows its sentence once, as the description.
  leave(first); enter(second); await wait(250);
  expect(card(root)!.querySelector('.card-excerpt')?.textContent).toBe('Save is hidden 2');
  expect(card(root)!.textContent).not.toContain('No replies yet');
  // A reply is newer than the description.
  leave(second); enter(third); await wait(250);
  expect(card(root)!.querySelector('.card-excerpt')).toBeNull();
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('Team We are looking into it.');
  // Without an excerpt (an older server) the title and "No replies yet" remain.
  leave(third); enter(fourth); await wait(250);
  expect(card(root)!.querySelector('.card-title strong')?.textContent).toBe('#4 Save is hidden 4');
  expect(card(root)!.querySelector('.card-reply')?.textContent).toBe('No replies yet');
});

it('cuts the card to a short viewport, so it never runs past it', async () => {
  const { root } = await page([report(1)], { 1: [100, 200, 40, 20] });
  enter(root.querySelector('.pin')!); await wait(250);
  expect(card(root)!.style.maxHeight).toBe(innerHeight - 16 + 'px');
});

it('keeps a card dismissed with Escape away until the pointer has left the marker and come back', async () => {
  const { root } = await page([report(1)], { 1: [100, 100, 200, 100] }, 'border');
  move(150, 150); await wait(300);
  expect(card(root)).not.toBeNull();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await wait(50);
  expect(card(root)).toBeNull();
  // Still moving over the same marker: no card.
  move(160, 160); await wait(300); move(170, 150); await wait(300);
  expect(card(root)).toBeNull();
  move(500, 500); await wait(300);
  move(150, 150); await wait(300);
  expect(card(root)).not.toBeNull();
});
