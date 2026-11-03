import assert from "node:assert/strict";
import { test } from "node:test";
import { OAuthError, discover, pollOnce, refresh, registerClient, startDevice, urlencode } from "../mods/tuix/lib/oauth.js";

function fakeFetch(status, body) {
  const f = async (url, options) => {
    f.last = { url, options };
    return { status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return f;
}

const meta = {
  token_endpoint: "https://tuix.app/oauth/token",
  device_authorization_endpoint: "https://tuix.app/oauth/device",
  registration_endpoint: "https://tuix.app/oauth/register",
};
const now = () => 1_000_000;
const form = (f) => Object.fromEntries(new URLSearchParams(f.last.options.body));

test("urlencode escapes keys and values", () => {
  assert.equal(urlencode({ a: "b c", "d&": "e=f" }), "a=b%20c&d%26=e%3Df");
});

test("discover reads the metadata document", async () => {
  const f = fakeFetch(200, { ...meta, revocation_endpoint: "https://tuix.app/oauth/revoke", issuer: "https://tuix.app/" });
  const got = await discover("https://tuix.app/anything", f);
  assert.equal(f.last.url, "https://tuix.app/.well-known/oauth-authorization-server");
  assert.equal(got.token_endpoint, meta.token_endpoint);
  assert.equal(got.device_authorization_endpoint, meta.device_authorization_endpoint);
  assert.equal(got.registration_endpoint, meta.registration_endpoint);
  assert.equal(got.revocation_endpoint, "https://tuix.app/oauth/revoke");
});

test("discover without a device endpoint is unsupported", async () => {
  const f = fakeFetch(200, { issuer: "https://tuix.app", token_endpoint: meta.token_endpoint });
  await assert.rejects(discover("https://tuix.app", f), (e) => e instanceof OAuthError && e.code === "unsupported");
});

test("discover on an HTTP error throws http_<status>", async () => {
  await assert.rejects(discover("https://tuix.app", fakeFetch(404, {})), { code: "http_404" });
});

test("registerClient posts the public-client body and returns client_id", async () => {
  const f = fakeFetch(201, { client_id: "cid_1" });
  assert.equal(await registerClient(meta, f), "cid_1");
  assert.equal(f.last.url, meta.registration_endpoint);
  assert.equal(f.last.options.method, "POST");
  assert.equal(f.last.options.headers["content-type"], "application/json");
  assert.deepEqual(JSON.parse(f.last.options.body), {
    client_name: "Herdr",
    grant_types: ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
    token_endpoint_auth_method: "none",
  });
});

test("registerClient failure throws the server error code", async () => {
  await assert.rejects(registerClient(meta, fakeFetch(400, { error: "invalid_client_metadata" })), { code: "invalid_client_metadata" });
});

test("startDevice posts client_id as a form and returns the grant", async () => {
  const grant = {
    device_code: "dc",
    user_code: "ABCD-EFGH",
    verification_uri: "https://tuix.app/device",
    verification_uri_complete: "https://tuix.app/device?user_code=ABCD-EFGH",
    expires_in: 600,
    interval: 5,
  };
  const f = fakeFetch(200, grant);
  assert.deepEqual(await startDevice(meta, "cid", f), grant);
  assert.equal(f.last.url, meta.device_authorization_endpoint);
  assert.equal(f.last.options.headers["content-type"], "application/x-www-form-urlencoded");
  assert.equal(f.last.options.body, "client_id=cid&scope=full");
});

test("startDevice failure throws", async () => {
  await assert.rejects(startDevice(meta, "cid", fakeFetch(400, { error: "invalid_client" })), { code: "invalid_client" });
});

test("pollOnce success returns tokens with expires_at", async () => {
  const f = fakeFetch(200, { access_token: "at", token_type: "Bearer", expires_in: 3600, refresh_token: "rt" });
  const got = await pollOnce(meta, "cid", "dc", f, now);
  assert.deepEqual(got, { status: "ok", tokens: { access_token: "at", refresh_token: "rt", expires_at: 1_000_000 + 3_600_000 } });
  assert.equal(f.last.url, meta.token_endpoint);
  assert.equal(f.last.options.headers["content-type"], "application/x-www-form-urlencoded");
  assert.deepEqual(form(f), {
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    device_code: "dc",
    client_id: "cid",
  });
});

for (const [error, status] of [
  ["authorization_pending", "pending"],
  ["slow_down", "slow_down"],
  ["access_denied", "denied"],
  ["expired_token", "expired"],
]) {
  test(`pollOnce maps ${error} to ${status}`, async () => {
    assert.deepEqual(await pollOnce(meta, "cid", "dc", fakeFetch(400, { error }), now), { status });
  });
}

test("pollOnce throws other errors", async () => {
  await assert.rejects(pollOnce(meta, "cid", "dc", fakeFetch(400, { error: "invalid_client" }), now), { code: "invalid_client" });
  await assert.rejects(pollOnce(meta, "cid", "dc", fakeFetch(500, {}), now), { code: "http_500" });
});

test("refresh rotates the refresh token", async () => {
  const f = fakeFetch(200, { access_token: "at2", token_type: "bearer", expires_in: 60, refresh_token: "rt2" });
  const got = await refresh(meta, "cid", "rt1", f, now);
  assert.deepEqual(got, { access_token: "at2", refresh_token: "rt2", expires_at: 1_060_000 });
  assert.deepEqual(form(f), { grant_type: "refresh_token", refresh_token: "rt1", client_id: "cid" });
});

test("refresh invalid_grant throws OAuthError", async () => {
  await assert.rejects(refresh(meta, "cid", "rt1", fakeFetch(400, { error: "invalid_grant" }), now), (e) => {
    return e instanceof OAuthError && e.code === "invalid_grant";
  });
});

const goodMeta = { issuer: "https://tuix.app", ...meta };

test("discover rejects an issuer mismatch", async () => {
  await assert.rejects(discover("https://tuix.app", fakeFetch(200, { ...goodMeta, issuer: "https://evil.example" })), { code: "invalid_metadata" });
  await assert.rejects(discover("https://tuix.app", fakeFetch(200, { ...meta })), { code: "invalid_metadata" });
});

test("discover rejects endpoints on another origin or scheme", async () => {
  for (const key of ["token_endpoint", "device_authorization_endpoint", "registration_endpoint", "revocation_endpoint"]) {
    for (const bad of ["https://evil.example/x", "http://tuix.app/x"]) {
      await assert.rejects(discover("https://tuix.app", fakeFetch(200, { ...goodMeta, [key]: bad })), { code: "invalid_metadata" });
    }
  }
});

test("discover with an invalid origin throws OAuthError", async () => {
  await assert.rejects(discover("not a url", fakeFetch(200, goodMeta)), (e) => e instanceof OAuthError && e.code === "invalid_origin");
});

test("discover with a non-JSON body is invalid_metadata", async () => {
  const f = async () => ({ status: 200, ok: true, json: async () => { throw new Error("bad"); } });
  await assert.rejects(discover("https://tuix.app", f), { code: "invalid_metadata" });
});

test("refresh keeps the old refresh token when not rotated", async () => {
  const f = fakeFetch(200, { access_token: "at2", token_type: "Bearer", expires_in: 60 });
  assert.deepEqual(await refresh(meta, "cid", "rt1", f, now), { access_token: "at2", refresh_token: "rt1", expires_at: 1_060_000 });
});

test("tokens without expires_in have a null expires_at", async () => {
  const f = fakeFetch(200, { access_token: "at", token_type: "Bearer", refresh_token: "rt" });
  assert.equal((await pollOnce(meta, "cid", "dc", f, now)).tokens.expires_at, null);
});

test("a non-bearer token type is invalid_response", async () => {
  const body = { access_token: "at", token_type: "mac", expires_in: 60 };
  await assert.rejects(pollOnce(meta, "cid", "dc", fakeFetch(200, body), now), { code: "invalid_response" });
  await assert.rejects(refresh(meta, "cid", "rt", fakeFetch(200, body), now), { code: "invalid_response" });
});

test("a 2xx without access_token is an error, not ok", async () => {
  await assert.rejects(pollOnce(meta, "cid", "dc", fakeFetch(200, {}), now), { code: "http_200" });
  await assert.rejects(refresh(meta, "cid", "rt", fakeFetch(200, {}), now), { code: "http_200" });
});

test("pollOnce ignores inherited error names", async () => {
  await assert.rejects(pollOnce(meta, "cid", "dc", fakeFetch(400, { error: "toString" }), now), { code: "toString" });
});

test("a non-JSON error body throws an http code", async () => {
  const f = async () => ({ status: 502, ok: false, json: async () => { throw new Error("html"); } });
  await assert.rejects(pollOnce(meta, "cid", "dc", f, now), { code: "http_502" });
});

test("startDevice defaults interval and verification_uri_complete", async () => {
  const f = fakeFetch(200, { device_code: "dc", user_code: "AB", verification_uri: "https://tuix.app/device", expires_in: 600 });
  const got = await startDevice(meta, "cid", f);
  assert.equal(got.interval, 5);
  assert.equal(got.verification_uri_complete, "https://tuix.app/device");
});

test("startDevice with missing fields is invalid_response", async () => {
  for (const drop of ["user_code", "verification_uri", "expires_in", "device_code"]) {
    const body = { device_code: "dc", user_code: "AB", verification_uri: "u", expires_in: 600 };
    delete body[drop];
    await assert.rejects(startDevice(meta, "cid", fakeFetch(200, body)), { code: "invalid_response" });
  }
});

test("revoke posts the token to the revocation endpoint and does nothing without one", async () => {
  const { revoke } = await import("../mods/tuix/lib/oauth.js");
  const f = fakeFetch(200, {});
  assert.equal(await revoke({ revocation_endpoint: "https://tuix.app/oauth/revoke" }, "cid", "r1", f), true);
  assert.equal(f.last.url, "https://tuix.app/oauth/revoke");
  assert.deepEqual(form(f), { token: "r1", client_id: "cid" });
  const g = fakeFetch(200, {});
  assert.equal(await revoke({ revocation_endpoint: null }, "cid", "r1", g), false);
  assert.equal(g.last, undefined);
});

test("startDevice never polls faster than every 5 seconds", async () => {
  for (const [given, want] of [[1, 5], [0, 5], ["x", 5], [12, 12]]) {
    const f = fakeFetch(200, { device_code: "d", user_code: "u", verification_uri: "https://tuix.app/device", expires_in: 600, interval: given });
    assert.equal((await startDevice(meta, "cid", f)).interval, want);
  }
});

test("startDevice asks for the full scope explicitly", async () => {
  const f = fakeFetch(200, { device_code: "d", user_code: "u", verification_uri: "https://tuix.app/device", expires_in: 600 });
  await startDevice(meta, "cid", f);
  assert.deepEqual(form(f), { client_id: "cid", scope: "full" });
});
