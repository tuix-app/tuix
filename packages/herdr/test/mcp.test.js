import assert from "node:assert/strict";
import { test } from "node:test";
import { McpError, collect, createClient, validUrl } from "../mods/tuix/lib/mcp.js";

function fakeFetch(status, body) {
  const f = async (url, options) => {
    f.last = { url, options };
    return { status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) };
  };
  return f;
}

const client = (fetch) => createClient({ url: "https://tuix.app", token: "tuix_write_x", fetch });

test("call returns structuredContent and sends the bearer token", async () => {
  const f = fakeFetch(200, { jsonrpc: "2.0", id: 1, result: { structuredContent: { projects: [] } } });
  const c = createClient({ url: "https://tuix.app", token: "tuix_write_x", fetch: f });
  assert.deepEqual(await c.call("list_projects"), { projects: [] });
  assert.equal(f.last.url, "https://tuix.app/mcp");
  assert.equal(f.last.options.method, "POST");
  assert.equal(f.last.options.headers.authorization, "Bearer tuix_write_x");
  assert.equal(f.last.options.headers["content-type"], "application/json");
  assert.equal(f.last.options.headers.accept, "application/json, text/event-stream");
  assert.equal(f.last.options.headers["mcp-protocol-version"], "2025-06-18");
  const body = JSON.parse(f.last.options.body);
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.method, "tools/call");
  assert.equal(body.params.name, "list_projects");
  assert.deepEqual(body.params.arguments, {});
});

test("call passes arguments", async () => {
  const f = fakeFetch(200, { result: { structuredContent: {} } });
  await client(f).call("get_issue", { id: "7" });
  assert.deepEqual(JSON.parse(f.last.options.body).params.arguments, { id: "7" });
});

test("401 is unauthorized", async () => {
  await assert.rejects(client(fakeFetch(401, { error: "invalid_token" })).call("list_projects"), { code: "unauthorized" });
});

test("429 is rate_limited", async () => {
  await assert.rejects(client(fakeFetch(429, {})).call("list_projects"), { code: "rate_limited" });
});

test("other non-2xx statuses are http_<status>", async () => {
  await assert.rejects(client(fakeFetch(500, {})).call("list_projects"), { code: "http_500" });
});

test("a JSON-RPC error is rpc", async () => {
  const f = fakeFetch(200, { jsonrpc: "2.0", id: 1, error: { code: -32601, message: "Method not found" } });
  await assert.rejects(client(f).call("nope"), { code: "rpc", message: "Method not found" });
});

test("a tool error keeps its code and message", async () => {
  const f = fakeFetch(200, { result: { isError: true, structuredContent: { error: { code: "invalid_turn", message: "No." } } } });
  await assert.rejects(client(f).call("reply_to_issue", {}), (error) => {
    assert.ok(error instanceof McpError);
    assert.equal(error.code, "invalid_turn");
    assert.equal(error.message, "No.");
    return true;
  });
});

test("tools lists names", async () => {
  const f = fakeFetch(200, { result: { tools: [{ name: "list_projects" }, { name: "get_issue" }] } });
  assert.deepEqual(await client(f).tools(), ["list_projects", "get_issue"]);
  assert.equal(JSON.parse(f.last.options.body).method, "tools/list");
});

test("connect sends initialize and returns the credential meta", async () => {
  const meta = { label: "Herdr", can_write: true, expires_at: "2026-12-01T00:00:00Z" };
  const f = fakeFetch(200, { result: { protocolVersion: "2025-06-18", _meta: { "tuix/credential": meta } } });
  assert.deepEqual(await client(f).connect(), meta);
  assert.equal(JSON.parse(f.last.options.body).method, "initialize");
});

test("connect returns null without credential meta", async () => {
  const f = fakeFetch(200, { result: { protocolVersion: "2025-06-18" } });
  assert.equal(await client(f).connect(), null);
});

test("ids increase per request", async () => {
  const f = fakeFetch(200, { result: { structuredContent: {} } });
  const c = client(f);
  await c.call("a");
  const first = JSON.parse(f.last.options.body).id;
  await c.call("b");
  assert.ok(JSON.parse(f.last.options.body).id > first);
});

test("validUrl", () => {
  assert.ok(validUrl("https://tuix.app"));
  assert.ok(validUrl("http://localhost:4000"));
  assert.ok(validUrl("http://127.0.0.1:4000"));
  assert.ok(!validUrl("http://tuix.app"));
  assert.ok(!validUrl("https://tuix.app/mcp"));
  assert.ok(!validUrl("https://a:b@tuix.app"));
  assert.ok(!validUrl("https://tuix.app?x=1"));
  assert.ok(!validUrl("not a url"));
  assert.ok(!validUrl(""));
});

test("collect follows next_cursor with the same arguments", async () => {
  const calls = [];
  const pages = { undefined: { items: [1, 2], next_cursor: "a" }, a: { items: [3], next_cursor: null } };
  const client = { call: async (tool, args) => { calls.push({ tool, args }); return pages[args.cursor]; } };
  assert.deepEqual(await collect(client, "list_x", "items", { project_id: "p" }), [1, 2, 3]);
  assert.deepEqual(calls.map((c) => c.args), [{ project_id: "p" }, { project_id: "p", cursor: "a" }]);
});

test("collect stops at a repeated cursor and at the page limit", async () => {
  let n = 0;
  const stuck = { call: async () => ({ items: [++n], next_cursor: "same" }) };
  assert.deepEqual(await collect(stuck, "t", "items"), [1, 2]);
  const endless = { call: async () => ({ items: [1], next_cursor: String(++n) }) };
  assert.equal((await collect(endless, "t", "items", {}, 5)).length, 5);
});

test("collect flags truncation only when pages were left", async () => {
  let n = 0;
  const endless = { call: async () => ({ items: [1], next_cursor: String(++n) }) };
  assert.equal((await collect(endless, "t", "items", {}, 3)).truncated, true);
  const done = { call: async () => ({ items: [1], next_cursor: null }) };
  assert.equal((await collect(done, "t", "items", {}, 1)).truncated, false);
  const exact = { call: async (_t, a) => ({ items: [1], next_cursor: a.cursor ? null : "x" }) };
  assert.equal((await collect(exact, "t", "items", {}, 2)).truncated, false);
});
