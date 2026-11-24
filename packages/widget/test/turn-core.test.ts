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
  id: 'issue-' + number, number, title: 'Save is hidden ' + number, body: 'Body ' + number, status: 'open', state: 'open', env_name: 'uat', url: location.origin + '/',
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


import { turnLine } from '../src/i18n';
import { turnOf, turnAfterReply, myTurn, dotState } from '../src/states';

const as = (viewer: 'reporter' | 'fixer' | 'other', turn: string | null | undefined) => ({ turn, reporter: viewer === 'reporter', fixer: viewer === 'fixer' });

it('has ONE turn line, phrased for the viewer, in both languages', () => {
  const holder = (name: string | null, me = false, reporter = false) => ({ name, me, reporter });
  const team = { can_take: true }, reporterView = { reporter: true }, member = { name: 'Anna' };
  const matrix: [string, Parameters<typeof turnLine>[0], string, string][] = [
    ['team, their own turn', { ...team, state: 'open', turn_holder: holder('Anna', true) }, 'Your turn', 'Twoja kolej'],
    ['team, someone else holds it', { ...team, state: 'open', turn_holder: holder(member.name) }, 'Waiting for Anna', 'Czeka na: Anna'],
    ['team, the reporter holds it in review', { ...team, state: 'in_review', turn_holder: holder('Ola', false, true) }, 'Waiting for Ola', 'Czeka na: Ola'],
    ['team, a holder without a name', { ...team, state: 'open', turn_holder: holder(null) }, 'Waiting for the team', 'Czeka na zespół'],
    ['team, a reporter without a name', { ...team, state: 'open', turn_holder: holder(null, false, true) }, 'Waiting for the reporter', 'Czeka na zgłaszającego'],
    ['team, nobody holds it', { ...team, state: 'open', turn_holder: null }, 'Unclaimed', 'Nikt się tym jeszcze nie zajął'],
    ['reporter, the team holds it', { ...reporterView, state: 'open', turn_holder: holder('Anna') }, 'Waiting for the team', 'Czeka na zespół'],
    ['reporter, nobody holds it: never Unclaimed', { ...reporterView, state: 'open', turn_holder: null }, 'Waiting for the team', 'Czeka na zespół'],
    ['reporter, a fix to check', { ...reporterView, state: 'in_review', turn_holder: holder('Ola', true, true) }, 'Your turn', 'Twoja kolej'],
    ['another person from the app, nobody holds it: never Unclaimed', { state: 'open', turn_holder: null }, 'Waiting for the team', 'Czeka na zespół'],
    ['closed as fixed', { ...team, state: 'done', turn_holder: null }, 'Closed · Fixed', 'Zamknięte · Naprawione'],
    ['closed otherwise', { ...reporterView, state: 'closed' }, 'Closed', 'Zamknięte'],
    ['state_name wins', { ...team, state_name: 'fixed', state: 'open' }, 'Closed · Fixed', 'Zamknięte · Naprawione'],
  ];
  for (const [name, issue, en, pl] of matrix) { expect(turnLine(issue, 'en'), name).toBe(en); expect(turnLine(issue, 'pl'), name).toBe(pl); }
  // A report still sending has no turn yet.
  expect(turnLine({ status: 'sending' }, 'en')).toBeNull();
});

it('falls back to `turn` against a server before stored turns, and shows nothing without one', () => {
  const matrix: [ReturnType<typeof as>, string][] = [
    [as('reporter', 'reporter'), 'Your turn'], [as('reporter', 'team'), 'Waiting for the team'], [as('reporter', 'verify'), 'Your turn'],
    [as('fixer', 'reporter'), 'Waiting for the reporter'], [as('fixer', 'team'), 'Your turn'], [as('fixer', 'verify'), 'Waiting for the reporter'],
    [as('other', 'reporter'), 'Waiting for the reporter'], [as('other', 'team'), 'Waiting for the team'], [as('other', 'verify'), 'Waiting for the reporter'],
  ];
  for (const [issue, en] of matrix) expect(turnLine({ ...issue, state: 'open' }, 'en')).toBe(en);
  // The reporter who is also the fixer reads it as the reporter.
  expect(turnLine({ turn: 'team', reporter: true, fixer: true, state: 'open' }, 'en')).toBe('Waiting for the team');
  // Absent (an older server) and a value from a newer server show nothing.
  for (const turn of [undefined, null, 'later']) for (const viewer of ['reporter', 'fixer', 'other'] as const) expect(turnLine({ ...as(viewer, turn), state: 'open' }, 'en')).toBeNull();
  expect(turnLine({}, 'en')).toBeNull();
  expect(turnOf({ turn: 'later' })).toBeNull();
  expect(turnOf({ turn: 'verify' })).toBe('verify');
});

it('knows whose turn it is for the dot: the stored holder, else the older `turn`', () => {
  expect(myTurn({ state: 'open', turn_holder: { me: true } })).toBe(true);
  expect(myTurn({ state: 'open', turn_holder: { me: false } })).toBe(false);
  expect(myTurn({ state: 'open', turn_holder: null })).toBe(false);
  // Finished conversations have no turn, whatever the holder says.
  expect(myTurn({ state: 'done', turn_holder: { me: true } })).toBe(false);
  expect(myTurn({ state: 'open', turn: 'verify', reporter: true })).toBe(true);
  expect(myTurn({ state: 'open', turn: 'team', fixer: true })).toBe(true);
  expect(myTurn({ state: 'open', turn: 'team', reporter: true })).toBe(false);
  expect(dotState({ state: 'open', turn_holder: { me: true } })).toBe('turn');
  expect(dotState({ state: 'in_review', turn_holder: { me: false } })).toBe('open');
  expect(dotState({ state: 'closed' })).toBe('closed');
  expect(dotState({ state_name: 'fixed' })).toBe('closed');
});

it('hands the turn over when the viewer replies, by the same rule as the server', () => {
  expect(turnAfterReply({ turn: 'reporter', reporter: true })).toBe('team');
  expect(turnAfterReply({ turn: 'team', fixer: true })).toBe('reporter');
  // Both at once is the reporter; someone else's reply is "anyone else" and leaves it with the team.
  expect(turnAfterReply({ turn: 'team', reporter: true, fixer: true })).toBe('team');
  expect(turnAfterReply({ turn: 'reporter' })).toBe('team');
  // In review and finished reports keep theirs, and an older server stays without.
  expect(turnAfterReply({ turn: 'verify', reporter: true })).toBe('verify');
  expect(turnAfterReply({ turn: null, reporter: true })).toBeNull();
  expect(turnAfterReply({ reporter: true })).toBeUndefined();
});

it('a picked person other than the reporter leaves the turn with the team; the reporter option hands it over', () => {
  const issue = { turn: 'team' as const, fixer: true, turn_options: options };
  expect(turnAfterReply(issue, 'end_user:rep')).toBe('reporter');
  expect(turnAfterReply(issue, 'member:abc')).toBe('team');
});

it('lets the fixer choose: keep leaves the turn, reporter hands it over, verify and finished stay', () => {
  expect(turnAfterReply({ turn: 'team', fixer: true }, 'keep')).toBe('team');
  expect(turnAfterReply({ turn: 'reporter', fixer: true }, 'keep')).toBe('reporter');
  expect(turnAfterReply({ turn: 'team', fixer: true }, 'reporter')).toBe('reporter');
  expect(turnAfterReply({ turn: 'reporter', fixer: true }, 'reporter')).toBe('reporter');
  for (const choice of ['keep', 'reporter'] as const) { expect(turnAfterReply({ turn: 'verify', fixer: true }, choice)).toBe('verify'); expect(turnAfterReply({ turn: null, fixer: true }, choice)).toBeNull(); expect(turnAfterReply({ fixer: true }, choice)).toBeUndefined(); }
});

/** Answers from copies, as a server does: the widget never holds the object the test changes. */
const served = (stored: Report) => (path: string) => path.startsWith('/issues?') ? { issues: [structuredClone(stored)] } : path === '/issues/' + stored.id ? structuredClone(stored) : undefined;
const hover = async (root: ShadowRoot) => { dots(root)[0].dispatchEvent(new Event('pointerenter')); await wait(400); return root.querySelector<HTMLElement>('.hover-card'); };
const waiting = { turn: 'reporter', reporter: true, fixer: false };

it('shows the turn in the hover card, and in its label', async () => {
  const { root } = await page([report(7, waiting)], { 7: [100, 200, 40, 20] });
  const card = (await hover(root))!;
  expect(card.querySelector('.card-meta .turn')?.textContent).toBe('Your turn');
  expect(card.querySelector('.card-meta .turn-dot')).not.toBeNull();
  expect(card.getAttribute('aria-label')).toContain('Your turn');
  // The card shows a line of text, nothing else changed: still no request for a hover.
  expect(calls('/issues/issue-7')).toHaveLength(0);
});

it('phrases the card for a fixer and for someone else, in Polish', async () => {
  const { root } = await page([report(7, { turn: 'team', reporter: false, fixer: true })], { 7: [100, 200, 40, 20] }, { lang: 'pl' });
  expect((await hover(root))!.querySelector('.turn')?.textContent).toBe('Twoja kolej');
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();
  const { root: peer } = await page([report(7, { turn: 'team', reporter: false, fixer: false })], { 7: [100, 200, 40, 20] });
  expect((await hover(peer))!.querySelector('.turn')?.textContent).toBe('Waiting for the team');
});

it('shows no turn when the server sent none or the report is finished', async () => {
  const { root } = await page([report(7)], { 7: [100, 200, 40, 20] });
  const card = (await hover(root))!;
  expect(card.querySelector('.turn')).toBeNull();
  expect(card.getAttribute('aria-label')).not.toMatch(/Waiting|turn|on it/);
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();
  const { root: finished } = await page([report(7, { turn: null, reporter: true })], { 7: [100, 200, 40, 20] });
  expect((await hover(finished))!.querySelector('.turn')).toBeNull();
});

it('shows the turn in the chat window header', async () => {
  const { root } = await page([report(7, waiting)], { 7: [100, 200, 40, 20] });
  dots(root)[0].click(); await wait(200);
  const header = win(root)!.querySelector('header')!;
  // One turn line, no status chip.
  expect(header.querySelectorAll('.turn-line')).toHaveLength(1);
  expect(header.querySelector('.status')).toBeNull();
  expect(header.querySelector('.turn')?.textContent).toBe('Your turn');
  expect(header.querySelector('.turn-dot')).not.toBeNull();
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const { root: pl } = await page([report(7, { turn: 'verify', state: 'in_review', status: 'awaiting_verification', reporter: true })], { 7: [100, 200, 40, 20] }, { lang: 'pl' });
  dots(pl)[0].click(); await wait(200);
  expect(win(pl)!.querySelector('header .turn')?.textContent).toBe('Twoja kolej');
  core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear();

  const { root: older } = await page([report(7)], { 7: [100, 200, 40, 20] });
  dots(older)[0].click(); await wait(200);
  expect(win(older)!.querySelector('header .turn')).toBeNull();
});

it('follows a live update: the window header and the hover card change with the reply that arrived', async () => {
  const stored: Report & { turn?: string | null } = report(7, { turn: 'team', reporter: false, fixer: true });
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, { handler: served(stored) });
  expect((await hover(root))!.querySelector('.turn')?.textContent).toBe('Your turn');
  dots(root)[0].click(); await wait(200);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Your turn');

  // The fixer replied from another tab.
  stored.turn = 'reporter';
  await mock.refresh(); await wait(200);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Waiting for the reporter');

  // The fix goes to review and the report is checked: the state and the turn change together.
  Object.assign(stored, { turn: 'verify', state: 'in_review', status: 'awaiting_verification' });
  await mock.refresh(); await wait(200);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Waiting for the reporter');
  // Finished: the line says so.
  Object.assign(stored, { turn: null, state: 'done', status: 'resolved' });
  await mock.refresh(); await wait(200);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Closed · Fixed');
});

it('hands the turn over at once when the reporter replies, and takes it back if sending fails', async () => {
  let release: () => void = () => {};
  let fail = true;
  const stored: Report & { turn?: string | null } = report(7, waiting);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, {
    // Only the reply is held back; everything else answers as usual.
    handler: (path, method) => {
      if (path !== '/issues/issue-7/comments' || method !== 'POST') return served(stored)(path);
      return new Promise((resolve, reject) => {
        release = () => { if (fail) reject(Object.assign(new Error('offline'), { status: 500 })); else { stored.turn = 'team'; resolve({ id: 'c3' }); } };
      });
    },
  });
  dots(root)[0].click(); await wait(200);
  const line = () => win(root)!.querySelector('header .turn')?.textContent;
  expect(line()).toBe('Your turn');

  typeIn(reply(root), 'Here is the page'); await wait(10);
  reply(root).closest('form')!.requestSubmit(); await wait(5);
  // Before the server answers.
  expect(line()).toBe('Waiting for the team');
  release(); await wait(200);
  expect(line()).toBe('Your turn');
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');

  fail = false;
  reply(root).closest('form')!.requestSubmit(); await wait(5);
  release(); await wait(200);
  expect(line()).toBe('Waiting for the team');
  // The hover card follows the thread once the window is closed.
  escape(); await wait(100);
  expect((await hover(root))!.querySelector('.turn')?.textContent).toBe('Waiting for the team');
});

const comments = () => calls('/issues/issue-7/comments').filter(([, method]) => method === 'POST');
const options = [{ value: 'end_user:rep', name: 'Rita', reporter: true }, { value: 'member:abc', name: 'Anna', team: true }];
const fixerView = { turn: 'team', reporter: false, fixer: true, can_be_fixer: true, turn_person: 'member:abc', turn_options: options, default_turn: 'end_user:rep' };
const sendTo = (form: Element) => form.querySelector<HTMLSelectElement>('select[data-send-to]')!;
const pick = (form: Element, value: string) => { const select = sendTo(form); select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };

it('gives a signed team session one Send with a Send to picker, each choice sent and moving the turn', async () => {
  for (const [value, turn, line] of [['end_user:rep', 'end_user:rep', 'Waiting for the reporter'], ['keep', 'keep', 'Your turn']] as const) {
    const stored: Report & { turn?: string | null } = report(7, fixerView);
    const { root } = await page([stored], { 7: [100, 200, 40, 20] }, { handler: (path, method, body) => { if (path === '/issues/issue-7/comments' && method === 'POST') { if ((body as { turn?: string }).turn === 'end_user:rep') stored.turn = 'reporter'; return { id: 'c3' }; } return served(stored)(path); } });
    dots(root)[0].click(); await wait(200);
    const form = reply(root).closest('form')!;
    expect([...form.querySelectorAll('button')].map(item => item.textContent)).toEqual(['Send']);
    // The server's order, then Keep with me; preselected by its default.
    expect([...sendTo(form).options].map(item => [item.value, item.textContent])).toEqual([['end_user:rep', 'Rita (reporter)'], ['member:abc', 'Anna'], ['keep', 'Keep with me']]);
    expect(sendTo(form).value).toBe('end_user:rep');
    pick(form, value); await wait(5);
    typeIn(reply(root), 'Looking'); await wait(10);
    button(form, 'Send').click(); await wait(5);
    expect(win(root)!.querySelector('header .turn')?.textContent).toBe(line);
    await wait(200);
    expect(win(root)!.querySelector('header .turn')?.textContent).toBe(line);
    expect(comments()).toHaveLength(1);
    expect(comments()[0][2]).toEqual({ body: 'Looking', turn });
    core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear(); mock.request.mockReset();
  }
});

it('sends the server\'s default recipient when the form is submitted untouched', async () => {
  const stored: Report & { turn?: string | null } = report(7, fixerView);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, { handler: served(stored) });
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), 'Done here'); await submit(root);
  expect(comments()[0][2]).toEqual({ body: 'Done here', turn: 'end_user:rep' });
});

it('restores the turn and who holds it when a team reply fails', async () => {
  let release: () => void = () => {};
  const stored: Report & { turn?: string | null } = report(7, fixerView);
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, {
    handler: (path, method) => path === '/issues/issue-7/comments' && method === 'POST' ? new Promise((_, reject) => { release = () => reject(Object.assign(new Error('offline'), { status: 500 })); }) : served(stored)(path),
  });
  dots(root)[0].click(); await wait(200);
  typeIn(reply(root), 'Soon'); await wait(10);
  button(win(root)!, 'Send').click(); await wait(5);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Waiting for the reporter');
  release(); await wait(200);
  expect(win(root)!.querySelector('header .turn')?.textContent).toBe('Your turn');
  expect(win(root)!.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');
});

it('keeps the single Reply for the reporter, other viewers and a fixer who cannot be one, with no turn sent', async () => {
  for (const view of [{ turn: 'reporter', reporter: true, fixer: false }, { turn: 'team', reporter: false, fixer: false }, { turn: 'team', reporter: true, fixer: true, can_be_fixer: true }, { turn: 'team', reporter: false, fixer: true }, { turn: 'team' }]) {
    const stored: Report & { turn?: string | null } = report(7, view);
    const { root } = await page([stored], { 7: [100, 200, 40, 20] }, { handler: served(stored) });
    dots(root)[0].click(); await wait(200);
    expect([...reply(root).closest('form')!.querySelectorAll('button')].map(item => item.textContent)).toEqual(['Send']);
    typeIn(reply(root), 'Hi'); await submit(root);
    expect(comments()[0][2]).toEqual({ body: 'Hi' });
    core!.destroy(); core = undefined; document.body.replaceChildren(); localStorage.clear(); mock.request.mockReset();
  }
});

it('sends no choice when the default recipient is not among the offered people', async () => {
  const stored = report(7, { ...fixerView, default_turn: 'member:hidden' });
  const { root } = await page([stored], { 7: [100, 200, 40, 20] }, { handler: (path, method) => (path === '/issues/issue-7/comments' && method === 'POST' ? { id: 'c3' } : served(stored)(path)) });
  dots(root)[0].click(); await wait(200);
  const form = reply(root).closest('form')!;
  expect(sendTo(form).value).toBe('');
  expect(sendTo(form).options[0].textContent).toBe('Default');
  typeIn(reply(root), 'Looking'); await wait(10);
  button(form, 'Send').click(); await wait(50);
  expect(comments()).toHaveLength(1);
  expect(comments()[0][2]).toEqual({ body: 'Looking' });
});
