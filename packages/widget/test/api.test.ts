// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { Api, ApiError } from '../src/api';
afterEach(() => vi.unstubAllGlobals());
it('binds project/environment, uses no cookies and re-identifies once on expiry', async () => {
  const responses = [{ token: 'first' }, null, { token: 'renewed' }, { issues: [] }];
  const fetch = vi.fn().mockImplementation(async () => { const value = responses.shift(); return value === null ? { ok: false, status: 401 } : { ok: true, status: 200, json: async () => value }; });
  vi.stubGlobal('fetch', fetch);
  const api = new Api({ project: 'pk_test', environment: 'uat' }, { id: 'u', name: 'User' });
  expect(await api.request('/issues')).toEqual({ issues: [] });
  expect(fetch).toHaveBeenCalledTimes(4);
  expect(fetch.mock.calls[3][1]).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { 'x-tuix-project': 'pk_test', 'x-tuix-environment': 'uat', 'x-tuix-widget': '2', authorization: 'Bearer renewed' } });
  // Version 2 of the widget contract is announced on every API call, including identify.
  expect(fetch.mock.calls.every(([, init]) => init.headers['x-tuix-widget'] === '2')).toBe(true);
  api.destroy();
});
it('stops retrying after a second unauthorized response', async () => {
  const fetch = vi.fn().mockImplementation(async (url: string) => url.endsWith('/identify') ? { ok: true, json: async () => ({ token: 'token' }) } : { ok: false, status: 401 });
  vi.stubGlobal('fetch', fetch);
  const api = new Api({ project: 'pk_test' }, { id: 'u', name: 'User' });
  await expect(api.request('/issues')).rejects.toBeInstanceOf(ApiError);
  expect(fetch).toHaveBeenCalledTimes(4);
});
it('Shopify authentication refreshes the reviewer session and never uses host identify', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ token: 'reviewer-jwt' }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ issues: [] }) });
  vi.stubGlobal('fetch', fetch);
  const api = new Api({ project: 'pk_shop' }, { id: 'reviewer', name: 'Reviewer', reviewerSession: 'opaque-session' });
  await api.request('/issues');
  expect(fetch.mock.calls[0][0]).toMatch(/\/shopify\/reviewer\/refresh$/);
  expect(fetch.mock.calls[0][1].body).toBe(JSON.stringify({ token: 'opaque-session' }));
  expect(fetch.mock.calls[1][1].headers.authorization).toBe('Bearer reviewer-jwt');
  api.destroy();
});
