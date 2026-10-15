import type { Config, Identity } from './types';
export class ApiError extends Error { constructor(public status: number) { super(`tuix request failed (${status})`); } }
export class Api {
  private token = '';
  private identifying?: Promise<void>;
  private controller = new AbortController();
  readonly environment: string;
  constructor(readonly config: Config, private identity: Identity) {
    this.environment = config.environment ?? (['localhost', '127.0.0.1'].includes(location.hostname) ? 'local' : 'production');
    const url = new URL(config.api ?? 'https://api.tuix.app');
    if (!(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('tuix API must use HTTPS');
    if (url.username || url.password || url.search || url.hash) throw new Error('Invalid tuix API URL');
  }
  destroy() { this.controller.abort(); this.token = ''; }
  async liveCredentials() {
    if (!this.token) await this.identify();
    const url = new URL((this.config.api ?? 'https://api.tuix.app').replace(/\/$/, '') + '/widget/socket');
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return { url: url.toString(), token: this.token, params: { project: this.config.project, environment: this.environment, origin: location.origin } };
  }
  private async identify() {
    if (!this.identifying) this.identifying = (this.identity.reviewerSession
      ? this.request<{ token: string }>('/shopify/reviewer/refresh', 'POST', { token: this.identity.reviewerSession }, false)
      : this.request<{ token: string }>('/identify', 'POST', this.identity, false))
      .then(result => { this.token = result.token; }).finally(() => { this.identifying = undefined; });
    return this.identifying;
  }
  private async send<T>(url: string, options: RequestInit, json: boolean): Promise<{ ok: boolean; status: number; body?: T }> {
    const request = new AbortController();
    const abort = () => request.abort();
    this.controller.signal.addEventListener('abort', abort, { once: true });
    if (this.controller.signal.aborted) request.abort();
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetch(url, { ...options, credentials: 'omit', redirect: 'error', signal: request.signal });
      const body = response.ok && json ? await response.json() as T : undefined;
      return { ok: response.ok, status: response.status, body };
    } finally {
      clearTimeout(timer);
      this.controller.signal.removeEventListener('abort', abort);
    }
  }
  async upload(url: string, headers: Record<string, string>, body: Blob): Promise<void> {
    const result = await this.send(url, { method: 'PUT', headers, body }, false);
    if (!result.ok) throw new ApiError(result.status);
  }
  async request<T>(path: string, method = 'GET', body?: unknown, authenticated = true, retry = true): Promise<T> {
    if (authenticated && !this.token) await this.identify();
    // Version 2 widgets read `state` and the new `/v1` routes (people-and-statuses §6).
    const headers: Record<string, string> = { 'x-tuix-project': this.config.project, 'x-tuix-environment': this.environment, 'x-tuix-widget': '2' };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (authenticated) headers.authorization = 'Bearer ' + this.token;
    const response = await this.send<T>((this.config.api ?? 'https://api.tuix.app').replace(/\/$/, '') + '/v1' + path, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    }, true);
    if (response.status === 401 && authenticated && retry) { this.token = ''; await this.identify(); return this.request<T>(path, method, body, true, false); }
    if (!response.ok) throw new ApiError(response.status);
    return response.body as T;
  }
}
