// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), panel: vi.fn(), screenshot: vi.fn(), start: vi.fn(), stop: vi.fn(), refresh: async (): Promise<void> => {} }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
vi.mock('../src/screenshot', () => ({ screenshot: mock.screenshot }));
// The socket itself is not under test: the connection's start, stop and refresh are.
vi.mock('../src/live', () => ({ liveUpdates: (_api: unknown, refresh: () => Promise<void>) => { mock.start(); mock.refresh = refresh; return { stop: mock.stop }; } }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
// Browsers have these on elements, which tells Preact the events' casing; jsdom does not.
for (const name of ['onpointerenter', 'onpointerleave', 'onpointerdown', 'onpointerup', 'onpointercancel']) if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true, configurable: true });
afterEach(async () => {
  core?.destroy(); core = undefined; if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(200);
  localStorage.clear(); history.replaceState({}, '', '/');
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); mock.request.mockReset(); document.body.replaceChildren();
});

const comment = (n: number, extra: Record<string, unknown> = {}) => ({ id: 'c' + n, body: 'Reply ' + n, author: { name: n % 2 ? 'Anna' : 'Reporter' }, team: n % 2 === 1, inserted_at: new Date(2026, 0, 1, 10, n).toISOString(), ...extra });
const report = (number: number, extra: Record<string, unknown> = {}) => ({
  id: 'issue-' + number, number, title: 'Save is hidden ' + number, body: 'Body ' + number, status: 'open', state: 'open', type: 'bug', severity: 'major', env_name: 'uat', url: location.origin + '/',
  locators: { testid: `[data-testid="t${number}"]` }, author: { name: 'Reporter' }, own: false, comment_count: 2, comments: [comment(1), comment(2)], inserted_at: new Date().toISOString(),
  latest_comment: { author: { name: 'Anna' }, team: true, body: 'Reply 1', inserted_at: new Date().toISOString() }, unread: false, can_mention: false, ...extra,
});
type Report = ReturnType<typeof report>;
type Box = [number, number, number, number];
interface Options { open?: boolean; shots?: boolean; touch?: boolean; width?: number; lang?: 'en' | 'pl'; style?: string; thread?: (item: Report) => unknown; handler?: (path: string, method?: string, body?: unknown) => unknown }
/** Markers drawn without the sidebar, one target per report at `boxes[number]`, and a server that answers lists and threads. */
async function page(reports: Report[], boxes: Record<number, Box>, options: Options = {}) {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
  if (options.width) vi.stubGlobal('innerWidth', options.width);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: options.touch ? query.includes('hover: none') : query.includes('reduce') }));
  localStorage.setItem('tuix:markers:chat', 'on:' + (options.style ?? 'dot'));
  mock.request.mockImplementation(async (path: string, method?: string, body?: unknown) => {
    const custom = options.handler?.(path, method, body);
    if (custom !== undefined) return custom;
    if (path === '/config') return { telemetry: false, capture: { screenshot: !!options.shots, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: reports };
    const item = reports.find(entry => path === '/issues/' + entry.id);
    if (item) return options.thread ? options.thread(item) : item;
    if (path.endsWith('/comments')) return { id: 'new' };
    if (path.endsWith('/verify')) return { ...reports[0], state: 'done', status: 'resolved', allowed_states: [] };
    return { notifications: [] };
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
  core = mount(root, launcher, { project: 'chat', lang: options.lang }, { id: 'me', name: 'Me' }, mock.panel);
  // The SDK opens the sidebar at once for a report link.
  if (options.open) core.open();
  await vi.advanceTimersByTimeAsync(300);
  return { root, launcher };
}
const wait = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const win = (root: ShadowRoot) => root.querySelector<HTMLElement>('.chat-window');
const dots = (root: ShadowRoot) => [...root.querySelectorAll<HTMLButtonElement>('.pin')];
const calls = (...match: string[]) => mock.request.mock.calls.filter(([path]) => match.every(part => String(path).includes(part)));
const escape = () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true }));
const move = (x: number, y: number) => document.body.dispatchEvent(Object.assign(new MouseEvent('pointermove', { bubbles: true, composed: true, clientX: x, clientY: y }), { pointerType: 'mouse' }));
const reply = (root: ShadowRoot) => root.querySelector<HTMLTextAreaElement>('.chat-window .mention-field textarea')!;
const typeIn = (field: HTMLTextAreaElement, value: string) => { field.focus(); field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); };
const submit = async (root: ShadowRoot) => { await wait(10); reply(root).closest('form')!.requestSubmit(); await wait(200); };
const button = (root: ParentNode, label: string) => [...root.querySelectorAll('button')].find(item => item.textContent === label)!;

it('opens a window beside the element when a dot is clicked, not the sidebar, and reads the thread as the panel does', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  mock.request.mockClear(); mock.panel.mockClear();
  dots(root)[0].click(); await wait(200);
  const chat = win(root)!;
  expect(chat.getAttribute('role')).toBe('dialog');
  expect(chat.querySelector('h2')?.textContent).toBe('#7 Save is hidden 7');
  expect(chat.querySelector('header .status')?.textContent).toBe('Open');
  expect(chat.querySelector('[data-action="close-chat"]')?.getAttribute('aria-label')).toBe('Close conversation');
  expect([...chat.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Reply 1', 'Reply 2']);
  expect(root.querySelector('.panel')).toBeNull();
  expect(mock.panel).not.toHaveBeenCalled();
  // Right of the element (100 + 40 + 12), centred on it vertically and inside the viewport.
  expect(chat.style.left).toBe('152px');
  expect(Number.parseInt(chat.style.top)).toBeGreaterThanOrEqual(8);
  // Same requests as the panel: the thread, then marked read; the page does not scroll.
  expect(calls('/issues/issue-7').map(([path, method]) => [path, method ?? 'GET'])).toEqual([['/issues/issue-7', 'GET'], ['/issues/issue-7/read', 'POST']]);
  expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  // The window is on top of the page, off the dot's hover card.
  dots(root)[0].dispatchEvent(new Event('pointerenter')); await wait(400);
  expect(root.querySelector('.hover-card')).toBeNull();
});

it('opens from the hover card of an outline or fill marker', async () => {
  for (const style of ['border', 'fill']) {
    const { root } = await page([report(7)], { 7: [100, 200, 200, 80] }, { style });
    move(150, 230); await wait(300);
    const card = root.querySelector<HTMLElement>('.hover-card')!;
    expect(card).not.toBeNull();
    card.click(); await wait(200);
    expect(win(root)?.querySelector('h2')?.textContent).toBe('#7 Save is hidden 7');
    expect(root.querySelector('.hover-card')).toBeNull();
    expect(root.querySelector('.panel')).toBeNull();
    // To the right of the box: 100 + 200 + 12.
    expect(win(root)!.style.left).toBe('312px');
    core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();
  }
});

it('moves the focus into the window and back to the dot on close, by the close button, Escape or the dot', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  for (const close of [
    () => root.querySelector<HTMLButtonElement>('[data-action="close-chat"]')!.click(),
    () => escape(),
    () => dots(root)[0].click(),
  ]) {
    dots(root)[0].click(); await wait(200);
    expect(win(root)).not.toBeNull();
    expect(root.activeElement).toBe(win(root));
    close(); await wait(100);
    expect(win(root)).toBeNull();
    expect(root.activeElement).toBe(dots(root)[0]);
    // The dot's focus does not bring its card back.
    await wait(400);
    expect(root.querySelector('.hover-card')).toBeNull();
    expect(root.querySelector('.panel')).toBeNull();
  }
});

it('keeps one window: another dot, the sidebar and a new comment close it', async () => {
  const { root } = await page([report(1), report(2)], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  dots(root)[1].click(); await wait(200);
  expect(root.querySelectorAll('.chat-window')).toHaveLength(1);
  expect(win(root)!.querySelector('h2')?.textContent).toBe('#2 Save is hidden 2');

  core!.open(); await wait(200);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  // The sidebar shows its list, not the window's thread.
  expect(root.querySelector('.thread-body')).toBeNull();
  core!.close(); await wait(100);

  dots(root)[0].click(); await wait(200);
  expect(win(root)).not.toBeNull();
  core!.comment!(); await wait(200);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.pick-surface')).not.toBeNull();
});

it('closes only the window on Escape while the sidebar is open, and keeps clear of the sidebar', async () => {
  const { root } = await page([report(7)], { 7: [900, 200, 40, 20] });
  core!.open(); await wait(200);
  dots(root)[0].click(); await wait(200);
  expect(win(root)).not.toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  // The element lies under the 360px sidebar: the window sits by the sidebar's edge, clear of it.
  expect(Number.parseInt(win(root)!.style.left)).toBe(innerWidth - 360 - 320 - 12);
  escape(); await wait(100);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  escape(); await wait(100);
  expect(root.querySelector('.panel')).toBeNull();
});

it('shows the newest five replies, expands the earlier ones, and sends longer threads to the sidebar', async () => {
  const many = report(7, { comments: [1, 2, 3, 4, 5, 6, 7].map(n => comment(n)) });
  const { root } = await page([many], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Reply 3', 'Reply 4', 'Reply 5', 'Reply 6', 'Reply 7']);
  button(win(root)!, 'Show earlier').click(); await wait(100);
  expect(win(root)!.querySelectorAll('.comment')).toHaveLength(7);
  expect(button(win(root)!, 'Show earlier')).toBeUndefined();
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const older = report(7, { comments_older: 'cursor-1', comments: [comment(1), comment(2)] });
  const { root: other } = await page([older], { 7: [100, 200, 40, 20] });
  dots(other)[0].click(); await wait(200);
  button(win(other)!, 'Show earlier').click(); await wait(200);
  expect(win(other)).toBeNull();
  expect(other.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
});

it('opens the full thread in the sidebar with what the window loaded, without another request', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  mock.request.mockClear(); mock.panel.mockClear();
  button(win(root)!, 'Open full thread').click(); await wait(200);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
  expect([...root.querySelectorAll('.panel .comment p')].map(item => item.textContent)).toEqual(['Reply 1', 'Reply 2']);
  expect(mock.panel).toHaveBeenLastCalledWith(true);
  expect(calls('/issues/issue-7')).toHaveLength(0);
});

it('sends a reply with an optimistic comment and refreshes the thread', async () => {
  let sent: unknown;
  const stored = report(7);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, {
    handler: (path, method, body) => { if (path === '/issues/issue-7/comments') { sent = [method, body]; stored.comments.push(comment(3, { body: 'On my way', author: { name: 'Me' }, team: false })); return { id: 'c3' }; } },
  });
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), 'On my way');
  await wait(10);
  mock.request.mockClear();
  reply(root).closest('form')!.requestSubmit(); await wait(5);
  // The comment is on screen before the server answers.
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Reply 1', 'Reply 2', 'On my way']);
  await wait(200);
  expect(sent).toEqual(['POST', { body: 'On my way' }]);
  expect(reply(root).value).toBe('');
  expect(calls('/issues/issue-7').some(([path, method]) => path === '/issues/issue-7' && !method)).toBe(true);
  expect(win(root)!.querySelectorAll('.comment')).toHaveLength(3);
  expect(win(root)!.querySelector('[role="alert"]')).toBeNull();
});

it('restores the reply and its mentions when sending fails', async () => {
  const people = [{ id: 'member:dana', name: 'Dana', team: true }];
  const { root } = await page([report(7, { can_mention: true })], { 7: [100, 200, 40, 20] }, {
    handler: path => {
      if (path === '/issues/issue-7/comments') throw Object.assign(new Error('offline'), { status: 500 });
      if (path.startsWith('/issues/issue-7/people')) return { people };
    },
  });
  dots(root)[0].click(); await wait(200);
  // Mentions work in the window: the hint, the suggestion list, and the pick.
  expect(win(root)!.querySelector('#tuix-mention-hint')?.textContent).toBe('Type @ to mention someone.');
  typeIn(reply(root), 'Hi @Da'); await wait(400);
  const option = root.querySelector<HTMLElement>('.chat-window [role="option"]')!;
  expect(option.textContent).toContain('Dana');
  option.click(); await wait(10);
  expect(reply(root).value).toBe('Hi @Dana ');
  await submit(root);
  const attempts = calls('/issues/issue-7/comments');
  expect(attempts[0].slice(1)).toEqual(['POST', { body: 'Hi @Dana ', mentions: ['member:dana'] }]);
  expect(reply(root).value).toBe('Hi @Dana ');
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');
  expect(win(root)!.querySelectorAll('.comment')).toHaveLength(2);
  // The restored pick is sent again with the retry.
  await submit(root);
  expect(calls('/issues/issue-7/comments')[1].slice(1)).toEqual(['POST', { body: 'Hi @Dana ', mentions: ['member:dana'] }]);
});

it('takes Escape for an open mention list before it closes the window', async () => {
  const { root } = await page([report(7, { can_mention: true })], { 7: [100, 200, 40, 20] }, {
    handler: path => path.startsWith('/issues/issue-7/people') ? { people: [{ id: 'm', name: 'Dana', team: true }] } : undefined,
  });
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), '@D'); await wait(400);
  expect(root.querySelector('.chat-window [role="listbox"]')).not.toBeNull();
  escape(); await wait(50);
  expect(root.querySelector('.chat-window [role="listbox"]')).toBeNull();
  expect(win(root)).not.toBeNull();
  escape(); await wait(50);
  expect(win(root)).toBeNull();
});

const review = { state: 'in_review', status: 'awaiting_verification', reporter: true, can_be_fixer: false, allowed_states: ['done', 'open', 'closed'], fixed_note: { body: 'Restored the button.', author: { name: 'Dev' } } };

it('offers Done and Still broken to the reporter of a report in review, and records Done', async () => {
  const { root } = await page([report(7, review)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  const tools = win(root)!.querySelector('.verify-tools')!;
  expect([...tools.querySelectorAll('[data-state-action]')].map(item => item.textContent)).toEqual(['Done', 'Still broken']);
  expect(tools.textContent).toContain('Restored the button.');
  mock.request.mockClear();
  tools.querySelector<HTMLButtonElement>('[data-state-action="done"]')!.click(); await wait(300);
  expect(calls('/verify')[0].slice(1)).toEqual(['POST', { outcome: 'works' }]);
  // The window stays, on the verified report, with the thanks; the list drops the marker.
  expect(win(root)!.querySelector('.notice')?.textContent).toBe('Fix verified. Thank you.');
  expect(win(root)!.querySelector('.verify-tools')).toBeNull();
  expect(win(root)!.querySelector('header .status')?.textContent).toBe('Done');
});

it('needs a note for Still broken in the window and sends it with no screenshot', async () => {
  const { root } = await page([report(7, review)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  win(root)!.querySelector<HTMLButtonElement>('[data-state-action="open"]')!.click(); await wait(100);
  const note = win(root)!.querySelector<HTMLTextAreaElement>('.verify-tools textarea')!;
  expect(note.required).toBe(true);
  const send = button(win(root)!.querySelector('.verify-tools')!, 'Reopen report');
  expect(send.disabled).toBe(true);
  // The reply form gives way to the note.
  expect(win(root)!.querySelector('.mention-field')).toBeNull();
  typeIn(note, 'Still hidden.'); await wait(50);
  expect(button(win(root)!.querySelector('.verify-tools')!, 'Reopen report').disabled).toBe(false);
  mock.request.mockClear();
  note.closest('form')!.requestSubmit(); await wait(300);
  expect(calls('/verify')[0].slice(1)).toEqual(['POST', { outcome: 'broken', note: 'Still hidden.', attachments: [] }]);
  expect(calls('/uploads')).toHaveLength(0);
  expect(win(root)!.querySelector('.notice')?.textContent).toBe('Report reopened with your review.');
});

it('takes no new screenshot for Still broken in the window', async () => {
  const { root } = await page([report(7, review)], { 7: [100, 200, 40, 20] }, { shots: true });
  dots(root)[0].click(); await wait(200);
  win(root)!.querySelector<HTMLButtonElement>('[data-state-action="open"]')!.click(); await wait(100);
  expect(mock.screenshot).not.toHaveBeenCalled();
  expect(win(root)!.querySelector('.verify-tools details')).toBeNull();
  typeIn(win(root)!.querySelector('.verify-tools textarea')!, 'Still hidden.'); await wait(50);
  win(root)!.querySelector('.verify-tools form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  await wait(300);
  expect(calls('/verify')[0].slice(1)).toEqual(['POST', { outcome: 'broken', note: 'Still hidden.', attachments: [] }]);
});

it('leaves out the verify actions for anyone but the reporter, and for a report not in review', async () => {
  const { root } = await page([report(1, { ...review, reporter: false, allowed_states: ['closed'] }), report(2, { reporter: true, allowed_states: ['closed'] })], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  expect(win(root)!.querySelector('h2')?.textContent).toContain('#1');
  expect(win(root)!.querySelector('.verify-tools')).toBeNull();
  expect(win(root)!.querySelector('header .status')?.textContent).toBe('In review');
  dots(root)[1].click(); await wait(200);
  expect(win(root)!.querySelector('h2')?.textContent).toContain('#2');
  expect(win(root)!.querySelector('.verify-tools')).toBeNull();
});

it('hides the reply form on a closed report', async () => {
  // The list leaves out finished reports, so the report finishes while the window is open.
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] }, { thread: item => ({ ...item, state: 'done', status: 'resolved', allowed_states: [] }) });
  dots(root)[0].click(); await wait(200);
  expect(win(root)!.querySelector('header .status')?.textContent).toBe('Done');
  expect(win(root)!.querySelector('form')).toBeNull();
  expect(win(root)!.querySelector('.chat-moved')).toBeNull();
  expect(button(win(root)!, 'Open full thread')).not.toBeUndefined();
});

it('measures the window again when the thread arrives, without waiting for a resize observer', async () => {
  // jsdom has no ResizeObserver: only the measure after each render can see the window grow.
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!;
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.classList.contains('chat-window') ? 100 + 60 * this.querySelectorAll('.comment').length : 0; } });
  try {
    const stored = report(7);
    const { root } = await page([stored], { 7: [100, 600, 40, 20] }, { thread: item => new Promise(resolve => setTimeout(() => resolve(item), 500)) });
    dots(root)[0].click(); await wait(100);
    // Loading, 100px tall, centred on the element.
    expect(Number.parseInt(win(root)!.style.top)).toBe(610 - 50);
    await wait(500);
    // Two replies make it 220px: it moves up to stay inside the viewport.
    expect(win(root)!.querySelectorAll('.comment')).toHaveLength(2);
    expect(Number.parseInt(win(root)!.style.top) + 220).toBeLessThanOrEqual(innerHeight - 8);
  } finally { Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original); }
});

it('appends replies that arrive while the window is open', async () => {
  const stored = report(7);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  expect(win(root)!.querySelectorAll('.comment')).toHaveLength(2);
  stored.comments.push(comment(3, { body: 'Fixed on staging' }));
  await wait(61000);
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Reply 1', 'Reply 2', 'Fixed on staging']);
  expect(root.querySelector('.panel')).toBeNull();
});

it('follows the element on scroll and resize, flips to the left near the right edge, and below or above when there is no side', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const target = document.querySelector<HTMLElement>('[data-testid="t7"]')!;
  const at = (x: number, y: number, width = 40, height = 20) => { (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({ x, y, width, height }); document.dispatchEvent(new Event('scroll')); return wait(50); };
  dots(root)[0].click(); await wait(200);
  // jsdom measures no height: the window counts as its tallest (480px) and is centred on the element, kept 8px inside the viewport.
  expect(Number.parseInt(win(root)!.style.top)).toBe(8);
  await at(100, 500);
  expect(Number.parseInt(win(root)!.style.top)).toBe(500 + 10 - 240);
  expect(win(root)!.dataset.side).toBe('right');
  await at(900, 300);
  expect(win(root)!.dataset.side).toBe('left');
  expect(win(root)!.style.left).toBe(900 - 320 - 12 + 'px');
  // A wide element at the top of the page leaves room only below it.
  await at(10, 20, 1000, 60);
  expect(win(root)!.dataset.side).toBe('below');
  expect(Number.parseInt(win(root)!.style.top)).toBe(20 + 60 + 12);
  await at(10, 700, 1000, 60);
  expect(win(root)!.dataset.side).toBe('above');
});

it('stays where it was and says so when the element leaves the page', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  const at = { left: win(root)!.style.left, top: win(root)!.style.top };
  expect(win(root)!.querySelector('.chat-moved')).toBeNull();
  document.querySelector('[data-testid="t7"]')!.remove(); await wait(400);
  expect(root.querySelector('.pin')).toBeNull();
  expect(win(root)).not.toBeNull();
  expect(win(root)!.style.left).toBe(at.left);
  expect(win(root)!.style.top).toBe(at.top);
  expect(win(root)!.querySelector('.chat-moved')?.textContent).toContain('no longer on the page');
  // The conversation still works, and the full thread is one click away.
  expect(win(root)!.querySelector('.mention-field')).not.toBeNull();
  button(win(root)!, 'Open full thread').click(); await wait(200);
  expect(root.querySelector('.panel .thread-body')).not.toBeNull();
});

it('keeps following an element scrolled out of view, without saying it left the page', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const target = document.querySelector<HTMLElement>('[data-testid="t7"]')!;
  const at = (y: number) => { (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({ x: 100, y, width: 40, height: 20 }); document.dispatchEvent(new Event('scroll')); return wait(50); };
  dots(root)[0].click(); await wait(200);
  // Scrolled far below the viewport: the marker is not drawn, the window stays on screen, next to the edge the element left by.
  await at(3000);
  expect(root.querySelector('.pin')).toBeNull();
  expect(win(root)).not.toBeNull();
  expect(win(root)!.querySelector('.chat-moved')).toBeNull();
  expect(Number.parseInt(win(root)!.style.top)).toBeLessThanOrEqual(innerHeight - 8);
  // Scrolled back, it is beside the element again.
  await at(500);
  expect(root.querySelector('.pin')).not.toBeNull();
  expect(win(root)!.dataset.side).toBe('right');
  expect(win(root)!.querySelector('.chat-moved')).toBeNull();
});

it('keeps a wide element scrolled below the fold from taking the window off screen', async () => {
  const { root } = await page([report(7)], { 7: [0, 200, 1000, 60] });
  const target = document.querySelector<HTMLElement>('[data-testid="t7"]')!;
  dots(root)[0].click(); await wait(200);
  (target.getBoundingClientRect as ReturnType<typeof vi.fn>).mockReturnValue({ x: 0, y: 3000, width: 1000, height: 60 });
  document.dispatchEvent(new Event('scroll')); await wait(50);
  const box = win(root)!;
  expect(box.querySelector('.chat-moved')).toBeNull();
  expect(Number.parseInt(box.style.top)).toBeLessThanOrEqual(innerHeight - 8);
  expect(Number.parseInt(box.style.left)).toBeLessThanOrEqual(innerWidth - 8);
});

it('says a report is unavailable when it cannot be loaded', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] }, { handler: path => { if (path === '/issues/issue-7') throw Object.assign(new Error('gone'), { status: 404 }); } });
  dots(root)[0].click(); await wait(200);
  expect(win(root)!.querySelector('.notice')?.textContent).toBe('This report is no longer available in this environment.');
  expect(win(root)!.querySelector('.comment')).toBeNull();
  expect(win(root)!.querySelector('.mention-field')).toBeNull();
  escape(); await wait(50);
  expect(win(root)).toBeNull();
});

it('does not open on a touch-first device or a narrow screen: the sidebar takes the report', async () => {
  const touch = await page([report(7)], { 7: [100, 200, 40, 20] }, { touch: true });
  dots(touch.root)[0].click(); await wait(200);
  expect(win(touch.root)).toBeNull();
  expect(touch.root.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const narrow = await page([report(7)], { 7: [100, 200, 40, 20] }, { width: 639 });
  dots(narrow.root)[0].click(); await wait(200);
  expect(win(narrow.root)).toBeNull();
  expect(narrow.root.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
});

it('hands over to the sidebar when the screen narrows while the window is open', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  expect(win(root)).not.toBeNull();
  vi.stubGlobal('innerWidth', 500); window.dispatchEvent(new Event('resize')); await wait(100);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
  expect(mock.panel).toHaveBeenLastCalledWith(true);
});

it('keeps the deep link opening the report in the sidebar', async () => {
  const id = '00000000-0000-4000-8000-000000000007';
  history.replaceState({}, '', '/?tuix=' + id);
  const { root } = await page([report(7, { id })], { 7: [100, 200, 40, 20] }, { open: true });
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 7');
});

it('shows the sidebar thread as before when it is chosen from the list, and a dot after that opens the window', async () => {
  const { root } = await page([report(1), report(2)], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] });
  core!.open(); await wait(200);
  [...root.querySelectorAll<HTMLButtonElement>('.panel .issue-item')].find(item => item.textContent?.includes('Save is hidden 1'))!.click(); await wait(200);
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 1');
  dots(root)[1].click(); await wait(200);
  expect(win(root)?.querySelector('h2')?.textContent).toBe('#2 Save is hidden 2');
  expect(root.querySelector('.panel .thread-body')).toBeNull();
});

it('closes the window when a report is chosen from the sidebar list', async () => {
  const { root } = await page([report(1), report(2)], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] });
  core!.open(); await wait(200);
  dots(root)[0].click(); await wait(200);
  expect(win(root)).not.toBeNull();
  [...root.querySelectorAll<HTMLButtonElement>('.panel .issue-item')].find(item => item.textContent?.includes('Save is hidden 2'))!.click(); await wait(200);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 2');
});

it('shows the report that was chosen, not the sidebar thread before it, when its own thread fails to load', async () => {
  const { root } = await page([report(1), report(2)], { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] }, {
    handler: path => { if (path === '/issues/issue-2') throw Object.assign(new Error('down'), { status: 500 }); },
  });
  core!.open(); await wait(200);
  [...root.querySelectorAll<HTMLButtonElement>('.panel .issue-item')].find(item => item.textContent?.includes('Save is hidden 1'))!.click(); await wait(200);
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 1');
  dots(root)[1].click(); await wait(200);
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Retry');
  expect(win(root)!.querySelector('.comment')).toBeNull();
  button(win(root)!, 'Open full thread').click(); await wait(200);
  expect(win(root)).toBeNull();
  // The first report's thread is gone from the sidebar; the second is asked for again.
  expect(root.querySelector('.panel .thread-body')).toBeNull();
  expect(calls('/issues/issue-2').filter(([path, method]) => path === '/issues/issue-2' && !method).length).toBeGreaterThan(1);
});

it('lets another outline or fill marker replace the open window through its card, and closes back to the launcher', async () => {
  for (const style of ['border', 'fill']) {
    const { root, launcher } = await page([report(1), report(2)], { 1: [100, 200, 200, 80], 2: [100, 400, 200, 80] }, { style });
    move(150, 230); await wait(300);
    root.querySelector<HTMLElement>('.hover-card')!.click(); await wait(200);
    expect(win(root)?.querySelector('h2')?.textContent).toBe('#1 Save is hidden 1');
    // The open report has no card; the other one does.
    move(150, 240); await wait(300);
    expect(root.querySelector('.hover-card')).toBeNull();
    move(150, 430); await wait(300);
    expect(root.querySelector('.hover-card')?.getAttribute('aria-label')).toContain('#2');
    root.querySelector<HTMLElement>('.hover-card')!.click(); await wait(200);
    expect(root.querySelectorAll('.chat-window')).toHaveLength(1);
    expect(win(root)?.querySelector('h2')?.textContent).toBe('#2 Save is hidden 2');
    // No dot to return to: the launcher gets the focus.
    escape(); await wait(100);
    expect(win(root)).toBeNull();
    expect(document.activeElement).toBe(launcher);
    core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();
  }
});

it('is labelled in Polish', async () => {
  const { root } = await page([report(7, { ...review, comments: [1, 2, 3, 4, 5, 6].map(n => comment(n)) })], { 7: [100, 200, 40, 20] }, { lang: 'pl' });
  dots(root)[0].click(); await wait(200);
  const chat = win(root)!;
  expect(chat.querySelector('[data-action="close-chat"]')?.getAttribute('aria-label')).toBe('Zamknij rozmowę');
  expect(chat.querySelector('header .status')?.textContent).toBe('Do sprawdzenia');
  expect(chat.querySelector('[data-action="show-earlier"]')?.textContent).toBe('Pokaż wcześniejsze');
  expect(chat.querySelector('[data-action="open-full-thread"]')?.textContent).toBe('Otwórz pełną rozmowę');
  expect(chat.querySelector('textarea')).not.toBeNull();
});

it('keeps the live connection for a window that outlives the sidebar, and stops it when the window goes', async () => {
  const stored = report(7);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] });
  core!.open(); await wait(200);
  dots(root)[0].click(); await wait(200);
  expect(win(root)).not.toBeNull();
  const starts = mock.start.mock.calls.length, stops = mock.stop.mock.calls.length;
  core!.close(); await wait(200);
  expect(root.querySelector('.panel')).toBeNull();
  expect(win(root)).not.toBeNull();
  expect(mock.start).toHaveBeenCalledTimes(starts);
  expect(mock.stop).toHaveBeenCalledTimes(stops);
  // A push from the socket refreshes the window's thread well before the 60 s poll.
  stored.comments.push(comment(3, { body: 'Pushed live' }));
  await mock.refresh(); await wait(200);
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Reply 1', 'Reply 2', 'Pushed live']);
  escape(); await wait(100);
  expect(win(root)).toBeNull();
  expect(mock.stop).toHaveBeenCalledTimes(stops + 1);
});

it('does not announce a changed status when the sidebar opens over a window in Still broken', async () => {
  const { root } = await page([report(7, review)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  win(root)!.querySelector<HTMLButtonElement>('[data-state-action="open"]')!.click(); await wait(100);
  expect(win(root)!.querySelector('.verify-tools textarea')).not.toBeNull();
  core!.open(); await wait(200);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(root.querySelector('.panel .notice')).toBeNull();
});

it('keeps the window\'s error when the sidebar closes beside it', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] }, {
    handler: path => { if (path === '/issues/issue-7/comments') throw Object.assign(new Error('offline'), { status: 500 }); },
  });
  core!.open(); await wait(200);
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), 'Hello'); await submit(root);
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');
  core!.close(); await wait(300);
  expect(win(root)).not.toBeNull();
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');
  expect(root.textContent).not.toContain('Loading feedback');
});

it('leaves Escape to the host page when its own field has the focus, and keeps that focus', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  const field = document.createElement('input'); document.body.append(field); field.focus();
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true });
  field.dispatchEvent(event); await wait(100);
  expect(win(root)).toBeNull();
  expect(event.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(field);
});

it('keeps the host field\'s focus when Escape closes the window beside an open sidebar', async () => {
  const { root } = await page([report(7)], { 7: [900, 200, 40, 20] });
  core!.open(); await wait(200);
  dots(root)[0].click(); await wait(200);
  const field = document.createElement('input'); document.body.append(field); field.focus();
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true, composed: true })); await wait(100);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(document.activeElement).toBe(field);
});

it('leaves no loading status in the sidebar when the window closes before its thread arrives', async () => {
  const reports = [report(7)];
  const { root } = await page(reports, { 7: [900, 200, 40, 20] }, { handler: slow(reports, 500) });
  core!.open(); await wait(700);
  dots(root)[0].click(); await wait(100);
  escape(); await wait(900);
  expect(win(root)).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(root.querySelector('.panel [role="status"]')?.textContent ?? '').not.toContain('Loading feedback');
  expect(root.textContent).not.toContain('Loading feedback');
});

it('tells assistive technology that a dot opens a dialog, and which one while it is open', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const dot = dots(root)[0];
  expect(dot.getAttribute('aria-haspopup')).toBe('dialog');
  expect(dot.hasAttribute('aria-expanded')).toBe(false);
  dot.click(); await wait(200);
  expect(dots(root)[0].getAttribute('aria-expanded')).toBe('true');
  expect(dots(root)[0].getAttribute('aria-controls')).toBe('tuix-chat');
  expect(win(root)!.id).toBe('tuix-chat');
  escape(); await wait(100);
  expect(dots(root)[0].hasAttribute('aria-expanded')).toBe(false);
});

/** A server whose thread answers arrive late, as on a real network. */
const slow = (reports: Report[], delay = 80) => (path: string) => {
  const item = reports.find(entry => path === '/issues/' + entry.id);
  return item ? new Promise(resolve => setTimeout(() => resolve(item), delay)) : undefined;
};

it('loads the second report\'s thread when the window moves from one report to another on a slow network', async () => {
  const reports = [report(1), report(2, { comments: [comment(1, { body: 'Second thread' })] })];
  const { root } = await page(reports, { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] }, { handler: slow(reports) });
  dots(root)[0].click(); await wait(300);
  expect(win(root)!.querySelectorAll('.comment')).toHaveLength(2);
  dots(root)[1].click(); await wait(300);
  expect(win(root)!.querySelector('h2')?.textContent).toBe('#2 Save is hidden 2');
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Second thread']);
  expect(win(root)!.textContent).not.toContain('Loading');
});

it('loads the window\'s thread when a dot is clicked while the sidebar shows another report, on a slow network', async () => {
  const reports = [report(1), report(2, { comments: [comment(1, { body: 'Second thread' })] })];
  const { root } = await page(reports, { 1: [100, 200, 40, 20], 2: [400, 200, 40, 20] }, { handler: slow(reports) });
  core!.open(); await wait(300);
  [...root.querySelectorAll<HTMLButtonElement>('.panel .issue-item')].find(item => item.textContent?.includes('Save is hidden 1'))!.click(); await wait(300);
  expect(root.querySelector('.panel .thread-body')?.textContent).toBe('Body 1');
  dots(root)[1].click(); await wait(300);
  expect([...win(root)!.querySelectorAll('.comment p')].map(item => item.textContent)).toEqual(['Second thread']);
  expect(win(root)!.textContent).not.toContain('Loading');
});

it('returns the focus to the dot on Escape after a reply disabled the button that had the focus', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), 'Hello'); await wait(10);
  const send = win(root)!.querySelector<HTMLButtonElement>('form button.primary')!;
  send.focus();
  // Browsers drop the focus of a button that becomes disabled; jsdom does not, so do it as they would.
  const disable = vi.spyOn(HTMLButtonElement.prototype, 'disabled', 'set').mockImplementation(function (this: HTMLButtonElement, value: boolean) { this.toggleAttribute('disabled', value); if (value && root.activeElement === this) document.body.tabIndex = -1; document.body.focus(); });
  send.click(); await wait(200);
  disable.mockRestore();
  escape(); await wait(100);
  expect(win(root)).toBeNull();
  expect(root.activeElement).toBe(dots(root)[0]);
});

it('returns the focus to the dot on Escape after Show earlier, Done and Cancel removed the control that had it', async () => {
  const many = report(7, { comments: [1, 2, 3, 4, 5, 6, 7].map(n => comment(n)) });
  const { root } = await page([many], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  button(win(root)!, 'Show earlier').focus();
  button(win(root)!, 'Show earlier').click(); await wait(100);
  expect(root.activeElement).toBe(win(root));
  escape(); await wait(100);
  expect(win(root)).toBeNull();
  expect(root.activeElement).toBe(dots(root)[0]);
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const { root: other } = await page([report(7, review)], { 7: [100, 200, 40, 20] });
  dots(other)[0].click(); await wait(200);
  const done = win(other)!.querySelector<HTMLButtonElement>('[data-state-action="done"]')!;
  done.focus(); done.click(); await wait(300);
  expect(win(other)!.querySelector('.verify-tools')).toBeNull();
  expect(other.activeElement).toBe(win(other));
  escape(); await wait(100);
  expect(win(other)).toBeNull();
  expect(other.activeElement).toBe(dots(other)[0]);
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const { root: third } = await page([report(7, review)], { 7: [100, 200, 40, 20] });
  dots(third)[0].click(); await wait(200);
  win(third)!.querySelector<HTMLButtonElement>('[data-state-action="open"]')!.click(); await wait(100);
  const cancel = button(win(third)!.querySelector('.verify-tools')!, 'Cancel');
  cancel.focus(); cancel.click(); await wait(100);
  expect(win(third)!.querySelector('.verify-tools textarea')).toBeNull();
  expect(third.activeElement).toBe(win(third));
  escape(); await wait(100);
  expect(third.activeElement).toBe(dots(third)[0]);
});

it('scrolls to the newest reply when it arrives in a thread longer than the window shows, and to the top on Show earlier', async () => {
  const stored = report(7, { comments: [1, 2, 3, 4, 5, 6].map(n => comment(n)) });
  const { root } = await page([stored], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  const list = win(root)!.querySelector<HTMLElement>('.chat-body')!;
  Object.defineProperty(list, 'scrollHeight', { value: 900, configurable: true });
  let top = 0;
  Object.defineProperty(list, 'scrollTop', { get: () => top, set: value => { top = value; }, configurable: true });
  stored.comments.push(comment(7, { body: 'Latest' }));
  await wait(61000);
  expect([...list.querySelectorAll('.comment p')].map(item => item.textContent).at(-1)).toBe('Latest');
  expect(top).toBe(900);
  button(win(root)!, 'Show earlier').click(); await wait(100);
  expect(list.querySelectorAll('.comment')).toHaveLength(7);
  expect(top).toBe(0);
});
