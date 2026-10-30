import { afterEach, expect, it, vi } from 'vitest';
import { mountSettings } from '../src/settings';
import { readPreferences, savePreferences, showQuery, cleanFilter } from '../src/preferences';
import pkg from '../package.json';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); localStorage.clear(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });
it('validates per-project settings and retains blocked-storage choices for the session', () => {
  localStorage.setItem('tuix:preferences:bad', '{"scope":"bogus","show":"closed","environment":"secret","hideClosed":"no"}');
  expect(readPreferences('bad')).toEqual({ scope: 'page', show: 'unresolved', involving: 'everyone', environment: '' });
  localStorage.setItem('tuix:preferences:broken', '{');
  expect(readPreferences('broken').show).toBe('unresolved');
  localStorage.setItem('tuix:preferences:wrong-shape', JSON.stringify({ show: ['open'] }));
  expect(readPreferences('wrong-shape').show).toBe('unresolved');
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked'); });
  savePreferences('blocked', { show: 'all', scope: 'all' });
  expect(readPreferences('blocked')).toEqual({ scope: 'all', show: 'all', involving: 'everyone', environment: '' });
  expect(readPreferences('other').show).toBe('unresolved');
});
it('migrates Reported by: Me to Involving: Me and keeps the stored Open name for active work', () => {
  localStorage.setItem('tuix:preferences:old', '{"scope":"all","show":"open","author":"mine"}');
  expect(readPreferences('old')).toEqual({ scope: 'all', show: 'open', involving: 'me', environment: '' });
  savePreferences('old', { show: 'verify' });
  expect(JSON.parse(localStorage.getItem('tuix:preferences:old')!)).toEqual({ scope: 'all', show: 'verify', involving: 'me', environment: '', version: 2 });
  // An explicit Involving choice wins over the legacy field.
  localStorage.setItem('tuix:preferences:both', '{"author":"mine","involving":"everyone"}');
  expect(readPreferences('both').involving).toBe('everyone');
  localStorage.setItem('tuix:preferences:everyone', '{"author":"all"}');
  expect(readPreferences('everyone')).toMatchObject({ show: 'unresolved', involving: 'everyone' });
});
it('reveals the reports and settings dots on hover, opens settings only on click and browses only explicitly', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const reports = vi.fn(), changed = vi.fn(), fetch = vi.spyOn(window, 'fetch');
  const settings = mountSettings(root, launcher, { project: 'hover', environment: 'local' }, reports, changed); cleanup = settings.destroy;
  const panel = root.querySelector<HTMLElement>('.settings-flyout')!, toggle = root.querySelector<HTMLButtonElement>('#tuix-settings-toggle')!;
  const browse = root.querySelector<HTMLButtonElement>('#tuix-reports-toggle')!;
  expect(toggle.classList.contains('revealed')).toBe(false); expect(browse.classList.contains('revealed')).toBe(false);
  expect(toggle.querySelector('svg')).not.toBeNull(); expect(browse.querySelector('svg')).not.toBeNull();
  expect(browse.getAttribute('aria-label')).toBe('Reports');
  expect(panel.querySelector('[data-action=reports]')).toBeNull();
  launcher.dispatchEvent(new MouseEvent('mouseenter'));
  expect(toggle.classList.contains('revealed')).toBe(true); expect(browse.classList.contains('revealed')).toBe(true);
  await vi.advanceTimersByTimeAsync(1000); expect(panel.hidden).toBe(true);
  launcher.dispatchEvent(new MouseEvent('mouseleave')); toggle.dispatchEvent(new MouseEvent('mouseenter'));
  await vi.advanceTimersByTimeAsync(500); expect(toggle.classList.contains('revealed')).toBe(true);
  toggle.click(); expect(panel.hidden).toBe(false); expect(toggle.getAttribute('aria-expanded')).toBe('true');
  // Report filters stay with the list; marker preferences form a named group.
  expect([...panel.querySelectorAll('legend')].map(legend => legend.textContent)).toEqual(['Appearance']);
  expect(panel.querySelector('[data-setting=show],[data-setting=author]')).toBeNull();
  // Markers offer Dots, Outlines and Fills, and the choice reaches the shared preference.
  expect([...panel.querySelectorAll('[data-setting=markers]')].map(item => [item.getAttribute('data-value'), item.textContent])).toEqual([['dot', 'Dots'], ['border', 'Outlines'], ['fill', 'Fills']]);
  root.querySelector<HTMLButtonElement>('[data-setting=markers][data-value=fill]')!.click();
  expect(localStorage.getItem('tuix:markers:hover')).toBe('off:fill'); expect(changed).toHaveBeenCalled();
  expect(panel.querySelector('select')).not.toBeNull();
  // The core's updates slot follows the environment control; the quiet version line closes the flyout.
  expect(panel.lastElementChild!.previousElementSibling).toBe(settings.slot);
  // The version line must follow the published package version, not a stale constant.
  expect(panel.lastElementChild!.textContent).toBe(`tuix ${pkg.version}`);
  expect(panel.querySelector('[data-setting=scope]')).toBeNull(); expect(reports).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  browse.click();
  expect(reports).toHaveBeenCalledOnce(); expect(panel.hidden).toBe(true);
  toggle.dispatchEvent(new MouseEvent('mouseleave'));
  await vi.advanceTimersByTimeAsync(500);
  expect(toggle.classList.contains('revealed')).toBe(false); expect(browse.classList.contains('revealed')).toBe(false);
});

it('synchronizes open controls and stays dismissed after Escape returns focus', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const settings = mountSettings(root, launcher, { project: 'sync' }, vi.fn(), vi.fn()); cleanup = settings.destroy;
  settings.open();
  const all = root.querySelector<HTMLSelectElement>('[data-setting=environment]')!;
  savePreferences('sync', { environment: 'all' });
  expect(all.value).toBe('all');
  expect(root.querySelector('[data-setting=environment]')).toBe(all);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await vi.advanceTimersByTimeAsync(500);
  expect(root.querySelector<HTMLElement>('.settings-flyout')!.hidden).toBe(true);
  expect(root.activeElement).toBe(launcher);
});

it('dismisses a bootstrap-opened flyout on an outside press and conceals the control when the pointer leaves', async () => {
  vi.useFakeTimers();
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const settings = mountSettings(root, launcher, { project: 'replacement' }, vi.fn(), vi.fn()); cleanup = settings.destroy;
  settings.open();
  // JSDOM returns zero rects, so this point is outside all three controls.
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
  await vi.advanceTimersByTimeAsync(500);
  expect(root.querySelector<HTMLElement>('.settings-flyout')!.hidden).toBe(false);
  document.dispatchEvent(new MouseEvent('pointerdown', { clientX: 100, clientY: 100 }));
  expect(root.querySelector<HTMLElement>('.settings-flyout')!.hidden).toBe(true);
  document.dispatchEvent(new MouseEvent('pointermove', { clientX: 100, clientY: 100 }));
  await vi.advanceTimersByTimeAsync(500);
  expect(root.querySelector('#tuix-settings-toggle')!.classList.contains('revealed')).toBe(false);
});

it('registers no document listeners while idle, only while the dots or the flyout show', async () => {
  vi.useFakeTimers();
  const add = vi.spyOn(document, 'addEventListener'), remove = vi.spyOn(document, 'removeEventListener');
  const types = (spy: typeof add) => spy.mock.calls.map(([type]) => type).filter(type => ['pointermove', 'pointerdown', 'keydown'].includes(type));
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const settings = mountSettings(root, launcher, { project: 'idle' }, vi.fn(), vi.fn()); cleanup = settings.destroy;
  // A returning browser mounts this on every page: no handler runs on the host's mouse moves or keys.
  expect(types(add)).toEqual([]);
  settings.summary({ to_verify: 1, assigned_active: 0 });
  expect(types(add)).toEqual([]);
  launcher.dispatchEvent(new MouseEvent('mouseenter'));
  expect(new Set(types(add))).toEqual(new Set(['pointermove', 'pointerdown', 'keydown']));
  launcher.dispatchEvent(new MouseEvent('mouseleave')); await vi.advanceTimersByTimeAsync(500);
  expect(root.querySelector('#tuix-settings-toggle')!.classList.contains('revealed')).toBe(false);
  expect(new Set(types(remove))).toEqual(new Set(['pointermove', 'pointerdown', 'keydown']));
  // The flyout brings them back for Escape and outside presses, and concealing removes them again.
  add.mockClear(); remove.mockClear();
  settings.open();
  expect(new Set(types(add))).toEqual(new Set(['pointermove', 'pointerdown', 'keydown']));
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(root.querySelector<HTMLElement>('.settings-flyout')!.hidden).toBe(true);
  // The dots stay until the pointer and focus leave, and so do their listeners.
  expect(types(remove)).toEqual([]);
  launcher.blur(); root.querySelector<HTMLElement>('#tuix-settings-toggle')!.dispatchEvent(new MouseEvent('mouseleave'));
  await vi.advanceTimersByTimeAsync(500);
  expect(new Set(types(remove))).toEqual(new Set(['pointermove', 'pointerdown', 'keydown']));
});

function mounted(project: string, options: Parameters<typeof mountSettings>[5] = {}, position?: 'bottom-left') {
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button'); root.append(launcher);
  const settings = mountSettings(root, launcher, { project, lang: 'en', position }, vi.fn(), vi.fn(), options); cleanup = settings.destroy;
  return { root, launcher, settings, capsule: root.querySelector<HTMLElement>('.tuix-summary')! };
}

it('shows one summary capsule with clickable segments that open Reports filtered to the caller', () => {
  vi.useFakeTimers();
  const onFilter = vi.fn();
  const { settings, capsule } = mounted('capsule', { onFilter });
  expect(capsule.hidden).toBe(true);
  settings.summary({ to_verify: 2, assigned_active: 3 });
  expect(capsule.hidden).toBe(false);
  const [verify, open] = capsule.querySelectorAll('button');
  expect([verify.textContent, open.textContent]).toEqual(['To verify2', 'Open3']);
  expect(verify.getAttribute('aria-label')).toBe('To verify 2: your reports waiting for your check');
  expect(open.getAttribute('aria-label')).toBe('Open 3: reports assigned to you');
  verify.click(); expect(onFilter).toHaveBeenLastCalledWith({ scope: 'all', show: 'verify', involving: 'me' });
  open.click(); expect(onFilter).toHaveBeenLastCalledWith({ scope: 'all', show: 'open', involving: 'me' });
  // Zero segments hide; both zero hides the capsule. Malformed counts read as zero.
  settings.summary({ to_verify: 0, assigned_active: 1 });
  expect([verify.hidden, open.hidden, capsule.hidden]).toEqual([true, false, false]);
  settings.summary({ to_verify: 0, assigned_active: 0 });
  expect(capsule.hidden).toBe(true);
  settings.summary({ to_verify: 'x', assigned_active: -4 } as never);
  expect(capsule.hidden).toBe(true);
});

it('hides the capsule while the menu dots are revealed or a panel or the flyout is open', async () => {
  vi.useFakeTimers();
  const onVisible = vi.fn();
  const { launcher, settings, capsule, root } = mounted('hiding', { onVisible });
  settings.summary({ to_verify: 1, assigned_active: 0 });
  launcher.dispatchEvent(new MouseEvent('mouseenter'));
  expect(capsule.hidden).toBe(true);
  launcher.dispatchEvent(new MouseEvent('mouseleave')); await vi.advanceTimersByTimeAsync(500);
  expect(capsule.hidden).toBe(false);
  settings.active(true); expect(capsule.hidden).toBe(true);
  settings.active(false); await vi.advanceTimersByTimeAsync(500); expect(capsule.hidden).toBe(false);
  root.querySelector<HTMLButtonElement>('#tuix-settings-toggle')!.click();
  expect(capsule.hidden).toBe(true); expect(onVisible).toHaveBeenLastCalledWith(true);
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(onVisible).toHaveBeenLastCalledWith(false); expect(onVisible).toHaveBeenCalledTimes(2);
  launcher.blur(); document.dispatchEvent(new MouseEvent('pointermove', { clientX: 500, clientY: 500 }));
  await vi.advanceTimersByTimeAsync(500);
  expect(capsule.hidden).toBe(false);
});

it('places the capsule beside the launcher on its side and caps the flyout to the viewport', () => {
  const { root } = mounted('left', {}, 'bottom-left');
  const css = [...root.querySelectorAll('style')].map(style => style.textContent).join('');
  expect(css).toContain('.tuix-summary{box-sizing:border-box;position:fixed;left:68px');
  expect(css).toMatch(/\.tuix-settings\{[^}]*max-height:calc\(100vh - 32px\);overflow:auto/);
});

it('draws no capsule or flyout for hosts without a launcher', () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' }), launcher = document.createElement('button');
  const settings = mountSettings(root, launcher, { project: 'hidden', launcher: false }, vi.fn(), vi.fn()); cleanup = settings.destroy;
  settings.summary({ to_verify: 4, assigned_active: 4 });
  expect(root.querySelector('.tuix-summary, .settings-flyout')).toBeNull();
});

it('groups marker appearance and explicit visibility, defaulting to dots while the panel is open', () => {
  const first = mounted('visibility');
  first.settings.open();
  const group = first.root.querySelector('[aria-labelledby="tuix-page-markers-title"]')!;
  expect(group.textContent).toContain('unresolved reports');
  expect(first.root.querySelector('[data-setting=hide-closed], [data-setting=scope]')).toBeNull();
  expect(group.querySelector('[data-value=dot]')!.getAttribute('aria-pressed')).toBe('true');
  const pin = group.querySelector<HTMLInputElement>('[data-setting=pinned]')!;
  expect(pin.checked).toBe(false);
  expect(pin.closest('label')!.textContent).toBe('Show markers when the feedback panel is closed');
  expect(first.root.getElementById(pin.getAttribute('aria-describedby')!)!.textContent).toContain('after you close the feedback panel');
  pin.click(); first.settings.destroy();
  const again = mounted('visibility'); again.settings.open();
  expect(again.root.querySelector<HTMLInputElement>('[data-setting=pinned]')!.checked).toBe(true);
});

it('migrates legacy All without changing visible reports, then saves explicit All', () => {
  for (const [project, hideClosed, expected] of [['legacy-on', true, 'unresolved'], ['legacy-off', false, 'all'], ['legacy-default', undefined, 'unresolved']] as const) {
    localStorage.setItem('tuix:preferences:' + project, JSON.stringify({ show: 'all', hideClosed }));
    expect(readPreferences(project).show).toBe(expected);
    savePreferences(project, { show: 'all' });
    expect(readPreferences(project).show).toBe('all');
    expect(JSON.parse(localStorage.getItem('tuix:preferences:' + project)!)).not.toHaveProperty('hideClosed');
  }
  expect(readPreferences('fresh')).toEqual({ scope: 'page', show: 'unresolved', involving: 'everyone', environment: '' });
  expect(['unresolved', 'open', 'verify', 'finished', 'all'].map(show => showQuery(show as Parameters<typeof showQuery>[0]))).toEqual(['unresolved', 'active', 'verify', 'finished', 'all']);
  expect(cleanFilter({ show: 'finished', scope: 'all', involving: 'me', secret: true })).toEqual({ show: 'finished', scope: 'all', involving: 'me' });
});

it('localizes group context and hides developer options outside local development', () => {
  const host = document.createElement('div'); document.body.append(host);
  const root = host.attachShadow({ mode: 'open' });
  const settings = mountSettings(root, document.createElement('button'), { project: 'pl', lang: 'pl', environment: 'production' }, vi.fn(), vi.fn()); cleanup = settings.destroy;
  expect(root.querySelector('#tuix-page-markers-title')!.textContent).toBe('Znaczniki na stronie');
  expect(root.querySelector('[data-setting=pinned]')!.closest('label')!.textContent).toContain('panelu uwag');
  expect(root.querySelector('#tuix-developer-options-title')).toBeNull();
});
