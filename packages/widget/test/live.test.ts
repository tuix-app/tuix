import { afterEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ sockets: [] as any[] }));
vi.mock('phoenix', () => ({Socket: class {
  callbacks: Record<string, () => void> = {};
  receives: Record<string, () => void> = {};
  disconnect = vi.fn(); connect = vi.fn();
  constructor(public url: string, public options: unknown) { mock.sockets.push(this); }
  onError(fn: () => void) { this.callbacks.error = fn; }
  onClose(fn: () => void) { this.callbacks.close = fn; }
  channel() { return {leave: vi.fn(), on: (name: string, fn: () => void) => this.callbacks[name] = fn, onError: () => {}, onClose: () => {}, join: () => { const push = {receive: (name: string, fn: () => void) => {this.receives[name] = fn; return push;}};return push;}}; }
}}));
import { liveUpdates } from '../src/live';
import type { Api } from '../src/api';
const credentials = {url: 'wss://api.example.test/widget/socket', token: 'dummy', params: {project: 'pk', environment: 'uat', origin: 'https://host.example.test'}};
const api = {liveCredentials: async () => credentials} as Api;
afterEach(() => {vi.useRealTimers();vi.unstubAllGlobals();mock.sockets.length = 0;});

it('coalesces signals and stops queued work and the socket on close', async () => {
  vi.useFakeTimers(); vi.stubGlobal('WebSocket', class {});
  const refresh = vi.fn(async () => {});
  const live = liveUpdates(api, refresh);
  await Promise.resolve(); const socket = mock.sockets[0];
  expect(socket.options.authToken).toBe('dummy');
  expect(socket.options.params).not.toHaveProperty('token');
  socket.receives.ok();
  for(let i=0;i<20;i++) socket.callbacks.changed();
  await vi.advanceTimersByTimeAsync(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  socket.callbacks.changed();
  live.stop();
  await vi.advanceTimersByTimeAsync(60000);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(socket.disconnect).toHaveBeenCalled();
  expect(live.connected()).toBe(false);
});

it('does not connect when closed during identity lookup', async () => {
  vi.stubGlobal('WebSocket', class {});
  let resolve!: (value: typeof credentials) => void;
  const live = liveUpdates({liveCredentials: () => new Promise(r=>resolve=r)} as Api, async () => {});
  live.stop();resolve(credentials);await Promise.resolve();
  expect(mock.sockets).toHaveLength(0);
});

it('drops to polling after a transport failure without keeping reconnect timers', async () => {
  vi.stubGlobal('WebSocket', class {});
  const live = liveUpdates(api, async () => {});
  await Promise.resolve(); const socket = mock.sockets[0];
  socket.receives.ok();socket.callbacks.error();
  expect(live.connected()).toBe(false);
  expect(socket.disconnect).toHaveBeenCalled();
});
