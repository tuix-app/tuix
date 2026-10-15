// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mocks.request; destroy() {} } }));
import { mount, type Hooks } from '../src/core';
import { readPreferences, savePreferences } from '../src/preferences';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; localStorage.clear(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mocks.request.mockReset(); });

const issue = { id: 'mine', number: 4, title: 'Save is hidden', body: 'Save is hidden', status: 'resolved', state: 'done', type: 'bug', env_name: 'uat', url: location.origin + '/', locators: {}, author: { name: 'Me' }, reporter: true, comment_count: 0, comments: [], inserted_at: '2026-09-20T10:00:00Z' };
const update = { id: 'n1', issue_id: 'mine', kind: 'resolved', state_kind: 'done', inserted_at: '2026-09-21T10:00:00Z', issue: { number: 4, title: 'Save is hidden', status: 'resolved', state: 'done', url: location.origin + '/' } };
const elsewhere = { id: 'n2', issue_id: 'other', kind: 'member_reply', inserted_at: '2026-09-21T11:00:00Z', issue: { number: 9, title: 'Invoice total', status: 'open', url: 'https://app.example.test/invoices/9' } };
// A legacy server sends only `kind`; the label still reads naturally.
const legacy = { id: 'n3', issue_id: 'old', kind: 'awaiting_verification', inserted_at: '2026-09-21T12:00:00Z', issue: { number: 10, title: 'Legacy kind', status: 'awaiting_verification', url: location.origin + '/' } };
const assigned = (index: number) => ({ id: 'a' + index, issue_id: 'x' + index, kind: 'assigned', state_kind: 'assigned', inserted_at: '2026-09-22T10:00:00Z', issue: { number: 20 + index, title: 'Assigned ' + index, status: 'open', state: 'open', url: location.origin + '/' } });

interface Options { preference?: { email_available: boolean; notify_email: boolean; email_schedule?: string }; unread?: object[]; appUrl?: string | null; hooks?: Hooks; account?: (path: string) => unknown; failSave?: boolean }
function fixture({ preference = { email_available: true, notify_email: false }, unread: initial = [update, elsewhere], appUrl = null, hooks = {}, account, failSave = false }: Options = {}) {
  vi.useFakeTimers();
  let unread = initial as { issue_id: string }[];
  mocks.request.mockImplementation(async (path: string, method = 'GET', body?: { time_zone?: string }) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false }, app_url: appUrl };
    if (path.startsWith('/issues?')) return { issues: [], next_before: null };
    if (path === '/notifications') return { notifications: unread };
    if (path === '/notifications/read') { unread = []; return { notifications: [] }; }
    if (path === '/issues/mine') return issue;
    if (path === '/issues/mine/read') { unread = unread.filter(item => item.issue_id !== 'mine'); return { notifications: unread }; }
    if (path === '/preferences' && method === 'POST') { if (failSave) throw new Error('offline'); const { time_zone: _zone, ...change } = body!; preference = { ...preference, ...change }; return preference; }
    if (path === '/preferences') return preference;
    if (path.startsWith('/account/') && account) return account(path);
    throw new Error('Unexpected ' + path);
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const onPanel = vi.fn();
  core = mount(root, launcher, { project: 'updates', lang: 'en' }, { id: 'me', name: 'Me' }, onPanel, undefined, hooks);
  return { root, onPanel };
}
const paths = () => mocks.request.mock.calls.map(call => call[0] as string);

it('renders updates in the settings flyout without opening the panel or loading reports', async () => {
  const slot = document.createElement('div'), openSettings = vi.fn();
  const unread = [update, elsewhere, legacy, ...[1, 2, 3, 4].map(assigned)];
  const { root, onPanel } = fixture({ unread, hooks: { updates: slot, openSettings } });
  root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.panel')).toBeNull();
  expect(onPanel).not.toHaveBeenCalled();
  expect(paths().some(path => path.startsWith('/issues'))).toBe(false);
  expect(paths()).toEqual(expect.arrayContaining(['/config', '/notifications', '/preferences']));
  expect(localStorage.getItem('tuix:active:updates')).toMatch(/^\d+$/);
  // Five newest, in an internal scroll, labelled by the new notification kinds.
  const items = slot.querySelectorAll<HTMLElement>('.update-item');
  expect(items).toHaveLength(5);
  expect([...items].map(item => item.querySelector('.update-kind')!.textContent)).toEqual(['Done', 'New reply', 'Ready for you to verify', 'Assigned to you', 'Assigned to you']);
  expect(slot.querySelector('.tuix-app.flyout-extra .updates')).not.toBeNull();
  expect(slot.querySelector('[data-setting="email-updates"]')).not.toBeNull();
  // The gold reply dot opens settings.
  const dot = root.querySelector<HTMLButtonElement>('button.reply-dot[data-action="open-updates"]')!;
  expect(dot.getAttribute('aria-label')).toBe('Updates on your reports');
  dot.click(); expect(openSettings).toHaveBeenCalledOnce();
  slot.querySelector<HTMLButtonElement>('[data-action="read-updates"]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(slot.querySelectorAll('.update-item')).toHaveLength(0);
  expect(slot.textContent).toContain('No new updates.');
  expect(root.querySelector('.reply-dot')).toBeNull();
  // Closing the flyout stops its polling.
  core!.settings!(false); await vi.advanceTimersByTimeAsync(50);
  const count = mocks.request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120000);
  expect(mocks.request).toHaveBeenCalledTimes(count);
});

it('opens a flyout update in the panel and keeps updates out of the panel when a flyout exists', async () => {
  const slot = document.createElement('div');
  const { root, onPanel } = fixture({ hooks: { updates: slot, openSettings: vi.fn() } });
  root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  slot.querySelector<HTMLButtonElement>('button.update-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(onPanel).toHaveBeenLastCalledWith(true);
  expect(root.querySelector('.thread-body')?.textContent).toBe('Save is hidden');
  expect(mocks.request).toHaveBeenCalledWith('/issues/mine/read', 'POST', {});
  root.querySelector<HTMLButtonElement>('.panel .content > button')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.panel .updates')).toBeNull();
  expect(slot.querySelectorAll('.update-item')).toHaveLength(1);
});

it('keeps updates at the top of Reports for hosts without a launcher flyout', async () => {
  const { root } = fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const items = root.querySelectorAll<HTMLElement>('.panel .update-item');
  expect([...items].map(item => item.querySelector('.update-kind')!.textContent)).toEqual(['Done', 'New reply']);
  expect(items[1].tagName).toBe('A');
  expect(items[1].getAttribute('href')).toBe('https://app.example.test/invoices/9?tuix=other');
  // Without a flyout the reply dot is decoration, not a button.
  expect(root.querySelector('span.reply-dot')).not.toBeNull();
  expect(root.querySelector('button.reply-dot, [data-action="open-updates"]')).toBeNull();
  items[0].click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.thread-body')?.textContent).toBe('Save is hidden');
  root.querySelector<HTMLButtonElement>('.panel .content > button')!.click(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelectorAll('.update-item')).toHaveLength(1);
  root.querySelector<HTMLButtonElement>('[data-action="read-updates"]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(root.querySelectorAll('.update-item')).toHaveLength(0);
  expect(root.querySelector('.reply-dot')).toBeNull();
  expect(mocks.request).toHaveBeenCalledWith('/notifications/read', 'POST', {});
});

it('offers the email opt-in only with an email and saves the reporter choice', async () => {
  const slot = document.createElement('div');
  const { root } = fixture({ hooks: { updates: slot } }); root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  const toggle = slot.querySelector<HTMLInputElement>('[data-setting="email-updates"]')!;
  expect(toggle.checked).toBe(false);
  toggle.checked = true; toggle.dispatchEvent(new Event('change', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  expect(mocks.request).toHaveBeenCalledWith('/preferences', 'POST', { notify_email: true });
  expect(slot.querySelector<HTMLInputElement>('[data-setting="email-updates"]')!.checked).toBe(true);
  core!.destroy(); core = undefined; document.body.replaceChildren();
  const other = document.createElement('div');
  const anonymous = fixture({ preference: { email_available: false, notify_email: false }, hooks: { updates: other } }); anonymous.root.append(other);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  expect(other.querySelector('.updates')).not.toBeNull();
  expect(other.querySelector('[data-setting="email-updates"]')).toBeNull();
});

it('offers how often to email beside the opt-in and saves it with the browser zone', async () => {
  const slot = document.createElement('div');
  const { root } = fixture({ preference: { email_available: true, notify_email: false, email_schedule: 'every_15_minutes' }, hooks: { updates: slot } }); root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  const select = () => slot.querySelector<HTMLSelectElement>('select[data-setting="email-schedule"]')!;
  // Shown without the status opt-in: replies and mentions are emailed anyway.
  expect(select().value).toBe('every_15_minutes');
  expect(select().closest('label')!.textContent).toContain('How often to email me');
  expect([...select().options].map(option => [option.value, option.textContent])).toEqual([
    ['immediately', 'Immediately'], ['every_15_minutes', 'Every 15 minutes'], ['hourly', 'Every hour'],
    ['twice_daily', 'Twice a day (09:00 and 16:00)'], ['daily', 'Daily (09:00)'],
  ]);
  select().value = 'daily'; select().dispatchEvent(new Event('change', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  expect(mocks.request).toHaveBeenCalledWith('/preferences', 'POST', { email_schedule: 'daily', time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  expect(select().value).toBe('daily');
  // The opt-in keeps its own request, without a zone.
  slot.querySelector<HTMLInputElement>('[data-setting="email-updates"]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(mocks.request).toHaveBeenLastCalledWith('/preferences', 'POST', { notify_email: true });
  expect(select().value).toBe('daily');
});

it('restores how often after a failed save, and hides it without an email or on older servers', async () => {
  const slot = document.createElement('div');
  const { root } = fixture({ preference: { email_available: true, notify_email: true, email_schedule: 'hourly' }, hooks: { updates: slot }, failSave: true }); root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  const select = slot.querySelector<HTMLSelectElement>('select[data-setting="email-schedule"]')!;
  select.value = 'immediately'; select.dispatchEvent(new Event('change', { bubbles: true })); await vi.advanceTimersByTimeAsync(50);
  expect(mocks.request).toHaveBeenCalledWith('/preferences', 'POST', expect.objectContaining({ email_schedule: 'immediately' }));
  expect(slot.querySelector<HTMLSelectElement>('select[data-setting="email-schedule"]')!.value).toBe('hourly');
  expect(slot.querySelector('[role="alert"]')!.textContent).toBe('Could not save your email preference. Please retry.');
  for (const preference of [{ email_available: false, notify_email: false, email_schedule: 'hourly' }, { email_available: true, notify_email: false }]) {
    core!.destroy(); core = undefined; document.body.replaceChildren();
    const other = document.createElement('div');
    const next = fixture({ preference, hooks: { updates: other } }); next.root.append(other);
    core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
    expect(other.querySelector('.updates')).not.toBeNull();
    expect(other.querySelector('[data-setting="email-schedule"]')).toBeNull();
  }
});

it('keeps page markers on unresolved reports from everyone while the panel list follows Show and Involving', async () => {
  savePreferences('updates', { show: 'verify', involving: 'me' });
  fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  const lists = paths().filter(path => path.startsWith('/issues?')).map(path => new URLSearchParams(path.slice(8)));
  const markers = lists.filter(query => query.get('show') === 'unresolved');
  const panel = lists.filter(query => query.get('show') === 'verify');
  expect(markers.length).toBeGreaterThanOrEqual(1);
  expect(markers.every(query => query.get('involving') === 'everyone' && !query.has('mine'))).toBe(true);
  expect(panel.length).toBeGreaterThanOrEqual(1);
  expect(panel.every(query => query.get('involving') === 'me')).toBe(true);
});

it('opens Reports with a filter as a session override: Pages All, the chosen Show and Involving', async () => {
  const { root } = fixture();
  core!.open({ scope: 'all', show: 'verify', involving: 'me' }); await vi.advanceTimersByTimeAsync(200);
  expect(readPreferences('updates')).toMatchObject({ scope: 'page', show: 'open', involving: 'everyone' });
  expect(paths()).toContain('/issues?scope=all&show=verify&involving=me');
  expect(root.querySelector('[data-filter=show] [data-value=verify]')!.getAttribute('aria-pressed')).toBe('true');
  expect(root.querySelector('[data-filter=involving] [data-value=me]')!.getAttribute('aria-pressed')).toBe('true');
});

it('opens tuix.app through a one-time handoff, or falls back to an emailed sign-in link', async () => {
  // With noopener the browser returns null whether or not the tab opened.
  const open = vi.fn(() => null); vi.stubGlobal('open', open);
  let handoff: () => unknown = () => ({ url: 'https://tuix.app/auth/handoff?code=abc' });
  let link: () => unknown = () => ({ sent: true });
  const slot = document.createElement('div');
  const { root } = fixture({ appUrl: 'https://tuix.app/', hooks: { updates: slot }, account: path => path === '/account/handoff' ? handoff() : link() });
  root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  const anchor = () => slot.querySelector<HTMLAnchorElement>('[data-action="open-app"]')!;
  const next = () => slot.querySelector<HTMLAnchorElement>('[data-action="continue-app"]');
  expect(anchor().textContent).toBe('Open tuix.app');
  // A middle click or a copied link goes to sign-in, not the marketing page at the bare origin.
  expect(anchor().getAttribute('href')).toBe('https://tuix.app/login');
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(open).toHaveBeenCalledWith('https://tuix.app/auth/handoff?code=abc', '_blank', 'noopener,noreferrer');
  expect(paths()).not.toContain('/account/link');
  // A blocked tab is invisible to the widget, so the handoff stays one direct click away.
  expect(slot.querySelector('[role=status]')!.textContent).toBe('No new tab? Continue to tuix.app');
  expect(next()!.getAttribute('href')).toBe('https://tuix.app/auth/handoff?code=abc');
  expect(next()!.getAttribute('target')).toBe('_blank');
  expect(next()!.getAttribute('rel')).toBe('noopener noreferrer');
  // Not linked or not signed: 403 handoff_unavailable sends a sign-in link instead.
  handoff = () => { throw Object.assign(new Error('403'), { status: 403 }); };
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(mocks.request).toHaveBeenCalledWith('/account/link', 'POST', {});
  expect(slot.textContent).toContain('We emailed you a sign-in link for tuix.app.');
  expect(next()).toBeNull();
  expect(open).toHaveBeenCalledOnce();
  link = () => { throw Object.assign(new Error('422'), { status: 422 }); };
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(slot.textContent).toContain('Your app has not shared your email address');
  // A handoff URL on another origin is never opened.
  handoff = () => ({ url: 'https://evil.example/steal' }); link = () => ({ sent: true });
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(open).toHaveBeenCalledOnce();
  expect(slot.textContent).toContain('We emailed you a sign-in link');
  expect(next()).toBeNull();
});

it('never emails a sign-in link when the handoff fails for another reason', async () => {
  const open = vi.fn(() => null); vi.stubGlobal('open', open);
  let failure: unknown = Object.assign(new Error('500'), { status: 500 });
  const slot = document.createElement('div');
  const { root } = fixture({ appUrl: 'https://tuix.app/', hooks: { updates: slot }, account: path => { if (path === '/account/handoff') throw failure; return { sent: true }; } });
  root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  const anchor = () => slot.querySelector<HTMLAnchorElement>('[data-action="open-app"]')!;
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(slot.querySelector('[role=status]')!.textContent).toBe('Could not open tuix.app. Please retry.');
  // A network failure or timeout (no status) is a retry too.
  failure = new Error('offline');
  anchor().click(); await vi.advanceTimersByTimeAsync(50);
  expect(slot.querySelector('[role=status]')!.textContent).toBe('Could not open tuix.app. Please retry.');
  expect(paths()).not.toContain('/account/link');
  expect(open).not.toHaveBeenCalled();
});

it('offers the handoff as a link when the click is too old to open a tab, and drops it before it expires', async () => {
  const open = vi.fn(() => null); vi.stubGlobal('open', open);
  Object.defineProperty(navigator, 'userActivation', { configurable: true, value: { isActive: false } });
  try {
    const slot = document.createElement('div');
    const { root } = fixture({ appUrl: 'https://tuix.app/', hooks: { updates: slot }, account: () => ({ url: '/auth/handoff?code=slow' }) });
    root.append(slot);
    core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
    slot.querySelector<HTMLAnchorElement>('[data-action="open-app"]')!.click(); await vi.advanceTimersByTimeAsync(50);
    expect(open).not.toHaveBeenCalled();
    expect(paths()).not.toContain('/account/link');
    const next = slot.querySelector<HTMLAnchorElement>('[data-action="continue-app"]')!;
    expect(next.getAttribute('href')).toBe('https://tuix.app/auth/handoff?code=slow');
    expect(slot.querySelector('[role=status]')!.textContent).toBe('Continue to tuix.app');
    // Single use: following it removes it.
    next.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); await vi.advanceTimersByTimeAsync(50);
    expect(slot.querySelector('[data-action="continue-app"]')).toBeNull();
    // The one-time code lives 60 seconds; an unused link goes away before that.
    slot.querySelector<HTMLAnchorElement>('[data-action="open-app"]')!.click(); await vi.advanceTimersByTimeAsync(50);
    expect(slot.querySelector('[data-action="continue-app"]')).not.toBeNull();
    await vi.advanceTimersByTimeAsync(55000);
    expect(slot.querySelector('[data-action="continue-app"]')).toBeNull();
  } finally { delete (navigator as { userActivation?: unknown }).userActivation; }
});

it('marks the browser active only for hosts with a launcher', async () => {
  fixture();
  core!.open(); await vi.advanceTimersByTimeAsync(200);
  expect(localStorage.getItem('tuix:active:updates')).toMatch(/^\d+$/);
  core!.destroy(); core = undefined; localStorage.clear(); document.body.replaceChildren();
  vi.useRealTimers(); vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  core = mount(root, launcher, { project: 'hidden', lang: 'en', launcher: false }, { id: 'me', name: 'Me' }, vi.fn());
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(localStorage.getItem('tuix:active:hidden')).toBeNull();
});

it('hides Open tuix.app when the server gives no dashboard origin', async () => {
  const slot = document.createElement('div');
  const { root } = fixture({ appUrl: 'javascript:alert(1)', hooks: { updates: slot } }); root.append(slot);
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  expect(slot.querySelector('.updates')).not.toBeNull();
  expect(slot.querySelector('[data-action="open-app"]')).toBeNull();
});

it('says so in the flyout when feedback cannot load', async () => {
  const slot = document.createElement('div');
  const { root } = fixture({ hooks: { updates: slot } }); root.append(slot);
  mocks.request.mockImplementation(async () => { throw new Error('offline'); });
  core!.settings!(true); await vi.advanceTimersByTimeAsync(200);
  expect(slot.querySelector('[role=alert]')!.textContent).toBe('Could not load feedback. Please retry.');
  expect(slot.querySelector('.updates')).toBeNull();
});
