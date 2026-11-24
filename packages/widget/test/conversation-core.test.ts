// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mock = vi.hoisted(() => ({ request: vi.fn(), environment: 'uat' }));
vi.mock('../src/api', () => ({ Api: class { environment = mock.environment; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import { eventLine, sentLine } from '../src/i18n';
import type { Core } from '../src/types';
let core: Core | undefined;
afterEach(() => { core?.destroy(); core = undefined; mock.environment = 'uat'; localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.request.mockReset(); document.body.replaceChildren(); });

const mine = { name: 'Me', me: true, reporter: false }, anna = { name: 'Anna', me: false, reporter: false };
const base = { id: 'issue', number: 3, title: 'Totals overflow', body: 'Totals overflow', status: 'open', state: 'open', state_name: 'open', env_name: 'uat', url: location.origin + '/', locators: { testid: '[data-testid="save"]' }, author: { name: 'Ola' }, comments: [] as unknown[], inserted_at: '2026-09-22T12:00:00Z', reporter: false, actions: ['reply', 'close', 'take', 'urgent'], can_set_urgent: true, urgent: false, can_take: true, turn: 'team', turn_holder: anna };
type Payload = Record<string, unknown>;
async function open(extra: Payload, act: (path: string, body: Payload) => Payload = () => ({})) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  let current: Payload = { ...base, ...extra };
  mock.request.mockImplementation(async (path: string, _method?: string, body?: Payload) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [current], next_before: null };
    if (path === '/issues/issue') return current;
    if (/\/issue\/(state|assign|urgent)$/.test(path)) { current = { ...current, ...act(path, body!) }; return current; }
    return { notifications: [] };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'conv', lang: 'en' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLButtonElement>('.issue-item')!.click(); await vi.advanceTimersByTimeAsync(200);
  return root;
}
const primaries = (root: ShadowRoot) => [...root.querySelectorAll('.panel button.primary')].map(item => item.textContent);
const comment = (id: string, minute: number, extra: Payload = {}) => ({ id, body: 'Reply ' + id, author: { name: 'Anna' }, team: true, inserted_at: `2026-09-22T12:${String(minute).padStart(2, '0')}:00Z`, ...extra });

it('shows replies and small lines in time order, "→ Name" beside a reply that sent the turn, and no line for a pass made by a reply', async () => {
  const root = await open({
    comments: [comment('c1', 10, { sent_to: { name: 'Ola', me: false, reporter: true } }), comment('c2', 30, { sent_to: { name: 'Me', me: true } }), comment('c3', 40, { keeps: true, sent_to: null })],
    timeline: [
      { id: 'e1', kind: 'urgent_set', at: '2026-09-22T12:05:00Z', actor: anna },
      { id: 'e2', kind: 'turn_passed', at: '2026-09-22T12:10:00Z', actor: anna, to: { name: 'Ola', me: false }, with_reply: true, comment_id: 'c1' },
      { id: 'e3', kind: 'turn_passed', at: '2026-09-22T12:20:00Z', actor: anna, to: mine },
      { id: 'e4', kind: 'turn_taken', at: '2026-09-22T12:25:00Z', actor: mine },
      { id: 'e5', kind: 'fix_ready', at: '2026-09-22T12:35:00Z', actor: anna },
      { id: 'e6', kind: 'something_new', at: '2026-09-22T12:36:00Z', actor: anna },
    ],
  });
  const items = [...root.querySelectorAll('.comment, .event-line')].map(item => item.classList.contains('comment') ? 'reply:' + item.querySelector('p')!.textContent + '|' + (item.querySelector('.sent')?.textContent ?? '') : 'line:' + [...item.childNodes][0].textContent);
  expect(items).toEqual(['line:Anna marked it urgent', 'reply:Reply c1|→ Ola', 'line:Anna passed it to you', 'line:You took it', 'reply:Reply c2|→ you', 'line:Anna marked the fix ready', 'reply:Reply c3|→ kept']);
});

it('words every event kind, with the viewer as "You", and drops a pass a reply already says', () => {
  const who = (name: string, me = false) => ({ name, me });
  expect(eventLine({ kind: 'turn_passed', actor: who('Anna'), to: null })).toBe('Anna left it unclaimed');
  expect(eventLine({ kind: 'turn_passed', actor: who('Anna'), to: who('Bo') , with_reply: true })).toBeNull();
  expect(eventLine({ kind: 'urgent_cleared', actor: who('Me', true) })).toBe('You cleared urgent');
  expect(eventLine({ kind: 'works', actor: who('Ola') })).toBe('Ola confirmed the fix');
  expect(eventLine({ kind: 'still_broken', actor: who('Ola') })).toBe('Ola said it is still broken');
  expect(eventLine({ kind: 'closed', actor: who('Anna') })).toBe('Anna closed it');
  expect(eventLine({ kind: 'reopened', actor: who('Anna') })).toBe('Anna reopened it');
  expect(eventLine({ kind: 'auto_closed', actor: null })).toBe('Closed automatically after 14 days');
  // A name the server held back (another group) is never made up.
  expect(eventLine({ kind: 'turn_taken', actor: { name: null } })).toBe('Someone took it');
  expect(eventLine({ kind: 'closed', actor: who('Anna') }, 'pl')).toBe('Zamknięte przez Anna');
  // The viewer as a name, in the right case in both languages.
  expect(eventLine({ kind: 'turn_taken', actor: who('Me', true) })).toBe('You took it');
  expect(eventLine({ kind: 'turn_passed', actor: who('Anna'), to: who('Me', true) })).toBe('Anna passed it to you');
  expect(eventLine({ kind: 'turn_passed', actor: who('Anna'), to: who('Me', true) }, 'pl')).toBe('Przekazane do Ciebie przez Anna');
  expect(eventLine({ kind: 'turn_taken', actor: who('Me', true) }, 'pl')).toBe('Przejęte przez Ciebie');
  // Events nobody made (a release matching the fix) have their own sentence, never "Someone".
  expect(eventLine({ kind: 'fix_ready', actor: null })).toBe('The fix was released and is ready to check');
  expect(eventLine({ kind: 'fix_ready', actor: null }, 'pl')).toBe('Poprawka została wydana i czeka na sprawdzenie');
  expect(sentLine({ sent_to: { name: null } })).toBeNull();
  expect(sentLine({ keeps: true }, 'pl')).toBe('→ zostaje');
});

it('has ONE primary button per view: Send for the team, Works for a reporter in review, Reopen when closed, the note form while it is open', async () => {
  let root = await open({ comments: [] });
  expect(primaries(root)).toEqual(['Send']);
  core!.destroy(); document.body.replaceChildren();
  root = await open({ state: 'in_review', state_name: 'fix_ready', reporter: true, turn_holder: { name: 'Ola', me: true, reporter: true }, actions: ['reply', 'works', 'still_broken', 'close'], can_take: false });
  expect(primaries(root)).toEqual(['Works']);
  core!.destroy(); document.body.replaceChildren();
  root = await open({ state: 'closed', state_name: 'closed', turn_holder: null, actions: ['reopen'] });
  expect(primaries(root)).toEqual(['Reopen']);
  core!.destroy(); document.body.replaceChildren();
  root = await open({ actions: ['reply', 'close', 'still_broken'], state: 'in_review', state_name: 'fix_ready', can_take: false });
  root.querySelector<HTMLButtonElement>('[data-state-action=still_broken]')!.click(); await vi.advanceTimersByTimeAsync(50);
  expect(primaries(root)).toEqual(['Still broken']);
  expect(root.querySelector('.mention-field')).toBeNull();
});

it('refuses replies on a closed conversation with the sentence, and offers Reopen with an optional note', async () => {
  const root = await open({ state: 'closed', state_name: 'closed', turn_holder: null, actions: ['reopen'], can_set_urgent: true, urgent: true }, (_p, body) => ({ state: 'open', state_name: 'open', actions: ['reply', 'close'], note: body.note }));
  expect(root.querySelector('.closed-note p')!.textContent).toBe('This conversation is closed. Reopen it to reply.');
  expect(root.querySelector('textarea')).toBeNull();
  // Urgent is not offered on a closed conversation (its mark stays).
  expect(root.querySelector('[data-action=urgent]')).toBeNull();
  expect(root.querySelector('.urgent-mark')).not.toBeNull();
  root.querySelector<HTMLButtonElement>('[data-action=reopen-note]')!.click(); await vi.advanceTimersByTimeAsync(50);
  const note = root.querySelector<HTMLTextAreaElement>('.state-note textarea')!;
  expect(note.required).toBe(false);
  note.value = 'Back again'; note.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(10);
  root.querySelector<HTMLFormElement>('.state-note')!.requestSubmit(); await vi.advanceTimersByTimeAsync(100);
  expect(mock.request).toHaveBeenCalledWith('/issues/issue/state', 'POST', { state: 'reopen', note: 'Back again' });
  expect(root.querySelector('[data-action=urgent]')).not.toBeNull();
});

it('offers exactly what `actions` lists: Fix ready, Take it, Close, and the urgent toggle only while open', async () => {
  const root = await open({ actions: ['reply', 'fix_ready', 'close', 'take', 'urgent'] });
  expect([...root.querySelectorAll('.thread-actions button')].map(item => item.textContent)).toEqual(['Fix ready', 'Close', 'Take it', 'Mark urgent']);
  expect(root.querySelector('[data-action=urgent]')!.textContent).toBe('Mark urgent');
  // The header is the back link, one meta line and the turn line.
  expect(root.querySelector('.panel .meta')!.textContent).toBe('#3 · Ola · uat');
  core!.destroy(); document.body.replaceChildren();
  // Take it is never drawn for the person who holds the turn, even when `actions` lists it.
  const holder = await open({ actions: ['reply', 'take', 'close'], turn_holder: mine });
  expect(holder.querySelector('.thread-state .turn')!.textContent).toBe('Your turn');
  expect(holder.querySelector('[data-action=assign]')).toBeNull();
  core!.destroy(); document.body.replaceChildren();
  const quiet = await open({ actions: ['reply'], can_take: false, can_set_urgent: false });
  expect(quiet.querySelector('.thread-actions')).toBeNull();
  expect(quiet.querySelector('[data-action=urgent]')).toBeNull();
});

it('reads an older server: no actions, timeline, state_name or turn_holder', async () => {
  const root = await open({ actions: undefined, timeline: undefined, state_name: undefined, turn_holder: undefined, turn: 'team', fixer: false, reporter: false, can_take: undefined, can_be_fixer: false, allowed_states: [], urgent: undefined, can_set_urgent: undefined,
    comments: [comment('c1', 10)] });
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Waiting for the team');
  expect(root.querySelectorAll('.comment')).toHaveLength(1);
  expect(root.querySelector('.event-line')).toBeNull();
  expect(root.querySelector('.comment .sent')).toBeNull();
  expect(root.querySelector('[data-action=urgent]')).toBeNull();
});

it('lists rows as an urgent mark, number, title, one line of the newest message and a quiet word, with a peach dot for your turn', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const row = (id: string, extra: Payload) => ({ ...base, id, number: Number(id), title: 'T' + id, ...extra });
  const issues = [row('1', { urgent: true, turn_holder: mine, latest_comment: { author: { name: 'Anna' }, team: true, body: 'Looking now' } }), row('2', { state: 'in_review', state_name: 'fix_ready' }), row('3', { state: 'done', state_name: 'fixed', turn_holder: null })];
  mock.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues, next_before: null } : { notifications: [] });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'rows', lang: 'en' }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  const rows = [...root.querySelectorAll('.issue-item')];
  expect(rows.map(item => [!!item.querySelector('.turn-dot'), !!item.querySelector('.urgent-mark'), item.querySelector('.row-word')?.textContent ?? null, item.querySelector('.row-message')?.textContent ?? null]))
    .toEqual([[true, true, null, 'Anna: Looking now'], [false, false, 'Fix ready', null], [false, false, 'Fixed', null]]);
  expect(root.querySelector('.status')).toBeNull();
  // Show: Your turn, Open, All.
  expect([...root.querySelectorAll('[data-filter=show] button')].map(item => item.textContent)).toEqual(['Your turn', 'Open', 'All']);
  expect(root.querySelector('[data-filter=show] legend')!.textContent).toBe('Show');
  expect(root.querySelector('[data-filter=involving]')).toBeNull();
});

it('draws a dot per state, flat: no icon, number or animation hook inside, with a 28px hit area', async () => {
  const css = readFileSync(resolve(__dirname, '../src/widget.css'), 'utf8');
  expect(css).toMatch(/button\.pin\{[^}]*width:28px;height:28px/);
  expect(css).toMatch(/button\.pin:before\{[^}]*width:14px;height:14px/);
  expect(css).toMatch(/button\.pin\[data-state=turn\]:before\{background:var\(--tx-peach\)/);
  // Flat at rest: a halo (not a shadow) only appears around the focus ring, over whatever the host page is.
  expect(css).not.toMatch(/button\.pin(?![^{]*(hover|focus|active))[^{]*\{[^}]*(box-shadow|animation:[^n])/);
  expect(css).toMatch(/button\.pin:focus-visible:before[^{]*\{[^}]*outline:2px solid var\(--tx-focus\);[^}]*box-shadow:0 0 0 6px var\(--tx-surface\)/);
});

it('keeps the quiet look in the stylesheets: one accent, hairlines, no dimmed text, nothing under 13px, no blur', () => {
  const dir = resolve(__dirname, '../src');
  const files = ['widget.css', 'tokens.ts', 'settings.ts', 'index.ts', 'verify-prompt.ts', 'loader.js'].map(name => [name, readFileSync(resolve(dir, name), 'utf8')] as const);
  for (const [name, text] of files) {
    expect(text, name).not.toMatch(/--tx-(gold|aqua|s-|faint|peach-text)/);
    expect(text, name).not.toMatch(/backdrop-filter/);
    for (const [, size] of text.matchAll(/font(?:-size)?:[^;}]*?(?<![\d.])(\d{1,2}(?:\.\d+)?)px/g)) expect(Number(size), `${name}: ${size}px`).toBeGreaterThanOrEqual(13);
    // No 2px or control-colour border around the chat: only inputs, buttons and the selection frame use the control line.
    expect(text, name).not.toMatch(/border[^:]*:\s*(1\.5|2)px solid var\(--tx-line\b/);
  }
  const css = files[0][1];
  // Text is dimmed with colour, never opacity: opacity appears only in animations and decorative layers.
  for (const [, rule] of css.matchAll(/([^{}]+\{[^}]*opacity:[^}]*\})/g)) expect(rule, rule).toMatch(/@keyframes|marker\.fill|tuix-enter|tuix-card|\bfrom\{|to\{/);
  // --rl is the one hairline: 1px (0.5px at two device pixels per CSS pixel) in line-soft.
  expect(css).toMatch(/--rl:var\(--tx-hairline\) solid var\(--tx-line-soft\)/);
  expect(css).toMatch(/\.panel\{[^}]*border-left:var\(--rl\)/);
  expect(css).toMatch(/\.chat-window\{[^}]*border:var\(--rl\)/);
  expect(css).toMatch(/button\.hover-card\{[^}]*border:var\(--rl\)/);
  expect(readFileSync(resolve(dir, 'tokens.ts'), 'utf8')).toMatch(/min-resolution:2dppx[^`]*--tx-hairline:\.5px/);
  expect(readdirSync(dir).length).toBeGreaterThan(0);
});

it('says only "This conversation is closed." to someone who cannot reopen it', async () => {
  const root = await open({ state: 'closed', state_name: 'closed', turn_holder: null, actions: [] });
  expect(root.querySelector('.closed-note p')!.textContent).toBe('This conversation is closed.');
  expect(root.querySelector('.closed-note button')).toBeNull();
});

it('moves the turn line with the viewer\'s own reply at once: to the person picked, or back to them for Keep with me', async () => {
  const options = [{ value: 'end_user:ola', name: 'Ola', reporter: true }, { value: 'member:anna', name: 'Anna', team: true }];
  const root = await open({ turn_holder: mine, turn_options: options, default_turn: 'end_user:ola', actions: ['reply', 'close'] });
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Your turn');
  const form = root.querySelector('form')!;
  const field = form.querySelector('textarea')!;
  field.value = 'On it'; field.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(10);
  // The reply is held back: the line has changed before the server answers.
  mock.request.mockImplementation(async (path: string) => path.endsWith('/comments') ? new Promise(() => {}) : { notifications: [] });
  form.requestSubmit(); await vi.advanceTimersByTimeAsync(10);
  expect(root.querySelector('.thread-state .turn')!.textContent).toBe('Waiting for Ola');
});
