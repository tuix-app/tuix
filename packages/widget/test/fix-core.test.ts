// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), environment: 'local' }));
vi.mock('../src/api', () => ({ Api: class {
  environment = mock.environment;
  request = mock.request;
  destroy() {}
} }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('records a local peer fix with its note and host commit, preserving the note after failure', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  // Unassigned, and this signed developer may be its fixer: Mark fixed assigns them.
  const issue = { id: 'issue', number: 1, title: 'Save is hidden', body: 'Save is hidden', status: 'open', state: 'open', type: 'bug', env_name: 'uat', locators: {}, author: { name: 'Reviewer' }, reporter: false, fixer: false, can_be_fixer: true, assignee: null, allowed_states: [], comments: [], inserted_at: new Date().toISOString() };
  let fail = true, pollPending = false;
  let finishPoll!: (value: unknown) => void, finishFix!: (value: unknown) => void;
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [issue] };
    if (path === '/issues/issue') return pollPending ? new Promise(resolve => { finishPoll = resolve; }) : issue;
    if (path === '/issues/issue/fix') {
      if (fail) throw new Error('offline');
      return new Promise(resolve => { finishFix = resolve; });
    }
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture', commit: 'abc123', release: 'build-42' }, { id: 'developer', name: 'Developer' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  (root.querySelector('.issue-item') as HTMLButtonElement).click();
  await vi.advanceTimersByTimeAsync(200);
  const form = root.querySelector('.fix-tools form') as HTMLFormElement;
  expect(form).not.toBeNull();
  const textarea = form.querySelector('textarea')!;
  textarea.value = 'Restored the save button.'; textarea.dispatchEvent(new Event('input', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(50);
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.advanceTimersByTimeAsync(100);
  expect(textarea.value).toBe('Restored the save button.');
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not record the fix');
  fail = false; pollPending = true;
  await vi.advanceTimersByTimeAsync(60000);
  expect(finishPoll).toBeTypeOf("function");
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.advanceTimersByTimeAsync(100);
  await vi.advanceTimersByTimeAsync(60000);
  finishFix({ ...issue, status: 'fixed_awaiting_deploy', state: 'in_progress', fix_pending: true, fixer: true, assignee: { name: 'Developer', me: true }, allowed_states: ['in_review', 'wont_fix'] });
  await vi.advanceTimersByTimeAsync(100);
  finishPoll(issue);
  await vi.advanceTimersByTimeAsync(100);
  expect(mock.request.mock.calls.filter(([path]) => path.endsWith('/fix'))).toEqual([
    ['/issues/issue/fix', 'POST', { note: 'Restored the save button.', commit: 'abc123' }],
    ['/issues/issue/fix', 'POST', { note: 'Restored the save button.', commit: 'abc123' }],
  ]);
  expect(root.querySelector('.fix-tools')).toBeNull();
  expect(root.textContent).toContain('Waiting for deployment to UAT');
  expect(root.querySelector('.fix-pending')!.textContent).toBe('Fix waiting for deploy');
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: you');
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('In progress');
});

it('hides Mark fixed from people who cannot fix, and outside local development', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const base = { id: 'issue', number: 1, title: 'Save is hidden', body: 'Save is hidden', status: 'open', state: 'open', type: 'bug', env_name: 'uat', locators: {}, author: { name: 'Reviewer' }, comments: [], inserted_at: new Date().toISOString() };
  for (const [environment, extra, visible] of [
    ['local', { can_be_fixer: false, allowed_states: ['done', 'closed'], reporter: true }, false],
    ['local', { can_be_fixer: true, fixer: false, assignee: { name: 'Someone else', me: false } }, false],
    ['local', { can_be_fixer: true, fixer: true, assignee: { name: 'Developer', me: true }, fix_pending: true, state: 'in_progress', status: 'fixed_awaiting_deploy' }, false],
    ['uat', { can_be_fixer: true, fixer: true, assignee: { name: 'Developer', me: true } }, false],
    ['local', { can_be_fixer: true, fixer: true, assignee: { name: 'Developer', me: true }, state: 'in_progress', status: 'acknowledged' }, true],
  ] as const) {
    mock.environment = environment;
    const issue = { ...base, ...extra };
    mock.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues: [issue] } : path === '/issues/issue' ? issue : { notifications: [] });
    const host = document.createElement('div'); document.body.append(host);
    const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
    core = mount(root, launcher, { project: 'fixture' }, { id: 'developer', name: 'Developer' }, () => {});
    core.open(); await vi.advanceTimersByTimeAsync(200);
    (root.querySelector('.issue-item') as HTMLButtonElement).click(); await vi.advanceTimersByTimeAsync(200);
    expect(!!root.querySelector('.fix-tools')).toBe(visible);
    core.destroy(); core = undefined; document.body.replaceChildren();
  }
  mock.environment = 'local';
});
