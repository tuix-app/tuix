import { afterEach, expect, it, vi } from 'vitest';
import { liveUpdates } from '../src/live';
import type { Api } from '../src/api';
const sockets: FakeWebSocket[] = [];
class FakeWebSocket {
  readyState = 0;
  binaryType = '';
  onopen?: (event: unknown) => void;
  onclose?: (event: unknown) => void;
  onerror?: (event: unknown) => void;
  onmessage?: (event: {data: string}) => void;
  sent: string[] = [];
  constructor() { sockets.push(this); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.onclose?.({code: 1000}); }
  open() { this.readyState = 1; this.onopen?.({}); }
}
const api = {liveCredentials: async () => ({url: 'wss://api.example.test/widget/socket', token: 'dummy', params: {}})} as unknown as Api;
afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals(); sockets.length = 0;});
for (const state of ['connecting', 'joining', 'rejected', 'joined', 'transport-failed']) {
  it(`cleans every real Phoenix timer when stopped while ${state}`, async () => {
    vi.useFakeTimers(); vi.stubGlobal('WebSocket', FakeWebSocket);
    const refresh = vi.fn(async () => {});
    const live = liveUpdates(api, refresh);
    await Promise.resolve();
    const ws = sockets[0];
    if (state !== 'connecting') ws.open();
    if (state === 'rejected' || state === 'joined') {
      const join = ws.sent.map(s=>JSON.parse(s)).find(m=>m[3]==='phx_join');
      ws.onmessage?.({data: JSON.stringify([join[0], join[1], 'updates', 'phx_reply', {status: state === 'joined' ? 'ok' : 'error', response: {}}])});
    }
    if (state === 'transport-failed') ws.onerror?.({});
    live.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(120000);
    expect(sockets).toHaveLength(1);
    expect(refresh).not.toHaveBeenCalled();
  });
}
