// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.example.test/"}
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mountStorefrontRecovery } from '../src/storefront-recovery';
const config = {project:'pk_shop',api:'https://api.example.test',nonce:'fixture-nonce'};
let root: ShadowRoot, destroy: (() => void) | undefined;
beforeEach(() => {
  const attach = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function(this: HTMLElement, options) { root = attach.call(this, options); return root; });
});
afterEach(() => { destroy?.(); destroy = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
const submit = () => root.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles:true,cancelable:true}));
it('isolates the panel, supports dismiss/reopen and sends only an explicit email request', async () => {
  const fetch = vi.fn().mockResolvedValue({ok:true,json:async()=>({status:'accepted'})}); vi.stubGlobal('fetch',fetch);
  destroy = mountStorefrontRecovery(config, 'expired');
  expect(document.querySelector('tuix-review-signin')!.shadowRoot).toBeNull();
  expect(root.querySelector('style')!.nonce).toBe('fixture-nonce');
  expect(root.querySelector('p')!.textContent).toContain('no longer valid');
  const email = root.querySelector('input')!;
  expect(root.activeElement).toBe(email); expect(fetch).not.toHaveBeenCalled();
  root.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  expect(root.querySelector('section')!.hidden).toBe(true);
  const launcher = root.querySelector<HTMLButtonElement>('.review-launcher')!;
  expect(root.activeElement).toBe(launcher);
  launcher.click(); expect(root.activeElement).toBe(email);
  submit(); expect(fetch).not.toHaveBeenCalled();
  email.value = 'invited@example.test'; submit();
  await vi.waitFor(()=>expect(root.querySelector('[role=status]')!.textContent).toContain('If this address has an active invitation'));
  expect(email.value).toBe('');
  expect(fetch).toHaveBeenCalledExactlyOnceWith('https://api.example.test/v1/shopify/reviewer/request-link', expect.objectContaining({credentials:'omit',redirect:'error',body:JSON.stringify({email:'invited@example.test'}),headers:{'x-tuix-project':'pk_shop','x-tuix-environment':'production','x-tuix-widget':'2','content-type':'application/json'}}));
});
it('prevents duplicate submission and retains the email after a failed request', async () => {
  let reject!: (error: Error) => void;
  const fetch = vi.fn().mockImplementation(()=>new Promise((_, no)=>{reject=no;})); vi.stubGlobal('fetch',fetch);
  destroy = mountStorefrontRecovery(config, 'unavailable');
  const email = root.querySelector('input')!; email.value = 'invited@example.test';
  submit(); submit(); expect(fetch).toHaveBeenCalledTimes(1);
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
  reject(new TypeError('offline'));
  await vi.waitFor(()=>expect(root.querySelector('[role=status]')!.textContent).toContain('Check your connection'));
  expect(email.value).toBe('invited@example.test');
  expect(root.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
});
it('offers Polish copy and aborts pending work on teardown', async () => {
  vi.spyOn(navigator, 'language', 'get').mockReturnValue('pl-PL');
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch',vi.fn().mockImplementation((_url, init)=>{signal=init.signal; return new Promise(()=>{});}));
  destroy = mountStorefrontRecovery(config, 'signin');
  expect(root.querySelector('h2')!.textContent).toBe('Zaloguj się do recenzji');
  root.querySelector('input')!.value = 'reviewer@example.test'; submit();
  destroy(); destroy=undefined;
  expect(signal!.aborted).toBe(true);
  expect(document.querySelector('tuix-review-signin')).toBeNull();
});
it('keeps keys pressed in the sign-in from storefront shortcuts, except Escape', () => {
  vi.stubGlobal('fetch', vi.fn());
  destroy = mountStorefrontRecovery(config, 'signin');
  const keys: string[] = [], shortcut = (event: KeyboardEvent) => { keys.push(event.key); };
  document.addEventListener('keydown', shortcut);
  try {
    const press = (target: Element, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
    press(root.querySelector('button[type=submit]')!, ' '); press(root.querySelector('.review-launcher')!, 'Enter');
    for (const key of [' ', '/', 'Escape']) press(root.querySelector('input')!, key);
    expect(keys).toEqual(['Escape']);
    expect(root.querySelector('section')!.hidden).toBe(true);
  } finally { document.removeEventListener('keydown', shortcut); }
});
