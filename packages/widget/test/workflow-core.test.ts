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

const base = { id: 'issue', number: 3, title: 'Totals overflow', body: 'Totals overflow', status: 'open', state: 'open', type: 'bug', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' }, author: { name: 'Anna' }, comments: [], inserted_at: '2026-09-22T12:00:00Z', reporter: false, fixer: false, can_be_fixer: false, assignee: null, allowed_states: [] as string[] };
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

it('offers the reporter Done and Close, and records Done through the state route', async () => {
  const root = await open({ reporter: true, allowed_states: ['done', 'closed'] }, (_path, body) => ({ state: body.state, status: 'resolved', allowed_states: ['open', 'closed'] }));
  expect(root.querySelector('.fixer-line')!.textContent).toBe('No fixer yet');
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  expect(actions(root)).toEqual(['Done', 'Close']);
  action(root, 'done').click(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'done' }]);
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('Done');
  expect(root.querySelector('.notice')!.textContent).toBe('Status changed to Done.');
  // A finished report offers exactly what the server allows (Close and Reopen) and no replies.
  expect(actions(root)).toEqual(['Close', 'Reopen']);
  expect(root.textContent).not.toContain('Add a reply');
  action(root, 'closed').click(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'done' }, { state: 'closed' }]);
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('Closed');
});

it('offers the fixer Start, Ready for review and Won’t fix, which needs a note that survives a failure', async () => {
  let fail = true;
  const root = await open({ fixer: true, can_be_fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review', 'wont_fix'] }, (_path, body) => {
    if (fail) throw new Error('offline');
    return { state: body.state, status: body.state, allowed_states: ['in_progress', 'in_review'] };
  });
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: you');
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  expect(actions(root)).toEqual(['Start', 'Ready for review', 'Won’t fix']);
  press(action(root, 'wont_fix')); await vi.advanceTimersByTimeAsync(50);
  const form = root.querySelector<HTMLFormElement>('.state-note')!;
  // The note form takes focus from the action button it replaces.
  expect(root.activeElement).toBe(form.querySelector('textarea'));
  expect(form.querySelector('label')!.textContent).toContain('Why won’t this be fixed?');
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]')!;
  expect(submit.disabled).toBe(true);
  const note = form.querySelector('textarea')!;
  note.value = 'Works as designed.'; note.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  form.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('[role=alert]')!.textContent).toContain('Could not change the status');
  expect(root.querySelector<HTMLTextAreaElement>('.state-note textarea')!.value).toBe('Works as designed.');
  fail = false;
  root.querySelector<HTMLFormElement>('.state-note')!.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'wont_fix', note: 'Works as designed.' }, { state: 'wont_fix', note: 'Works as designed.' }]);
  expect(root.querySelector('.state-note')).toBeNull();
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('Won’t fix');
  // Focus lands on the new state rather than falling to the page.
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
});

it('lets a possible fixer take an unassigned report: Assign to me, or Start which assigns them first', async () => {
  const root = await open({ can_be_fixer: true }, (path, body) => path.endsWith('/assign')
    ? { fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review', 'wont_fix'] }
    : { state: body.state, status: 'acknowledged', fixer: true, assignee: { name: 'Me', me: true } });
  // Fixer actions show before the server lists them: Start assigns the caller first.
  expect(actions(root)).toEqual(['Start', 'Ready for review', 'Won’t fix']);
  press(root.querySelector<HTMLButtonElement>('[data-action=assign]')!); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/assign', 'POST', {});
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: you');
  expect(root.querySelector('[data-action=assign]')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
  press(action(root, 'in_progress')); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'in_progress' }]);
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('In progress');
  expect(action(root, 'in_progress')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
});

it('hides fixer statuses and Mark fixed from an assignee whose session cannot take fixer actions', async () => {
  mock.environment = 'local';
  const root = await open({ fixer: true, can_be_fixer: false, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review', 'wont_fix'] });
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: you');
  expect(actions(root)).toEqual([]);
  expect(root.querySelector('.thread-actions, [data-action=assign], .fix-tools')).toBeNull();
});

it('shows Assign to me on someone else’s report without borrowing their fixer actions', async () => {
  const root = await open({ can_be_fixer: true, assignee: { name: 'Bo', me: false }, allowed_states: [] });
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: Bo');
  expect(root.querySelector('[data-action=assign]')!.textContent).toBe('Assign to me');
  expect(root.querySelector('.thread-actions')).toBeNull();
});

it('asks for a note before Still broken when someone other than the reporter reopens a report in review', async () => {
  // A project admin: a linked member, so allowed to take fixer actions.
  const root = await open({ state: 'in_review', status: 'awaiting_verification', can_be_fixer: true, assignee: { name: 'Bo', me: false }, allowed_states: ['open', 'done', 'closed', 'in_progress', 'wont_fix'] }, (_path, body) => ({ state: body.state }));
  expect(root.querySelector('.verify-tools')).toBeNull();
  expect(actions(root)).toEqual(['Done', 'Close', 'Still broken', 'Start', 'Won’t fix']);
  press(action(root, 'open')); await vi.advanceTimersByTimeAsync(50);
  expect(root.activeElement).toBe(root.querySelector('.state-note textarea'));
  // Cancel removes the form; focus returns to the thread state above the actions.
  press([...root.querySelectorAll<HTMLButtonElement>('.state-note button')].find(button => button.textContent === 'Cancel')!); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelector('.state-note')).toBeNull();
  expect(root.activeElement).toBe(root.querySelector('.thread-state'));
  expect(stateCalls()).toEqual([]);
  action(root, 'open').click(); await vi.advanceTimersByTimeAsync(50);
  const note = root.querySelector<HTMLTextAreaElement>('.state-note textarea')!;
  note.value = 'Still overflows.'; note.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  root.querySelector<HTMLFormElement>('.state-note')!.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(stateCalls()).toEqual([{ state: 'open', note: 'Still overflows.' }]);
});

it('offers only the allowed states on a finished report and reads legacy statuses in the new vocabulary', async () => {
  const root = await open({ state: null, status: 'resolved', reporter: true, can_be_fixer: true, allowed_states: ['open', 'closed'] });
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('Done');
  // The reporter may still close it; no assignment, fixer actions or Mark fixed on a finished report.
  expect(actions(root)).toEqual(['Close', 'Reopen']);
  expect(root.querySelector('[data-action=assign], .fix-tools')).toBeNull();
  expect(root.textContent).not.toContain('Add a reply');
});

it('offers a fixer the matrix states on a finished report when the server allows them', async () => {
  const root = await open({ state: 'wont_fix', status: 'wont_fix', fixer: true, can_be_fixer: true, assignee: { name: 'Me', me: true }, allowed_states: ['in_progress', 'in_review'] });
  expect(actions(root)).toEqual(['Start', 'Ready for review']);
  expect(root.querySelector('[data-action=assign]')).toBeNull();
});

it('colours pins by state: peach open, gold in progress, an aqua ring in review', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const targets = ['a', 'b', 'c', 'd'].map((id, index) => {
    const target = document.createElement('button'); target.dataset.testid = id; document.body.append(target);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ x: 20 + index * 60, y: 40, width: 40, height: 20 } as DOMRect);
    return target;
  });
  const report = (id: string, extra: Payload) => ({ ...base, id, title: id, locators: { testid: `[data-testid="${id}"]` }, ...extra });
  const reports = [report('a', { state: 'open' }), report('b', { state: 'in_progress', status: 'acknowledged' }), report('c', { state: 'in_review', status: 'awaiting_verification' }), report('d', { state: null, status: 'fixed_awaiting_deploy' })];
  mock.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues: reports, next_before: null } : { notifications: [] });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'pins' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  const pins = [...root.querySelectorAll<HTMLElement>('.pin')];
  expect(pins.map(pin => [pin.dataset.state, pin.classList.contains('verify-pin')])).toEqual([['open', false], ['warm', false], ['verify', true], ['warm', false]]);
  expect(targets).toHaveLength(4);
});

it('offers the reporter Reopen on a finished report, without a note', async () => {
  const root = await open({ reporter: true, state: 'done', status: 'resolved', allowed_states: ['open', 'closed'] }, (_path, body) => ({ state: body.state, status: body.state, allowed_states: ['done', 'closed'] }));
  expect(actions(root)).toEqual(['Close', 'Reopen']);
  action(root, 'open').click(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('.thread-actions textarea')).toBeNull();
  expect(stateCalls()).toEqual([{ state: 'open' }]);
});
