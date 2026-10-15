// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), environment: 'uat' }));
vi.mock('../src/api', () => ({ Api: class {
  environment = mock.environment;
  request = mock.request;
  destroy() {}
} }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });

it('pages replies, preserves drafts during polling, and returns to the latest page after replying', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const comment = (body: string) => ({ id: body, body, author: { name: 'Reviewer' }, team: false, inserted_at: new Date().toISOString() });
  const issue = { id: 'issue', number: 1, title: 'Long discussion', body: 'Report', status: 'open', state: 'open', reporter: true, allowed_states: ['done', 'closed'], type: 'bug', env_name: 'uat', locators: {}, author: { name: 'Reviewer' }, own: false, comments: [comment('Recent reply')], comments_older: 'older-id', inserted_at: new Date().toISOString() };
  let deleted = false, replied = false;
  let releaseReply!: () => void;
  const heldReply = new Promise<void>(resolve => { releaseReply = resolve; });
  mock.request.mockImplementation(async (path: string) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [issue] };
    if (path === '/issues/issue?before=older-id') {
      if (deleted) throw { status: 422 };
      return {...issue, comments: [comment('Old reply')], comments_older: null};
    }
    if (path === '/issues/issue') return {...issue, comments: [comment(replied ? 'Newly sent reply' : 'Recent reply')]};
    if (path === '/issues/issue/comments') { await heldReply; replied = true; return {}; }
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture' }, { id: 'reviewer', name: 'Reviewer' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  (root.querySelector('.issue-item') as HTMLButtonElement).click(); await vi.advanceTimersByTimeAsync(200);
  const button = (text: string) => [...root.querySelectorAll('button')].find(el => el.textContent === text)!;
  const textarea = root.querySelector('textarea')!;
  textarea.value = 'Keep my reply'; textarea.dispatchEvent(new Event('input', {bubbles:true}));
  await vi.advanceTimersByTimeAsync(50);
  button('Older replies').click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.textContent).toContain('Old reply');
  expect(textarea.value).toBe('Keep my reply');
  await vi.advanceTimersByTimeAsync(60000);
  expect(root.textContent).toContain('Old reply');
  expect(textarea.value).toBe('Keep my reply');
  textarea.closest('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
  await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.comment:last-of-type')?.textContent).toContain('Keep my reply');
  expect(textarea.value).toBe('');
  expect(replied).toBe(false);
  releaseReply();
  await vi.advanceTimersByTimeAsync(200);
  expect(root.textContent).toContain('Newly sent reply');
  expect(root.textContent).not.toContain('Old reply');
  deleted = true;
  button('Older replies').click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.textContent).toContain('Newly sent reply');
  expect(button('Latest replies')).toBeUndefined();
});
