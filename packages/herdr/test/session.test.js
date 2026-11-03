import assert from "node:assert/strict";
import { test } from "node:test";
import { McpError } from "../mods/tuix/lib/mcp.js";
import { createSession, withRefresh } from "../mods/tuix/lib/session.js";

const meta = { token_endpoint: "https://tuix.app/oauth/token" };
let clock = 1_000_000;
const now = () => clock;

// A token endpoint that answers each refresh from `replies` (status, body) and counts the requests.
function tokenFetch(...replies) {
  const f = async (_url, options) => {
    f.bodies.push(Object.fromEntries(new URLSearchParams(options.body)));
    const [status, body] = replies[Math.min(f.bodies.length - 1, replies.length - 1)];
    if (status === "network") throw new TypeError("offline");
    return { status, json: async () => body };
  };
  f.bodies = [];
  return f;
}
const ok = (access, refresh) => [200, { access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600 }];
const start = (fetch, tokens = { access_token: "a1", refresh_token: "r1", expires_at: clock + 3600_000 }) =>
  createSession({ meta, clientId: "cid", tokens, fetch, now });

test("access returns the current token and does not refresh while it is fresh", async () => {
  const f = tokenFetch(ok("a2", "r2"));
  assert.equal(await start(f).access(), "a1");
  assert.equal(f.bodies.length, 0);
});

test("an expired token is refreshed before use, with the stored refresh token", async () => {
  clock = 1_000_000;
  const f = tokenFetch(ok("a2", "r2"));
  const s = start(f, { access_token: "a1", refresh_token: "r1", expires_at: clock + 10_000 });
  assert.equal(await s.access(), "a2");
  assert.equal(f.bodies[0].refresh_token, "r1");
  assert.equal(await s.forget(), "r2");
});

test("concurrent refreshes share one request", async () => {
  const f = tokenFetch(ok("a2", "r2"));
  const s = start(f);
  await Promise.all([s.refreshNow(), s.refreshNow(), s.refreshNow()]);
  assert.equal(f.bodies.length, 1);
});

test("msUntilRefresh: five minutes before expiry, half the lifetime for short tokens, never under 30 s", () => {
  clock = 1_000_000;
  assert.equal(start(tokenFetch(), { access_token: "a", refresh_token: "r", expires_at: clock + 3600_000 }).msUntilRefresh(), 3600_000 - 300_000);
  assert.equal(start(tokenFetch(), { access_token: "a", refresh_token: "r", expires_at: clock + 60_000 }).msUntilRefresh(), 30_000);
  assert.equal(start(tokenFetch(), { access_token: "a", refresh_token: "r", expires_at: clock + 400_000 }).msUntilRefresh(), 200_000);
  assert.equal(start(tokenFetch(), { access_token: "a", refresh_token: "r", expires_at: clock + 1000 }).msUntilRefresh(), 30_000);
  assert.equal(start(tokenFetch(), { access_token: "a", refresh_token: "r", expires_at: null }).msUntilRefresh(), null);
});

test("a refused refresh ends the session as unauthorized and later calls do not hit the server", async () => {
  const f = tokenFetch([400, { error: "invalid_grant" }]);
  const s = start(f);
  await assert.rejects(s.refreshNow(), (e) => e instanceof McpError && e.code === "unauthorized");
  assert.equal(s.ended, true);
  await assert.rejects(s.access(), (e) => e.code === "unauthorized");
  assert.equal(f.bodies.length, 1);
});

test("a network error or a 5xx keeps the session so the refresh can be retried", async () => {
  for (const reply of [["network"], [503, { error: "server_error" }]]) {
    const s = start(tokenFetch(reply, ok("a2", "r2")));
    await assert.rejects(s.refreshNow(), (e) => !(e instanceof McpError));
    assert.equal(s.ended, false);
    await s.refreshNow();
    assert.equal(s.peek(), "a2");
  }
});

test("without a refresh token an unauthorized call ends the session", async () => {
  const s = start(tokenFetch(), { access_token: "a1", refresh_token: null, expires_at: null });
  await assert.rejects(s.refreshNow(), (e) => e.code === "unauthorized");
});

test("forget drops the tokens", async () => {
  const s = start(tokenFetch());
  assert.equal(await s.forget(), "r1"); // the refresh token to revoke
  assert.equal(await s.forget(), null);
  assert.equal(s.peek(), null);
  await assert.rejects(s.access(), (e) => e.code === "unauthorized");
});

function fakeClient(session, fail) {
  const c = { seen: [], async call(tool) { c.seen.push(session.peek()); if (fail(c.seen.length)) throw new McpError("unauthorized"); return { tool }; } };
  return c;
}

test("withRefresh retries once after a 401 with the refreshed token", async () => {
  const f = tokenFetch(ok("a2", "r2"));
  const s = start(f), c = fakeClient(s, (n) => n === 1);
  assert.deepEqual(await withRefresh(c, s).call("list_projects"), { tool: "list_projects" });
  assert.deepEqual(c.seen, ["a1", "a2"]);
  assert.equal(f.bodies.length, 1);
});

test("withRefresh does not refresh twice when another call already did", async () => {
  const f = tokenFetch(ok("a2", "r2"));
  const s = start(f), c = fakeClient(s, (n) => n === 1 || n === 2);
  const guarded = withRefresh(c, s);
  await Promise.all([guarded.call("x"), guarded.call("y")]);
  assert.equal(f.bodies.length, 1);
});

test("withRefresh gives up after one retry and when the refresh is refused", async () => {
  const s1 = start(tokenFetch(ok("a2", "r2"))), c1 = fakeClient(s1, () => true);
  await assert.rejects(withRefresh(c1, s1).call("x"), (e) => e.code === "unauthorized");
  assert.equal(c1.seen.length, 2);
  const s2 = start(tokenFetch([400, { error: "invalid_grant" }])), c2 = fakeClient(s2, () => true);
  await assert.rejects(withRefresh(c2, s2).call("x"), (e) => e.code === "unauthorized");
  assert.equal(c2.seen.length, 1);
});

test("withRefresh passes other errors through", async () => {
  const s = start(tokenFetch()), c = { call: async () => { throw new McpError("rate_limited"); } };
  await assert.rejects(withRefresh(c, s).call("x"), (e) => e.code === "rate_limited");
});

test("signinMessage uses the exact sign-in copy", async () => {
  const { signinMessage } = await import("../mods/tuix/lib/session.js");
  const { OAuthError } = await import("../mods/tuix/lib/oauth.js");
  assert.equal(signinMessage(new OAuthError("access_denied")), "Sign-in was declined.");
  assert.equal(signinMessage(new OAuthError("expired_token")), "The code expired. Try again.");
  assert.equal(signinMessage(new OAuthError("unsupported")), "This Tuix doesn't support sign-in from Herdr yet.");
  assert.equal(signinMessage(new OAuthError("http_404")), "This Tuix doesn't support sign-in from Herdr yet.");
  assert.equal(signinMessage(new TypeError("offline")), "Can't reach Tuix. Try again.");
});

test("forget during a refresh in flight resolves to the rotated refresh token and the tokens never come back", async () => {
  clock = 1_000_000;
  let release;
  const f = async () => { await new Promise((r) => { release = r; }); return { status: 200, json: async () => ok("a2", "r2")[1] }; };
  const s = start(f);
  const pending = s.refreshNow().catch(() => {});
  const forgotten = s.forget();
  assert.equal(s.peek(), null);
  release();
  assert.equal(await forgotten, "r2");
  await pending;
  assert.equal(s.peek(), null);
  assert.equal(await s.forget(), null);
});

test("access after a forget during its refresh is unauthorized, not a TypeError", async () => {
  clock = 1_000_000;
  let release;
  const f = async () => { await new Promise((r) => { release = r; }); return { status: 200, json: async () => ok("a2", "r2")[1] }; };
  const s = start(f, { access_token: "a1", refresh_token: "r1", expires_at: clock + 1000 });
  const access = s.access();
  const forgotten = s.forget();
  release();
  await assert.rejects(access, (e) => e instanceof McpError && e.code === "unauthorized");
  await forgotten;
});
