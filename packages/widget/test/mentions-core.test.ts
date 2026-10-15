// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url', () => ({ default: '' }));
vi.mock('@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url', () => ({ default: '' }));
const mock = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/api', () => ({ Api: class { environment = 'uat'; request = mock.request; destroy() {} } }));
import { mount } from '../src/core';
import type { Core } from '../src/types';
let core: Core | undefined;
// Preact queues effects for the next frame in a module-wide list: let that frame run before the fake clock goes.
afterEach(async () => { core?.destroy(); core = undefined; if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(200); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); mock.request.mockReset(); document.body.replaceChildren(); });

// Browsers have `onpointerdown` and its siblings on elements, which tells Preact the event's casing; jsdom does not.
for (const name of ['onpointerdown', 'onpointerup', 'onpointercancel']) if (!(name in HTMLElement.prototype)) Object.defineProperty(HTMLElement.prototype, name, { value: null, writable: true, configurable: true });
type Payload = Record<string, unknown>;
const base = { id: 'issue', number: 7, title: 'Total overlaps', body: 'Total overlaps', status: 'open', state: 'open', type: 'bug', env_name: 'uat', url: location.origin + '/', locators: {}, author: { name: 'Ola' }, comment_count: 0, comments: [] as Payload[], inserted_at: '2026-10-06T10:00:00Z', updated_at: '2026-10-06T10:00:00Z', reporter: true, allowed_states: ['done', 'closed'], can_mention: true };
const directory = [{ id: 'member:dana', name: 'Dana Kowalska', team: true }, { id: 'end_user:dan', name: 'Dan', team: false }, { id: 'member:daniel', name: 'Daniel', team: true }];

interface Options { issue?: Payload; people?: (query: string) => Promise<unknown> | unknown; reply?: (body: Payload) => Promise<unknown> | unknown; unread?: Payload[]; lang?: 'en' | 'pl' }
/** Opens one report's thread; `/people` and `/comments` go through the given handlers. */
async function open({ issue = {}, people = query => ({ people: directory.filter(person => person.name.toLowerCase().includes(query.trim().toLowerCase())) }), reply = () => ({ id: 'c1' }), unread = [], lang = 'en' }: Options = {}) {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
  const current = { ...base, ...issue };
  mock.request.mockImplementation(async (path: string, _method?: string, body?: Payload) => {
    if (path === '/config') return { telemetry: false, capture: { screenshot: false, console: false, network: false } };
    if (path.startsWith('/issues?')) return { issues: [current], next_before: null };
    if (path === '/issues/issue') return current;
    if (path.startsWith('/issues/issue/people?q=')) return people(decodeURIComponent(path.split('?q=')[1]));
    if (path === '/issues/issue/comments') return reply(body!);
    if (path === '/preferences') return { email_available: false, notify_email: false };
    return { notifications: unread };
  });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'closed' }), launcher = document.createElement('button'); document.body.append(launcher);
  core = mount(root, launcher, { project: 'mentions', lang }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  root.querySelector<HTMLButtonElement>('.issue-item')?.click(); await vi.advanceTimersByTimeAsync(200);
  return root;
}
const area = (root: ShadowRoot) => root.querySelector<HTMLTextAreaElement>('.mention-field textarea')!;
/** Types the whole value with the caret at its end, as one input event. */
const type = (root: ShadowRoot, value: string) => { const field = area(root); field.focus(); field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); };
/** A real key press is composed, so the panel's document handler sees it before the textarea. */
const key = (root: ShadowRoot, name: string) => { const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, composed: true }); area(root).dispatchEvent(event); return event; };
const options = (root: ShadowRoot) => [...root.querySelectorAll<HTMLElement>('[role="listbox"] [role="option"]')];
const lookups = () => mock.request.mock.calls.map(([path]) => String(path)).filter(path => path.includes('/people'));
const replies = () => mock.request.mock.calls.filter(([path]) => path === '/issues/issue/comments').map(([, method, body]) => [method, body]);
const send = async (root: ShadowRoot) => { await vi.advanceTimersByTimeAsync(10); area(root).closest('form')!.requestSubmit(); await vi.advanceTimersByTimeAsync(200); };
const live = (root: ShadowRoot) => root.querySelector('.mention-field [role="status"]')!.textContent;

it('suggests people after a debounced lookup, moves and picks with the keyboard, and sends the picked id', async () => {
  const root = await open();
  const field = area(root);
  expect(field.getAttribute('aria-autocomplete')).toBe('list');
  expect(field.getAttribute('aria-describedby')).toBe('tuix-mention-hint');
  expect(root.getElementById('tuix-mention-hint')!.textContent).toBe('Type @ to mention someone.');
  expect(field.hasAttribute('aria-controls')).toBe(false);
  type(root, 'Hi @D'); await vi.advanceTimersByTimeAsync(200);
  type(root, 'Hi @Da'); await vi.advanceTimersByTimeAsync(200);
  expect(lookups()).toEqual([]);
  await vi.advanceTimersByTimeAsync(110);
  expect(lookups()).toEqual(['/issues/issue/people?q=Da']);
  const list = root.querySelector('[role="listbox"]')!;
  expect(list.getAttribute('aria-label')).toBe('People to mention');
  expect(options(root).map(option => option.textContent)).toEqual(['Dana KowalskaTeam', 'Dan', 'DanielTeam']);
  // The textarea keeps its role and points at the list and its active option.
  expect(field.getAttribute('role')).toBeNull();
  expect(field.getAttribute('aria-controls')).toBe(list.id);
  expect(field.getAttribute('aria-activedescendant')).toBe(options(root)[0].id);
  expect(options(root).map(option => option.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
  // One polite announcement, after a pause.
  expect(live(root)).toBe('');
  await vi.advanceTimersByTimeAsync(400);
  expect(live(root)).toBe('Suggestions: 3');
  expect(key(root, 'ArrowDown').defaultPrevented).toBe(true); await vi.advanceTimersByTimeAsync(10);
  expect(field.getAttribute('aria-activedescendant')).toBe(options(root)[1].id);
  expect(options(root)[1].getAttribute('aria-selected')).toBe('true');
  key(root, 'ArrowUp'); await vi.advanceTimersByTimeAsync(10);
  key(root, 'ArrowUp'); await vi.advanceTimersByTimeAsync(10);
  expect(field.getAttribute('aria-activedescendant')).toBe(options(root)[2].id);
  key(root, 'ArrowDown'); await vi.advanceTimersByTimeAsync(10);
  expect(field.getAttribute('aria-activedescendant')).toBe(options(root)[0].id);
  key(root, 'ArrowUp'); await vi.advanceTimersByTimeAsync(10);
  const enter = key(root, 'Enter'); await vi.advanceTimersByTimeAsync(10);
  expect(enter.defaultPrevented).toBe(true);
  expect(field.value).toBe('Hi @Daniel ');
  expect(field.selectionStart).toBe('Hi @Daniel '.length);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
  expect(field.hasAttribute('aria-controls')).toBe(false);
  expect(field.hasAttribute('aria-activedescendant')).toBe(false);
  // Typing on after the name is plain text again.
  type(root, 'Hi @Daniel can you check?'); await vi.advanceTimersByTimeAsync(200);
  expect(lookups()).toHaveLength(1);
  await send(root);
  expect(replies()).toEqual([['POST', { body: 'Hi @Daniel can you check?', mentions: ['member:daniel'] }]]);
  // A sent reply forgets its picks: the same text typed again mentions no one.
  expect(field.value).toBe('');
  type(root, 'Thanks @Daniel'); await send(root);
  expect(replies()[1]).toEqual(['POST', { body: 'Thanks @Daniel' }]);
});

it('closes only the list on Escape, so the panel stays open until the next Escape', async () => {
  const root = await open();
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(310);
  expect(options(root)).toHaveLength(3);
  expect(key(root, 'Escape').defaultPrevented).toBe(true); await vi.advanceTimersByTimeAsync(10);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
  expect(root.querySelector('.panel')).not.toBeNull();
  expect(area(root).value).toBe('@Da');
  // That "@" stays dismissed while typing on.
  type(root, '@Dan'); await vi.advanceTimersByTimeAsync(200);
  expect(lookups()).toHaveLength(1);
  key(root, 'Escape'); await vi.advanceTimersByTimeAsync(10);
  expect(root.querySelector('.panel')).toBeNull();
});

it('picks with Tab and with a pointer that keeps focus, and sends only people still named in the reply', async () => {
  const root = await open();
  type(root, 'x @dan'); await vi.advanceTimersByTimeAsync(310);
  expect(key(root, 'Tab').defaultPrevented).toBe(true); await vi.advanceTimersByTimeAsync(10);
  expect(area(root).value).toBe('x @Dana Kowalska ');
  type(root, 'x @Dana Kowalska and @Dan'); await vi.advanceTimersByTimeAsync(310);
  const pointer = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  options(root).find(option => option.textContent === 'Dan')!.dispatchEvent(pointer); await vi.advanceTimersByTimeAsync(10);
  expect(pointer.defaultPrevented).toBe(true);
  expect(area(root).value).toBe('x @Dana Kowalska and @Dan ');
  expect(root.activeElement).toBe(area(root));
  // Removing a name forgets its pick; "@Dana" alone is not "@Dana Kowalska".
  type(root, 'x @Dana and @Dan please'); await vi.advanceTimersByTimeAsync(200);
  await send(root);
  expect(replies()).toEqual([['POST', { body: 'x @Dana and @Dan please', mentions: ['end_user:dan'] }]]);
});

it('keeps the picks with the restored reply when sending fails', async () => {
  let fail = true;
  const root = await open({ reply: () => { if (fail) throw { status: 503 }; return { id: 'c1' }; } });
  type(root, 'See @Dan'); await vi.advanceTimersByTimeAsync(310);
  key(root, 'ArrowDown'); await vi.advanceTimersByTimeAsync(10);
  key(root, 'Enter'); await vi.advanceTimersByTimeAsync(10);
  type(root, 'See @Dan please'); await send(root);
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Could not send your reply');
  expect(area(root).value).toBe('See @Dan please');
  fail = false; await send(root);
  expect(replies()).toEqual([['POST', { body: 'See @Dan please', mentions: ['end_user:dan'] }], ['POST', { body: 'See @Dan please', mentions: ['end_user:dan'] }]]);
});

it('drops stale answers and announces when no one matches', async () => {
  let release!: (value: unknown) => void;
  const held = new Promise(resolve => { release = resolve; });
  const root = await open({ people: query => query === 'D' ? held : { people: query === 'Da' ? [directory[0]] : [] } });
  type(root, '@D'); await vi.advanceTimersByTimeAsync(310);
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(310);
  release({ people: directory }); await vi.advanceTimersByTimeAsync(10);
  expect(options(root).map(option => option.textContent)).toEqual(['Dana KowalskaTeam']);
  type(root, '@Dax'); await vi.advanceTimersByTimeAsync(710);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
  expect(area(root).hasAttribute('aria-controls')).toBe(false);
  expect(live(root)).toBe('No one found');
  // Without a list, Escape closes the panel as before.
  key(root, 'Escape'); await vi.advanceTimersByTimeAsync(10);
  expect(root.querySelector('.panel')).toBeNull();
});

it('asks for each query once per thread, a bare "@" included, and shows known answers at once', async () => {
  const root = await open();
  type(root, '@'); await vi.advanceTimersByTimeAsync(310);
  expect(options(root)).toHaveLength(3);
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(310);
  type(root, '@Dan'); await vi.advanceTimersByTimeAsync(310);
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(1);
  expect(options(root).map(option => option.textContent)).toEqual(['Dana KowalskaTeam', 'Dan', 'DanielTeam']);
  key(root, 'Escape'); await vi.advanceTimersByTimeAsync(10);
  // The server reads the query trimmed and in any case, and so does the cache.
  type(root, '@Da and @'); await vi.advanceTimersByTimeAsync(1);
  expect(options(root)).toHaveLength(3);
  type(root, '@Da and @dan '); await vi.advanceTimersByTimeAsync(310);
  expect(lookups()).toEqual(['/issues/issue/people?q=', '/issues/issue/people?q=Da', '/issues/issue/people?q=Dan']);
});

it('hides the list quietly when lookups are rate limited, and typing and sending go on', async () => {
  let limited = true;
  const root = await open({ people: () => { if (limited) throw { status: 429 }; return { people: directory }; } });
  type(root, 'Ask @Da'); await vi.advanceTimersByTimeAsync(400);
  expect(root.querySelector('[role="listbox"], .panel [role="alert"]')).toBeNull();
  expect(root.getElementById('tuix-mention-hint')).not.toBeNull();
  type(root, 'Ask @Dana about it'); await send(root);
  expect(replies()).toEqual([['POST', { body: 'Ask @Dana about it' }]]);
  // Failures are not remembered: a later "@" asks again.
  limited = false;
  type(root, 'Then @Da'); await vi.advanceTimersByTimeAsync(310);
  expect(options(root)).toHaveLength(3);
  expect(lookups()).toEqual(['/issues/issue/people?q=Da', '/issues/issue/people?q=Da']);
});

it('stops suggesting on a newline, after 30 characters, inside an address, and once a query ending in a space finds no one', async () => {
  const root = await open({ people: query => ({ people: query.startsWith('Zed') ? [] : directory }) });
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(310);
  expect(options(root)).toHaveLength(3);
  type(root, '@Da\n'); await vi.advanceTimersByTimeAsync(310);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
  type(root, '@' + 'x'.repeat(31)); await vi.advanceTimersByTimeAsync(310);
  type(root, 'write to anna@example'); await vi.advanceTimersByTimeAsync(310);
  expect(lookups()).toEqual(['/issues/issue/people?q=Da']);
  type(root, '@Zed '); await vi.advanceTimersByTimeAsync(310);
  type(root, '@Zed is'); await vi.advanceTimersByTimeAsync(310);
  expect(lookups()).toEqual(['/issues/issue/people?q=Da', '/issues/issue/people?q=Zed%20']);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
});

it('stops opening at ten people and says so', async () => {
  const root = await open({ people: query => ({ people: [{ id: 'member:' + query, name: query, team: true }] }) });
  let text = '';
  for (let index = 0; index < 10; index++) {
    type(root, text + '@P' + index); await vi.advanceTimersByTimeAsync(310);
    key(root, 'Enter'); await vi.advanceTimersByTimeAsync(10);
    text = area(root).value;
  }
  expect(text).toBe('@P0 @P1 @P2 @P3 @P4 @P5 @P6 @P7 @P8 @P9 ');
  type(root, text + '@Q'); await vi.advanceTimersByTimeAsync(710);
  expect(lookups()).toHaveLength(10);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
  expect(live(root)).toBe('You can mention up to 10 people.');
  await send(root);
  expect((replies()[0][1] as { mentions: string[] }).mentions).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(index => 'member:P' + index));
});

it('offers nothing when the thread cannot mention, and sends the reply as before', async () => {
  const root = await open({ issue: { can_mention: false } });
  const field = area(root);
  expect(root.getElementById('tuix-mention-hint')).toBeNull();
  expect(field.hasAttribute('aria-autocomplete')).toBe(false);
  expect(field.hasAttribute('aria-describedby')).toBe(false);
  expect(root.querySelector('.mention-field [role="status"]')).toBeNull();
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(710);
  expect(lookups()).toEqual([]);
  await send(root);
  expect(replies()).toEqual([['POST', { body: '@Da' }]]);
});

it('treats a server without can_mention as one that cannot mention', async () => {
  const root = await open({ issue: { can_mention: undefined } });
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(710);
  expect(lookups()).toEqual([]);
  expect(root.getElementById('tuix-mention-hint')).toBeNull();
});

it('removes the composer for the thread when the lookup is forbidden, and closes silently on other failures', async () => {
  let status = 500;
  const root = await open({ people: () => { throw { status }; } });
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(710);
  expect(root.querySelector('[role="listbox"], .panel [role="alert"]')).toBeNull();
  expect(root.getElementById('tuix-mention-hint')).not.toBeNull();
  status = 403;
  type(root, 'again @Da'); await vi.advanceTimersByTimeAsync(710);
  expect(lookups()).toHaveLength(2);
  expect(root.getElementById('tuix-mention-hint')).toBeNull();
  expect(area(root).hasAttribute('aria-autocomplete')).toBe(false);
  type(root, 'and @Dan'); await vi.advanceTimersByTimeAsync(710);
  expect(lookups()).toHaveLength(2);
});

it('renders mentions as chips from text alone, and falls back to the body without segments', async () => {
  const label = '<img src=x onerror="window.__mentionXss=1">';
  const root = await open({ issue: { comments: [
    { id: 'c1', body: `Hi @${label} and <b>you</b>`, segments: [{ text: 'Hi ' }, { mention: label }, { text: ' and <b>you</b>' }], author: { name: 'Anna' }, team: true, inserted_at: '2026-10-06T10:00:00Z' },
    { id: 'c2', body: 'Plain @Dan reply', author: { name: 'Dan' }, team: false, inserted_at: '2026-10-06T10:01:00Z' },
  ] } });
  const [first, second] = [...root.querySelectorAll('.comment p')];
  expect(first.querySelector('.mention')!.textContent).toBe('@' + label);
  expect(first.textContent).toBe(`Hi @${label} and <b>you</b>`);
  expect(first.querySelector('img, b')).toBeNull();
  expect((window as { __mentionXss?: number }).__mentionXss).toBeUndefined();
  expect(second.textContent).toBe('Plain @Dan reply');
  expect(second.querySelector('.mention')).toBeNull();
});

it('renders mentions in the developer note of a report waiting for verification', async () => {
  const root = await open({ issue: { state: 'in_review', status: 'awaiting_verification', allowed_states: ['done', 'open'], fixed_note: { body: 'Fixed, @Ola please check', segments: [{ text: 'Fixed, ' }, { mention: 'Ola' }, { text: ' please check' }], author: { name: 'Dev' } } } });
  const note = root.querySelector('.fix-note p')!;
  expect(note.textContent).toBe('Fixed, @Ola please check');
  expect(note.querySelector('.mention')!.textContent).toBe('@Ola');
});

it.each([['en', 'Mentioned you'], ['pl', 'Wspomniano o Tobie']] as const)('labels a mention in the updates list (%s)', async (lang, label) => {
  const unread = [
    { id: 'n1', issue_id: 'issue', kind: 'member_reply', state_kind: 'mentioned', inserted_at: '2026-10-06T11:00:00Z', issue: { number: 7, title: 'Total overlaps', status: 'open', state: 'open', url: location.origin + '/' } },
    // An older server's widget API names the kind only.
    { id: 'n2', issue_id: 'issue', kind: 'mentioned', inserted_at: '2026-10-06T10:00:00Z', issue: { number: 7, title: 'Total overlaps', status: 'open', state: 'open', url: location.origin + '/' } },
  ];
  vi.useFakeTimers();
  mock.request.mockImplementation(async (path: string) => path === '/config' ? { telemetry: false, capture: { screenshot: false, console: false, network: false } } : path.startsWith('/issues?') ? { issues: [], next_before: null } : path === '/preferences' ? { email_available: false, notify_email: false } : { notifications: unread });
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  core = mount(root, launcher, { project: 'mentions', lang }, { id: 'me', name: 'Me' }, () => {});
  core.open(); await vi.advanceTimersByTimeAsync(200);
  expect([...root.querySelectorAll('.update-kind')].map(item => item.textContent)).toEqual([label, label]);
});

/** A pointer event of a given kind, as jsdom has no PointerEvent. */
const pointer = (target: Element, name: string, pointerType: string) => {
  const event = new MouseEvent(name, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event); return event;
};
const dan = (root: ShadowRoot) => options(root).find(option => option.textContent === 'Dan')!;

it('picks on a plain click too, as a screen reader activates an option', async () => {
  const root = await open();
  type(root, 'x @dan'); await vi.advanceTimersByTimeAsync(310);
  dan(root).click(); await vi.advanceTimersByTimeAsync(10);
  expect(area(root).value).toBe('x @Dan ');
});

it('does not pick when a finger lands on the list, but on the tap that follows', async () => {
  const root = await open();
  type(root, 'x @dan'); await vi.advanceTimersByTimeAsync(310);
  const down = pointer(dan(root), 'pointerdown', 'touch'); await vi.advanceTimersByTimeAsync(10);
  expect(down.defaultPrevented).toBe(false);
  expect(area(root).value).toBe('x @dan');
  // The keyboard of a phone may blur the textarea meanwhile: the list stays for the tap.
  area(root).dispatchEvent(new FocusEvent('blur')); await vi.advanceTimersByTimeAsync(10);
  expect(options(root)).toHaveLength(3);
  pointer(dan(root), 'pointerup', 'touch'); dan(root).click(); await vi.advanceTimersByTimeAsync(10);
  expect(area(root).value).toBe('x @Dan ');
  expect(root.querySelector('[role="listbox"]')).toBeNull();
});

it('never picks while a finger scrolls the list, and keeps focus in the textarea for presses on it', async () => {
  const root = await open();
  type(root, 'x @dan'); await vi.advanceTimersByTimeAsync(310);
  pointer(dan(root), 'pointerdown', 'touch'); pointer(dan(root), 'pointercancel', 'touch'); await vi.advanceTimersByTimeAsync(10);
  expect(area(root).value).toBe('x @dan');
  expect(pointer(root.querySelector('[role="listbox"]')!, 'mousedown', 'mouse').defaultPrevented).toBe(true);
  // Pointer down and up that drift away from a tap, with no click, leave the list and the text alone.
  pointer(dan(root), 'pointerdown', 'touch'); pointer(dan(root), 'pointerup', 'touch'); await vi.advanceTimersByTimeAsync(600);
  expect(area(root).value).toBe('x @dan');
  area(root).dispatchEvent(new FocusEvent('blur')); await vi.advanceTimersByTimeAsync(10);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
});

it.each(['mouse', 'pen'])('picks a %s on pointerdown, and keeps the focus', async kind => {
  const root = await open();
  type(root, 'x @dan'); await vi.advanceTimersByTimeAsync(310);
  const down = pointer(dan(root), 'pointerdown', kind); await vi.advanceTimersByTimeAsync(10);
  expect(down.defaultPrevented).toBe(true);
  expect(area(root).value).toBe('x @Dan ');
});

it('reuses a space after the caret and moves past it', async () => {
  const root = await open();
  const field = area(root); field.focus(); field.value = 'Hi @dan, and more'.replace(',', ''); field.setSelectionRange(7, 7);
  field.dispatchEvent(new Event('input', { bubbles: true })); await vi.advanceTimersByTimeAsync(310);
  key(root, 'ArrowDown'); await vi.advanceTimersByTimeAsync(10); key(root, 'Enter'); await vi.advanceTimersByTimeAsync(10);
  expect(field.value).toBe('Hi @Dan and more');
  expect(field.selectionStart).toBe(8);
});

it('moves the active option only with plain arrows', async () => {
  const root = await open();
  type(root, '@Da'); await vi.advanceTimersByTimeAsync(310);
  const down = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true, composed: true });
  area(root).dispatchEvent(down); await vi.advanceTimersByTimeAsync(10);
  expect(down.defaultPrevented).toBe(false);
  expect(options(root)[0].getAttribute('aria-selected')).toBe('true');
  key(root, 'ArrowDown'); await vi.advanceTimersByTimeAsync(10);
  expect(options(root)[1].getAttribute('aria-selected')).toBe('true');
});

it('inserts nothing when a pick would pass the 2000 characters the textarea allows', async () => {
  const root = await open();
  const text = 'x'.repeat(1995) + ' @dan';
  type(root, text); await vi.advanceTimersByTimeAsync(310);
  expect(options(root)).toHaveLength(3);
  key(root, 'ArrowDown'); await vi.advanceTimersByTimeAsync(10); key(root, 'Enter'); await vi.advanceTimersByTimeAsync(10);
  expect(area(root).value).toBe(text);
  expect(root.querySelector('[role="listbox"]')).toBeNull();
});
