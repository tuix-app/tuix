// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mock = vi.hoisted(() => ({ request: vi.fn(), environment: 'uat' }));
vi.mock('../src/api', () => ({ Api: class { environment = mock.environment; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; mock.environment = 'uat'; localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.request.mockReset(); document.body.replaceChildren(); });

const base = { id: 'issue', number: 3, title: 'Totals overflow', body: 'Totals overflow', status: 'open', state: 'open', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' }, author: { name: 'Anna' }, comments: [], inserted_at: '2026-09-22T12:00:00Z', reporter: false, fixer: false, can_be_fixer: false, assignee: null, allowed_states: [] as string[] };
type Payload = Record<string, unknown>;

/** Serves one report; `/state` and `/assign` go through `act`, which returns the next payload. */
async function open(initial: Payload, act: (path: string, body: Payload) => Payload = () => ({})) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  let current = { ...base, ...initial };
  mock.request.mockImplementation(async (path: string, _method?: string, body?: Payload) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [current], next_before: null };
    if (path === '/issues/issue') return current;
    if (path === '/issues/issue/state' || path === '/issues/issue/assign') { current = { ...current, ...act(path, body!) }; return current; }
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'workflow', lang: 'en' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  return root;
}
const actions = (root: ShadowRoot) => [...root.querySelectorAll('.thread-actions [data-state-action]')].map(item => item.textContent);
const action = (root: ShadowRoot, state: string) => root.querySelector<HTMLButtonElement>(`.thread-actions [data-state-action="${state}"]`)!;
/** Focuses a button before clicking it, as a keyboard user would. */
const press = (button: HTMLButtonElement) => { button.focus(); button.click(); };
const stateCalls = () => mock.request.mock.calls.filter(([path]) => String(path).endsWith('/state')).map(([, , body]) => body);

it('offers the reporter Works and Close from allowed_states alone (an older server), and records Works through the old state name', async () => {
  const root = await open({ reporter: true, allowed_states: ['done', 'closed'] }, (_path, body) => ({ state: body.state, status: 'resolved', allowed_states: ['open', 'closed'] }));
  expect(root.querySelector('.fixer-line')).toBeNull();
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  // The reporter of a report that is not in review: Works and Close, both quiet; Send is the one primary.
  expect(actions(root)).toEqual(['Works', 'Close']);
  expect(root.querySelectorAll('button.primary')).toHaveLength(1);
  action(root, 'works').click(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'done' }]);
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Closed · Fixed');
  expect(root.querySelector('.notice')!.textContent).toBe('Saved.');
  // A finished conversation takes no reply: it says so and offers Reopen as its one primary button.
  expect(actions(root)).toEqual(['Reopen']);
  expect(root.querySelector('.closed-note p')!.textContent).toBe('This conversation is closed. Reopen it to reply.');
  expect(root.querySelectorAll('button.primary')).toHaveLength(1);
  expect(root.querySelector('button.primary')!.textContent).toBe('Reopen');
  expect(root.querySelector('.mention-field')).toBeNull();
});

it('offers the fixer Fix ready and Close, which needs no note and retries after a failure', async () => {
  let fail = true;
  const root = await open({ fixer: true, can_be_fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review', 'closed'] }, (_path, body) => {
    if (fail) throw new Error('offline');
    return { state: body.state, status: 'resolved', allowed_states: ['in_progress', 'in_review'] };
  });
  expect(root.querySelector('.fixer-line')).toBeNull();
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  expect(actions(root)).toEqual(['Fix ready', 'Close']);
  press(action(root, 'close')); await vi.advanceTimersByTimeAsync(100);
  // Why it was closed goes in a reply: Close asks for no note.
  expect(root.querySelector('.state-note')).toBeNull();
  expect(root.querySelector('[role=alert]')!.textContent).toContain('Could not save that');
  fail = false;
  press(action(root, 'close')); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'closed' }, { state: 'closed' }]);
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Closed');
  // Focus lands on the new state rather than falling to the page.
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
});

it('lets a possible fixer take an unassigned report, and Fix ready assigns them first', async () => {
  const root = await open({ can_be_fixer: true }, (path, body) => path.endsWith('/assign')
    ? { fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review', 'closed'] }
    : { state: body.state, status: 'acknowledged', fixer: true, assignee: { name: 'Me', me: true } });
  // Fixer actions show before the server lists them: Fix ready assigns the caller first.
  expect(actions(root)).toEqual(['Fix ready']);
  press(root.querySelector<HTMLButtonElement>('[data-action=assign]')!); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/assign', 'POST', {});
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
  press(action(root, 'fix_ready')); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'in_review' }]);
  expect(root.querySelector('.thread-state')!.textContent).not.toContain('Fix ready');
  expect(action(root, 'fix_ready')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
});

it('hides fixer statuses and Mark fixed from an assignee whose session cannot take fixer actions', async () => {
  mock.environment = 'local';
  const root = await open({ fixer: true, can_be_fixer: false, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review'] });
  expect(actions(root)).toEqual([]);
  expect(root.querySelector('.thread-actions, [data-action=assign], .fix-tools')).toBeNull();
});

it('shows Take it on someone else’s report without borrowing their fixer actions', async () => {
  const root = await open({ can_be_fixer: true, assignee: { name: 'Bo', me: false }, allowed_states: [] });
  expect(root.querySelector('[data-action=assign]')!.textContent).toBe('Take it');
  expect(actions(root)).toEqual([]);
});

it('shows whose turn it is from the stored holder, and Take it only when the server says so', async () => {
  let root = await open({ turn: 'team', turn_holder: { name: 'Anna', me: false, reporter: false }, can_take: true, can_be_fixer: true, allowed_states: [] });
  expect(root.querySelector('.turn-line')!.textContent).toBe('Waiting for Anna');
  expect(root.querySelector('.fixer-line')).toBeNull();
  expect(root.querySelector('[data-action=assign]')!.textContent).toBe('Take it');
  core!.destroy(); document.body.replaceChildren();
  root = await open({ turn: 'team', turn_holder: { name: 'Rita', me: false, reporter: true }, can_take: false, can_be_fixer: true, allowed_states: [] });
  expect(root.querySelector('.turn-line')!.textContent).toBe('Waiting for Rita');
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  core!.destroy(); document.body.replaceChildren();
  root = await open({ turn: 'team', turn_holder: null, can_take: true, can_be_fixer: true, allowed_states: [] });
  expect(root.querySelector('.turn-line')!.textContent).toBe('Unclaimed');
  core!.destroy(); document.body.replaceChildren();
  root = await open({ turn: 'team', turn_holder: { name: 'Anna', me: true, reporter: false }, can_take: false, can_be_fixer: true, allowed_states: [] });
  expect(root.querySelector('.turn-line')!.textContent).toBe('Your turn');
});

it('asks for a note before Still broken when someone other than the reporter reopens a report in review', async () => {
  let fail = true;
  // A project admin: a linked member, so allowed to take fixer actions.
  const root = await open({ state: 'in_review', status: 'awaiting_verification', can_be_fixer: true, assignee: { name: 'Bo', me: false }, allowed_states: ['open', 'done', 'closed', 'in_progress'] }, (_path, body) => {
    if (fail) throw new Error('offline');
    return { state: body.state };
  });
  expect(root.querySelector('.verify-tools')).toBeNull();
  expect(actions(root)).toEqual(['Works', 'Still broken', 'Close']);
  press(action(root, 'still_broken')); await vi.advanceTimersByTimeAsync(50);
  expect(root.activeElement).toBe(root.querySelector('.state-note textarea'));
  // Cancel removes the form; focus returns to the thread state above the actions.
  press([...root.querySelectorAll<HTMLButtonElement>('.state-note button')].find(button => button.textContent === 'Cancel')!); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.state-note')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
  expect(stateCalls()).toEqual([]);
  action(root, 'still_broken').click(); await vi.advanceTimersByTimeAsync(50);
  const note = root.querySelector<HTMLTextAreaElement>('.state-note textarea')!;
  note.value = 'Still overflows.'; note.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  const submit = root.querySelector<HTMLButtonElement>('.state-note button[type=submit]')!;
  expect(submit.textContent).toBe('Still broken');
  // A failed change keeps the note for another try.
  root.querySelector<HTMLFormElement>('.state-note')!.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('[role=alert]')!.textContent).toContain('Could not save that');
  expect(root.querySelector<HTMLTextAreaElement>('.state-note textarea')!.value).toBe('Still overflows.');
  fail = false;
  root.querySelector<HTMLFormElement>('.state-note')!.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'open', note: 'Still overflows.' }, { state: 'open', note: 'Still overflows.' }]);
  expect(root.querySelector('.state-note')).toBeNull();
});

it('offers only the allowed states on a finished report and reads legacy statuses in the new vocabulary', async () => {
  const root = await open({ state: null, status: 'resolved', reporter: true, can_be_fixer: true, allowed_states: ['open', 'closed'] });
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Closed · Fixed');
  // A finished conversation offers Reopen only; no assignment, fixer actions or Mark fixed.
  expect(actions(root)).toEqual(['Reopen']);
  expect(root.querySelector('[data-action=assign], .fix-tools')).toBeNull();
  expect(root.textContent).not.toContain('Add a reply');
});

it('offers a fixer the matrix states on a finished report when the server allows them', async () => {
  const root = await open({ state: 'closed', status: 'resolved', fixer: true, can_be_fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review'] });
  // Nothing but Reopen is offered on a closed conversation, whatever else the server allows.
  expect(actions(root)).toEqual([]);
  expect(root.querySelector('[data-action=assign]')).toBeNull();
});

it('draws dots by whose turn it is: filled for yours, an outline for the rest, and closed ones only under All', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const targets = ['a', 'b', 'c', 'd'].map((id, index) => {
    const target = document.createElement('button'); target.dataset.testid = id; document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 20 + index * 60, y: 40, width: 40, height: 20 } as DOMRect);
    return target;
  });
  const report = (id: string, extra: Payload) => ({ ...base, id, title: id, locators: { testid: `[data-testid="${id}"]` }, ...extra });
  const mine = { turn_holder: { name: 'Me', me: true, reporter: false } }, theirs = { turn_holder: { name: 'Anna', me: false, reporter: false } };
  const reports = [report('a', { state: 'open', ...mine }), report('b', { state: 'in_progress', status: 'acknowledged', ...theirs }), report('c', { state: 'in_review', status: 'awaiting_verification', ...mine }), report('d', { state: null, status: 'fixed_awaiting_deploy', turn_holder: null })];
  mock.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues: reports, next_before: null } : { notifications: [] });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'pins' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  const pins = [...root.querySelectorAll<HTMLElement>('.pin')];
  expect(pins.map(pin => pin.dataset.state)).toEqual(['turn', 'open', 'turn', 'open']);
  // Flat: no pulse, no number or icon inside, and nothing like the old verify ring.
  expect(pins.every(pin => pin.children.length === 0 && !pin.classList.contains('verify-pin'))).toBe(true);
  expect(targets).toHaveLength(4);
});

it('offers the reporter Reopen on a finished report, without a note', async () => {
  const root = await open({ reporter: true, state: 'done', status: 'resolved', allowed_states: ['open', 'closed'] }, (_path, body) => ({ state: body.state, status: body.state, allowed_states: ['done', 'closed'] }));
  expect(actions(root)).toEqual(['Reopen']);
  action(root, 'reopen').click(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('.thread-actions textarea, .state-note textarea')).toBeNull();
  expect(stateCalls()).toEqual([{ state: 'open' }]);
});

/** What a server with actions sends; `/state` takes the action names. */
const served = (extra: Payload): Payload => ({ state: 'open', state_name: 'open', status: 'open', actions: [], allowed_states: [], ...extra });

it('draws the buttons from `actions` and sends the action name, with a note only for Still broken', async () => {
  const root = await open(served({ state: 'in_review', state_name: 'fix_ready', status: 'awaiting_verification', can_be_fixer: true, actions: ['reply', 'works', 'still_broken', 'close', 'urgent'] }),
    (_path, body) => body.state === 'close' ? { state: 'closed', state_name: 'closed', actions: ['reopen'] } : {});
  expect(actions(root)).toEqual(['Works', 'Still broken', 'Close']);
  press(action(root, 'still_broken')); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.state-note textarea')).not.toBeNull();
  expect(stateCalls()).toEqual([]);
  press([...root.querySelectorAll<HTMLButtonElement>('.state-note button')].find(button => button.textContent === 'Cancel')!); await vi.advanceTimersByTimeAsync(50);
  press(action(root, 'close')); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'close' }]);
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Closed');
  expect(actions(root)).toEqual(['Reopen']);
});

it('offers Fix ready and Take it only when `actions` lists them, and no Start, Ready for review or Done', async () => {
  const root = await open(served({ can_be_fixer: true, actions: ['reply', 'fix_ready', 'close', 'take', 'urgent'] }));
  expect(actions(root)).toEqual(['Fix ready', 'Close']);
  expect(root.querySelector('[data-action=assign]')!.textContent).toBe('Take it');
  for (const word of ['Start', 'Ready for review', 'Done']) expect(root.textContent).not.toContain(word);
  core!.destroy(); document.body.replaceChildren();
  const quiet = await open(served({ can_be_fixer: true, can_take: true, actions: ['reply'] }));
  expect(quiet.querySelector('.thread-actions')).toBeNull();
  expect(quiet.querySelector('[data-action=assign]')).toBeNull();
});

it('reads the closed words from state_name before state and status', async () => {
  const lines = [] as (string | null)[];
  for (const [state_name, state] of [['open', 'open'], ['fix_ready', 'in_review'], ['fixed', 'done'], ['closed', 'closed']]) {
    const root = await open(served({ state_name, state, status: 'open', turn_holder: { name: 'Anna', me: false, reporter: false }, can_take: true }));
    lines.push(root.querySelector('.thread-state .turn')!.textContent);
    core!.destroy(); document.body.replaceChildren();
  }
  expect(lines).toEqual(['Waiting for Anna', 'Waiting for Anna', 'Closed · Fixed', 'Closed']);
});

it('keeps Mark fixed, not a Fix ready button, in a local environment', async () => {
  mock.environment = 'local';
  const root = await open(served({ can_be_fixer: true, actions: ['reply', 'fix_ready', 'close'] }));
  expect(actions(root)).toEqual(['Close']);
  expect(root.querySelector('.fix-tools summary')!.textContent).toBe('Mark fixed');
});
