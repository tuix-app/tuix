import type { Api } from './api';

/** Reports the host's UAT build once per mounted widget, after fresh admission. */
export function deploymentReporter(api: Pick<Api, 'request' | 'environment'>, release: unknown) {
  const name = typeof release === 'string' ? release.trim() : '';
  let reported = false, pending: Promise<void> | undefined;
  return (active: boolean, enabled: boolean): Promise<void> => {
    if (!active || !enabled || api.environment !== 'uat' || !name || [...name].length > 200 || reported) return Promise.resolve();
    if (pending) return pending;
    pending = api.request('/releases', 'POST', { release: name })
      .then(() => { reported = true; })
      .catch(() => { /* Retry only on the next active settings refresh, without another timer. */ })
      .finally(() => { pending = undefined; });
    return pending;
  };
}
