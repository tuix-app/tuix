// Decisions of the device sign-in, kept free of timers and the view so they can be tested: what to do after a poll,
// after a failed start, and which address the browser may be sent to. No host imports.
import { OAuthError } from "./oauth.js";
import { isTransient } from "./session.js";

const SLOW_DOWN_SECONDS = 5;
const MAX_BACKOFF_SECONDS = 60;

// The device: { interval (seconds), expiresAt (ms), failures }. `outcome` is { result } from pollOnce or { error }.
// Returns { type: "wait", seconds } (the device's interval and failures are updated), { type: "done", tokens }
// or { type: "fail", error }.
export function pollStep(device, outcome, now) {
  const step = decide(device, outcome, now);
  // Never sleep past the code's expiry, so "The code expired" shows on time.
  if (step.type === "wait") step.seconds = Math.min(step.seconds, Math.max(1, Math.ceil((device.expiresAt - now) / 1000)));
  return step;
}

function decide(device, outcome, now) {
  if (outcome.result?.status === "ok") return { type: "done", tokens: outcome.result.tokens };
  if (now >= device.expiresAt) return { type: "fail", error: new OAuthError("expired_token") };
  if (outcome.error) {
    if (!isTransient(outcome.error)) return { type: "fail", error: outcome.error };
    device.failures = (device.failures ?? 0) + 1; // offline or the server is struggling: back off, keep waiting
    return { type: "wait", seconds: Math.min(MAX_BACKOFF_SECONDS, device.interval * 2 ** device.failures) };
  }
  device.failures = 0;
  switch (outcome.result.status) {
    case "pending": return { type: "wait", seconds: device.interval };
    case "slow_down": device.interval += SLOW_DOWN_SECONDS; return { type: "wait", seconds: device.interval };
    case "denied": return { type: "fail", error: new OAuthError("access_denied") };
    case "expired": return { type: "fail", error: new OAuthError("expired_token") };
    default: return { type: "fail", error: new OAuthError("invalid_response") };
  }
}

// After startDevice fails: a client id read from storage that the server no longer knows is registered again
// once; a fresh registration that is refused, or any other error, ends the attempt.
export const onStartError = (usedStored, error) => (usedStored && error instanceof OAuthError && error.code === "invalid_client" ? "reregister" : "fail");

// The page to open in the browser: the complete verification URI, else the plain one, and only on the Tuix
// address's own origin over https (http for localhost). Otherwise null: the panel shows the code as text.
export function browserUrl(code, address) {
  let origin;
  try { origin = new URL(address).origin; } catch { return null; }
  for (const candidate of [code.verification_uri_complete, code.verification_uri]) {
    try {
      const u = new URL(candidate);
      const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
      if (u.origin === origin && !u.username && !u.password && (u.protocol === "https:" || (u.protocol === "http:" && local))) return u.href;
    } catch { /* not a URL */ }
  }
  return null;
}
