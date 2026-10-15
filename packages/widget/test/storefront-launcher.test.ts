// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.example.test/"}
import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ mount: vi.fn(), open: vi.fn() }));
vi.mock('../src/core', () => ({ mount: mock.mount }));
import { activateStorefront } from '../src/storefront';
import { tuix } from '../src/index';
afterEach(() => { tuix.destroy(); vi.restoreAllMocks(); vi.unstubAllGlobals(); document.body.replaceChildren(); });
it.each([false, true])('uses server appearance before opening and honors automatic opening=%s', async showPinsOnLoad => {
  let root: ShadowRoot | undefined;
  const attach = HTMLElement.prototype.attachShadow;
  vi.spyOn(HTMLElement.prototype, 'attachShadow').mockImplementation(function(this: HTMLElement, options) {
    root = attach.call(this, options); return root;
  });
  mock.mount.mockReset(); mock.open.mockReset();
  mock.mount.mockReturnValue({ open: mock.open, close() {}, destroy() {} });
  const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({
    token: 'dummy', user: {id:'reviewer',name:'Reviewer'}, expires_at: new Date(Date.now()+3600000).toISOString(),
    settings: {position:'bottom-left', theme:{accent:'#ffffff'}, showPinsOnLoad,
      project:'wrong-project', api:'https://wrong.example', capture:{console:true}},
  }) });
  vi.stubGlobal('fetch',fetch);
  expect(await activateStorefront({project:'fixture',session:'s'.repeat(43),template:'index',handle:''})).toBe(true);
  const launcher = root!.querySelector<HTMLButtonElement>('#tuix-launcher')!;
  expect(launcher.style.left).toBe('16px'); expect(launcher.style.right).toBe('');
  // A stored project accent is ignored: every site shows the tuix palette.
  expect(launcher.style.background).toBe(''); expect(launcher.style.color).toBe('');
  expect(fetch).toHaveBeenCalledTimes(1);
  if (showPinsOnLoad) {
    await vi.waitFor(() => expect(mock.open).toHaveBeenCalledTimes(1));
    expect(mock.mount.mock.calls[0][2]).toMatchObject({project:'fixture',position:'bottom-left'});
    expect(mock.mount.mock.calls[0][2].capture).toBeUndefined();
    expect(mock.mount.mock.calls[0][2].api).toBeUndefined();
  } else expect(mock.mount).not.toHaveBeenCalled();
});
