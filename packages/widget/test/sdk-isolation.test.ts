// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
const lifecycle = vi.hoisted(() => ({ open: vi.fn(), close: vi.fn(), destroy: vi.fn(), reportError: vi.fn() }));
vi.mock('../src/core', () => ({ mount: vi.fn(() => lifecycle) }));
import { tuix } from '../src/index';
afterEach(() => { vi.restoreAllMocks(); tuix.destroy(); vi.resetAllMocks(); document.querySelectorAll('tuix-widget').forEach(node => node.remove()); });
function identify() { tuix.init({ project: 'fixture' }); tuix.identify({ id: 'alice', name: 'Alice' }); }

it('contains throwing DOM calls and can activate again after the host recovers', async () => {
  vi.spyOn(Element.prototype, 'attachShadow').mockImplementationOnce(() => { throw Error('fixture'); });
  expect(identify).not.toThrow();
  await expect(tuix.open()).resolves.toBeUndefined();
  expect(document.querySelectorAll('tuix-widget')).toHaveLength(1);
});

it('contains asynchronous activation failure before import handling', async () => {
  identify();
  vi.spyOn(performance, 'now').mockImplementationOnce(() => { throw Error('fixture'); });
  await expect(tuix.open()).resolves.toBeUndefined();
  await expect(tuix.open()).resolves.toBeUndefined();
});

it('contains core lifecycle failures and retires the old host despite failed cleanup', async () => {
  identify(); await tuix.open();
  lifecycle.open.mockImplementationOnce(() => { throw Error('fixture'); });
  await expect(tuix.open()).resolves.toBeUndefined();
  lifecycle.close.mockImplementationOnce(() => { throw Error('fixture'); });
  expect(() => tuix.close()).not.toThrow();
  expect(lifecycle.reportError).toHaveBeenCalled();
  lifecycle.destroy.mockImplementationOnce(() => { throw Error('fixture'); });
  lifecycle.reportError.mockImplementationOnce(() => { throw Error('reporting fixture'); });
  expect(() => tuix.destroy()).not.toThrow();
  expect(document.querySelector('tuix-widget')).toBeNull();
  identify(); expect(document.querySelectorAll('tuix-widget')).toHaveLength(1);
});
