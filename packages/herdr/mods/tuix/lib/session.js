// The signed-in session: OAuth tokens held in memory only, refreshed before they expire and once
// after a 401. Side effects (fetch, clock) are injected; the tokens are never written anywhere.
import { McpError } from "./mcp.js";
import { OAuthError, refresh } from "./oauth.js";

export const REFRESH_AHEAD_MS = 5 * 60 * 1000; // refresh this long before the access token expires
const EXPIRY_SLACK_MS = 30 * 1000; // a token this close to expiring is refreshed before it is used
const MAX_TIMER_MS = 2 ** 31 - 1;

// A refresh the server refused (revoked, expired, unknown client) ends the session; a network error or a 5xx
// does not: the session is still good and the request can be tried again.
const TRANSIENT = /^(http_5\d\d|server_error|temporarily_unavailable)$/;
export const isTransient = (e) => !(e instanceof OAuthError) || TRANSIENT.test(e.code);

const MIN_REFRESH_DELAY_MS = 30 * 1000;

export function createSession({ meta, clientId, tokens, fetch, now = Date.now }) {
  let current = tokens, inflight = null, ended = false, issuedAt = now();

  async function refreshNow(stale) {
    if (ended || !current?.refresh_token) { ended = true; throw new McpError("unauthorized"); }
    if (stale !== undefined && current.access_token !== stale) return current; // someone else already refreshed
    inflight ??= refresh(meta, clientId, current.refresh_token, fetch, now)
      // Recorded even after forget(): the server rotated the refresh token, and forget() hands the new one to revoke.
      .then((next) => { current = next; issuedAt = now(); return next; })
      .catch((e) => { if (!isTransient(e)) { ended = true; throw new McpError("unauthorized"); } throw e; })
      .finally(() => { inflight = null; });
    return inflight;
  }

  return {
    meta, clientId,
    get ended() { return ended; },
    // Sync read of the access token in use (to tell a stale 401 from a fresh one).
    peek: () => (ended ? null : current?.access_token ?? null),
    async access() {
      if (ended) throw new McpError("unauthorized");
      if (current.expires_at != null && current.refresh_token && now() >= current.expires_at - EXPIRY_SLACK_MS) await refreshNow();
      if (ended) throw new McpError("unauthorized"); // signed out while the refresh was under way
      return current.access_token;
    },
    refreshNow,
    // Milliseconds until the next scheduled refresh, or null when the token has no expiry. The lead time is five
    // minutes, or half the lifetime for a short-lived token, and never less than 30 s from now.
    msUntilRefresh() {
      if (ended || current?.expires_at == null || !current.refresh_token) return null;
      const lifetime = Math.max(0, current.expires_at - issuedAt), ahead = Math.min(REFRESH_AHEAD_MS, lifetime / 2);
      return Math.min(MAX_TIMER_MS, Math.max(MIN_REFRESH_DELAY_MS, current.expires_at - ahead - now()));
    },
    // Ends the session at once and resolves to the refresh token to revoke: the latest one, after any refresh
    // already under way has finished (it may have rotated the token). The tokens are gone when it resolves.
    async forget() {
      ended = true;
      try { await inflight; } catch { /* a failed refresh leaves the old token, which is what gets revoked */ }
      const refreshToken = current?.refresh_token ?? null;
      current = null;
      return refreshToken;
    },
  };
}

// The client, plus one refresh-and-retry when a call comes back unauthorized.
export function withRefresh(client, session) {
  const guarded = (method) => async (...args) => {
    const used = session.peek();
    try {
      return await client[method](...args);
    } catch (e) {
      if (!(e instanceof McpError && e.code === "unauthorized") || session.ended) throw e;
      // `used` is the token this call was sent with. If another call refreshed since, refreshNow skips the request
      // and this call just retries with the newer token; if `used` is already stale the outcome is the same.
      await session.refreshNow(used); // throws unauthorized when the session is over
      return client[method](...args);
    }
  };
  return { connect: guarded("connect"), call: guarded("call"), tools: guarded("tools") };
}

// What the sign-in view says when signing in fails.
export function signinMessage(e) {
  if (e instanceof OAuthError) {
    if (e.code === "access_denied") return "Sign-in was declined.";
    if (e.code === "expired_token") return "The code expired. Try again.";
    if (e.code === "unsupported" || e.code === "http_404") return "This Tuix doesn't support sign-in from Herdr yet.";
    if (e.code === "invalid_origin") return "Enter the address of your Tuix, like https://tuix.app.";
    if (e.code === "invalid_metadata") return "That address doesn't look like a Tuix server.";
    return `Couldn't sign in (${e.code}). Try again.`;
  }
  return "Can't reach Tuix. Try again.";
}
