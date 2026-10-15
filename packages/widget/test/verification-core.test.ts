// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ request: vi.fn(), upload: vi.fn(), screenshot: vi.fn(), environment: 'uat' }));
vi.mock('../src/api', () => ({ Api: class { environment = mock.environment; request = mock.request; upload = mock.upload; destroy() {} } }));
vi.mock('../src/screenshot', () => ({ screenshot: mock.screenshot }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; mock.environment = 'uat'; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); document.body.replaceChildren(); });
// The caller reported it; the fixer moved it to review.
const issue = { id: 'issue', number: 1, title: 'Save is hidden', body: 'Save is hidden', status: 'awaiting_verification', state: 'in_review', type: 'bug', env_name: 'uat', locators: {}, author: { name: 'Reporter' }, reporter: true, fixer: false, can_be_fixer: false, allowed_states: ['open', 'done', 'closed'], assignee: { name: 'Developer', me: false }, comments: [], inserted_at: new Date().toISOString(), fixed_note: {body: 'Restored the save button.', author: {name: 'Developer'}}, original_screenshot: [] };
const reopened = { ...issue, status: 'open', state: 'open', allowed_states: ['done', 'closed'] };
async function openFixture(decide: (body: unknown) => unknown, screenshot = false) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  mock.request.mockImplementation(async (path: string, _method: string, body: unknown) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [issue] };
    if (path === '/issues/issue') return issue;
    if (path === '/issues/issue/verify') return decide(body);
    if (path === '/uploads') return {id: 'upload', url: 'https://upload.example.test', headers: {}};
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' });
  const launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'fixture' }, { id: 'reviewer', name: 'Reviewer' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  (root.querySelector('.issue-item') as HTMLButtonElement).click(); await vi.advanceTimersByTimeAsync(200);
  return root;
}
function button(root: ShadowRoot, label: string) { return [...root.querySelectorAll('button')].find(b => b.textContent === label)!; }

it.each(['uat', 'local', 'production'])('shows verification evidence in %s and records Done without misreporting a later refresh failure', async environment => {
  mock.environment = environment;
  const root = await openFixture(() => {
    mock.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/issues?')) return {issues: []};
      throw new Error('notification refresh offline');
    });
    return {...issue, status: 'resolved', state: 'done'};
  });
  expect(root.textContent).toContain('Restored the save button.');
  expect(root.textContent).toContain('The original element could not be found');
  // The page-scoped "Verify n" capsule is gone; the SDK summary capsule replaces it.
  expect(root.querySelector('.verify-badge')).toBeNull();
  expect(root.querySelector('.thread-state .status')!.textContent).toBe('In review');
  expect(root.querySelector('.fixer-line')!.textContent).toBe('Fixer: Developer');
  // Done and Still broken live in the verification block; Close stays with the other actions.
  expect([...root.querySelectorAll('.verify-tools [data-state-action]')].map(item => item.textContent)).toEqual(['Done', 'Still broken']);
  expect([...root.querySelectorAll('.thread-actions [data-state-action]')].map(item => item.textContent)).toEqual(['Close']);
  button(root, 'Done').click(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/verify', 'POST', {outcome: 'works'});
  expect(root.textContent).toContain('Fix verified. Thank you.');
  expect(root.textContent).not.toContain('Could not save your decision');
  expect(root.querySelector('.verify-tools')).toBeNull();
});

it('preserves a broken-review note on failure and supports text-only review when capture is disabled', async () => {
  let fail = true;
  const root = await openFixture(() => { if (fail) throw new Error('offline'); return reopened; });
  button(root, 'Still broken').click(); await vi.advanceTimersByTimeAsync(100);
  const input = root.querySelector('.verify-tools textarea') as HTMLTextAreaElement;
  input.value = 'Save still disappears.'; input.dispatchEvent(new Event('input', {bubbles: true}));
  await vi.advanceTimersByTimeAsync(50);
  button(root, 'Reopen report').click(); await vi.advanceTimersByTimeAsync(100);
  expect(input.value).toBe('Save still disappears.');
  expect(root.textContent).toContain('Could not save your decision');
  fail = false;
  button(root, 'Reopen report').click(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/verify', 'POST', {outcome: 'broken', note: 'Save still disappears.', attachments: []});
  expect(mock.screenshot).not.toHaveBeenCalled();
  expect(root.querySelector('.verify-tools')).toBeNull();
  expect(root.textContent).toContain('Report reopened with your review.');
});

it('uploads a new captured screenshot with a broken review', async () => {
  const shot = new Blob(['fixture'], {type: 'image/png'});
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture'); static revokeObjectURL = vi.fn(); });
  mock.screenshot.mockResolvedValue(shot);
  const root = await openFixture(() => reopened, true);
  button(root, 'Still broken').click(); await vi.advanceTimersByTimeAsync(100);
  const input = root.querySelector('.verify-tools textarea') as HTMLTextAreaElement;
  input.value = 'Still hidden.'; input.dispatchEvent(new Event('input', {bubbles: true}));
  await vi.advanceTimersByTimeAsync(50);
  button(root, 'Reopen report').click(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.upload).toHaveBeenCalledWith('https://upload.example.test', {}, shot);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/verify', 'POST', {outcome: 'broken', note: 'Still hidden.', attachments: ['upload']});
});

it('ends an unfinished review when polling discovers that another reviewer reopened the report', async () => {
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture'); static revokeObjectURL = vi.fn(); });
  mock.screenshot.mockResolvedValue(new Blob(['fixture'], {type: 'image/png'}));
  const root = await openFixture(() => { throw new Error('must not submit'); }, true);
  button(root, 'Still broken').click(); await vi.advanceTimersByTimeAsync(100);
  expect(root.querySelector('.verify-tools img')).not.toBeNull();
  const prior = mock.request.getMockImplementation()!;
  mock.request.mockImplementation((path: string, ...args: unknown[]) => path === '/issues/issue' ? Promise.resolve(reopened) : prior(path, ...args));
  await vi.advanceTimersByTimeAsync(60100);
  expect(root.querySelector('.verify-tools')).toBeNull();
  expect(root.textContent).toContain('Add a reply');
  expect(root.textContent).toContain('The report status changed.');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
  expect(mock.request.mock.calls.some(([path]) => path === '/issues/issue/verify')).toBe(false);
});

it('discards review capture when a cross-environment report becomes unavailable after another decision', async () => {
  vi.stubGlobal('URL', class extends URL { static createObjectURL = vi.fn(() => 'blob:fixture'); static revokeObjectURL = vi.fn(); });
  mock.screenshot.mockResolvedValue(new Blob(['fixture'], {type: 'image/png'}));
  const root = await openFixture(() => { throw new Error('must not submit'); }, true);
  button(root, 'Still broken').click(); await vi.advanceTimersByTimeAsync(100);
  const prior = mock.request.getMockImplementation()!;
  mock.request.mockImplementation((path: string, ...args: unknown[]) => path === '/issues/issue' ? Promise.reject({status: 404}) : prior(path, ...args));
  await vi.advanceTimersByTimeAsync(60100);
  expect(root.querySelector('.verify-tools')).toBeNull();
  expect(root.querySelector('.issue-list')).not.toBeNull();
  expect(root.textContent).toContain('This report is no longer available in this environment.');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fixture');
});
