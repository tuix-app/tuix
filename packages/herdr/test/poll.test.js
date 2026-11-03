import assert from "node:assert/strict";
import { test } from "node:test";
import { OAuthError } from "../mods/tuix/lib/oauth.js";
import { browserUrl, onStartError, pollStep } from "../mods/tuix/lib/poll.js";

const device = (over = {}) => ({ interval: 5, expiresAt: 100_000, failures: 0, ...over });
const result = (status, tokens) => ({ result: { status, tokens } });

test("pending waits one interval", () => {
  assert.deepEqual(pollStep(device(), result("pending"), 0), { type: "wait", seconds: 5 });
});

test("slow_down adds 5 seconds for this and every later poll", () => {
  const d = device();
  assert.deepEqual(pollStep(d, result("slow_down"), 0), { type: "wait", seconds: 10 });
  assert.deepEqual(pollStep(d, result("pending"), 0), { type: "wait", seconds: 10 });
  assert.deepEqual(pollStep(d, result("slow_down"), 0), { type: "wait", seconds: 15 });
});

test("ok finishes with the tokens, even at the expiry edge", () => {
  const tokens = { access_token: "a" };
  assert.deepEqual(pollStep(device(), result("ok", tokens), 200_000), { type: "done", tokens });
});

test("past the expiry the sign-in stops, whatever the poll said", () => {
  for (const o of [result("pending"), result("slow_down"), { error: new TypeError("offline") }]) {
    const step = pollStep(device(), o, 100_000);
    assert.equal(step.type, "fail");
    assert.equal(step.error.code, "expired_token");
  }
});

test("denied and expired end the sign-in with their codes", () => {
  assert.equal(pollStep(device(), result("denied"), 0).error.code, "access_denied");
  assert.equal(pollStep(device(), result("expired"), 0).error.code, "expired_token");
});

test("transient errors back off and keep waiting; a good poll resets the backoff", () => {
  const d = device();
  assert.deepEqual(pollStep(d, { error: new TypeError("offline") }, 0), { type: "wait", seconds: 10 });
  assert.deepEqual(pollStep(d, { error: new OAuthError("http_503") }, 0), { type: "wait", seconds: 20 });
  assert.deepEqual(pollStep(d, { error: new OAuthError("server_error") }, 0), { type: "wait", seconds: 40 });
  assert.deepEqual(pollStep(d, { error: new OAuthError("temporarily_unavailable") }, 0), { type: "wait", seconds: 60 });
  assert.deepEqual(pollStep(d, result("pending"), 0), { type: "wait", seconds: 5 });
  assert.equal(d.failures, 0);
});

test("other errors end the sign-in", () => {
  const error = new OAuthError("invalid_grant");
  assert.deepEqual(pollStep(device(), { error }, 0), { type: "fail", error });
});

test("a stored client id the server forgot is registered again once; a fresh one is not retried", () => {
  assert.equal(onStartError(true, new OAuthError("invalid_client")), "reregister");
  assert.equal(onStartError(false, new OAuthError("invalid_client")), "fail");
  assert.equal(onStartError(true, new OAuthError("http_500")), "fail");
  assert.equal(onStartError(true, new TypeError("offline")), "fail");
});

test("browserUrl opens only the Tuix origin over https (http for localhost)", () => {
  const code = (complete, plain) => ({ verification_uri_complete: complete, verification_uri: plain });
  assert.equal(browserUrl(code("https://tuix.app/device?user_code=A", "https://tuix.app/device"), "https://tuix.app"), "https://tuix.app/device?user_code=A");
  assert.equal(browserUrl(code("https://evil.example/x", "https://tuix.app/device"), "https://tuix.app"), "https://tuix.app/device");
  assert.equal(browserUrl(code("javascript:alert(1)", "https://evil.example/x"), "https://tuix.app"), null);
  assert.equal(browserUrl(code("http://tuix.app/device", "http://tuix.app/device"), "https://tuix.app"), null);
  assert.equal(browserUrl(code("http://localhost:4000/device", "x"), "http://localhost:4000"), "http://localhost:4000/device");
  assert.equal(browserUrl(code("https://u:p@tuix.app/device", "x"), "https://tuix.app"), null);
});

test("a malformed token response fails the sign-in at once", () => {
  const error = new OAuthError("invalid_response");
  assert.deepEqual(pollStep(device(), { error }, 0), { type: "fail", error });
});

test("no wait outlasts the code's expiry", () => {
  const d = device({ expiresAt: 12_000, interval: 10 });
  assert.deepEqual(pollStep(d, result("pending"), 8_000), { type: "wait", seconds: 4 });
  assert.deepEqual(pollStep(d, result("slow_down"), 8_000), { type: "wait", seconds: 4 });
  assert.deepEqual(pollStep(d, { error: new TypeError("offline") }, 8_000), { type: "wait", seconds: 4 });
  assert.deepEqual(pollStep(d, result("pending"), 11_900), { type: "wait", seconds: 1 });
});
