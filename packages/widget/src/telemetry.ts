import type { Api } from './api';
import type { Issue } from './types';
import type { Resolution } from './locators';

/** No timers or identity payloads. At most one batch per active minute. */
export function locatorTelemetry(api: Pick<Api, 'request'>) {
  let next = 0;
  return (enabled: boolean, values: { issue: Pick<Issue, 'id' | 'status'>; resolution: Resolution }[], release?: string) => {
    if (!enabled || performance.now() < next) return;
    const persisted = values.filter(({ issue }) => issue.status !== 'sending');
    if (!persisted.length) return;
    next = performance.now() + 60000;
    const resolutions = persisted.slice(0, 200).map(({ issue, resolution }) => ({
      issue_id: issue.id, method: resolution.method,
    }));
    void api.request('/telemetry/locators', 'POST', { resolutions, ...(typeof release === 'string' && release.trim() ? { release: release.slice(0, 200) } : {}) }).catch(() => {
      // Non-essential observations never interrupt feedback or retry in a loop.
    });
  };
}

export type RuntimeError = 'config' | 'refresh' | 'list' | 'thread' | 'notifications' | 'submit' | 'reply' | 'resolve' | 'screenshot' | 'entrypoint';

/** Only instrument widget operations, never global host errors or error messages. */
export function runtimeTelemetry(api: Pick<Api, 'request'>) {
  let active = false, allowed = false, known = false, loadHandled = false;
  let loadDuration: number | undefined;
  let submissionHandled = false, submissionDuration: number | undefined;
  const next = new Map<RuntimeError, number>();
  function send(body: object) {
    void api.request('/telemetry/runtime', 'POST', body).catch(() => { /* No recursive error reporting. */ });
  }
  function flushLoad() {
    if (!active || !known || loadHandled || loadDuration === undefined) return;
    loadHandled = true;
    if (allowed) send({ kind: 'load', duration_ms: loadDuration });
  }
  function flushSubmission() {
    if (!active || !known || submissionHandled || submissionDuration === undefined) return;
    submissionHandled = true;
    if (allowed) send({ kind: 'submission', duration_ms: submissionDuration });
    submissionDuration = undefined;
  }
  return {
    active(value: boolean) {
      if (value && !active) { known = false; submissionHandled = false; }
      if (!value && !loadHandled) loadDuration = undefined;
      if (!value) submissionDuration = undefined;
      active = value;
    },
    allowed(value: boolean) { allowed = value; known = true; flushLoad(); flushSubmission(); },
    loaded(duration: number) {
      if (loadDuration !== undefined || !active || !Number.isFinite(duration)) return;
      loadDuration = Math.max(0, Math.min(120000, Math.round(duration)));
      flushLoad();
    },
    submitted(duration: number) {
      if (!active || submissionHandled || submissionDuration !== undefined || !Number.isFinite(duration) || duration < 0) return;
      submissionDuration = Math.min(86400000, Math.round(duration));
      flushSubmission();
    },
    error(category: RuntimeError) {
      if (!active || !known || !allowed || performance.now() < (next.get(category) ?? 0)) return;
      next.set(category, performance.now() + 60000);
      send({ kind: 'error', category });
    },
  };
}
