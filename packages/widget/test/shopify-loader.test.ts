// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.example.test/"}
import source from '../src/shopify-loader.js?raw';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const run = () => new Function('window', 'document', source)(window, document);
const scope = window as Window & { __tuixShopifyLoaded?: boolean; __tuixShopifyBoot?: unknown };
const moduleScript = () => document.querySelector<HTMLScriptElement & { tuixBoot?: unknown }>('script[data-tuix-storefront]');
beforeEach(() => {
  document.head.innerHTML = ''; document.body.innerHTML = '';
  history.replaceState(null, '', '/'); document.documentElement.removeAttribute('data-tuix-shopify-bound');
  document.cookie = '__Host-tuix_review_pk_shop=; Path=/; Secure; Max-Age=0';
  const script = document.createElement('script'); script.src = 'https://cdn.example.test/widget/pinned/shopify.js';
  script.setAttribute('data-project', 'pk_shop'); script.setAttribute('data-template', 'product'); script.setAttribute('data-handle', 'shirt');
  vi.spyOn(document, 'currentScript', 'get').mockReturnValue(script);
});
afterEach(() => { expect(scope.__tuixShopifyLoaded).toBeUndefined(); expect(scope.__tuixShopifyBoot).toBeUndefined(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('has no idle requests, UI, timers or listeners for shoppers', () => {
  const fetch = vi.fn(), timer = vi.spyOn(window, 'setTimeout'), listener = vi.spyOn(window, 'addEventListener'); vi.stubGlobal('fetch', fetch);
  run(); expect(fetch).not.toHaveBeenCalled(); expect(timer).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled();
  expect(document.querySelector('script,tuix-widget')).toBeNull(); expect(moduleScript()?.tuixBoot).toBeUndefined();
});
it('strips invite from history before importing the active entry and retains theme preview', () => {
  const invite = 'a'.repeat(43); history.replaceState(null, '', '/products/shirt?preview_theme_id=123&tuix_review=' + invite + '#size');
  run(); expect(location.search).toBe('?preview_theme_id=123'); expect(location.hash).toBe('#size');
  expect(moduleScript()?.tuixBoot).toMatchObject({ invitation: invite, template: 'product', handle: 'shirt' });
  expect(document.documentElement.outerHTML).not.toContain(invite);
  expect(document.querySelector('script')?.src).toBe('https://cdn.example.test/widget/pinned/storefront.js');
  run(); expect(document.querySelectorAll('script')).toHaveLength(1);
});
it('gates on a well-formed host cookie and stays dormant in design mode', () => {
  document.cookie = `__Host-tuix_review_pk_shop=${'s'.repeat(43)}; Path=/; Secure`;
  vi.stubGlobal('Shopify', { designMode: true }); run(); expect(document.querySelector('script')).toBeNull();
  vi.stubGlobal('Shopify', { designMode: false }); run(); expect(document.querySelectorAll('script')).toHaveLength(1);
});
it('malformed query credentials are removed without activation', () => {
  history.replaceState(null, '', '/?tuix_review=bad&keep=yes'); run();
  expect(location.search).toBe('?keep=yes'); expect(document.querySelector('script')).toBeNull();
});

it('explicit sign-in loads recovery without manufacturing an invitation or session', () => {
  history.replaceState(null, '', '/products/shirt?tuix_review=signin&preview_theme_id=123'); run();
  expect(location.search).toBe('?preview_theme_id=123');
  expect(moduleScript()?.tuixBoot).toMatchObject({signIn:true,invitation:undefined,session:null});
  expect(document.querySelectorAll('script')).toHaveLength(1);
});
it('failed module loading provides a safe retry without restoring the invitation bearer', () => {
  history.replaceState(null, '', '/?tuix_review=' + 'a'.repeat(43)); run();
  document.querySelector('script')!.dispatchEvent(new Event('error'));
  expect(document.querySelector('tuix-review-retry')).not.toBeNull();
  expect(moduleScript()?.tuixBoot).toBeUndefined();
  expect(location.search).toBe('');
  expect(document.body.textContent).not.toContain('a'.repeat(43));
});
