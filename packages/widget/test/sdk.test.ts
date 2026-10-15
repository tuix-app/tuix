// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { tuix } from '../src/index';
afterEach(() => { tuix.destroy(); vi.restoreAllMocks(); });
it('stays hidden until identity, creates an isolated launcher, and makes no idle request', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  tuix.init({ project: 'public-test' });
  expect(document.querySelector('tuix-widget')).toBeNull();
  tuix.identify({ id: 'fixture', name: 'Fixture' });
  const host = document.querySelector('tuix-widget');
  expect(host).not.toBeNull();
  expect(host!.shadowRoot).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  tuix.identify(null);
  expect(document.querySelector('tuix-widget')).toBeNull();
  vi.unstubAllGlobals();
});
