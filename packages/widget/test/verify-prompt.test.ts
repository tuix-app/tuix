// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { choose, DISMISS_MS, dismissals, eligible, forgetDismissals, mountVerifyPrompt, SETTLE_MS, type PromptContext } from '../src/verify-prompt';
import type { Issue } from '../src/types';

const page = location.origin + location.pathname;
const issue = (extra: Partial<Issue> = {}): Issue => ({
  id: 'a', number: 1, title: 'Save is hidden', status: 'awaiting_verification', state: 'in_review', type: 'bug', env_name: 'uat', url: page, locators: {} as never,
  author: { name: 'Reporter' }, comment_count: 0, inserted_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', reporter: true, allowed_states: ['done', 'open'],
  verification_started_at: '2026-11-02T10:00:00Z', ...extra,
});
const context = (extra: Partial<PromptContext> = {}): PromptContext => ({ active: true, identified: true, pageUrl: page, panelOpen: false, deepLink: false, isDismissed: () => false, ...extra });

beforeEach(() => { forgetDismissals(); localStorage.clear(); });
afterEach(() => { document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); history.replaceState({}, '', '/'); });

it('asks only when every condition holds', () => {
  expect(eligible(issue(), context())).toBe(true);
  expect(eligible(issue(), context({ active: false }))).toBe(false);
  expect(eligible(issue(), context({ identified: false }))).toBe(false);
  expect(eligible(issue(), context({ panelOpen: true }))).toBe(false);
  expect(eligible(issue(), context({ deepLink: true }))).toBe(false);
  expect(eligible(issue(), context({ isDismissed: () => true }))).toBe(false);
  for (const state of ['open', 'in_progress', 'done', 'closed'] as const) expect(eligible(issue({ state, status: state }), context()), state).toBe(false);
  // Someone else's report, as the review controls see it; `own` stands in for `reporter` on older servers.
  expect(eligible(issue({ reporter: false }), context())).toBe(false);
  expect(eligible(issue({ reporter: undefined, own: true }), context())).toBe(true);
  // The server does not let the caller decide.
  expect(eligible(issue({ allowed_states: [] }), context())).toBe(false);
  expect(eligible(issue({ allowed_states: undefined }), context())).toBe(false);
  // Another page, or a report with no page.
  expect(eligible(issue({ url: page + 'other' }), context())).toBe(false);
  expect(eligible(issue({ url: undefined }), context())).toBe(false);
});

it('picks the oldest report and counts the others', () => {
  const picked = choose([issue({ id: 'c', number: 9 }), issue({ id: 'a', number: 2 }), issue({ id: 'b', number: 5, reporter: false }), issue({ id: 'd', number: 1, state: 'open' })], context());
  expect(picked).toMatchObject({ issue: { id: 'a' }, count: 2 });
  expect(choose([issue({ state: 'done' })], context())).toBeNull();
});

it('remembers Later for a day per review round, and cleans up expired entries', () => {
  let time = 1_000_000;
  const store = dismissals('p', () => time);
  const first = issue(), other = issue({ id: 'z' });
  expect(store.isDismissed(first)).toBe(false);
  store.dismiss(first);
  expect(store.isDismissed(first)).toBe(true);
  expect(store.isDismissed(other)).toBe(false);
  // A new review round of the same report asks again.
  expect(store.isDismissed({ ...first, verification_started_at: '2026-11-09T10:00:00Z' })).toBe(false);
  // Another project's browser state is separate.
  expect(dismissals('q', () => time).isDismissed(first)).toBe(false);
  time += DISMISS_MS - 1; expect(store.isDismissed(first)).toBe(true);
  store.dismiss(other);
  time += 2; expect(store.isDismissed(first)).toBe(false);
  store.clean();
  expect(Object.keys(JSON.parse(localStorage.getItem('tuix:verify-prompt:p')!))).toEqual(['z']);
  time += DISMISS_MS; store.clean();
  expect(localStorage.getItem('tuix:verify-prompt:p')).toBeNull();
});

it('falls back to memory when storage throws or holds garbage', () => {
  const store = dismissals('blocked');
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  expect(() => store.dismiss(issue())).not.toThrow();
  expect(store.isDismissed(issue())).toBe(true);
  vi.restoreAllMocks();
  localStorage.setItem('tuix:verify-prompt:junk', '[1,2'); expect(dismissals('junk').isDismissed(issue())).toBe(false);
  localStorage.setItem('tuix:verify-prompt:junk', '{"a":{"until":"x"}}'); expect(dismissals('junk').isDismissed(issue({ id: 'a' }))).toBe(false);
});

function mounted(list: () => Issue[], extra: { isOpen?: () => boolean } = {}) {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const request = vi.fn(async (_path: string) => ({ issues: list() })), onCheck = vi.fn();
  const prompt = mountVerifyPrompt(root, launcher, { project: 'fixture' }, { api: { request: request as never, environment: 'uat' }, isOpen: extra.isOpen ?? (() => false), onCheck });
  const card = () => root.querySelector<HTMLElement>('.tuix-verify')!;
  return { root, prompt, request, onCheck, card, launcher, live: () => root.querySelector('[aria-live=polite]')!.textContent };
}

it('stays quiet and silent on the network until the summary has something to verify', async () => {
  const { prompt, request, card } = mounted(() => [issue()]);
  prompt.sync(0); await vi.advanceTimersByTimeAsync(5000);
  expect(request).not.toHaveBeenCalled(); expect(card().hidden).toBe(true);
  prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS - 10);
  expect(request).not.toHaveBeenCalled(); expect(card().hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(20);
  expect(request).toHaveBeenCalledTimes(1);
  const query = new URLSearchParams(request.mock.calls[0][0].split('?')[1]);
  expect(Object.fromEntries(query)).toMatchObject({ show: 'verify', involving: 'me', page_url: page });
  prompt.destroy();
});

it('renders an accessible card, announces it once and opens the thread from Check it', async () => {
  const { prompt, onCheck, card, live, root } = mounted(() => [issue({ id: 'b', number: 7, title: 'x'.repeat(200) }), issue({ id: 'a', number: 3 })]);
  prompt.sync(2); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(card().hidden).toBe(false);
  expect(card().getAttribute('role')).toBe('group');
  expect(card().textContent).toContain('Fixed — does it work now?');
  expect(card().textContent).toContain('#3 Save is hidden');
  expect(card().textContent).toContain('1 of 2');
  const buttons = [...card().querySelectorAll('button')];
  expect(buttons.map(b => [b.type, b.textContent])).toEqual([['button', 'Check it'], ['button', 'Later']]);
  expect(live()).toContain('#3');
  // A refresh of the same report does not re-announce it.
  prompt.sync(2); await vi.advanceTimersByTimeAsync(10);
  expect(live()).toContain('#3');
  buttons[0].click();
  expect(onCheck).toHaveBeenCalledWith('a');
  expect(card().hidden).toBe(true);
  // One decision per page load: no chain to the next report.
  prompt.sync(2); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(card().hidden).toBe(true);
  expect(root.querySelectorAll('.tuix-verify').length).toBe(1);
});

it('truncates a long title', async () => {
  const { prompt, card } = mounted(() => [issue({ title: 'y'.repeat(300) })]);
  prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(card().querySelector('.r')!.textContent!.length).toBeLessThan(100);
});

it('Later and Escape hide it for the report and do not take the focus', async () => {
  const { prompt, card, onCheck, launcher } = mounted(() => [issue()]);
  prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(card().contains(document.activeElement)).toBe(false);
  card().querySelector<HTMLButtonElement>('.k')!.focus();
  card().querySelector<HTMLButtonElement>('button:not(.k)')!.focus();
  card().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(card().hidden).toBe(true); expect(onCheck).not.toHaveBeenCalled();
  expect(dismissals('fixture').isDismissed(issue())).toBe(true);
  expect(localStorage.getItem('tuix:verify-prompt:fixture')).toContain('"a"');
  void launcher;
});

it('is not shown again while dismissed, but is for a new review round', async () => {
  dismissals('fixture').dismiss(issue());
  const first = mounted(() => [issue()]);
  first.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(first.card().hidden).toBe(true);
  first.prompt.destroy();
  const second = mounted(() => [issue({ verification_started_at: '2026-11-20T10:00:00Z' })]);
  second.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(second.card().hidden).toBe(false);
});

it('goes away when the report leaves review or the count drops to zero, and when the panel is open', async () => {
  let list = [issue()];
  const view = mounted(() => list);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(false);
  list = [issue({ state: 'done', status: 'resolved' })];
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(10);
  expect(view.card().hidden).toBe(true);
  list = [issue()];
  view.prompt.sync(2); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(false);
  view.prompt.sync(0);
  expect(view.card().hidden).toBe(true);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(false);
  view.prompt.suppress(); expect(view.card().hidden).toBe(true);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(true);
});

it('does not appear while the panel is open or for a deep link', async () => {
  const open = mounted(() => [issue()], { isOpen: () => true });
  open.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(open.card().hidden).toBe(true);
  open.prompt.destroy();
  history.replaceState({}, '', '/?tuix=f3f59e83-0750-47aa-9c04-c7fb02060900');
  const linked = mounted(() => [issue({ url: location.origin + location.pathname })]);
  linked.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(linked.card().hidden).toBe(true);
});

it('follows single-page route changes: the old page loses its prompt and the new page is looked at', async () => {
  const pages: Record<string, Issue[]> = { '/': [issue()], '/next': [issue({ id: 'n', number: 4, url: location.origin + '/next' })] };
  const view = mounted(() => pages[location.pathname] ?? []);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().textContent).toContain('#1');
  history.pushState({}, '', '/next');
  expect(view.card().hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(false); expect(view.card().textContent).toContain('#4');
  history.pushState({}, '', '/empty'); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(true);
  view.prompt.destroy();
  const push = history.pushState; history.pushState({}, '', '/'); expect(history.pushState).toBe(push);
});

it('looks once per page and count, and stops asking after the count drops to zero', async () => {
  const original = history.pushState;
  const view = mounted(() => []);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(history.pushState).not.toBe(original);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).toHaveBeenCalledTimes(1);
  view.prompt.sync(2); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).toHaveBeenCalledTimes(2);
  view.prompt.sync(0); view.request.mockClear();
  // Disarmed: no route change and no tab change asks anything.
  history.pushState({}, '', '/elsewhere'); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).not.toHaveBeenCalled();
  expect(history.pushState).toBe(original);
});

it('ignores a response that lands after the route changed', async () => {
  let release!: (value: { issues: Issue[] }) => void;
  const view = mounted(() => []);
  view.request.mockImplementationOnce(() => new Promise(resolve => { release = resolve as never; }) as never);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  history.pushState({}, '', '/moved');
  release({ issues: [issue()] }); await vi.advanceTimersByTimeAsync(0);
  expect(view.card().hidden).toBe(true);
});

it('asks nothing on a tab refocus unless a look was deferred while the tab was hidden', async () => {
  const view = mounted(() => [issue({ reporter: false })]);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).toHaveBeenCalledTimes(1);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).toHaveBeenCalledTimes(1);
  view.prompt.destroy();
  // The page settles while the tab is in the background: the look waits for the tab.
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
  const later = mounted(() => [issue()]);
  later.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(later.request).not.toHaveBeenCalled();
  hidden.mockReturnValue(false);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(later.request).toHaveBeenCalledTimes(1); expect(later.card().hidden).toBe(false);
});

it('re-checks a visible card on tab refocus, at most once a minute, and drops it when the report is no longer eligible', async () => {
  let list = [issue()];
  const view = mounted(() => list);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.card().hidden).toBe(false);
  list = [issue({ state: 'done', status: 'resolved' })];
  await vi.advanceTimersByTimeAsync(30_000);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10);
  expect(view.request).toHaveBeenCalledTimes(1); expect(view.card().hidden).toBe(false);
  await vi.advanceTimersByTimeAsync(31_000);
  document.dispatchEvent(new Event('visibilitychange')); await vi.advanceTimersByTimeAsync(10);
  expect(view.request).toHaveBeenCalledTimes(2); expect(view.card().hidden).toBe(true);
});

it('takes its history wrappers off, and lets go of the card, even when another script wrapped after it', async () => {
  const view = mounted(() => [issue()]);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  const ours = history.pushState;
  const other = function(this: History, ...args: Parameters<History['pushState']>) { return ours.apply(this, args); } as History['pushState'];
  history.pushState = other;
  view.prompt.destroy(); view.request.mockClear();
  // Our wrapper cannot be removed from under the other script's: it stays, but does nothing.
  expect(history.pushState).toBe(other);
  history.pushState({}, '', '/after'); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(view.request).not.toHaveBeenCalled(); expect(location.pathname).toBe('/after');
});

it('never throws into the host navigation', async () => {
  const view = mounted(() => []);
  view.prompt.sync(1); await vi.advanceTimersByTimeAsync(SETTLE_MS + 10);
  expect(() => history.pushState({}, '', '/safe')).not.toThrow();
  view.prompt.destroy();
});
