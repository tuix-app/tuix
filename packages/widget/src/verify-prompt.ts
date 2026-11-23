import { translations } from './i18n';
import { linkedIssue } from './deeplink';
import { currentRoute } from './locators';
import { readPreferences } from './preferences';
import { stateOf } from './states';
import type { Api } from './api';
import type { Config, Issue } from './types';

/** "Later" hides a report's prompt for a day. */
export const DISMISS_MS = 24 * 60 * 60 * 1000;
/** The prompt waits this long after the summary arrives, so the page has settled. */
export const SETTLE_MS = 1000;

/** The review round a prompt belongs to: a new round of the same report is asked about again. */
export const reviewRound = (issue: Pick<Issue, 'verification_started_at'>) => issue.verification_started_at ?? '';

/** What the prompt needs to know about the widget and the page, besides the report itself. */
export interface PromptContext {
  /** The widget is active (not disabled by the host) and the person is identified. */
  active: boolean; identified: boolean;
  /** The current page: origin and pathname, as a report's `url` records it. */
  pageUrl: string;
  /** The panel, a thread or the settings flyout is open. */
  panelOpen: boolean;
  /** A `?tuix=` link is opening a report on this load. */
  deepLink: boolean;
  isDismissed: (issue: Issue) => boolean;
}

/**
 * Whether a report earns the prompt. Mirrors the thread's review controls (in review, the caller is the reporter, the server lets
 * them decide) and adds the page, the panel, the deep link and the dismissal.
 */
export function eligible(issue: Issue, context: PromptContext): boolean {
  if (!context.active || !context.identified || context.panelOpen || context.deepLink) return false;
  if (stateOf(issue) !== 'in_review') return false;
  if (!(issue.reporter ?? issue.own)) return false;
  const allowed = issue.allowed_states ?? [];
  if (!allowed.includes('done') && !allowed.includes('open')) return false;
  if (!issue.url || issue.url !== context.pageUrl) return false;
  return !context.isDismissed(issue);
}

/** The oldest eligible report and how many there are on the page; null when there is none. */
export function choose(issues: Issue[], context: PromptContext): { issue: Issue; count: number } | null {
  const list = issues.filter(issue => eligible(issue, context)).sort((a, b) => a.number - b.number);
  return list.length ? { issue: list[0], count: list.length } : null;
}

interface Entry { until: number; round: string }
const memory = new Map<string, Record<string, Entry>>();
const storageKey = (project: string) => 'tuix:verify-prompt:' + project;

/** Dismissals per project and report, kept in localStorage (memory when it is blocked); expired entries are dropped on every read and write. */
export function dismissals(project: string, now: () => number = Date.now) {
  function read(): Record<string, Entry> {
    let stored: Record<string, Entry> | undefined;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey(project)) ?? '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) stored = value;
    } catch { /* Blocked or corrupt storage: fall back to this page's memory. */ }
    const merged = { ...memory.get(project), ...stored };
    const kept: Record<string, Entry> = {};
    for (const [id, entry] of Object.entries(merged)) {
      if (entry && typeof entry.until === 'number' && typeof entry.round === 'string' && entry.until > now()) kept[id] = entry;
    }
    return kept;
  }
  function write(entries: Record<string, Entry>) {
    memory.set(project, entries);
    try {
      if (Object.keys(entries).length) localStorage.setItem(storageKey(project), JSON.stringify(entries));
      else localStorage.removeItem(storageKey(project));
    } catch { /* The memory copy still holds for this page. */ }
  }
  return {
    isDismissed(issue: Pick<Issue, 'id' | 'verification_started_at'>) {
      const entry = read()[issue.id];
      return !!entry && entry.round === reviewRound(issue);
    },
    dismiss(issue: Pick<Issue, 'id' | 'verification_started_at'>) {
      write({ ...read(), [issue.id]: { until: now() + DISMISS_MS, round: reviewRound(issue) } });
    },
    /** Drops expired entries from storage. */
    clean() { write(read()); },
  };
}
/** Forgets the in-memory copy (tests). */
export function forgetDismissals() { memory.clear(); }

export interface PromptOptions {
  api: Pick<Api, 'request' | 'environment'>;
  /** The panel, a thread or Settings is open. */
  isOpen: () => boolean;
  /** Check it: open the report's thread in its review state. */
  onCheck: (id: string) => void;
  now?: () => number;
}

/** A card re-checks its report on tab refocus at most this often. */
export const RECHECK_MS = 60000;

const css = (side: string) => `.tuix-verify{box-sizing:border-box;position:fixed;${side}:16px;bottom:calc(72px + env(safe-area-inset-bottom,0px) + var(--tuix-lift,0px));width:min(300px,calc(100vw - 32px));padding:12px 14px;background:var(--tx-surface);color:var(--tx-ink);border:1px solid var(--tx-line);border-inline-start:3px solid var(--tx-aqua);border-radius:8px;box-shadow:var(--tx-shadow-dot);pointer-events:auto;z-index:9;font:500 13px/1.4 var(--tx-font);animation:tuix-verify-in .24s var(--tx-ease)}.tuix-verify p{margin:0}.tuix-verify b{font-size:14px;font-weight:700}.tuix-verify .r,.tuix-verify .c{color:var(--tx-muted);font-size:12.5px;margin-top:2px}.tuix-verify .r{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tuix-verify div{display:flex;gap:8px;margin-top:10px}.tuix-verify button{all:initial;box-sizing:border-box;display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border:1px solid var(--tx-line-control);border-radius:8px;cursor:pointer;font:600 13px/1 var(--tx-font);color:var(--tx-ink)}.tuix-verify button:hover{background:var(--tx-raised)}.tuix-verify .k{background:var(--tx-aqua);border-color:var(--tx-aqua);color:var(--tx-on-aqua)}.tuix-verify button:focus-visible{outline:2px solid var(--tx-focus);outline-offset:2px}.tuix-verify-live{position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}@keyframes tuix-verify-in{from{opacity:0;transform:translateY(6px)}}@media(prefers-reduced-motion:reduce){.tuix-verify{animation:none}}`;

const truncate = (text: string, length = 80) => text.length > length ? text.slice(0, length - 1).trimEnd() + '…' : text;

/**
 * A calm card beside the launcher asking a reporter whether a fix on this page works now. It asks the server nothing until the summary says
 * the person has something to verify, and then looks once per page (and per change of the count) for the page's reports in review.
 */
export function mountVerifyPrompt(root: ShadowRoot, launcher: HTMLElement, config: Config, options: PromptOptions) {
  const t = translations(config.lang), now = options.now ?? Date.now, store = dismissals(config.project, now);
  const style = document.createElement('style'); if (config.nonce) style.nonce = config.nonce;
  style.textContent = css(config.position === 'bottom-left' ? 'left' : 'right');
  const card = document.createElement('section'), title = document.createElement('b'), report = document.createElement('p'), count = document.createElement('p');
  const actions = document.createElement('div'), check = document.createElement('button'), later = document.createElement('button');
  const live = document.createElement('div');
  card.className = 'tuix-verify'; card.hidden = true; card.setAttribute('role', 'group'); card.setAttribute('aria-label', t.verifyPrompt);
  title.textContent = t.verifyPrompt;
  report.className = 'r'; report.dir = 'auto'; count.className = 'c';
  check.type = later.type = 'button'; check.className = 'k'; check.textContent = t.verifyPromptCheck; later.textContent = t.verifyPromptLater;
  actions.append(check, later); card.append(title, report, count, actions);
  // Screen readers announce a change in a region that already exists, so the card itself is not the live region.
  live.className = 'tuix-verify-live'; live.setAttribute('aria-live', 'polite');
  root.append(style, card, live);

  let shown: Issue | undefined, announced = '', suppressed = false, destroyed = false, armed = false, deferred = false;
  let timer: ReturnType<typeof setTimeout> | undefined, sequence = 0, pageKey = '', total = 0, looked = '', checked = 0;
  const pageUrl = () => location.origin + location.pathname;
  const key = () => pageUrl() + '|' + currentRoute(config);

  function hide() {
    sequence++; clearTimeout(timer); timer = undefined; shown = undefined; card.hidden = true; live.textContent = '';
  }
  function dropFocus() {
    const active = root.activeElement;
    if (active && card.contains(active)) launcher.focus({ preventScroll: true });
  }
  function show(issue: Issue, many: number) {
    shown = issue;
    const label = '#' + issue.number + ' ' + (issue.title ?? '');
    report.textContent = truncate(label); report.title = label;
    count.hidden = many < 2; count.textContent = many < 2 ? '' : t.verifyPromptCount.replace('{count}', String(many));
    card.hidden = false;
    // Only a newly shown report is announced; a refresh of the same one stays quiet.
    const id = issue.id + '|' + reviewRound(issue);
    if (id !== announced) { announced = id; live.textContent = t.verifyPrompt + ' ' + truncate(label); }
  }
  async function run() {
    timer = undefined;
    if (destroyed || suppressed) return;
    if (document.hidden) { deferred = true; return; }
    const ticket = ++sequence, url = pageUrl(), at = key();
    checked = now();
    try {
      // Reviews are offered in every environment: a local session follows its Environment preference, as the summary does.
      const environments = options.api.environment === 'local' ? readPreferences(config.project).environment : '';
      const result = await options.api.request<{ issues: Issue[] }>('/issues?' + new URLSearchParams({ route_key: currentRoute(config), page_url: url, show: 'verify', involving: 'me', ...(environments ? { environments } : {}) }));
      if (destroyed || suppressed || ticket !== sequence || url !== pageUrl()) return;
      looked = at + '|' + total;
      const pick = Array.isArray(result?.issues) ? choose(result.issues, { active: config.enabled !== false, identified: true, pageUrl: url, panelOpen: options.isOpen(), deepLink: !!linkedIssue(), isDismissed: issue => store.isDismissed(issue) }) : null;
      if (pick) show(pick.issue, pick.count); else { shown = undefined; card.hidden = true; live.textContent = ''; }
    } catch { /* The page stays quiet; the capsule still counts. */ }
  }
  function schedule() {
    if (destroyed || suppressed) return;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), shown ? 0 : SETTLE_MS);
  }
  // Notifications from history and tab changes never throw into the host.
  function pageChanged() {
    try {
      if (destroyed || !armed) return;
      const next = key();
      if (next === pageKey) return;
      pageKey = next;
      // The old page's prompt goes; the new page is looked at once the route has settled.
      dropFocus(); hide(); announced = '';
      schedule();
    } catch { /* Navigation belongs to the host. */ }
  }
  function visible() {
    if (document.hidden || !armed || destroyed || suppressed) return;
    // A look that found the tab hidden is made now; a visible card is re-checked at most once a minute.
    if (deferred) { deferred = false; schedule(); } else if (shown && now() - checked >= RECHECK_MS) void run();
  }
  let restore: (() => void) | undefined;
  function watch() {
    if (armed) return;
    armed = true; pageKey = key();
    const push = history.pushState, replace = history.replaceState;
    // The wrappers hold only this reference; it is cleared when they can no longer be taken off the history.
    let notify: (() => void) | undefined = pageChanged;
    const wrapPush: History['pushState'] = function(this: History, ...args) { push.apply(this, args); notify?.(); };
    const wrapReplace: History['replaceState'] = function(this: History, ...args) { replace.apply(this, args); notify?.(); };
    history.pushState = wrapPush; history.replaceState = wrapReplace;
    window.addEventListener('popstate', pageChanged); window.addEventListener('hashchange', pageChanged);
    document.addEventListener('visibilitychange', visible);
    restore = () => {
      notify = undefined;
      if (history.pushState === wrapPush) history.pushState = push;
      if (history.replaceState === wrapReplace) history.replaceState = replace;
      window.removeEventListener('popstate', pageChanged); window.removeEventListener('hashchange', pageChanged);
      document.removeEventListener('visibilitychange', visible);
    };
  }
  function disarm() { restore?.(); restore = undefined; armed = false; deferred = false; looked = ''; }

  function decide(dismiss: boolean) {
    const issue = shown;
    // One decision per page load: the next report waits for the next one.
    suppressed = true; dropFocus(); hide();
    if (!issue) return;
    if (dismiss) store.dismiss(issue); else options.onCheck(issue.id);
  }
  check.onclick = () => decide(false);
  later.onclick = () => decide(true);
  card.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); decide(true); } });
  store.clean();

  return {
    /** `/me/summary` arrived: anything to verify starts the look at this page's reports, once per page and count (a card showing is re-checked). */
    sync(toVerify: number) {
      if (destroyed || suppressed) return;
      total = toVerify;
      if (!(toVerify > 0)) { hide(); disarm(); return; }
      watch();
      if (!shown && looked === key() + '|' + toVerify) return;
      schedule();
    },
    /** Something else took the stage (the panel, Settings, a chat window): no prompt for the rest of this page load. */
    suppress() { suppressed = true; hide(); },
    destroy() {
      destroyed = true; hide(); disarm();
      style.remove(); card.remove(); live.remove();
    },
  };
}
