const TOKEN = /^tuix_read_[A-Za-z0-9_-]{43}$/;
const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function readConfig(env = process.env) {
  let url;
  try {
    url = new URL(env.TUIX_API_URL);
  } catch {
    throw new Error("TUIX_API_URL must be an HTTPS origin (HTTP allowed only on localhost).");
  }
  if (
    !/^https?:\/\/[^/?#\\\s@]+\/?$/i.test(env.TUIX_API_URL) ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL.has(url.hostname))) ||
    url.username || url.password || url.pathname !== "/" || url.search || url.hash
  ) {
    throw new Error("TUIX_API_URL must be an HTTPS origin without credentials, path, query, or fragment.");
  }
  if (!TOKEN.test(env.TUIX_MCP_TOKEN ?? "")) {
    throw new Error("TUIX_MCP_TOKEN must be a Tuix read integration credential.");
  }
  return { origin: url.origin, token: env.TUIX_MCP_TOKEN };
}

const httpErrors = {
  400: ["invalid_request", "Tuix rejected the request parameters."],
  401: ["unauthorized", "Tuix credential is invalid, expired, or revoked."],
  403: ["forbidden", "Tuix credential does not permit this operation."],
  404: ["not_found", "Tuix resource was not found or is outside the credential scope."],
  429: ["rate_limited", "Tuix rate limit reached; retry later."],
};

export function createClient(config, { fetchImpl = fetch, timeoutMs = 15_000, maxBytes = 2 * 1024 * 1024 } = {}) {
  // Revalidate even injected configuration: requests may never change origin.
  const { origin, token } = readConfig({ TUIX_API_URL: config.origin, TUIX_MCP_TOKEN: config.token });

  async function get(path, params = {}) {
    const url = new URL(`/integrations/v1/${path}`, origin);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        redirect: "error",
        signal: controller.signal,
      });
      if (!response.ok) {
        await response.body?.cancel();
        const [code, message] = httpErrors[response.status] ??
          ["upstream_error", "Tuix could not complete the request."];
        throw new ApiError(code, message);
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        await response.body?.cancel();
        throw new ApiError("response_too_large", "Tuix response exceeds the size limit; request a smaller page.");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new ApiError("invalid_response", "Tuix returned an invalid response.");
      const chunks = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > maxBytes) {
            await reader.cancel();
            throw new ApiError("response_too_large", "Tuix response exceeds the size limit; request a smaller page.");
          }
          chunks.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      try {
        return JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new ApiError("invalid_response", "Tuix returned an invalid response.");
      }
    } catch (error) {
      if (controller.signal.aborted) throw new ApiError("timeout", "Tuix request timed out.");
      if (error instanceof ApiError) throw error;
      throw new ApiError("connection_failed", "Could not reach Tuix; check the configured origin and service.");
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    listProjects: (params) => get("projects", params),
    listIssues: (params) => get("issues", params),
    getIssue: ({ id, ...params }) => {
      // Dot segments are normalized even when percent encoded by URL implementations.
      if (!id || id === "." || id === "..") throw new ApiError("invalid_request", "Invalid issue identifier.");
      return get(`issues/${encodeURIComponent(id)}`, params);
    },
  };
}
