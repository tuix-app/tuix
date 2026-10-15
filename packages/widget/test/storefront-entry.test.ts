// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ activate: vi.fn(), recovery: vi.fn() }));
vi.mock('../src/storefront', () => ({ activateStorefront: mocks.activate }));
vi.mock('../src/storefront-recovery', () => ({ mountStorefrontRecovery: mocks.recovery }));
afterEach(() => { document.head.replaceChildren(); vi.resetAllMocks(); vi.resetModules(); });

it('consumes an element-local handoff and clears transient credentials after activation', async () => {
  const script = document.createElement('script') as HTMLScriptElement & { tuixBoot?: unknown };
  const boot = { project: 'pk_fixture', invitation: 'a'.repeat(43), session: 's'.repeat(43) };
  script.setAttribute('data-tuix-storefront', ''); script.tuixBoot = boot; document.head.append(script);
  let finish!: () => void;
  const pending = new Promise<void>(resolve => { finish = resolve; });
  mocks.activate.mockReturnValue(pending);
  await import('../src/storefront-entry');
  expect(mocks.activate).toHaveBeenCalledWith(boot, expect.any(Function));
  expect(script.tuixBoot).toBeUndefined();
  finish(); await pending; await Promise.resolve(); await Promise.resolve();
  expect(boot.invitation).toBeUndefined(); expect(boot.session).toBeUndefined();
});

it('stays dormant without a handoff', async () => {
  await import('../src/storefront-entry');
  expect(mocks.activate).not.toHaveBeenCalled();
});
