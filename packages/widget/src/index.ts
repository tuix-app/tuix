import { tokenCss } from './tokens';
import type { Config, Identity, Core, Summary } from './types';
import { linkedIssue } from './deeplink';
import { markersPinned } from './markers';
import { mountSettings } from './settings';
import { preferenceEvent, cleanFilter, readPreferences, type OpenFilter } from './preferences';
import { recentlyActive } from './states';
import { isolateKeys } from './keys';
import { Api } from './api';
export { locate, resolve, routeKey } from './locators';
export type { Config, Identity } from './types';
export type { OpenFilter } from './preferences';
export type { LocatorBundle, Resolution } from './locators';
let config: Config | undefined, identity: Identity | undefined, host: HTMLElement | undefined;
let root: ShadowRoot | undefined, launcher: HTMLButtonElement | undefined, core: Core | undefined;
let returnFocus: HTMLElement | undefined;
let loading: Promise<void> | undefined, generation = 0, opened = false;
/** True while Settings hides a composer: the core then reports its panel hidden, which is not a close. */
let suspending = false;
/** Settings hides a visible composer (kept in memory) or closes any other feedback panel. */
const closeForSettings = () => {
  if (!opened) return false;
  let hidden = false;
  suspending = true;
  try { hidden = !!core?.suspend?.(); } finally { suspending = false; }
  if (!hidden) tuix.close();
  return true;
};
let activationStarted: number | undefined;
let mode: 'reports' | 'comment' = 'reports';
let openFilter: OpenFilter | undefined;
let settings: ReturnType<typeof mountSettings> | undefined;
/** One API client per identity: the summary and the core share its token. */
let client: Api | undefined;
let flyoutOpen = false;
let cancelIdle: (() => void) | undefined;
function reportFailure(instance = core) {
  try { instance?.reportError?.(); } catch { /* Reporting must never recurse into the host. */ }
}
function protect(action: () => void) {
  try { action(); } catch { reportFailure(); }
}
function api() { return client ??= new Api(config!, identity!); }
/** Summary requests sent so far; only the latest one paints the capsule. */
let summaries = 0;
/** Counts for the capsule beside the launcher, from the small API client: this never mounts the core. */
function refreshSummary() {
  if (!config || !identity || !settings || config.launcher === false) return;
  const current = generation, target = settings, request = ++summaries;
  try {
    // The same Environment filter as the Reports list the capsule opens (a local session's preference).
    const environments = api().environment === 'local' ? readPreferences(config.project).environment : '';
    // An earlier Environment's counts never land after a newer one's.
    void api().request<Summary>('/me/summary' + (environments ? '?' + new URLSearchParams({ environments }) : '')).then(value => { if (current === generation && request === summaries) target.summary(value); }).catch(() => { /* The capsule keeps its last counts. */ });
  } catch { /* An invalid API origin keeps the capsule hidden. */ }
}
function whenIdle(action: () => void): () => void {
  const scope = window as Window & { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
  if (typeof scope.requestIdleCallback === 'function') { const handle = scope.requestIdleCallback(action, { timeout: 5000 }); return () => scope.cancelIdleCallback?.(handle); }
  // Older WebKit has no idle callback: wait for the page to load, then let it settle for a second.
  let handle: ReturnType<typeof setTimeout> | undefined;
  const run = () => { handle = setTimeout(action, 1000); };
  if (document.readyState === 'complete') run(); else window.addEventListener('load', run, { once: true });
  return () => { window.removeEventListener('load', run); clearTimeout(handle); };
}
function remove() {
  const retiredCore = core, retiredHost = host, retiredClient = client;
  cancelIdle?.(); cancelIdle = undefined;
  settings?.destroy(); settings = undefined;
  generation++; core = undefined; host = undefined; root = undefined; launcher = undefined; loading = undefined; opened = false; activationStarted = undefined;
  client = undefined; flyoutOpen = false; openFilter = undefined;
  // Retire authority first; one failed cleanup must not prevent the next cleanup.
  try { retiredCore?.destroy(); } catch { reportFailure(retiredCore); }
  try { retiredClient?.destroy(); } catch { /* Aborting requests cannot fail meaningfully. */ }
  try { retiredHost?.remove(); } catch {
    try { if (retiredHost?.parentNode) retiredHost.parentNode.removeChild(retiredHost); } catch { /* Host DOM may itself be unavailable. */ }
  }
}
function mountLauncher() {
  if (!config || !identity || host || typeof document === 'undefined' || (window as Window & { Shopify?: { designMode?: boolean } }).Shopify?.designMode) return;
  try {
    host = document.createElement('tuix-widget');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;';
    root = host.attachShadow({ mode: 'closed' }); isolateKeys(root);
    const style = document.createElement('style'); if (config.nonce) style.nonce = config.nonce;
    style.textContent = ':host{all:initial}[hidden]{display:none!important}' + tokenCss + "#tuix-launcher{all:initial;box-sizing:border-box;position:fixed;bottom:calc(16px + env(safe-area-inset-bottom,0px));width:44px;height:44px;border-radius:50%;background:var(--tx-peach);color:var(--tx-on-peach);cursor:pointer;pointer-events:auto;display:grid;place-items:center;font:700 13px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.04em;box-shadow:0 12px 28px -10px rgba(0,0,0,.55),0 0 22px 2px var(--tx-glow);transition:transform .3s,box-shadow .3s}#tuix-launcher:hover{transform:translateY(-2px)}#tuix-launcher:focus-visible{outline:2px solid var(--tx-focus);outline-offset:3px}#tuix-launcher:disabled{cursor:wait}#tuix-launcher[aria-expanded=true]{box-shadow:0 0 0 3px var(--tx-pin-ring),0 0 0 5px var(--tx-peach),0 0 26px 4px var(--tx-glow)}#tuix-launcher[data-mode=comment]{animation:tuix-ring 2.4s ease-in-out infinite}@keyframes tuix-ring{0%,100%{box-shadow:0 0 0 3px var(--tx-pin-ring),0 0 0 5px var(--tx-peach),0 0 18px 2px var(--tx-glow)}50%{box-shadow:0 0 0 3px var(--tx-pin-ring),0 0 0 7px var(--tx-peach),0 0 30px 6px var(--tx-glow)}}@media(prefers-reduced-motion:reduce){#tuix-launcher{transition:none}#tuix-launcher[data-mode=comment]{animation:none}}";
    launcher = document.createElement('button'); launcher.id = 'tuix-launcher'; launcher.type = 'button'; launcher.setAttribute('aria-label', 'Open tuix feedback');
    launcher.style[config.position === 'bottom-left' ? 'left' : 'right'] = '16px';
    launcher.hidden = config.launcher === false;
    // The product wordmark, not a conversation icon: tuix marks elements, it is not a chat.
    launcher.textContent = 'tuix.';
    launcher.onclick = () => { if (opened) tuix.close(); else void commands.open(undefined, 'comment'); };
    root.append(style, launcher); (document.body ?? document.documentElement).append(host);
    settings = mountSettings(root, launcher, config, () => void tuix.open(), () => {
      window.dispatchEvent(new CustomEvent(preferenceEvent));
      if (config && markersPinned(config.project)) void loadCore(false);
    }, {
      beforeOpen: closeForSettings,
      // Settings loads the core without opening the side panel, so updates render in the flyout.
      onVisible: open => { flyoutOpen = open; if (core) core.settings?.(open); else if (open) void loadCore(false); },
      onFilter: filter => void openFromLoader(undefined, 'reports', filter),
      onEnvironment: refreshSummary,
    });
    if (config.showPinsOnLoad || linkedIssue()) void tuix.open();
    else if (markersPinned(config.project)) void loadCore(false);
    // A returning browser learns its summary once the page is idle; an untouched one stays idle.
    if (config.launcher !== false && recentlyActive(config.project)) cancelIdle = whenIdle(() => { cancelIdle = undefined; refreshSummary(); });
  } catch (error) { remove(); throw error; }
}

/** Mounts the core without opening the panel; a background load keeps the launcher usable and quiet. */
function loadCore(interactive: boolean): Promise<void> | undefined {
  if (core || loading || !root || !launcher || !config || !identity) return loading;
  const current = generation, shadow = root, button = launcher, options = config, user = identity;
  if (interactive) button.disabled = true;
  loading = import('./core').then(module => {
    if (current !== generation) return;
    core = module.mount(shadow, button, options, user, active => {
      opened = active;
      // A composer hidden behind Settings is not closed: focus stays with the flyout and the counts cannot have changed.
      const closed = !active && !suspending;
      if (closed) (returnFocus?.isConnected ? returnFocus : button).focus();
      settings?.close();
      settings?.active(active);
      // The summary refreshes whenever the panel closes.
      if (closed) refreshSummary();
    }, opened ? activationStarted : undefined, {
      api: api(),
      updates: options.launcher !== false ? settings?.slot : undefined,
      openSettings: () => { closeForSettings(); settings?.open(); },
      changed: refreshSummary,
    });
    if (flyoutOpen) core.settings?.(true);
    if (opened) { if (mode === 'comment') (core.comment ?? core.open)(); else core.open(openFilter); }
    openFilter = undefined;
  }).catch(() => {
    if (current !== generation || !interactive) return;
    reportFailure(); opened = false;
    button.setAttribute('aria-label', options.lang === 'pl' ? 'Nie udało się wczytać uwag. Kliknij, aby ponowić.' : 'Could not load feedback. Click to retry.');
  }).finally(() => { if (current === generation) { button.disabled = false; loading = undefined; } });
  return loading;
}

const commands = {
  init(options: Config) { remove(); config = { ...options }; mountLauncher(); },
  config(options: Partial<Config>) { if (config) { const wasOpen = opened; remove(); config = { ...config, ...options }; mountLauncher(); if (wasOpen) void tuix.open(); } },
  identify(user: Identity | null) { remove(); identity = user ? { ...user } : undefined; mountLauncher(); },
  async open(started?: number, intent: 'reports' | 'comment' = 'reports', filter?: OpenFilter) {
    mountLauncher(); if (!root || !launcher || !config || !identity) return;
    settings?.close();
    if (!opened) {
      returnFocus = (root.activeElement ? launcher : document.activeElement) as HTMLElement;
      const now = performance.now();
      activationStarted = typeof started === 'number' && Number.isFinite(started) && started >= 0 && started <= now ? started : now;
    }
    opened = true;
    mode = intent;
    openFilter = intent === 'reports' ? cleanFilter(filter) : undefined;
    if (core) { if (intent === 'comment') (core.comment ?? core.open)(); else core.open(openFilter); openFilter = undefined; return; }
    return loadCore(true);
  },
  close() { opened = false; core?.close(); settings?.close(); },
  destroy() { remove(); config = undefined; identity = undefined; },
};

/** @internal Preserve the script loader's monotonic activation time (and a queued report filter) across lazy loading. */
export async function openFromLoader(started: unknown, intent: 'reports' | 'comment' = 'reports', filter?: unknown) {
  try { await commands.open(typeof started === 'number' ? started : undefined, intent, cleanFilter(filter)); } catch { reportFailure(); }
}
export function settingsFromLoader() { closeForSettings(); settings?.open(); }

/** Public integration calls never throw into the host, including async activation. */
export const tuix = {
  init: (options: Config) => protect(() => commands.init(options)),
  config: (options: Partial<Config>) => protect(() => commands.config(options)),
  identify: (user: Identity | null) => protect(() => commands.identify(user)),
  /** Opens report browsing; an optional filter sets Pages, Show and Involving first, e.g. `{ show: 'verify', involving: 'me' }`. */
  async open(filter?: OpenFilter) { try { await commands.open(undefined, 'reports', cleanFilter(filter)); } catch { reportFailure(); } },
  close: () => protect(() => commands.close()),
  destroy: () => protect(() => commands.destroy()),
};
