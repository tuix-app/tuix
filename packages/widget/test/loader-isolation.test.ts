// @vitest-environment jsdom
import source from '../src/loader.js?raw';
import { afterEach, expect, it, vi } from 'vitest';
const scope = window as Window & { tuix?: { (command: string, value?: unknown): void; q?: unknown[] } };
afterEach(() => { vi.restoreAllMocks(); delete scope.tuix; localStorage.clear(); document.querySelectorAll('tuix-widget, script[type=module]').forEach(node => node.remove()); });
it('contains launcher failure and replays later queued calls', () => {
  scope.tuix = Object.assign(vi.fn(), { q: [42, ['init', { project: 'fixture' }], ['identify', { id: 'alice' }], ['identify', { id: 'bob' }]] });
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementationOnce(() => { throw Error('fixture'); });
  expect(() => window.eval(source)).not.toThrow();
  expect(document.querySelectorAll('tuix-widget')).toHaveLength(1);
  expect(() => scope.tuix!('destroy')).not.toThrow();
  expect(document.querySelector('tuix-widget')).toBeNull();
});
it('contains a failure while activating the lazy script', () => {
  window.eval(source);
  scope.tuix!('init', { project: 'fixture' }); scope.tuix!('identify', { id: 'alice' });
  vi.spyOn(document.head, 'appendChild').mockImplementationOnce(() => { throw Error('fixture'); });
  expect(() => scope.tuix!('open')).not.toThrow();
  expect(() => scope.tuix!('open')).not.toThrow();
});
it('queues a monotonic activation timestamp without adding requests while idle', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(125);
  window.eval(source);
  scope.tuix!('init', { project: 'fixture' }); scope.tuix!('identify', { id: 'alice' });
  expect(now).not.toHaveBeenCalled();
  scope.tuix!('open');
  expect(scope.tuix!.q![scope.tuix!.q!.length - 1]).toEqual(['open', undefined, 125]);
});
it('separates bootstrap comment activation from settings-only activation', () => {
  const attach = Element.prototype.attachShadow; let root!: ShadowRoot;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { root = attach.call(this, options); return root; });
  vi.spyOn(performance, 'now').mockReturnValue(250);
  window.eval(source);
  scope.tuix!('init', { project: 'fixture' }); scope.tuix!('identify', { id: 'alice' });
  root.querySelector<HTMLButtonElement>('button')!.click();
  expect(scope.tuix!.q![scope.tuix!.q!.length - 1]).toEqual(['comment', undefined, 250]);
  root.querySelector<HTMLButtonElement>('button[aria-label="Feedback settings"]')!.click();
  expect(scope.tuix!.q![scope.tuix!.q!.length - 1]).toEqual(['settings', undefined, undefined]);
  // The second menu dot browses reports instead of starting a comment.
  root.querySelector<HTMLButtonElement>('button[aria-label="Reports"]')!.click();
  expect(scope.tuix!.q![scope.tuix!.q!.length - 1]).toEqual(['open', undefined, 250]);
});
it('queues a report filter with an open call', () => {
  vi.spyOn(performance, 'now').mockReturnValue(125);
  window.eval(source);
  scope.tuix!('init', { project: 'fixture' }); scope.tuix!('identify', { id: 'alice' });
  scope.tuix!('open', { show: 'verify', involving: 'me' });
  expect(scope.tuix!.q![scope.tuix!.q!.length - 1]).toEqual(['open', { show: 'verify', involving: 'me' }, 125]);
});
it('loads the SDK eagerly only for a browser that opened tuix for this project within 30 days', () => {
  const modules = () => document.head.querySelectorAll('script[type=module]').length;
  const boot = (project: string) => { delete scope.tuix; window.eval(source); scope.tuix!('init', { project }); scope.tuix!('identify', { id: 'alice' }); };
  boot('fresh');
  expect(modules()).toBe(0);
  localStorage.setItem('tuix:active:stale', String(Date.now() - 31 * 24 * 60 * 60 * 1000));
  boot('stale');
  expect(modules()).toBe(0);
  localStorage.setItem('tuix:active:other', String(Date.now()));
  boot('fresh');
  expect(modules()).toBe(0);
  localStorage.setItem('tuix:active:returning', String(Date.now() - 60_000));
  boot('returning');
  expect(modules()).toBe(1);
  expect(document.head.querySelector<HTMLScriptElement>('script[type=module]')!.src).toMatch(/cdn\.js$/);
  // Corrupt or blocked storage keeps the loader idle.
  document.head.querySelectorAll('script[type=module]').forEach(node => node.remove());
  localStorage.setItem('tuix:active:corrupt', 'soon');
  boot('corrupt');
  expect(modules()).toBe(0);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked'); });
  boot('returning');
  expect(modules()).toBe(0);
});
it('keeps a launcher:false host lazy for a returning browser, but still loads pinned markers', () => {
  const modules = () => document.head.querySelectorAll('script[type=module]').length;
  const boot = (project: string) => { delete scope.tuix; window.eval(source); scope.tuix!('init', { project, launcher: false }); scope.tuix!('identify', { id: 'alice' }); };
  // Only a launcher draws the summary, so a recent open buys nothing here.
  localStorage.setItem('tuix:active:hidden', String(Date.now() - 60_000));
  boot('hidden');
  expect(modules()).toBe(0);
  localStorage.setItem('tuix:markers:pinned', 'on:dot');
  boot('pinned');
  expect(modules()).toBe(1);
  // The loader only reads the pinned flag, so any style (fill included) loads eagerly and an off token stays idle.
  document.head.querySelectorAll('script[type=module]').forEach(node => node.remove());
  localStorage.setItem('tuix:markers:filled', 'on:fill');
  boot('filled');
  expect(modules()).toBe(1);
  document.head.querySelectorAll('script[type=module]').forEach(node => node.remove());
  localStorage.setItem('tuix:markers:quiet', 'off:fill');
  boot('quiet');
  expect(modules()).toBe(0);
});
it('keeps the launcher usable during an eager load, queues a click for cdn.js, and relabels only a failed load someone asked for', () => {
  const attach = Element.prototype.attachShadow; let root!: ShadowRoot;
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementation(function(this: Element, options) { root = attach.call(this, options); return root; });
  vi.spyOn(performance, 'now').mockReturnValue(300);
  const scripts = () => document.head.querySelectorAll<HTMLScriptElement>('script[type=module]');
  const boot = () => { delete scope.tuix; window.eval(source); scope.tuix!('init', { project: 'returning' }); scope.tuix!('identify', { id: 'alice' }); return root.querySelector<HTMLButtonElement>('#tuix-launcher')!; };
  localStorage.setItem('tuix:active:returning', String(Date.now() - 60_000));
  // An eager load that fails on its own stays quiet: no wait cursor before, no retry label after.
  let launcher = boot();
  expect(scripts()).toHaveLength(1);
  expect(launcher.disabled).toBe(false);
  scripts()[0].onerror!(new Event('error'));
  expect(launcher.disabled).toBe(false);
  expect(launcher.getAttribute('aria-label')).toBe('Open tuix feedback');
  scripts().forEach(node => node.remove());
  // A click during the eager load is queued for cdn.js to replay and waits on the same download.
  launcher = boot();
  expect(launcher.disabled).toBe(false);
  launcher.click();
  expect(scope.tuix!.q!.slice(-1)).toEqual([['comment', undefined, 300]]);
  expect(launcher.disabled).toBe(true);
  expect(scripts()).toHaveLength(1);
  scripts()[0].onerror!(new Event('error'));
  expect(launcher.disabled).toBe(false);
  expect(launcher.getAttribute('aria-label')).toBe('Could not load feedback. Click to retry.');
});
