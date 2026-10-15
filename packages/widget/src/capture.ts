/** Capture starts only after activation. Never inspect request bodies, headers or form values. */
export interface ConsoleEntry { t: number; level: string; msg: string }
export interface NetworkEntry { t: number; method: string; url: string; status: number; ms: number }
export interface CaptureOptions { console?: boolean; network?: boolean; network_allow?: string[]; network_deny?: string[] }
const bounded = (value: string) => value.slice(0, 500);
const ring = <T>(items: T[], entry: T) => { items.push(entry); if (items.length > 50) items.shift(); };
export function cleanUrl(value: string): string {
  try { const url = new URL(value, location.href); return url.protocol === 'http:' || url.protocol === 'https:' ? bounded(url.origin + url.pathname) : ''; } catch { return ''; }
}
function matches(url: string, pattern: string): boolean {
  // Bounded literal glob, never execute host-configured regular expressions.
  if (pattern.length > 500) return false;
  const parts = pattern.split('*');
  if (parts.length === 1) return url === pattern;
  if (!url.startsWith(parts[0])) return false;
  let offset = parts[0].length;
  for (const part of parts.slice(1, -1)) {
    const index = url.indexOf(part, offset);
    if (index < 0) return false;
    offset = index + part.length;
  }
  const suffix = parts[parts.length - 1];
  return url.endsWith(suffix) && offset <= url.length - suffix.length;
}
function message(value: unknown): string {
  if (value instanceof Error) return bounded(value.name + ': ' + value.message);
  if (typeof value === 'string') return bounded(value);
  if (value === null || ['number', 'boolean', 'undefined', 'bigint'].includes(typeof value)) return String(value);
  // Do not enumerate objects: they may contain DOM nodes, request data or accessors.
  return '[object]';
}
export function startCapture(options: CaptureOptions) {
  const consoleEntries: ConsoleEntry[] = [], networkEntries: NetworkEntry[] = [];
  const cleanups: (() => void)[] = [];
  let active = true;
  const log = (level: string, values: unknown[]) => {
    if (active) ring(consoleEntries, { t: Date.now(), level, msg: bounded(values.map(message).join(' ')) });
  };
  const record = (method: string, raw: string, status: number, started: number) => {
    const url = cleanUrl(raw);
    if (!active || !url || (status > 0 && status < 400)) return;
    if (options.network_allow?.length && !options.network_allow.slice(0, 50).some(pattern => matches(url, pattern))) return;
    if (options.network_deny?.slice(0, 50).some(pattern => matches(url, pattern))) return;
    ring(networkEntries, { t: Date.now(), method: bounded(method.toUpperCase()), url, status, ms: Math.round(performance.now() - started) });
  };
  if (options.console !== false) {
    for (const level of ['error', 'warn'] as const) {
      const original = console[level];
      const wrapped = function(this: Console, ...args: unknown[]) { try { log(level, args); } catch { /* Capture cannot break host logging. */ } return Reflect.apply(original, this, args); };
      console[level] = wrapped;
      cleanups.push(() => { if (console[level] === wrapped) console[level] = original; });
    }
    const onError = (event: ErrorEvent) => log('error', [event.message]);
    const onRejection = (event: PromiseRejectionEvent) => log('error', [event.reason]);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    cleanups.push(() => { window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection); });
  }
  if (options.network !== false) {
    const original = window.fetch;
    if (original) {
      const wrapped: typeof fetch = function(this: Window | undefined, input, init) {
        const started = performance.now();
        const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET');
        return Reflect.apply(original, this, [input, init]).then((response: Response) => {
          try { record(method, raw, response.status, started); } catch { /* Preserve host request result. */ }
          return response;
        }, (error: unknown) => { try { record(method, raw, 0, started); } catch { /* Preserve rejection. */ } throw error; });
      };
      window.fetch = wrapped;
      cleanups.push(() => { if (window.fetch === wrapped) window.fetch = original; });
    }
    const originalOpen = XMLHttpRequest.prototype.open, originalSend = XMLHttpRequest.prototype.send;
    const requests = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
    const open = function(this: XMLHttpRequest, ...args: Parameters<typeof originalOpen>) {
      requests.set(this, { method: args[0], url: String(args[1]) });
      return Reflect.apply(originalOpen, this, args);
    } as typeof originalOpen;
    const send = function(this: XMLHttpRequest, ...args: Parameters<typeof originalSend>) {
      const metadata = requests.get(this), started = performance.now();
      if (metadata) this.addEventListener('loadend', () => { try { record(metadata.method, metadata.url, this.status, started); } catch { /* Preserve host events. */ } }, { once: true });
      return Reflect.apply(originalSend, this, args);
    };
    XMLHttpRequest.prototype.open = open;
    XMLHttpRequest.prototype.send = send;
    cleanups.push(() => {
      if (XMLHttpRequest.prototype.open === open) XMLHttpRequest.prototype.open = originalOpen;
      if (XMLHttpRequest.prototype.send === send) XMLHttpRequest.prototype.send = originalSend;
    });
  }
  return {
    snapshot: () => ({ console_log: consoleEntries.map(entry => ({ ...entry })), network_log: networkEntries.map(entry => ({ ...entry })) }),
    stop: () => { active = false; cleanups.forEach(cleanup => cleanup()); consoleEntries.length = networkEntries.length = 0; },
  };
}
