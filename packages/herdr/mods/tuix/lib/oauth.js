// OAuth device-flow client (RFC 8628, RFC 8414, RFC 7591) for Tuix. Side effects
// (fetch, clock) are injected. Tokens are returned to the caller, never stored here.

export const CLIENT_NAME = "Herdr"; // registered with Tuix; comments the panel posts carry it as `via`
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export class OAuthError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.name = "OAuthError";
    this.code = code;
  }
}

export function urlencode(fields) {
  return Object.entries(fields)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

async function readJson(response) {
  try {
    return (await response.json()) ?? {};
  } catch {
    return {};
  }
}

async function post(url, fetch, contentType, body) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": contentType, accept: "application/json" },
    body,
  });
}

const postForm = (url, fetch, fields) => post(url, fetch, "application/x-www-form-urlencoded", urlencode(fields));

function sameOrigin(value, base) {
  try {
    return new URL(value).origin === base;
  } catch {
    return false;
  }
}

export async function discover(origin, fetch) {
  let base;
  try {
    base = new URL(origin).origin;
  } catch {
    throw new OAuthError("invalid_origin", "The server address is not a valid URL");
  }
  if (base === "null") throw new OAuthError("invalid_origin", "The server address is not a valid URL");
  const response = await fetch(`${base}/.well-known/oauth-authorization-server`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (response.status < 200 || response.status >= 300) throw new OAuthError(`http_${response.status}`);
  const body = await readJson(response);
  if (typeof body.issuer !== "string" || body.issuer.replace(/\/+$/, "") !== base) {
    throw new OAuthError("invalid_metadata", "The metadata issuer does not match the server");
  }
  if (!body.device_authorization_endpoint || !body.token_endpoint) {
    throw new OAuthError("unsupported", "The server does not support device sign-in");
  }
  for (const key of ["token_endpoint", "device_authorization_endpoint", "registration_endpoint", "revocation_endpoint"]) {
    if (body[key] != null && !sameOrigin(body[key], base)) {
      throw new OAuthError("invalid_metadata", `The metadata ${key} is on a different origin`);
    }
  }
  return {
    token_endpoint: body.token_endpoint,
    device_authorization_endpoint: body.device_authorization_endpoint,
    registration_endpoint: body.registration_endpoint ?? null,
    revocation_endpoint: body.revocation_endpoint ?? null,
  };
}

export async function registerClient(meta, fetch) {
  if (!meta.registration_endpoint) throw new OAuthError("unsupported", "The server does not allow client registration");
  const response = await post(
    meta.registration_endpoint,
    fetch,
    "application/json",
    JSON.stringify({
      client_name: CLIENT_NAME,
      grant_types: [DEVICE_GRANT, "refresh_token"],
      token_endpoint_auth_method: "none",
    }),
  );
  const body = await readJson(response);
  if (response.status < 200 || response.status >= 300 || !body.client_id) {
    throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description);
  }
  return body.client_id;
}

export async function startDevice(meta, clientId, fetch) {
  const response = await postForm(meta.device_authorization_endpoint, fetch, { client_id: clientId, scope: "full" });
  const body = await readJson(response);
  if (response.status < 200 || response.status >= 300) {
    throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description);
  }
  if (!body.device_code || !body.user_code || !body.verification_uri || !body.expires_in) {
    throw new OAuthError("invalid_response", "The device authorization response is incomplete");
  }
  return {
    device_code: body.device_code,
    user_code: body.user_code,
    verification_uri: body.verification_uri,
    verification_uri_complete: body.verification_uri_complete ?? body.verification_uri,
    expires_in: body.expires_in,
    interval: Math.max(5, Number(body.interval) || 5),
  };
}

function tokensFrom(body, now, previousRefresh = null) {
  if (typeof body.token_type !== "string" || body.token_type.toLowerCase() !== "bearer") {
    throw new OAuthError("invalid_response", "Unsupported token type");
  }
  const seconds = Number(body.expires_in);
  return {
    access_token: body.access_token,
    refresh_token: body.refresh_token ?? previousRefresh,
    expires_at: body.expires_in != null && Number.isFinite(seconds) ? now() + seconds * 1000 : null,
  };
}

const POLL_STATUS = new Map(
  Object.entries({
    authorization_pending: "pending",
    slow_down: "slow_down",
    access_denied: "denied",
    expired_token: "expired",
  }),
);

export async function pollOnce(meta, clientId, deviceCode, fetch, now = Date.now) {
  const response = await postForm(meta.token_endpoint, fetch, {
    grant_type: DEVICE_GRANT,
    device_code: deviceCode,
    client_id: clientId,
  });
  const body = await readJson(response);
  if (response.status >= 200 && response.status < 300 && body.access_token) {
    return { status: "ok", tokens: tokensFrom(body, now) };
  }
  const status = POLL_STATUS.get(body.error);
  if (status) return { status };
  throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description);
}

export async function refresh(meta, clientId, refreshToken, fetch, now = Date.now) {
  const response = await postForm(meta.token_endpoint, fetch, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
  });
  const body = await readJson(response);
  if (response.status < 200 || response.status >= 300 || !body.access_token) {
    throw new OAuthError(body.error ?? `http_${response.status}`, body.error_description);
  }
  return tokensFrom(body, now, refreshToken);
}

// Best effort (RFC 7009): the caller ignores failures; the session is forgotten locally either way.
export async function revoke(meta, clientId, token, fetch) {
  if (!meta.revocation_endpoint || !token) return false;
  const response = await postForm(meta.revocation_endpoint, fetch, { token, client_id: clientId });
  return response.status >= 200 && response.status < 300;
}
