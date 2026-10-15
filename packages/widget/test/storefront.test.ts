// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.example.test/products/a?preview_theme_id=123"}
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { activateStorefront, storefrontRoute } from '../src/storefront';
import { tuix } from '../src/index';
vi.mock('../src/index', () => ({ tuix: { init: vi.fn(), identify: vi.fn() } }));
const session = 's'.repeat(43), invitation = 'i'.repeat(43);
const boot = { project: 'pk_shop', template: 'product', handle: 'a', api: 'https://api.example.test' };
const result = () => ({ token: 'widget-jwt', session, user: { id: 'reviewer-id', name: 'Reviewer' }, expires_at: new Date(Date.now() + 2_592_000_000).toISOString() });
beforeEach(() => { vi.clearAllMocks(); document.cookie = '__Host-tuix_review_pk_shop=; Secure; Path=/; Max-Age=0'; });
afterEach(() => vi.unstubAllGlobals());
it('redeems once, stores a host cookie and mounts only with the admitted identity', async () => {
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => result() });
  vi.stubGlobal('fetch', fetch);
  expect(await activateStorefront({ ...boot, invitation })).toBe(true);
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.example.test/v1/shopify/reviewer/consume', expect.objectContaining({ credentials: 'omit', redirect: 'error', body: JSON.stringify({ token: invitation }) }));
  expect(document.cookie).toContain('__Host-tuix_review_pk_shop=' + session);
  expect(tuix.identify).toHaveBeenCalledWith({ id: 'reviewer-id', name: 'Reviewer', reviewerSession: session });
  expect(tuix.init).toHaveBeenCalledWith(expect.objectContaining({ environment: 'production' }));
  expect(vi.mocked(tuix.init).mock.calls[0][0].capture).toBeUndefined();
});
it('renders nothing without a credential or in the theme editor', async () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await activateStorefront(boot)).toBe(false);
  vi.stubGlobal('Shopify', { designMode: true });
  expect(await activateStorefront({ ...boot, session })).toBe(false);
  expect(fetch).not.toHaveBeenCalled(); expect(tuix.init).not.toHaveBeenCalled();
});
it('clears a rejected session but keeps it through a network outage', async () => {
  document.cookie = `__Host-tuix_review_pk_shop=${session}; Path=/; Secure`;
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
  expect(await activateStorefront({ ...boot, session })).toBe(false);
  expect(document.cookie).toContain(session);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  expect(await activateStorefront({ ...boot, session })).toBe(false);
  expect(document.cookie).not.toContain(session); expect(tuix.init).not.toHaveBeenCalled();
});
it('an expired invitation does not log out an existing valid reviewer', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: false, status: 401 }).mockResolvedValueOnce({ ok: true, json: async () => result() });
  vi.stubGlobal('fetch', fetch);
  expect(await activateStorefront({ ...boot, invitation, session })).toBe(true);
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://api.example.test/v1/shopify/reviewer/consume', 'https://api.example.test/v1/shopify/reviewer/refresh']);
});
it('refuses expired results and invalid API configuration without mounting', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ...result(), expires_at: '2000-01-01' }) }));
  expect(await activateStorefront({ ...boot, invitation })).toBe(false);
  expect(await activateStorefront({ ...boot, api: 'http://evil.test', invitation })).toBe(false);
  expect(tuix.init).not.toHaveBeenCalled();
});
it('uses template metadata and preserves long merchant handles across storefront paths', () => {
  expect(storefrontRoute('product', 'a-long-merchant-handle-that-is-not-an-id')).toBe('/products/a-long-merchant-handle-that-is-not-an-id');
  expect(storefrontRoute('article', 'news/new-release')).toBe('/blogs/news/new-release');
  expect(storefrontRoute('collection', 'summer')).toBe('/collections/summer');
  expect(storefrontRoute('index', '')).toBe('/');
});

it('explicit sign-in performs no exchange and requests recovery only outside the theme editor', async () => {
  const recover = vi.fn(), fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  expect(await activateStorefront({ ...boot, signIn: true }, recover)).toBe(false);
  expect(recover).toHaveBeenCalledExactlyOnceWith('signin');
  expect(fetch).not.toHaveBeenCalled();
  recover.mockClear(); vi.stubGlobal('Shopify', { designMode: true });
  await activateStorefront({ ...boot, signIn: true }, recover);
  expect(recover).not.toHaveBeenCalled();
});
it('reports rejected and ambiguous exchanges without replaying an invitation', async () => {
  const recover = vi.fn();
  const fetch = vi.fn().mockResolvedValueOnce({ok:false,status:401}).mockRejectedValueOnce(new TypeError('response lost'));
  vi.stubGlobal('fetch', fetch);
  await activateStorefront({ ...boot, invitation }, recover);
  expect(recover).toHaveBeenLastCalledWith('expired');
  await activateStorefront({ ...boot, invitation }, recover);
  expect(recover).toHaveBeenLastCalledWith('unavailable');
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(tuix.init).not.toHaveBeenCalled();
});
