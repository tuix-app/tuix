import { Socket, type Channel } from 'phoenix';
import type { Api } from './api';

/** Active-panel invalidation only; HTTP remains the content/authorization boundary. */
export function liveUpdates(api: Api, refresh: () => Promise<void>) {
  let stopped = false, connected = false, pending = false, running = false;
  let socket: Socket | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  let channel: Channel | undefined;
  let lastRefresh = 0;
  const schedule = () => {
    if (stopped) return;
    pending = true;
    if (timer || running) return;
    timer = setTimeout(async () => {
      timer = undefined;
      if (stopped) return;
      pending = false; running = true; lastRefresh = Date.now();
      try { await refresh(); } catch { /* Active polling recovers failed reads. */ }
      finally { running = false; if (pending) schedule(); }
    }, Math.max(0, 1000 - (Date.now() - lastRefresh)));
  };
  const stop = () => {
    if (stopped) return;
    stopped = true; connected = false;
    if (timer) clearTimeout(timer);
    channel?.leave();
    socket?.disconnect();
  };
  void (async () => {
    try {
      if (typeof WebSocket === 'undefined') return;
      const credentials = await api.liveCredentials();
      if (stopped) return;
      socket = new Socket(credentials.url, {
        authToken: credentials.token,
        params: credentials.params,
        // A failed mount falls back to existing polling; reopening retries.
        reconnectAfterMs: () => 60_000,
      });
      const failed = () => stop();
      socket.onError(failed); socket.onClose(failed);
      channel = socket.channel('updates', {});
      channel.on('changed', schedule);
      channel.onError(failed); channel.onClose(failed);
      channel.join().receive('ok', () => { connected = true; schedule(); })
        .receive('error', failed).receive('timeout', failed);
      socket.connect();
    } catch { stop(); }
  })();
  return { connected: () => connected, stop };
}
