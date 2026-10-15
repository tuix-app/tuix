import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Tuix, type TuixIdentity } from '../src/index.js';

const runtime = vi.hoisted(() => ({ init: vi.fn(), identify: vi.fn(), destroy: vi.fn() }));
const load = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime.js', () => ({ loadWidget: load }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
const config = { project: 'public-project', api: 'https://tuix.example.test' };
const alice = { id: 'alice', name: 'Alice', hash: 'a'.repeat(64), email: 'alice@example.test' };
const bob = { id: 'bob', name: 'Bob', hash: 'b'.repeat(64) };
beforeEach(() => {
  vi.clearAllMocks();
  load.mockReset().mockResolvedValue(runtime);
  const container = document.createElement('div'); document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.replaceChildren(); });
const render = async (user: TuixIdentity | null) => act(async () => root.render(<Tuix config={config} user={user} />));

it('loads once under Strict Mode and cleans up on unmount', async () => {
  await act(async () => root.render(<StrictMode><Tuix config={config} user={alice} /></StrictMode>));
  expect(runtime.init).toHaveBeenCalledTimes(1);
  expect(runtime.identify).toHaveBeenCalledExactlyOnceWith(alice);
  await act(async () => root.render(null));
  expect(runtime.destroy).toHaveBeenCalledTimes(2); // Before init and final cleanup.
});

it('stays idle for anonymous or explicitly disabled feedback', async () => {
  await render(null);
  await act(async () => root.render(<Tuix config={{ ...config, enabled: false }} user={alice} />));
  expect(load).not.toHaveBeenCalled();
});

it('preserves equivalent identities, switches users and destroys on logout', async () => {
  await render(alice);
  await render({ ...alice });
  expect(runtime.init).toHaveBeenCalledTimes(1);
  await render(bob);
  expect(runtime.identify).toHaveBeenLastCalledWith(bob);
  expect(runtime.destroy.mock.invocationCallOrder[1]).toBeLessThan(runtime.identify.mock.invocationCallOrder[1]);
  await render(null);
  expect(runtime.destroy).toHaveBeenCalledTimes(4);
});

it('cannot identify after logout while the import is pending', async () => {
  let finish!: (value: typeof runtime) => void;
  load.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render(alice);
  await render(null);
  await act(async () => { finish(runtime); });
  expect(runtime.init).not.toHaveBeenCalled();
  expect(runtime.identify).not.toHaveBeenCalled();
});

it('ignores a stale import when a new user takes over', async () => {
  let finish!: (value: typeof runtime) => void;
  load.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  await render(alice);
  await render(bob);
  await act(async () => { finish(runtime); });
  expect(runtime.identify).toHaveBeenCalledExactlyOnceWith(bob);
});

it('reports loader failures and can retry after a remount', async () => {
  const onError = vi.fn();
  load.mockRejectedValueOnce(new Error('network unavailable'));
  await act(async () => root.render(<Tuix config={config} user={alice} onError={onError} />));
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Tuix widget could not be loaded' }));
  await act(async () => root.render(null));
  await render(alice);
  expect(runtime.identify).toHaveBeenCalledExactlyOnceWith(alice);
});

it('rejects an overlapping mount without clearing the active widget', async () => {
  const onError = vi.fn();
  await act(async () => root.render(<><Tuix key="first" config={config} user={alice} />
    <Tuix key="second" config={config} user={bob} onError={onError} /></>));
  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'Mount only one Tuix component per application' }));
  expect(runtime.identify).toHaveBeenCalledExactlyOnceWith(alice);
  await act(async () => root.render(<><Tuix key="first" config={config} user={alice} /></>));
  expect(runtime.destroy).toHaveBeenCalledTimes(1);
});

it('reinitializes for changed configuration and rejects unsigned identities', async () => {
  await render(alice);
  await act(async () => root.render(<Tuix config={{ ...config, environment: 'production' }} user={alice} />));
  expect(runtime.init).toHaveBeenLastCalledWith({ ...config, environment: 'production' });
  const onError = vi.fn();
  await act(async () => root.render(<Tuix config={config} user={{ ...alice, hash: '' }} onError={onError} />));
  expect(onError).toHaveBeenCalled();
  expect(runtime.identify).toHaveBeenCalledTimes(2);
});
