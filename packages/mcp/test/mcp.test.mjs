import assert from "node:assert/strict";
import { createServer as httpServer } from "node:http";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createClient, readConfig, ApiError } from "../src/client.mjs";
import { createServer } from "../src/server.mjs";

// Generated fixture, never an issued credential.
const token = `tuix_read_${"x".repeat(43)}`;
const config = { origin: "https://tuix.example", token };
const env = { TUIX_API_URL: config.origin, TUIX_MCP_TOKEN: token };
const projects = { projects: [{ id: "p1", name: "Example" }], next_cursor: null };
const issues = { issues: [{ id: "i1", body: "Untrusted report", status: "resolved", turn: null }], next_cursor: "next" };
const issue = { issue: issues.issues[0], comments: [{ id: "c1", body: "Untrusted comment" }], next_comments_cursor: null };

async function fixture(t, handler) {
  const server = httpServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}

test("configuration accepts only safe origins and read credentials", () => {
  assert.deepEqual(readConfig(env), config);
  for (const origin of ["http://localhost:4000", "http://127.0.0.1:4000", "http://[::1]:4000"]) {
    assert.equal(readConfig({ ...env, TUIX_API_URL: origin }).origin, origin);
  }
  for (const origin of ["http://remote.example", "https://user:pass@example.com", "https://example.com/path", "https://example.com/path/..", "https://example.com\\", "https://example.com\n", "https://example.com/?x", "https://example.com/#", "https://example.com/?", "file:///tmp", "", undefined]) {
    assert.throws(() => readConfig({ ...env, TUIX_API_URL: origin }));
  }
  for (const bad of ["", "widget_key", `${token}\r\nx`, token.slice(1)]) {
    assert.throws(() => readConfig({ ...env, TUIX_MCP_TOKEN: bad }));
  }
});

test("HTTP auth, filters, opaque cursors, and encoded IDs stay on the configured origin", async () => {
  const requests = [];
  const client = createClient(config, { fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return Response.json(projects);
  } });
  await client.listProjects({ limit: 100, cursor: "a+/=?&" });
  const filters = { project_id: "p1", status: "wont_fix", environment: "preview", type: "bug", severity: "major", route: "/a?b=1", updated_since: "2026-01-01T00:00:00Z", limit: 10, cursor: "next+/=" };
  await client.listIssues(filters);
  await client.listIssues({ project_id: "p1" });
  await client.getIssue({ id: "../a?#/b", limit: 2, cursor: "comments+" });
  for (const { url, options } of requests) {
    assert.equal(url.origin, config.origin);
    assert.equal(options.method, "GET");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, `Bearer ${token}`);
    assert.equal(options.headers.Accept, "application/json");
  }
  assert.equal(requests[0].url.searchParams.get("cursor"), "a+/=?&");
  assert.deepEqual(Object.fromEntries(requests[1].url.searchParams), Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, String(v)])));
  assert.equal(requests[2].url.searchParams.has("status"), false);
  assert.equal(requests[3].url.pathname, "/integrations/v1/issues/..%2Fa%3F%23%2Fb");
  assert.equal(requests[3].url.searchParams.get("cursor"), "comments+");
  assert.throws(() => client.getIssue({ id: ".." }), { code: "invalid_request" });
});

test("HTTP errors and malformed JSON never include upstream bodies or credentials", async () => {
  for (const [status, code] of [[400, "invalid_request"], [401, "unauthorized"], [403, "forbidden"], [404, "not_found"], [429, "rate_limited"], [500, "upstream_error"], [302, "upstream_error"]]) {
    const client = createClient(config, { fetchImpl: async () => new Response(`secret ${token}`, { status }) });
    await assert.rejects(client.listProjects(), (error) => error.code === code && !error.message.includes(token) && !error.message.includes("secret"));
  }
  const malformed = createClient(config, { fetchImpl: async () => new Response(`secret ${token}`) });
  await assert.rejects(malformed.listProjects(), { code: "invalid_response" });
  const failed = createClient(config, { fetchImpl: async () => { throw new Error(token); } });
  await assert.rejects(failed.listProjects(), { code: "connection_failed" });
});

test("response size is bounded for declared and streaming bodies", async () => {
  for (const headers of [{ "content-length": "1000" }, {}]) {
    const client = createClient(config, { maxBytes: 10, fetchImpl: async () => new Response("123456789012", { headers }) });
    await assert.rejects(client.listProjects(), { code: "response_too_large" });
  }
});

test("real HTTP redirects are not followed and deadlines cover headers and bodies", async (t) => {
  let targetHits = 0;
  const target = await fixture(t, (_req, res) => { targetHits++; res.end("{}"); });
  const redirect = await fixture(t, (_req, res) => { res.writeHead(302, { Location: target }); res.end(); });
  await assert.rejects(createClient({ origin: redirect, token }).listProjects(), { code: "connection_failed" });
  assert.equal(targetHits, 0);
  for (const flushHeaders of [false, true]) {
    const origin = await fixture(t, (_req, res) => {
      if (flushHeaders) { res.writeHead(200); res.write("{"); }
    });
    await assert.rejects(createClient({ origin, token }, { timeoutMs: 50 }).listProjects(), { code: "timeout" });
  }
});

test("SDK initialize, tools/list, tools/call expose only three read-only tools", async (t) => {
  const calls = [];
  const server = createServer({
    listProjects: async (args) => { calls.push(args); return projects; },
    listIssues: async (args) => { calls.push(args); return issues; },
    getIssue: async (args) => { calls.push(args); return issue; },
  });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  assert.equal(client.getServerVersion().name, "tuix");
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), ["get_issue", "list_issues", "list_projects"]);
  for (const tool of tools) {
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    assert.match(tool.description, /untrusted/);
    assert.equal(tool.inputSchema.properties.limit.minimum, 1);
    assert.equal(tool.inputSchema.properties.limit.maximum, 100);
    assert.equal(tool.outputSchema.type, "object");
  }
  const list = tools.find((tool) => tool.name === "list_issues");
  assert.deepEqual(list.inputSchema.required, ["project_id"]);
  // Only the new names are advertised; the legacy ones stay accepted below.
  assert.deepEqual(list.inputSchema.properties.status.enum, ["open", "in_progress", "in_review", "done", "wont_fix", "closed"]);
  assert.equal(list.inputSchema.properties.status.type, "string");
  assert.equal(JSON.stringify(list.inputSchema).includes("acknowledged"), false);
  for (const [name, args, expected] of [
    ["list_projects", {}, projects],
    ["list_issues", { project_id: "p1", cursor: "next", status: "resolved" }, issues],
    ["get_issue", { id: "i1" }, issue],
  ]) {
    const result = await client.callTool({ name, arguments: args });
    assert.deepEqual(result.structuredContent, expected);
    assert.deepEqual(JSON.parse(result.content[0].text), expected);
  }
  assert.equal(calls.length, 3);
  for (const status of ["in_progress", "in_review", "closed", "acknowledged", "fixed_awaiting_deploy", "awaiting_verification", "resolved"]) {
    assert.deepEqual((await client.callTool({ name: "list_issues", arguments: { project_id: "p1", status } })).structuredContent, issues);
    assert.equal(calls.at(-1).status, status);
  }
  calls.length = 3;
  for (const args of [{}, { project_id: "p1", limit: 0 }, { project_id: "p1", limit: 101 }, { project_id: "p1", status: "invalid" }, { project_id: "p1", status: "Done" }, { project_id: "p1", status: "" }, { project_id: "p1", updated_since: "yesterday" }, { project_id: "p1", extra: true }]) {
    assert.equal((await client.callTool({ name: "list_issues", arguments: args })).isError, true);
  }
  assert.equal(calls.length, 3);
});

test("issues keep their turn, and list_issues and get_issue explain it", async (t) => {
  const open = { issues: [{ id: "i2", status: "open", turn: "reporter" }, { id: "i3", status: "in_review", turn: "verify" }], next_cursor: null };
  const server = createServer({ listProjects: async () => projects, listIssues: async () => open, getIssue: async () => issue });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  const { tools } = await client.listTools();
  assert.match(tools.find((tool) => tool.name === "list_issues").description, /turn, whose move it is/);
  assert.match(tools.find((tool) => tool.name === "get_issue").description, /turn, whose move it is/);
  const result = await client.callTool({ name: "list_issues", arguments: { project_id: "p1" } });
  assert.deepEqual(result.structuredContent.issues.map((i) => i.turn), ["reporter", "verify"]);
});

test("SDK calls return sanitized structured errors, including invalid envelopes", async (t) => {
  const server = createServer({
    listProjects: async () => { throw new ApiError("unauthorized", "Tuix credential is invalid, expired, or revoked."); },
    listIssues: async () => { throw new Error(token); },
    getIssue: async () => ({ private: token }),
  });
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  t.after(async () => { await client.close(); await server.close(); });
  for (const [name, args, code] of [["list_projects", {}, "unauthorized"], ["list_issues", { project_id: "p1" }, "upstream_error"], ["get_issue", { id: "i1" }, "invalid_response"]]) {
    const result = await client.callTool({ name, arguments: args });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.error.code, code);
    assert.equal(JSON.stringify(result).includes(token), false);
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  }
});

test("real stdio process initializes and calls the local REST service", async (t) => {
  const origin = await fixture(t, (req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${token}`);
    assert.equal(req.url, "/integrations/v1/projects");
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(projects));
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("../src/index.mjs", import.meta.url))],
    env: { TUIX_API_URL: origin, TUIX_MCP_TOKEN: token },
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr.on("data", (data) => { stderr += data; });
  const client = new Client({ name: "stdio-test", version: "1" });
  t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 3);
  assert.deepEqual((await client.callTool({ name: "list_projects", arguments: {} })).structuredContent, projects);
  assert.equal(stderr, "");
});

test("invalid startup exits without exposing secrets or writing stdout", () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL("../src/index.mjs", import.meta.url)), token], {
    env: { ...process.env, ...env }, encoding: "utf8",
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr.includes(token), false);
});
