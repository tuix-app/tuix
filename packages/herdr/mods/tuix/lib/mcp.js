// MCP JSON-RPC client for Tuix. Side effects (fetch) are injected.

const PROTOCOL = "2025-06-18";

export class McpError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "McpError";
    this.code = code;
  }
}

export function validUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (!(u.protocol === "https:" || (u.protocol === "http:" && local))) return false;
  if (u.username || u.password || u.search || u.hash) return false;
  return u.pathname === "/";
}

export function createClient({ url, token, fetch }) {
  const endpoint = `${new URL(url).origin}/mcp`;
  let nextId = 1;

  async function rpc(method, params) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": PROTOCOL,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    });
    if (response.status === 401) throw new McpError("unauthorized");
    if (response.status === 429) throw new McpError("rate_limited");
    if (response.status < 200 || response.status >= 300) throw new McpError(`http_${response.status}`);
    const body = await response.json();
    if (body?.error) throw new McpError("rpc", body.error.message);
    return body?.result ?? {};
  }

  return {
    async connect() {
      const result = await rpc("initialize", {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "tuix-herdr", version: "0.1.0" },
      });
      return result._meta?.["tuix/credential"] ?? null;
    },

    async call(tool, args = {}) {
      const result = await rpc("tools/call", { name: tool, arguments: args });
      if (result.isError) {
        const error = result.structuredContent?.error;
        throw new McpError(error?.code ?? "tool_error", error?.message);
      }
      return result.structuredContent;
    },

    async tools() {
      const result = await rpc("tools/list", {});
      return (result.tools ?? []).map((tool) => tool.name);
    },
  };
}

// Follows next_cursor for a list tool, with the same arguments on every page.
// Stops after `pages` pages, or when the cursor stops advancing. The result has
// `truncated: true` when it stopped with more pages left.
export async function collect(client, tool, key, args = {}, pages = 20) {
  const out = [];
  Object.defineProperty(out, "truncated", { value: false, writable: true });
  let cursor = null;
  for (let i = 0; i < pages; i++) {
    const result = await client.call(tool, cursor ? { ...args, cursor } : args);
    out.push(...(result?.[key] ?? []));
    const next = result?.next_cursor ?? null;
    if (!next || next === cursor) break;
    if (i === pages - 1) out.truncated = true;
    cursor = next;
  }
  return out;
}
