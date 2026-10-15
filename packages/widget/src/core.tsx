import { PageReports, pageLink } from './page-reports';
import { VERSION } from './version';
import { EvidencePreview } from './evidence-preview';
import { mentionIds, type Mention, type EscapeRef } from './mentions';
import { ThreadComments, ReplyForm, VerifyTools, CloseIcon } from './thread';
import { ChatWindow } from './chat-window';
import { placeChat, CHAT_W, CHAT_MAX_H, CHAT_MIN_WIDTH } from './chat-placement';
import { tokenCss, outlineColor } from './tokens';
import { render, Fragment } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Api } from './api';
import { linkedIssue } from './deeplink';
import { deploymentReporter } from './deployment';
import { liveUpdates } from './live';
import { startCapture } from './capture';
import { locate, resolve, routeKey, ignored, type LocatorBundle, type Resolution } from './locators';
import { frameBatch } from './frame-batch';
import { locatorTelemetry, runtimeTelemetry } from './telemetry';
import { sourceLocation, editorLink, readEditor, saveEditor, defaultEditor, type SourceLocation } from './source';
import { pickElement } from './picker';
import { readMarkers } from './markers';
import { readPreferences, savePreferences, preferenceEvent, type OpenFilter, type PreferenceChange } from './preferences';
import { translations, statusLabel, turnLine } from './i18n';
import { stateOf, fixPending, normalizeState, terminal, unresolved, markActive, turnAfterReply, type State } from './states';
import type { RemoteConfig, Config, Core, Identity, Issue, Update, EmailPreference } from './types';
import css from './widget.css?inline';
import fontUrl from '@fontsource-variable/karla/files/karla-latin-wght-normal.woff2?url';
import fontExtendedUrl from '@fontsource-variable/karla/files/karla-latin-ext-wght-normal.woff2?url';
/** Dot marker diameter; `.pin` in widget.css must match so centring stays exact. */
const DOT = 28;
/** Hover card: how long a pointer rests on a marker before it opens, how long it lingers so the pointer can travel into it, and its width (`.hover-card` in widget.css). CARD_HEIGHT is only the guess for the first frame: the card is measured once drawn (it grows with its turn line and reply). */
const CARD_DELAY = 200, CARD_LINGER = 200, CARD_W = 272, CARD_HEIGHT = 132, CARD_GAP = 10, CARD_EDGE = 8;
/** Capture budget: a faithful pass, then a network-free fallback, both inside this bound. */
const SHOT_BUDGET = 8000;
/** How long the comment-mode hint stays before fading. */
const HINT_MS = 10000;
/** Touch-first devices select without an overlay, so the page keeps scrolling, and confirm before composing. */
const touchFirst = () => { try { return matchMedia('(hover: none) and (pointer: coarse)').matches; } catch { return false; } };
/** A report opens in a chat window beside its element on a pointer device with room for it; elsewhere in the side panel. */
const roomy = () => !touchFirst() && innerWidth >= CHAT_MIN_WIDTH;
/** The sidebar's width (`.panel` in widget.css): the chat window keeps out of its way. */
const PANEL_W = 360;
/** Pin and marker color follows the conversation: peach open, gold in progress, an aqua ring in review. */
const pinState = (state: string) => state === 'in_review' ? 'verify' : state === 'in_progress' ? 'warm' : 'open';
/** Fixer transitions; on an unassigned report the server assigns the caller first. */
const fixerStates: readonly string[] = ['in_progress', 'in_review', 'wont_fix'];
/** How often tuix emails a person (the server's `Tuix.EmailSchedule`), in the order offered. */
const emailSchedules = ['immediately', 'every_15_minutes', 'hourly', 'twice_daily', 'daily'] as const;
/** The browser's IANA zone, which the server checks; without one, summaries follow UTC. */
const timeZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { return undefined; } };
/** Only a web origin can be the dashboard ("Open tuix.app"). */
function dashboardOrigin(value: unknown): string {
  try { const url = new URL(String(value)); return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.origin : ''; } catch { return ''; }
}
const elementLabel = (element: Element) => element.tagName.toLowerCase() + (element.getAttribute('data-testid') ? ' · ' + element.getAttribute('data-testid')!.slice(0, 60) : '');
let screenshotLoad: Promise<typeof import('./screenshot')> | undefined;
/** Loads the capture module once; picking warms it so the click does not pay for the download. */
function screenshotModule() {
  screenshotLoad ??= import('./screenshot').catch(error => { screenshotLoad = undefined; throw error; });
  return screenshotLoad;
}
interface Draft { body: string; type: string; severity: string; locators: LocatorBundle; key: string; route: string; url: string }
interface Box { x: number; y: number; width: number; height: number }
interface Pin { issue: Issue; box: Box; orphan: boolean }
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16)); bytes[6] = bytes[6] & 15 | 64; bytes[8] = bytes[8] & 63 | 128;
  const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
};
function documents(root = document): Document[] {
  if (!root.documentElement) return [];
  const result = [root];
  for (const frame of root.querySelectorAll('iframe')) { try { if (frame.contentDocument) result.push(...documents(frame.contentDocument)); } catch { /* Cross-origin frame stays opaque. */ } }
  return result;
}
function boxOf(element: Element) {
  const box = element.getBoundingClientRect(); let x = box.x, y = box.y;
  let view = element.ownerDocument.defaultView;
  while (view && view !== window) { try { const frame = view.frameElement; if (!frame) break; const offset = frame.getBoundingClientRect(); x += offset.x; y += offset.y; view = frame.ownerDocument.defaultView; } catch { break; } }
  return { x, y, width: box.width, height: box.height };
}
function visiblePoint(element: Element, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const style = parent.ownerDocument.defaultView!.getComputedStyle(parent);
    if (/(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowX + style.overflowY)) {
      const box = boxOf(parent); if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) return false;
    }
  }
  try {
    const frame = element.ownerDocument.defaultView?.frameElement;
    if (frame) {
      const box = boxOf(frame);
      if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) return false;
      return visiblePoint(frame, x, y);
    }
  } catch { return false; }
  return true;
}
/** Where the hover card sits: beside the marker, else below or above it, and always inside the viewport; next to the pointer when the marker is too big to clear. `measured` is the card's drawn height. */
function cardAt(box: Box, pointer?: { x: number; y: number }, measured = 0) {
  const height = measured || CARD_HEIGHT;
  // A tall or wide element is anchored by the part of it on screen.
  const x = Math.max(box.x, 0), y = Math.max(box.y, 0);
  const anchor = { x, y, width: Math.min(box.x + box.width, innerWidth) - x, height: Math.min(box.y + box.height, innerHeight) - y };
  const clamp = (value: number, max: number) => Math.max(CARD_EDGE, Math.min(value, max));
  const maxX = innerWidth - CARD_W - CARD_EDGE, maxY = innerHeight - height - CARD_EDGE;
  const after = anchor.x + anchor.width + CARD_GAP, before = anchor.x - CARD_W - CARD_GAP;
  if (after <= maxX || before >= CARD_EDGE) return { left: clamp(after <= maxX ? after : before, maxX), top: clamp(anchor.y + anchor.height / 2 - height / 2, maxY) };
  // No room at either side (a wide element, a narrow screen).
  const below = anchor.y + anchor.height + CARD_GAP;
  // An element that fills the screen leaves no free side: the card goes beside the pointer, never under it, so clicks on the element still reach it.
  if (pointer && below > maxY && anchor.y - height - CARD_GAP < CARD_EDGE) {
    const right = pointer.x + CARD_GAP, lower = pointer.y + CARD_GAP;
    return { left: clamp(right <= maxX ? right : pointer.x - CARD_W - CARD_GAP, maxX), top: clamp(lower <= maxY ? lower : pointer.y - height - CARD_GAP, maxY) };
  }
  return { left: clamp(anchor.x + anchor.width / 2 - CARD_W / 2, maxX), top: clamp(below <= maxY ? below : anchor.y - height - CARD_GAP, maxY) };
}
/** The marker under a point: of overlapping boxes the smallest, so a button inside a card inside a section picks the button. */
function markerAt(pins: Pin[], x: number, y: number): Pin | null {
  let best: Pin | null = null;
  for (const pin of pins) {
    const { box } = pin;
    // A report still sending has no server id to open yet.
    if (pin.issue.status === 'sending') continue;
    if (x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height && (!best || box.width * box.height < best.box.width * best.box.height)) best = pin;
  }
  return best;
}
function environment(config: Config) {
  let context: Record<string, unknown> = {};
  try { const value = typeof config.context === 'function' ? config.context() : config.context ?? {}; if (new TextEncoder().encode(JSON.stringify(value)).length <= 4096) context = value; } catch { /* Invalid host context is omitted. */ }
  const hints = (navigator as Navigator & { userAgentData?: { brands: { brand: string; version: string }[]; mobile: boolean; platform: string } }).userAgentData;
  const clientHints = hints ? { brands: hints.brands.slice(0, 10), mobile: hints.mobile, platform: hints.platform } : undefined;
  return { clientHints, viewport: { width: innerWidth, height: innerHeight }, dpr: devicePixelRatio, title: document.title.slice(0, 200), ua: navigator.userAgent.slice(0, 500), lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone, online: navigator.onLine, release: config.release, context };
}
function currentRoute(config: Config) { try { return (config.route?.() ?? routeKey(location.href, config.keepQuery)).slice(0, 512); } catch { return routeKey(location.href); } }

function CheckIcon() { return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>; }

/** What the SDK shares with the core. All optional: tests and `launcher: false` hosts mount without a flyout. */
export interface Hooks {
  /** The SDK's API client, so the summary and the core share one identity token. */
  api?: Api;
  /** The settings flyout's slot: Updates on your reports and Open tuix.app render there instead of in the panel. */
  updates?: HTMLElement;
  /** Opens the settings flyout (the gold reply dot). */
  openSettings?: () => void;
  /** Reports may have changed (live update): the SDK refreshes its summary. */
  changed?: () => void;
}

export function mount(root: ShadowRoot, launcher: HTMLButtonElement, initial: Config, identity: Identity, onPanel: (active: boolean) => void, started?: number, hooks: Hooks = {}): Core {
  const style = document.createElement('style'); if (initial.nonce) style.nonce = initial.nonce;
  style.textContent = tokenCss + css;
  const fonts: FontFace[] = [];
  /** Karla loads the first time the panel opens; markers and the launcher never wait for it. */
  function loadFonts() {
    if (fonts.length || typeof FontFace === 'undefined') return;
    for (const url of [fontUrl, fontExtendedUrl]) {
      const font = new FontFace('Tuix Karla', `url('${url}')`, { weight: '200 800', unicodeRange: url === fontUrl ? 'U+0000-00FF,U+2000-206F,U+20AC' : 'U+0100-1EFF,U+20A0-20FF' });
      fonts.push(font);
      void font.load().then(loaded => { if (!disposed) document.fonts.add(loaded); }).catch(() => {});
    }
  }
  const container = document.createElement('div'); root.append(style, container);
  const api = hooks.api ?? new Api(initial, identity);
  const slot = hooks.updates;
  let toggle: (value: boolean) => void = () => {};
  let comment = () => {};
  let browse: (filter?: OpenFilter) => void = () => {};
  let suspend = () => false;
  let showSettings: (value: boolean) => void = () => {};
  let disposed = false;
  const reportLocators = locatorTelemetry(api);
  const runtime = runtimeTelemetry(api);
  const reportDeployment = deploymentReporter(api, initial.release);
  let activationStarted = 0, activation = 0, firstStarted = started, panelActive = false, chatActive = false;
  /** The sidebar or a chat window is open: a thread is on screen and keeps live. */
  const engaged = () => panelActive || chatActive;
  let live: ReturnType<typeof liveUpdates> | undefined;
  const cleanups = new Set<() => void>();
  function cleanup(action: () => void) { try { action(); } catch { /* Cleanup steps are independent. */ } }
  function useManagedEffect(effect: () => void | (() => void), dependencies: unknown[], useEffectHook = useEffect) {
    useEffectHook(() => {
      if (disposed) return;
      const release = effect();
      if (!release) return;
      const stop = () => { if (cleanups.delete(stop)) cleanup(release); };
      cleanups.add(stop);
      return stop;
    }, dependencies);
  }
  function App() {
    const t = translations(initial.lang);
    const [open, setOpen] = useState(false), [config, setConfig] = useState(initial), [ready, setReady] = useState(false);
    const [issues, setIssues] = useState<Issue[]>([]), [thread, setThread] = useState<Issue | null>(null);
    // Reading a report or a newer turn edits its entry in place. Marker resolution and the panel list follow `located`, which keeps its identity through such edits and changes only when a report comes, goes or is relocated.
    const located = useRef(issues), issuesRef = useRef(issues), repin = useRef(() => {});
    issuesRef.current = issues;
    if (located.current !== issues && !(located.current.length === issues.length && issues.every((issue, index) => issue.id === located.current[index].id && issue.locators === located.current[index].locators))) located.current = issues;
    const [source, setSource] = useState<SourceLocation | null>(null);
    const [editor, setEditor] = useState(() => api.environment === 'local' ? readEditor() : defaultEditor);
    const [editorNotice, setEditorNotice] = useState('');
    const [fixNote, setFixNote] = useState('');
    const [reviewNote, setReviewNote] = useState(''), [reviewing, setReviewing] = useState(false), [threadOrphan, setThreadOrphan] = useState(false);
    const [loading, setLoading] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [hint, setHint] = useState(false), [touchPick, setTouchPick] = useState(false);
    const [picking, setPicking] = useState(false), [highlight, setHighlight] = useState<{ x: number; y: number; width: number; height: number; label: string } | null>(null);
    const [preferences, setPreferences] = useState(() => readPreferences(initial.project));
    // A summary capsule or host filter applies to this view only, over the stored preferences (§7 items 10, 11).
    const [viewFilter, setViewFilter] = useState<OpenFilter>({});
    const shown = { ...preferences, ...viewFilter };
    const allPages = shown.scope === 'all';
    const envFilter = api.environment === 'local' ? preferences.environment : '';
    // The settings flyout is open (updates render there) / a composer is hidden behind it, kept in memory.
    const [flyout, setFlyout] = useState(false), [suspended, setSuspended] = useState(false);
    const suspendedRef = useRef(false);
    const [appUrl, setAppUrl] = useState(''), [linking, setLinking] = useState(false), [linkNotice, setLinkNotice] = useState('');
    // A handoff URL the person can open with their own click when the new tab did not open.
    const [handoffUrl, setHandoffUrl] = useState('');
    const [updatesError, setUpdatesError] = useState('');
    // A status change that needs a note (Won't fix, Still broken) waits here for it.
    const [pendingState, setPendingState] = useState<State | null>(null), [stateNote, setStateNote] = useState('');
    const [route, setRoute] = useState(currentRoute(initial));
    const [pageUrl, setPageUrl] = useState(location.origin + location.pathname);
    const pageRef = useRef(pageUrl), routeRef = useRef(route);
    const [pins, setPins] = useState<Pin[]>([]), [draft, setDraft] = useState<Draft | null>(null);
    // The report whose hover card shows; the timer counts down to the next card (an id) or to none (null).
    const [card, setCard] = useState<string | null>(null), [cardHeight, setCardHeight] = useState(0);
    const cardEl = useRef<HTMLButtonElement>(null);
    const cardRef = useRef<string | null>(null), cardPlan = useRef<string | null | undefined>(undefined), cardTimer = useRef<ReturnType<typeof setTimeout>>();
    // Where the pointer was last on the page, and where it was when the card opened; whether it is on the card; the Escape the card took and the report it dismissed (its card stays away until the pointer has left that marker); a focus handed back to a dot.
    const pointer = useRef({ x: 0, y: 0 }), cardPoint = useRef({ x: 0, y: 0 }), overCard = useRef(false), cardEscape = useRef<Event | null>(null), dismissed = useRef<string | null>(null), refocusing = useRef(false);
    const draftRef = useRef<Draft | null>(null); draftRef.current = draft;
    const [shot, setShot] = useState<Blob | null>(null), [preview, setPreview] = useState(''), [capturing, setCapturing] = useState(false);
    const [busy, setBusy] = useState(false), [reply, setReply] = useState(''), [updates, setUpdates] = useState<Update[]>([]);
    // People picked in the reply composer; only those still named in the reply are sent.
    const [mentions, setMentions] = useState<Mention[]>([]);
    const mentionEscape: EscapeRef = useRef(null);
    const [emailPreference, setEmailPreference] = useState<EmailPreference | null>(null);
    const dot = updates.length > 0;
    function acceptUpdates(list: Update[]) { setUpdates(Array.isArray(list) ? list : []); }
    /** Reading a report (or all of them) clears the hover card's unread dot at once; the next list says the same. */
    function clearUnread(id?: string) { setIssues(values => values.some(issue => issue.unread && (!id || issue.id === id)) ? values.map(issue => issue.unread && (!id || issue.id === id) ? { ...issue, unread: false } : issue) : values); }
    const [markers, setMarkers] = useState(() => readMarkers(initial.project));
    // The report whose chat window is open (people-and-statuses §7 item 16). Its thread is the one `thread` holds, shown in the window instead of the side panel.
    const [chat, setChat] = useState<Issue | null>(null), [expanded, setExpanded] = useState(false), [chatHeight, setChatHeight] = useState(0);
    const chatRef = useRef<Issue | null>(null), chatEl = useRef<HTMLElement>(null), chatBox = useRef<Box | null>(null);
    // The Escape the window took, so the sidebar's handler skips it; whether closing the window already put the focus back on its dot.
    const chatEscape = useRef<Event | null>(null), chatLeft = useRef(false);
    // What had the focus when the window opened (for a marker without a dot to return to), and the boxes of elements that are on the page but scrolled out of view.
    const chatOpener = useRef<HTMLElement | null>(null), away = useRef(new Map<string, Box>());
    const posting = useRef(false); posting.current = busy;
    const captureOptions = useRef('');
    const deepLink = useRef(linkedIssue());
    const capture = useRef<ReturnType<typeof startCapture> | null>(null), chosen = useRef<Element | null>(null);
    const commentCursor = useRef<string | null>(null), threadRequests = useRef(0);
    const shotSequence = useRef(0), listSequence = useRef(0), threadSequence = useRef(0), openingSequence = useRef(0);
    const notificationSequence = useRef(0), fixing = useRef(false);
    const configurationSequence = useRef(0);
    const liveRefresh = useRef<(current: () => boolean) => Promise<void>>(async () => {});
    const formRef = useRef<HTMLFormElement>(null), panelRef = useRef<HTMLElement>(null);
    const reselecting = useRef<Draft | null>(null);
    const left = config.position === 'bottom-left';
    // A suspended composer keeps the sidebar open in memory but draws nothing.
    const visible = open && !suspended;
    // A visible sidebar always marks its reports; the stored preference only decides what survives closing it.
    // A composer hidden behind settings counts as closed here too, as it does for the SDK.
    const marking = visible || markers.pinned;
    // Route tracking lasts while the sidebar is open at all, so a page change still discards a hidden composer.
    const tracking = open || markers.pinned;
    const listening = marking || flyout;
    // Hover cards need a pointer that hovers, and no selection or composer in the way (people-and-statuses §7).
    const hoverable = marking && !picking && !draft && !touchFirst();
    /** An open window's own marker has no card; the others keep theirs, so another report replaces the window. */
    const cardable = (id: string) => id !== chatRef.current?.id;
    const marked = marking ? pins.filter(pin => pin.issue.url === location.origin + location.pathname) : [];
    const markedRef = useRef(marked); markedRef.current = marked;
    /** Moves the card toward `target` (a report to show, or null for none) after `delay`; a timer already counting down to it keeps running, so a moving pointer does not restart it. */
    function planCard(target: string | null, delay: number) {
      if (cardRef.current === target) { clearTimeout(cardTimer.current); cardPlan.current = undefined; return; }
      if (cardPlan.current === target) return;
      clearTimeout(cardTimer.current);
      const apply = () => {
        cardPlan.current = undefined;
        // A card closing under the keyboard focus hands it back to its dot (the card follows the dot in the DOM), so the person keeps their place.
        const active = root.activeElement;
        if (active?.classList.contains('hover-card')) { refocusing.current = true; (active.previousElementSibling as HTMLElement | null)?.focus?.({ preventScroll: true }); refocusing.current = false; }
        overCard.current = false; if (target) cardPoint.current = pointer.current;
        cardRef.current = target; setCard(target);
      };
      if (!delay) { cardPlan.current = undefined; apply(); } else { cardPlan.current = target; cardTimer.current = setTimeout(apply, delay); }
    }
    // The card's height decides where it sits (its turn line and reply vary); measure it before it is painted, and again when its content changes.
    useManagedEffect(() => {
      const element = cardEl.current;
      if (!card || !element) return;
      const measure = () => { const height = element.offsetHeight; if (height) setCardHeight(height); };
      measure();
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
      observer?.observe(element);
      return () => observer?.disconnect();
    }, [card], useLayoutEffect);
    useManagedEffect(() => { if (!hoverable) planCard(null, 0); }, [hoverable]);
    // The sidebar or a thread opening takes over from the card.
    useManagedEffect(() => { planCard(null, 0); }, [open, thread?.id]);
    useManagedEffect(() => () => clearTimeout(cardTimer.current), []);
    useManagedEffect(() => {
      if (!card) return;
      const close = () => planCard(null, 0);
      // The first Escape only dismisses the card; the panel's own Escape handler skips the event the card took.
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { cardEscape.current = event; dismissed.current = cardRef.current; close(); } };
      window.addEventListener('keydown', escape, true); window.addEventListener('scroll', close, true);
      return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('scroll', close, true); };
    }, [card]);
    // A card whose report is no longer drawn (page change, list refresh, covered element) has no pointer left to close it.
    const cardDrawn = !card || marked.some(pin => pin.issue.id === card);
    useManagedEffect(() => { if (!cardDrawn) planCard(null, 0); }, [cardDrawn]);
    // Outlines and fills let clicks through, so they cannot be hovered: the pointer is hit-tested against their boxes instead,
    // one passive listener, one test per frame, only while they are drawn. Dots hover on their own.
    useManagedEffect(() => {
      if (!hoverable || markers.style === 'dot' || !marked.length) return;
      let frame = 0, x = 0, y = 0;
      const probe = () => {
        frame = 0;
        const hit = markerAt(markedRef.current, x, y), id = hit && cardable(hit.issue.id) ? hit.issue.id : null;
        if (id && id === dismissed.current) return;
        dismissed.current = null; planCard(id, id ? CARD_DELAY : CARD_LINGER);
      };
      // The page sees tuix as its host element. On the card the card's own handlers decide; on the panel or the launcher the pointer has left the marker.
      const move = (event: PointerEvent) => {
        if (event.pointerType === 'touch') return;
        if (event.composedPath().includes(root.host)) { cancelAnimationFrame(frame); frame = 0; if (!overCard.current) planCard(null, CARD_LINGER); return; }
        x = event.clientX; y = event.clientY; pointer.current = { x, y };
        if (!frame) frame = requestAnimationFrame(probe);
      };
      const leave = () => planCard(null, CARD_LINGER);
      window.addEventListener('pointermove', move, { passive: true, capture: true });
      document.documentElement.addEventListener('pointerleave', leave);
      return () => { window.removeEventListener('pointermove', move, true); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(frame); };
    }, [hoverable, markers.style, marked.length > 0]);
    useManagedEffect(() => {
      const update = (event: Event) => {
        setPreferences(readPreferences(initial.project)); setMarkers(readMarkers(initial.project));
        // A preference the person chooses (Show, Involving, Pages) replaces the view's filter for it.
        const change = (event as CustomEvent<PreferenceChange | undefined>).detail;
        if (change?.project === initial.project) setViewFilter(filter => {
          const kept = { ...filter };
          for (const key of change.keys) delete kept[key as keyof OpenFilter];
          return kept;
        });
      };
      window.addEventListener(preferenceEvent, update);
      return () => window.removeEventListener(preferenceEvent, update);
    }, []);
    const sourceLink = source ? editorLink(editor, source) : null;
    function reconcilePage() {
      const next = location.origin + location.pathname, nextRoute = currentRoute(config);
      if (pageRef.current !== next || routeRef.current !== nextRoute) {
        pageRef.current = next; routeRef.current = nextRoute;
        listSequence.current++; threadSequence.current++; shotSequence.current++;
        chosen.current = null;
        reselecting.current = null;
        setIssues([]); setPins([]); setHighlight(null); setPicking(false);
        setDraft(null); setThread(null); dropChat(); setReviewing(false); setShot(null); setCapturing(false);
        setPageUrl(next); setRoute(nextRoute);
        // A composer hidden behind settings belonged to the old page: close its invisible sidebar quietly
        // (the SDK already counts it as closed, so focus and the flyout stay where they are).
        if (suspendedRef.current) { suspendedRef.current = false; setSuspended(false); panelActive = false; runtime.active(false); setOpen(false); live?.stop(); live = undefined; }
      }
    }
    /**
     * Shows a suspended sidebar again; true when a kept composer returns. With `keep` false the person chose
     * another view (a filtered list, an update, a marker), so the hidden composer's selection and text are dropped.
     * A caller that goes on to `toggle(true)` when nothing returns passes `announce` false, so the SDK hears once.
     */
    function resume(keep = true, announce = true) {
      if (!suspendedRef.current) return false;
      suspendedRef.current = false; setSuspended(false);
      if (!keep) { draftRef.current = null; setDraft(null); chosen.current = null; reselecting.current = null; shotSequence.current++; setShot(null); setCapturing(false); }
      const returned = keep && !!draftRef.current;
      if (returned || announce) onPanel(true);
      return returned;
    }
    toggle = value => {
      if (value && suspendedRef.current) { resume(); return; }
      // The sidebar opening takes over from a chat window; closing it leaves a window whose markers stay drawn.
      const keepChat = !value && !!chatRef.current && markers.pinned;
      if (value && chatRef.current) { dropChat(); setThread(null); threadSequence.current++; setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); shotSequence.current++; }
      if (value) reconcilePage();
      // Only a launcher draws the summary, so only then does a returning browser load the SDK early.
      if (value) { loadFonts(); if (initial.launcher !== false) markActive(initial.project); }
      if (value && !panelActive) { activation++; activationStarted = firstStarted ?? performance.now(); firstStarted = undefined; }
      panelActive = value; runtime.active(value); setOpen(value);
      // A window that stays keeps the connection: its effect owns it and stops it when the window goes too.
      if (!value && !keepChat) { live?.stop(); live = undefined; }
      if (!value) { suspendedRef.current = false; setSuspended(false); chosen.current = null; reselecting.current = null; setPicking(false); setDraft(null); }
      if (!value && !keepChat) { dropChat(); setThread(null); setReviewing(false); setShot(null); setCapturing(false); setPendingState(null); shotSequence.current++; threadSequence.current++; }
      // Markers can open the sidebar without the host SDK, which owns the launcher's open state.
      onPanel(value);
    };
    // Settings opened while composing: hide the composer, keep its selection and text; the launcher or Reports returns to it.
    suspend = () => {
      if (!panelActive || suspendedRef.current) return false;
      const kept = draftRef.current ?? reselecting.current;
      if (!kept) return false;
      if (!draftRef.current) { reselecting.current = null; draftRef.current = kept; setDraft(kept); setPicking(false); }
      suspendedRef.current = true; setSuspended(true); setHighlight(null);
      onPanel(false);
      return true;
    };
    showSettings = value => { if (value && initial.launcher !== false) markActive(initial.project); setFlyout(value); };
    const close = () => toggle(false);
    function resetMode() {
      threadSequence.current++; shotSequence.current++;
      setLoading(false); setReviewing(false); setShot(null); setCapturing(false);
      chosen.current = null;
      reselecting.current = null;
    }
    comment = () => {
      if (resume(true, false)) return;
      resetMode(); setTouchPick(touchFirst());
      toggle(true); setThread(null); setNotice(''); setError('');
      setDraft(null); setPicking(true);
    };
    browse = filter => {
      // Summary capsule and host filters apply to this view only: the stored Show, Involving and Pages stay the person's own.
      // State is set directly: right after mount the preference listener is not attached yet.
      if (filter) { setPreferences(readPreferences(initial.project)); setViewFilter(filter); }
      // Without a filter (the Reports dot) a composer hidden behind settings returns; a filter asks for the list.
      if (resume(!filter, false)) return;
      resetMode(); toggle(true); setPicking(false); setDraft(null); setThread(null);
    };
    async function fetchList(current = () => true) {
      const sequence = ++listSequence.current;
      try {
        // Page markers ignore the panel's filters: this page's unresolved reports from everyone.
        const result = await api.request<{ issues: Issue[] }>('/issues?' + new URLSearchParams({ route_key: route, page_url: pageUrl, show: 'unresolved', involving: 'everyone', ...(envFilter ? { environments: envFilter } : {}) }));
        if (current() && !disposed && sequence === listSequence.current && pageUrl === location.origin + location.pathname) { setIssues(result.issues.filter(issue => unresolved.includes(stateOf(issue)) && (!issue.url || issue.url === pageUrl))); runtime.loaded(performance.now() - activationStarted); }
        return true;
      } catch { if (current() && !disposed && sequence === listSequence.current) { setError(t.loadError); runtime.error('list'); } return false; }
    }
    async function openThread(issue: Pick<Issue, 'id'>, scroll = true, cursor: string | null = scroll ? null : commentCursor.current, inChat = false) {
      const sequence = ++threadSequence.current;
      threadRequests.current++;
      // A person's own open outlives the poll effect's cleanup, which the thread being cleared for it would otherwise trigger.
      if (scroll) openingSequence.current = sequence;
      if (scroll) { setLoading(true); setError(''); setDraft(null); setPicking(false); if (!inChat) dropChat(); }
      if (scroll) { setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); setPendingState(null); setStateNote(''); shotSequence.current++; }
      try {
        const detail = await api.request<Issue>('/issues/' + encodeURIComponent(issue.id) + (cursor ? '?before=' + encodeURIComponent(cursor) : ''));
        if (!disposed && sequence === threadSequence.current) {
          commentCursor.current = cursor; setThread(detail);
          if (scroll || api.environment === 'local' || stateOf(detail) === 'in_review') {
            const resolution = resolve(detail.locators, document, api.environment === 'local');
            const element = resolution.element; setThreadOrphan(resolution.orphaned);
            setSource(sourceLocation(element, api.environment));
            if (scroll) {
              setReply(''); setMentions([]); setFixNote('');
              // The chat window opens beside an element that is on screen already; the page stays where it is.
              if (!inChat) element?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth' });
            }
          }
          try {
            const unread = await api.request<{ notifications: Update[] }>('/issues/' + encodeURIComponent(issue.id) + '/read', 'POST', {});
            if (!disposed && sequence === threadSequence.current) { notificationSequence.current++; acceptUpdates(unread.notifications); clearUnread(issue.id); }
          } catch { /* Read acknowledgement retries when the visible thread refreshes. */ }
        }
      }
      catch (failure) {
        if (!disposed && sequence === threadSequence.current) {
          if (cursor && (failure as { status?: number } | null)?.status === 422) {
            await openThread(issue, false, null);
          } else if ((failure as { status?: number } | null)?.status === 404) {
            shotSequence.current++; setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); setThread(null); setNotice(t.reportUnavailable);
          } else { setError(t.loadError); runtime.error('thread'); }
        }
      }
      finally { threadRequests.current--; if (openingSequence.current === sequence) openingSequence.current = 0; if (!disposed && sequence === threadSequence.current) setLoading(false); }
    }
    /** Forgets the chat window; the thread it showed stays loaded, for the side panel to take over. */
    function dropChat() {
      if (!chatRef.current && !chatActive) return;
      chatActive = false; chatRef.current = null; chatBox.current = null; setChat(null); setExpanded(false); setChatHeight(0);
    }
    /** Puts the keyboard focus back on a report's dot, without its hover card opening. Outlines and fills have no dot: the element that had the focus when the window opened gets it, else the launcher. */
    function focusDot(id: string) {
      const dot = [...root.querySelectorAll<HTMLElement>('.pin')].find(item => item.dataset.issue === id);
      const target = dot ?? (chatOpener.current?.isConnected ? chatOpener.current : initial.launcher !== false ? launcher : null);
      if (target) { refocusing.current = true; target.focus({ preventScroll: true }); refocusing.current = false; }
    }
    /** Closes the chat window and its thread; the focus returns to the report's dot unless something else took it. */
    function closeChat(restore = true, leave = restore) {
      const id = chatRef.current?.id;
      if (!id) return;
      dropChat();
      // The window's own load is abandoned with it; nothing else is loading, and its `finally` no longer clears this.
      threadSequence.current++; shotSequence.current++; setLoading(false);
      setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); setThread(null); setNotice(''); setError('');
      // The sidebar's focus effect runs on this close; focus that stays in the host page (or on the dot) is not its to take.
      if (leave) chatLeft.current = visible;
      if (restore) focusDot(id);
    }
    /** One window at a time, beside the report's element; its thread loads as in the side panel (read, live updates). Choosing the same report again closes it. */
    function openChat(issue: Issue) {
      if (chatRef.current?.id === issue.id) { closeChat(); return; }
      chatBox.current = markedRef.current.find(pin => pin.issue.id === issue.id)?.box ?? null;
      const active = root.activeElement as HTMLElement | null;
      chatOpener.current = active && !active.classList.contains('hover-card') && !chatEl.current?.contains(active) ? active : null;
      chatActive = true; chatRef.current = issue; chatLeft.current = false;
      // The thread on hand belongs to another report: it must not stand in for this one if this one fails to load.
      if (thread?.id !== issue.id) { setThread(null); commentCursor.current = null; }
      setChat(issue); setExpanded(false); setChatHeight(0); setNotice(''); loadFonts();
      void openThread(issue, true, null, true);
    }
    /** "Open full thread" (and a window with no room left): the side panel shows the thread the window has loaded. */
    function fullThread() {
      const issue = chatRef.current;
      if (!issue) return;
      dropChat();
      if (!open) toggle(true);
      // A thread still on its way arrives in the panel; one that failed to load is asked for again.
      if (thread?.id !== issue.id && !threadRequests.current) void openThread(issue);
    }
    function acceptSettings(remote: Partial<Config>) {
      // Shopify's boot appearance is a snapshot, not a merchant override of later settings.
      const appearance = identity.reviewerSession ? { position: remote.position, theme: remote.theme } : {};
      const next = { ...remote, ...initial, ...appearance, enabled: remote.enabled !== false && initial.enabled !== false, telemetry: remote.telemetry !== false && initial.telemetry !== false, capture: {
        screenshot: remote.capture?.screenshot !== false && initial.capture?.screenshot !== false,
        console: remote.capture?.console !== false && initial.capture?.console !== false,
        network: remote.capture?.network !== false && initial.capture?.network !== false,
      } } as Config;
      setConfig(next);
      void reportDeployment(panelActive && !disposed, next.enabled !== false);
      runtime.allowed(next.enabled !== false && next.telemetry !== false);
      if (next.enabled === false) { live?.stop(); threadSequence.current++; shotSequence.current++; setPicking(false); setHighlight(null); setReviewing(false); setShot(null); setCapturing(false); setNotice(t.disabled); setReady(false); setIssues([]); setDraft(null); setThread(null); dropChat(); capture.current?.stop(); capture.current = null; return; }
      const options = { ...next.capture, network_allow: next.network_allow, network_deny: next.network_deny };
      const signature = JSON.stringify(options);
      // Diagnostics instrument the host only from the first panel activation; page markers alone never do.
      if ((panelActive || capture.current) && (!capture.current || captureOptions.current !== signature)) {
        capture.current?.stop(); capture.current = startCapture(options); captureOptions.current = signature;
      }
      if (next.capture?.screenshot === false) { shotSequence.current++; setShot(null); setCapturing(false); }
      setReady(true); setNotice(value => value === t.disabled ? '' : value);
    }
    async function refreshSettings(current: () => boolean) {
      const sequence = ++configurationSequence.current;
      const settings = await api.request<RemoteConfig>('/config', 'GET', undefined, false);
      if (disposed || !current() || sequence !== configurationSequence.current) return null;
      acceptSettings(settings);
      setAppUrl(dashboardOrigin(settings.app_url));
      return settings;
    }
    liveRefresh.current = async current => {
      if (!current() || !engaged() || disposed || document.hidden) return;
      const threadRequest = threadSequence.current;
      const notificationRequest = ++notificationSequence.current;
      await fetchList(current);
      if (!current() || !engaged() || disposed) return;
      const [settings, unread] = await Promise.all([
        refreshSettings(() => current() && engaged()),
        api.request<{ notifications: Update[] }>('/notifications'),
      ]);
      if (!current() || !engaged() || disposed) return;
      if (notificationRequest === notificationSequence.current) acceptUpdates(unread.notifications);
      hooks.changed?.();
      if (settings && settings.enabled !== false && thread && !busy && !fixing.current && !threadRequests.current && threadRequest === threadSequence.current) await openThread(thread, false);
    };
    // A thread read (or answered) after the list is newer on whose turn it is: the hover card follows it. The next list replaces the entry again.
    useManagedEffect(() => {
      if (!thread || thread.turn === undefined) return;
      setIssues(values => values.some(issue => issue.id === thread.id && issue.turn !== thread.turn) ? values.map(issue => issue.id === thread.id ? { ...issue, turn: thread.turn } : issue) : values);
    }, [thread]);
    useManagedEffect(() => {
      if (!(open || chat) || !ready) return;
      const connection = liveUpdates(api, () => liveRefresh.current(() => live === connection));
      live = connection;
      return () => { connection.stop(); if (live === connection) live = undefined; };
    }, [open || !!chat, ready]);
    useManagedEffect(() => {
      if (!listening) return;
      let stopped = false;
      // The sidebar opening or closing beside a chat window must not wipe the window's error or show it a loading state.
      if (!chatRef.current) { setLoading(true); setError(''); }
      refreshSettings(() => !stopped).catch(() => { if (!stopped) { setError(t.loadError); runtime.error('config'); } }).finally(() => { if (!stopped) setLoading(false); });
      return () => { stopped = true; };
    }, [listening, open]);
    useManagedEffect(() => () => { capture.current?.stop(); }, []);
    // The email opt-in is the reporter's own; load it once per open sidebar or flyout.
    useManagedEffect(() => {
      if (!(open || flyout) || !ready || emailPreference) return;
      let stopped = false;
      api.request<EmailPreference>('/preferences').then(value => { if (!stopped && !disposed) setEmailPreference(value); }).catch(() => { /* The switch stays hidden. */ });
      return () => { stopped = true; };
    }, [open, flyout, ready]);
    // Page markers and the current-page list.
    useManagedEffect(() => {
      if (!marking || !ready) return;
      let stopped = false;
      void fetchList();
      if (deepLink.current) { const id = deepLink.current; deepLink.current = null; void openThread({ id }); }
      const interval = setInterval(async () => {
        if (document.hidden) return;
        await fetchList();
        if (stopped || disposed) return;
        try { await refreshSettings(() => !stopped); }
        catch { if (!stopped && !disposed) runtime.error('refresh'); /* Next active poll retries. */ }
      }, 60000);
      return () => { stopped = true; clearInterval(interval); listSequence.current++; };
    }, [marking, open, ready, route, pageUrl, envFilter]);
    // Updates on your reports: for the open sidebar, pinned markers and the settings flyout.
    useManagedEffect(() => {
      if (!listening || !ready) return;
      let stopped = false;
      const load = () => {
        const request = ++notificationSequence.current;
        return api.request<{ notifications: Update[] }>('/notifications').then(result => {
          if (!stopped && !disposed && request === notificationSequence.current) acceptUpdates(result.notifications);
        }).catch(() => { if (!stopped && !disposed) runtime.error('notifications'); /* Next poll retries. */ });
      };
      void load();
      const interval = setInterval(() => { if (!document.hidden) void load(); }, 60000);
      return () => { stopped = true; clearInterval(interval); };
    }, [listening, open, ready]);
    useManagedEffect(() => {
      if (!(open || chat) || !thread) return;
      const interval = setInterval(() => { if (!document.hidden && !posting.current && !fixing.current && !threadRequests.current) void openThread(thread, false); }, 60000);
      return () => { clearInterval(interval); if (threadSequence.current !== openingSequence.current) threadSequence.current++; };
    }, [open || !!chat, thread?.id]);
    useManagedEffect(() => {
      if (!tracking) return;
      const checkRoute = reconcilePage;
      const originalPush = history.pushState, originalReplace = history.replaceState;
      const push: History['pushState'] = function(this: History, ...args) { originalPush.apply(this, args); checkRoute(); };
      const replace: History['replaceState'] = function(this: History, ...args) { originalReplace.apply(this, args); checkRoute(); };
      history.pushState = push; history.replaceState = replace;
      window.addEventListener('popstate', checkRoute); window.addEventListener('hashchange', checkRoute);
      // Navigation may have happened while markers were inactive and history was
      // intentionally untouched. Reconcile once when tracking starts; listeners alone
      // only observe future changes and otherwise leave the first list request stale.
      checkRoute();
      return () => { if (history.pushState === push) history.pushState = originalPush; if (history.replaceState === replace) history.replaceState = originalReplace; window.removeEventListener('popstate', checkRoute); window.removeEventListener('hashchange', checkRoute); };
    }, [tracking, config]);
    useManagedEffect(() => {
      if (!marking || !ready) { setPins([]); away.current = new Map(); return; }
      let frame = 0, debounce: ReturnType<typeof setTimeout>;
      let resolved: { issue: Issue; resolution: Resolution }[] = [];
      let cancelResolution = () => {};
      let resolving = false, refreshPending = false;
      const update = () => {
        frame = 0; setRoute(currentRoute(config));
        const values: Pin[] = [], offscreen = new Map<string, Box>();
        const latest = new Map(issuesRef.current.map(value => [value.id, value]));
        for (const { issue: resolvedIssue, resolution } of resolved) {
          const issue = latest.get(resolvedIssue.id) ?? resolvedIssue;
          if (resolution.element && !resolution.element.isConnected) continue;
          const rect = issue.locators?.rect;
          if (!resolution.element && (!rect || ![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite))) continue;
          const box = resolution.element ? boxOf(resolution.element) : { x: issue.locators.rect.x - scrollX, y: issue.locators.rect.y - scrollY, width: issue.locators.rect.w, height: issue.locators.rect.h };
          // Both marker styles hang on the element centre, so one visibility test covers them.
          const x = box.x + box.width / 2, y = box.y + box.height / 2;
          if (!(box.width > 0 && box.height > 0)) continue;
          // An element scrolled out of view is still on the page: the chat window keeps following its box.
          if (resolution.element ? visiblePoint(resolution.element, x, y) : x >= 0 && y >= 0 && x < innerWidth && y < innerHeight) values.push({ issue, box, orphan: resolution.orphaned }); else offscreen.set(issue.id, box);
        }
        away.current = offscreen;
        setPins(values);
      };
      const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
      const refresh = () => {
        if (resolving) { refreshPending = true; return; }
        resolving = true;
        cancelResolution = frameBatch(issues, issue => ({ issue, resolution: resolve(issue.locators, document, api.environment === 'local') }), values => {
          // From here the resolution can be reused: an edited entry may redraw the markers from it.
          resolved = values; resolving = false; repin.current = schedule; schedule();
          reportLocators(config.telemetry !== false, values, config.release);
          if (refreshPending) { refreshPending = false; refresh(); }
        });
      };
      const observer = new MutationObserver(() => { schedule(); clearTimeout(debounce); debounce = setTimeout(refresh, 150); });
      const docs = documents();
      docs.forEach(doc => { const target = doc.body ?? doc.documentElement; if (target) observer.observe(target, { childList: true, subtree: true, attributes: true }); doc.addEventListener('scroll', schedule, true); });
      window.addEventListener('resize', schedule); refresh();
      return () => { repin.current = () => {}; observer.disconnect(); cancelResolution(); cancelAnimationFrame(frame); clearTimeout(debounce); docs.forEach(doc => doc.removeEventListener('scroll', schedule, true)); window.removeEventListener('resize', schedule); };
    }, [marking, ready, located.current, config]);
    // An edited entry (read, a newer turn) redraws the markers and card from the resolution already made.
    useManagedEffect(() => { repin.current(); }, [issues]);
    useManagedEffect(() => { if (!picking) setHighlight(null); else if (config.capture?.screenshot !== false) void screenshotModule().catch(() => {}); }, [picking]);
    // Comment mode explains itself once, then gets out of the way; the page frame and launcher ring persist.
    useManagedEffect(() => {
      if (!visible || !picking) { setHint(false); return; }
      setHint(true);
      const timer = setTimeout(() => setHint(false), HINT_MS);
      return () => clearTimeout(timer);
    }, [visible, picking]);
    function choose(element: Element | null) {
      if (!element) { chosen.current = null; setHighlight(null); return null; }
      chosen.current = element;
      setHighlight({ ...boxOf(element), label: elementLabel(element) });
      return element;
    }
    function movePicker(event: MouseEvent) { return choose(pickElement(event.clientX, event.clientY, event.altKey)); }
    function chooseParent() {
      const parent = chosen.current?.parentElement;
      if (parent && parent !== parent.ownerDocument.documentElement && !ignored(parent)) choose(parent);
    }
    // Touch selection listens on the page itself: no overlay, so swipes scroll it. A tap
    // previews an element (links and controls do not act); "Comment here" confirms it.
    useManagedEffect(() => {
      if (!visible || !picking || !ready || !touchPick) return;
      const host = root.host;
      const own = (event: Event) => event.composedPath().includes(host);
      const tap = (event: MouseEvent) => {
        if (own(event)) return;
        event.preventDefault(); event.stopPropagation();
        const doc = (event.target as Node | null)?.ownerDocument ?? document;
        const view = doc.defaultView;
        let x = event.clientX, y = event.clientY;
        // Same-origin frame coordinates are local; lift them to the top document.
        try { const frame = view?.frameElement; if (frame) { const box = boxOf(frame); x += box.x; y += box.y; } } catch { /* Opaque frame. */ }
        choose(pickElement(x, y));
      };
      // Keep taps from focusing fields or starting host interactions while selecting.
      const hold = (event: Event) => { if (!own(event)) event.preventDefault(); };
      const follow = () => { const element = chosen.current; if (element?.isConnected) setHighlight(value => value && { ...value, ...boxOf(element) }); };
      const docs = documents();
      docs.forEach(doc => { doc.addEventListener('click', tap, true); doc.addEventListener('mousedown', hold, true); doc.addEventListener('scroll', follow, true); });
      window.addEventListener('resize', follow);
      return () => { docs.forEach(doc => { doc.removeEventListener('click', tap, true); doc.removeEventListener('mousedown', hold, true); doc.removeEventListener('scroll', follow, true); }); window.removeEventListener('resize', follow); };
    }, [visible, picking, ready, touchPick]);
    // A suspended composer is hidden behind the settings flyout: Escape there closes only the flyout.
    useManagedEffect(() => {
      if (!visible) return;
      const keydown = (event: KeyboardEvent) => {
        // An open mention list takes Escape first; the panel stays open.
        if (event.key === 'Escape' && event !== cardEscape.current && event !== chatEscape.current) { event.preventDefault(); if (!mentionEscape.current?.()) close(); }
        if (draft && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); formRef.current?.requestSubmit(); }
      };
      const docs = documents(); docs.forEach(doc => doc.addEventListener('keydown', keydown, true));
      return () => docs.forEach(doc => doc.removeEventListener('keydown', keydown, true));
    // Escape must work as soon as the sidebar is painted, including during config loading.
    }, [visible, picking, draft, thread], useLayoutEffect);
    useManagedEffect(() => {
      // A chat window keeps the focus it took; closing it to its dot leaves the panel alone too.
      if (!visible || chat) return;
      if (chatLeft.current) { chatLeft.current = false; return; }
      if (draft) formRef.current?.querySelector('textarea')?.focus({ preventScroll: true }); else if (!picking) panelRef.current?.querySelector('button')?.focus({ preventScroll: true });
    }, [visible, !!draft, picking, !!thread, !!chat]);
    // The chat window takes the focus when it opens; Escape closes it (an open mention list takes the first one), and the sidebar's handler skips that event.
    useManagedEffect(() => { if (chat) chatEl.current?.focus({ preventScroll: true }); }, [chat?.id], useLayoutEffect);
    useManagedEffect(() => {
      if (!chat) return;
      // Focus in the host page (its own input, an autocomplete) keeps its Escape: the window closes, but the host's focus stays.
      const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !cardRef.current) { chatEscape.current = event; const inside = !!root.activeElement; if (inside) event.preventDefault(); if (!(inside && mentionEscape.current?.())) closeChat(inside, true); } };
      window.addEventListener('keydown', escape, true);
      return () => window.removeEventListener('keydown', escape, true);
    }, [chat?.id, visible]);
    // Markers going away (settings, an unpinned closed sidebar) leave the window nothing to hang on.
    useManagedEffect(() => { if (chat && !marking) closeChat(false); }, [!!chat, marking]);
    // No room for the window any more (a narrower screen, a touch device): the side panel takes the thread over.
    const fits = !chat || roomy();
    useManagedEffect(() => { if (chat && !fits) fullThread(); }, [!!chat, fits]);
    // The window's height decides where it sits; measure it once it is drawn.
    useManagedEffect(() => {
      const element = chatEl.current;
      if (!chat || !element) return;
      const measure = () => { const height = element.offsetHeight; if (height) setChatHeight(height); };
      measure();
      // Content changes (replies, the mention list, notes) resize it; scrolling the page does not.
      const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
      observer?.observe(element);
      return () => observer?.disconnect();
    }, [chat?.id], useLayoutEffect);
    // A render that grows it (the thread arriving) is measured before paint: the observer reports a frame later,
    // and for that frame the window would hang past the viewport. An unchanged height does not render again.
    useLayoutEffect(() => { const height = !disposed && chat ? chatEl.current?.offsetHeight : 0; if (height) setChatHeight(height); });
    useManagedEffect(() => {
      if (reviewing && (thread ? stateOf(thread) : '') !== 'in_review') {
        shotSequence.current++; setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); setNotice(t.reviewChanged);
      }
    }, [reviewing, thread?.state, thread?.status]);
    useManagedEffect(() => { if (reviewing) { const form = (chatEl.current ?? panelRef.current)?.querySelector<HTMLElement>('.verify-tools'); form?.scrollIntoView?.({ block: 'start' }); form?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }); } }, [reviewing]);
    // A note form replaces the action that opened it, so it takes the focus.
    useManagedEffect(() => { if (pendingState) { const form = panelRef.current?.querySelector<HTMLElement>('.state-note'); form?.scrollIntoView?.({ block: 'start' }); form?.querySelector<HTMLTextAreaElement>('textarea')?.focus({ preventScroll: true }); } }, [pendingState]);
    /** A finished thread action removes the control that ran it: keep keyboard focus in the thread, on its state. */
    /** The same in the chat window: an action that removes the control holding the focus (Show earlier, Done, a note form) hands it to the window before it goes, so Escape still returns it to the dot. */
    const holdChatFocus = () => { const element = chatEl.current; if (element && element.contains(root.activeElement)) element.focus({ preventScroll: true }); };
    const focusState = () => panelRef.current?.querySelector<HTMLElement>('.thread-state')?.focus({ preventScroll: true });
    useManagedEffect(() => { if (!shot) { setPreview(''); return; } const url = URL.createObjectURL(shot); setPreview(url); return () => URL.revokeObjectURL(url); }, [shot]);
    async function compose(element: Element) {
      if (!ready || config.enabled === false) return;
      const previous = reselecting.current; reselecting.current = null;
      const next = { body: previous?.body ?? '', type: previous?.type ?? 'bug', severity: previous?.severity ?? '', locators: locate(element), key: previous?.key ?? uuid(), route, url: location.origin + location.pathname };
      setDraft(next); setPicking(false); setThread(null); setShot(null); setError('');
      await captureShot(element);
    }
    async function captureShot(element: Element, color = outlineColor) {
      if (!ready || config.enabled === false) return;
      setShot(null);
      const sequence = ++shotSequence.current;
      if (config.capture?.screenshot === false) { setCapturing(false); return; }
      setCapturing(true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = performance.now() + SHOT_BUDGET;
      try {
        const work = screenshotModule().then(module => performance.now() < deadline && !disposed && sequence === shotSequence.current ? module.screenshot(element, color, deadline - performance.now()) : null);
        // The capture has its own internal deadline; this outer bound only guards a stalled module load.
        const blob = await Promise.race([work, new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), SHOT_BUDGET + 500); })]);
        if (!disposed && sequence === shotSequence.current) { setShot(blob); if (!blob) runtime.error('screenshot'); }
      }
      catch { if (!disposed && sequence === shotSequence.current) runtime.error('screenshot'); /* Screenshot failure never blocks text feedback. */ }
      finally { if (timer) clearTimeout(timer); if (!disposed && sequence === shotSequence.current) setCapturing(false); }
    }
    function editDraft(change: Partial<Draft>) { if (draft) { const value = { ...draft, ...change }; setDraft(value); } }
    async function submit() {
      if (!ready || config.enabled === false || !draft || busy || capturing || !draft.body.trim()) return;
      const submittedActivation = activation;
      const submittedThread = ++threadSequence.current;
      setBusy(true); setError('');
      const optimistic: Issue = { id: draft.key, number: 0, title: draft.body.split('\n')[0], status: 'sending', type: draft.type, severity: draft.severity, env_name: api.environment, url: draft.url, route_key: draft.route, locators: draft.locators, author: { name: identity.name }, comment_count: 0, inserted_at: new Date().toISOString(), updated_at: new Date().toISOString() };
      setIssues(values => [optimistic, ...values]); setDraft(null); setNotice(t.sending);
      try {
        const attachments: string[] = [];
        if (shot) {
          const upload = await api.request<{ id: string; url: string; headers: Record<string, string> }>('/uploads', 'POST', { content_type: 'image/png', byte_size: shot.size });
          await api.upload(upload.url, upload.headers, shot); attachments.push(upload.id);
        }
        const issue = await api.request<Issue>('/issues', 'POST', { body: draft.body, type: draft.type, severity: draft.type === 'bug' ? draft.severity || null : null, locators: draft.locators, route_key: draft.route, url: draft.url, idempotency_key: draft.key, release: config.release, widget_version: VERSION, environment: environment(config), ...capture.current?.snapshot(), attachments });
        if (disposed) return;
        if (submittedActivation === activation) runtime.submitted(performance.now() - activationStarted);
        if (submittedThread === threadSequence.current && submittedActivation === activation && panelActive) {
          setShot(null); commentCursor.current = null; setThread(issue); setSource(api.environment === 'local' ? sourceLocation(resolve(issue.locators, document, true).element, 'local') : null); setNotice(t.sent); void fetchList();
        }
      } catch { if (!disposed) { if (submittedThread === threadSequence.current && submittedActivation === activation && panelActive) { setNotice(''); setDraft(draft); setError(t.error); } runtime.error('submit'); } }
      finally { if (!disposed) { setBusy(false); setNotice(value => value === t.sending ? '' : value); setIssues(values => values.filter(issue => issue.id !== optimistic.id)); } }
    }
    async function replyToThread() {
      if (!thread || busy || !reply.trim()) return;
      const sequence = threadSequence.current, body = reply, pending = uuid(), picked = mentions, ids = mentionIds(body, picked);
      setBusy(true); setError(''); setReply(''); setMentions([]);
      const turn = thread.turn;
      setThread(value => value && { ...value, turn: turnAfterReply(value), comments: [...(value.comments ?? []), { id: pending, body, pending: true, author: { name: identity.name }, team: false, inserted_at: new Date().toISOString() }] });
      try {
        // Servers before mentions read only `body`; a reply without mentions sends nothing else.
        await api.request('/issues/' + thread.id + '/comments', 'POST', ids.length ? { body, mentions: ids } : { body });
        if (!disposed && engaged() && sequence === threadSequence.current) void openThread(thread, false, null);
      } catch {
        if (!disposed && engaged() && sequence === threadSequence.current) {
          setThread(value => value && { ...value, turn, comments: value.comments?.filter(comment => comment.id !== pending) });
          // The picks come back with the text; pruning before the next send drops any the text no longer names.
          setReply(value => value || body); setMentions(value => [...value, ...picked.filter(pick => !value.some(kept => kept.id === pick.id))]);
          setError(t.replyError); runtime.error('reply');
        }
      } finally { if (!disposed) setBusy(false); }
    }
    async function markFixed() {
      if (!thread || busy || fixing.current || !fixNote.trim() || api.environment !== 'local') return;
      fixing.current = true;
      const sequence = ++threadSequence.current;
      setLoading(false);
      setBusy(true); setError('');
      try {
        const updated = await api.request<Issue>('/issues/' + thread.id + '/fix', 'POST', {
          note: fixNote, ...(initial.commit ? { commit: initial.commit } : initial.release ? { release: initial.release } : {}),
        });
        if (!disposed && panelActive && sequence === threadSequence.current) {
          commentCursor.current = null; setThread(updated); setFixNote(''); setNotice(t.fixSaved); await fetchList();
        }
      } catch {
        if (!disposed && panelActive && sequence === threadSequence.current) setError(t.fixError);
      } finally { fixing.current = false; if (!disposed) setBusy(false); }
    }
    function startReview() {
      if (!thread || busy) return;
      setReviewing(true); setReviewNote(''); setError('');
      // The small window attaches no new screenshot; Still broken there is the note alone.
      if (!chatRef.current) void captureShot(resolve(thread.locators, document).element ?? document.body);
    }
    function cancelReview() { setReviewing(false); shotSequence.current++; setShot(null); setCapturing(false); }
    /** The reporter's decision on a report in review (any environment); Still broken may carry a new screenshot. */
    async function verifyThread(outcome: 'works' | 'broken') {
      if (!thread || busy || fixing.current || capturing || (outcome === 'broken' && !reviewNote.trim())) return;
      fixing.current = true; const sequence = ++threadSequence.current;
      setBusy(true); setLoading(false); setError('');
      try {
        const attachments: string[] = [];
        if (outcome === 'broken' && shot && config.capture?.screenshot !== false) {
          const upload = await api.request<{ id: string; url: string; headers: Record<string, string> }>('/uploads', 'POST', { content_type: 'image/png', byte_size: shot.size });
          await api.upload(upload.url, upload.headers, shot); attachments.push(upload.id);
        }
        const updated = await api.request<Issue>('/issues/' + thread.id + '/verify', 'POST', outcome === 'works' ? { outcome } : { outcome, note: reviewNote, attachments });
        if (!disposed && engaged() && sequence === threadSequence.current) {
          setReviewing(false); setReviewNote(''); setShot(null); setCapturing(false); shotSequence.current++;
          commentCursor.current = null;
          // The window stays open on a verified report, showing its new state and the thanks; the panel goes back to the list.
          setThread(outcome === 'works' && !chatRef.current ? null : updated); setNotice(outcome === 'works' ? t.verified : t.reopened);
          await fetchList();
          try {
            const unread = await api.request<{ notifications: Update[] }>('/notifications');
            if (!disposed && engaged()) { notificationSequence.current++; acceptUpdates(unread.notifications); }
          } catch { /* The decision succeeded; badge refresh can retry on the active poll. */ }
        }
      } catch { if (!disposed && engaged() && sequence === threadSequence.current) setError(t.verifyError); }
      finally { fixing.current = false; if (!disposed) setBusy(false); }
    }
    async function readAllUpdates() {
      const previous = updates;
      notificationSequence.current++; acceptUpdates([]); clearUnread(); setUpdatesError('');
      try { await api.request('/notifications/read', 'POST', {}); }
      catch { if (!disposed) { acceptUpdates(previous); setUpdatesError(t.loadError); } }
    }
    /** Saves the email opt-in or how often tuix emails, at once on screen and restored if the save fails. */
    async function changeEmail(change: { notify_email: boolean } | { email_schedule: string }) {
      const previous = emailPreference;
      if (!previous) return;
      setEmailPreference({ ...previous, ...change }); setUpdatesError('');
      // Summaries go out at the reader's own times: the browser's zone goes with the choice.
      const body = 'email_schedule' in change ? { ...change, time_zone: timeZone() } : change;
      try { const saved = await api.request<EmailPreference>('/preferences', 'POST', body); if (!disposed) setEmailPreference(saved); }
      catch { if (!disposed) { setEmailPreference(previous); setUpdatesError(t.emailSaveError); } }
    }
    /** Applies an issue returned by a thread action, or reloads the thread when the response is not one. */
    function acceptThread(updated: Issue | null | undefined, id: string) {
      commentCursor.current = null;
      if (updated?.id === id) setThread(value => value?.id === id ? { ...value, ...updated } : value);
      else void openThread({ id }, false, null);
    }
    /** One thread action at a time; failures keep any note for a retry. */
    async function threadAction(path: 'state' | 'assign', body: object, failure: string, saved?: string) {
      if (!thread || busy || fixing.current) return;
      fixing.current = true;
      const sequence = ++threadSequence.current, id = thread.id;
      setBusy(true); setLoading(false); setError('');
      try {
        const updated = await api.request<Issue>('/issues/' + encodeURIComponent(id) + '/' + path, 'POST', body);
        if (!disposed && panelActive && sequence === threadSequence.current) {
          setPendingState(null); setStateNote(''); acceptThread(updated, id); setNotice(saved ?? ''); focusState();
          await fetchList();
        }
      // 'resolve' is the server's runtime category for status actions (runtime_telemetry.ex accepts no other name for them).
      } catch { if (!disposed && panelActive && sequence === threadSequence.current) { setError(failure); runtime.error('resolve'); } }
      finally { fixing.current = false; if (!disposed) setBusy(false); }
    }
    const changeState = (state: State, note?: string) => threadAction('state', note === undefined ? { state } : { state, note }, t.stateError, t.stateSaved.replace('{status}', statusLabel(state, initial.lang)));
    const assignToMe = () => threadAction('assign', {}, t.assignError);
    /** Open tuix.app: a one-time handoff when this person is linked and signed, otherwise an emailed sign-in link.
     *  The link's own address, for a middle click or a copied link, is sign-in (`/login`), never the bare origin,
     *  which is the marketing page once it is on. The handoff itself uses the origin (`appUrl`) only. */
    async function openDashboard(event: Event) {
      event.preventDefault();
      if (linking || !appUrl) return;
      setLinking(true); setLinkNotice(''); setHandoffUrl('');
      try {
        let target: URL | null = null;
        try {
          const handoff = await api.request<{ url: string }>('/account/handoff', 'POST', {});
          const url = new URL(handoff.url, appUrl);
          if (url.origin === appUrl) target = url;
        } catch (failure) {
          // Only 403 handoff_unavailable falls back to an emailed link; a server or network failure is a retry.
          if ((failure as { status?: number } | null)?.status !== 403) throw failure;
        }
        if (target) {
          if (disposed) return;
          // The click's activation lasts a few seconds; after a slow handoff a new tab would be blocked, so skip it.
          const activation = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
          const tried = activation?.isActive !== false;
          if (tried) window.open(target.href, '_blank', 'noopener,noreferrer');
          // With noopener the browser never reports a blocked tab: the handoff stays one click away.
          setHandoffUrl(target.href); setLinkNotice(tried ? t.appNotOpened : '');
          return;
        }
        await api.request('/account/link', 'POST', {});
        if (!disposed) setLinkNotice(t.linkSent);
      } catch (failure) {
        if (!disposed) setLinkNotice((failure as { status?: number } | null)?.status === 422 ? t.linkNeedsEmail : t.linkError);
      } finally { if (!disposed) setLinking(false); }
    }
    // A handoff link is single use and expires after 60 seconds; drop it before then.
    useManagedEffect(() => {
      if (!handoffUrl) return;
      const timer = setTimeout(() => { setHandoffUrl(''); setLinkNotice(value => value === t.appNotOpened ? '' : value); }, 55000);
      return () => clearTimeout(timer);
    }, [handoffUrl]);
    useManagedEffect(() => {
      launcher.style.left = left ? '16px' : '';
      launcher.style.right = left ? '' : '16px';
      launcher.setAttribute('aria-expanded', String(visible));
      // Comment mode is a page-wide state: the launcher carries a ring while it lasts.
      if (visible && picking) launcher.dataset.mode = 'comment'; else delete launcher.dataset.mode;
      // Announce comment mode as a pressed state only while it lasts; otherwise the launcher is a plain button.
      if (visible && picking) launcher.setAttribute('aria-pressed', 'true'); else launcher.removeAttribute('aria-pressed');
    }, [left, visible, picking]);
    const logs = capture.current?.snapshot();
    /** Updates on your reports: five newest in an internal scroll, Mark all as read and the email switch. */
    const updatesSection = <section class="updates" aria-labelledby="tuix-updates-title">
      <div class="updates-head"><h3 id="tuix-updates-title">{t.updates}</h3>{updates.length > 0 && <button type="button" class="text-button" data-action="read-updates" onClick={() => void readAllUpdates()}>{t.markAllRead}</button>}</div>
      {updates.length ? <ul class="update-list">{updates.slice(0, 5).map(update => {
        const label = t.updateKinds[update.state_kind ?? ''] ?? t.updateKinds[normalizeState(update.kind)] ?? statusLabel(update.issue?.state ?? update.issue?.status ?? '', initial.lang);
        const title = update.issue ? `#${update.issue.number} ${update.issue.title}` : t.updateUnavailable;
        const elsewhere = update.issue?.url && update.issue.url !== pageUrl ? pageLink(update.issue.url, update.issue_id) : null;
        const content = <><span class="update-kind">{label}</span><strong>{title}</strong><time>{new Date(update.inserted_at).toLocaleString(initial.lang)}</time></>;
        // Updates for another page return there, where the report's marker can be shown.
        return <li key={update.id}>{elsewhere ? <a class="update-item" href={elsewhere.href}>{content}</a> : <button type="button" class="update-item" disabled={!update.issue} onClick={() => { if (!open) toggle(true); else resume(false); void openThread({ id: update.issue_id }); }}>{content}</button>}</li>;
      })}</ul> : <p class="muted">{t.noUpdates}</p>}
      {updatesError && <p class="error" role="alert">{updatesError}</p>}
      {emailPreference?.email_available && <label class="switch-row"><input type="checkbox" role="switch" data-setting="email-updates" checked={emailPreference.notify_email} onChange={event => void changeEmail({ notify_email: event.currentTarget.checked })}/>{t.emailUpdates}</label>}
      {/* Replies and mentions are emailed without the opt-in, so how often shows with any email (older servers send no schedule). */}
      {emailPreference?.email_available && emailPreference.email_schedule && <label class="schedule-row">{t.emailSchedule}<select data-setting="email-schedule" value={emailPreference.email_schedule} onChange={event => void changeEmail({ email_schedule: event.currentTarget.value })}>{emailSchedules.map(key => <option key={key} value={key}>{t.emailSchedules[key]}</option>)}</select></label>}
    </section>;
    // The flyout slot is a separate Preact root. It renders only while the flyout shows, and again whenever
    // a value it reads changes; its handlers close over those same values, so they stay current.
    useLayoutEffect(() => {
      if (!slot || disposed || !flyout) return;
      render(<div class="tuix-app flyout-extra" lang={initial.lang ?? (navigator.language.startsWith('pl') ? 'pl' : 'en')}>
        {ready ? updatesSection : error && <p class="error" role="alert">{error}</p>}
        {appUrl && <p class="app-link-row"><a class="app-link" href={`${appUrl}/login`} rel="noreferrer" data-action="open-app" aria-disabled={linking ? 'true' : undefined} onClick={event => void openDashboard(event)}>{linking ? t.openingApp : t.openApp}</a></p>}
        {(linkNotice || handoffUrl) && <p class="muted" role="status">{linkNotice}{linkNotice && handoffUrl ? ' ' : ''}{handoffUrl && <a class="app-link" href={handoffUrl} target="_blank" rel="noopener noreferrer" data-action="continue-app" onClick={() => setTimeout(() => { if (!disposed) { setHandoffUrl(''); setLinkNotice(''); } })}>{t.continueApp}</a>}</p>}
      </div>, slot);
    }, [flyout, ready, error, updates, updatesError, emailPreference, appUrl, linking, linkNotice, handoffUrl, open, pageUrl]);
    // Thread actions come from the caller's allowed states (people-and-statuses §5, §7 item 12); without them (a
    // server before §6) the thread is read-only.
    const threadState = thread ? stateOf(thread) : '';
    // The side panel shows the thread unless a chat window has it.
    const panelThread = chat ? null : thread;
    const allowed = new Set<string>(thread?.allowed_states ?? []);
    const closedThread = terminal.includes(threadState);
    const reporter = !!(thread?.reporter ?? thread?.own);
    // Fixer powers: the fixer, or anyone allowed to be one on an unassigned report (Start assigns them first).
    const takeable = !!thread?.can_be_fixer && !closedThread && (!!thread.fixer || !thread.assignee);
    // The server's allowed states decide, on finished reports too (a reporter may still close a Done report). Fixer
    // states also need can_be_fixer: an unsigned session may be the assignee, but the server refuses its fixer actions (§5).
    const may = (next: State) => !!thread && next !== threadState && (fixerStates.includes(next) ? !!thread.can_be_fixer && (allowed.has(next) || takeable) : allowed.has(next));
    // The reporter decides a report in review in the verification block, which can attach a new screenshot.
    const verifying = threadState === 'in_review' && reporter && (may('done') || may('open'));
    const actions = ([['done', t.actionDone], ['closed', t.actionClose], ['open', threadState === 'in_review' ? t.stillBroken : t.actionReopen], ['in_progress', t.actionStart], ['in_review', t.actionReview], ['wont_fix', t.actionWontFix]] as [State, string][])
      .filter(([next]) => may(next) && !(verifying && (next === 'done' || next === 'open')) && (next !== 'open' || threadState === 'in_review' || closedThread));
    const needsNote = (next: State) => next === 'wont_fix' || (next === 'open' && threadState === 'in_review');
    const canAssign = !!thread?.can_be_fixer && !thread.fixer && !thread.assignee?.me && !closedThread;
    const canFix = !!thread && api.environment === 'local' && takeable && (threadState === 'open' || threadState === 'in_progress') && !fixPending(thread);
    /** A marker or its hover card was chosen: the report opens in a chat window, or in the sidebar where there is no room (people-and-statuses §7 item 16). */
    function openMarker(issue: Issue) {
      if (issue.status === 'sending') return;
      planCard(null, 0);
      // With room for it, and no hidden composer to keep, the report opens in a window beside its element.
      if (roomy() && !suspendedRef.current) { openChat(issue); return; }
      if (!open) toggle(true); else resume(false);
      void openThread(issue);
    }
    /** The card keeps to what the list already carries: no request per hover. Text only, never HTML. */
    function hoverCard(pin: Pin, anchor: Box, point?: { x: number; y: number }) {
      const { issue } = pin, reply = issue.latest_comment, state = stateOf(issue);
      const unread = !!issue.unread || updates.some(update => update.issue_id === issue.id);
      const number = `#${issue.number || '…'}`, status = statusLabel(state, initial.lang);
      const author = reply?.team ? t.team : reply?.author.name;
      const turn = turnLine(issue, initial.lang);
      // Without a reply the card shows the start of the description, whole: its first line is the title, kept on a line of its own, so the title row gives way to the number. An older server sends no excerpt, and the title stays.
      const excerpt = reply ? '' : (issue.excerpt ?? '').replace(/\s*\n\s*/g, '\n').trim();
      const title = excerpt ? number : `${number} ${issue.title}`;
      const label = [excerpt ? `${number} ${excerpt.replace(/\n/g, ' ')}` : title, status, turn, pin.orphan && t.moved, unread && t.unreadUpdates, reply && `${author}: ${reply.body}`, !excerpt && reply === null && t.noReplies].filter(Boolean).join(' · ');
      return <button type="button" id="tuix-card" ref={cardEl} class="hover-card" data-state={pinState(state)} aria-label={label} style={{ ...cardAt(anchor, point, cardHeight), maxHeight: innerHeight - 2 * CARD_EDGE }}
        onPointerEnter={() => { overCard.current = true; planCard(cardRef.current, 0); }} onPointerLeave={() => { overCard.current = false; planCard(null, CARD_LINGER); }} onFocus={() => planCard(cardRef.current, 0)} onBlur={() => planCard(null, CARD_LINGER)} onClick={() => openMarker(issue)}>
        <span class="card-title">{unread && <span class="unread-dot" aria-hidden="true"/>}<strong>{title}</strong></span>
        <span class="card-meta"><span class="status" data-status={state}>{status}</span>{turn && <span class="turn">{turn}</span>}{pin.orphan && <span class="muted">{t.moved}</span>}</span>
        {reply ? <span class="card-reply"><strong>{author}</strong> {reply.body}</span> : excerpt ? <span class="card-reply card-excerpt">{excerpt}</span> : reply === null && <span class="card-reply muted">{t.noReplies}</span>}
      </button>;
    }
    // The chat window follows its element through the same live pins as the markers; when the element leaves, the window stays where it was.
    const chatPin = chat ? marked.find(pin => pin.issue.id === chat.id) : undefined;
    const chatAway = chat && !chatPin ? away.current.get(chat.id) : undefined;
    // Scrolled out of view, the element still anchors the window, kept inside the viewport.
    if (chatPin || chatAway) chatBox.current = (chatPin?.box ?? chatAway)!;
    const chatThread = chat && thread?.id === chat.id ? thread : null;
    const chatState = chat ? stateOf(chatThread ?? chatPin?.issue ?? chat) : '';
    // The thread, once loaded, is newer than the list on whose turn it is; against an older server neither has one.
    const chatTurn = chat ? turnLine(chatThread && chatThread.turn !== undefined ? chatThread : chatPin?.issue ?? chat, initial.lang) : null;
    const chatAnchor = chatBox.current ?? { x: pointer.current.x, y: pointer.current.y, width: 1, height: 1 };
    const chatPlace = chat ? placeChat(chatAnchor, { width: CHAT_W, height: chatHeight || CHAT_MAX_H },
      // The open sidebar's side is left to it.
      { left: visible && left ? PANEL_W : 0, top: 0, right: innerWidth - (visible && !left ? PANEL_W : 0), bottom: innerHeight },
      { x: chatAnchor.x + chatAnchor.width / 2 - DOT / 2, y: chatAnchor.y + chatAnchor.height / 2 - DOT / 2, width: DOT, height: DOT }) : null;
    return <div class="tuix-app" lang={initial.lang ?? (navigator.language.startsWith('pl') ? 'pl' : 'en')}>
      {!!issues.length && !visible && initial.launcher !== false && <span class={'badge attention-dot' + (left ? ' left' : '')} aria-label={t.title}/>}
      {/* The gold reply dot opens the settings flyout, where Updates on your reports live. */}
      {dot && initial.launcher !== false && (hooks.openSettings
        ? <button type="button" class={'reply-dot' + (left ? ' left' : '')} data-action="open-updates" aria-label={t.updates} onClick={() => hooks.openSettings!()}/>
        : <span class={'reply-dot' + (left ? ' left' : '')}/>)}
      {marking && marked.map(pin => {
        const pinned = stateOf(pin.issue), verify = pinned === 'in_review', id = pin.issue.id, sending = pin.issue.status === 'sending';
        const state = (pin.orphan ? ' orphan' : '') + ((chat ? chat.id : thread?.id) === id ? ' active' : '');
        const spot = { x: pin.box.x + pin.box.width / 2 - DOT / 2, y: pin.box.y + pin.box.height / 2 - DOT / 2, width: DOT, height: DOT };
        // Outlines and fills stay click-through, so the host element underneath keeps working; hit-testing the pointer against their boxes gives them the hover card, and the card opens the chat.
        return <Fragment key={id}>{markers.style !== 'dot'
          ? <span data-state={pinState(pinned)} class={'marker' + (markers.style === 'fill' ? ' fill' : '') + (verify ? ' verify-marker' : '') + state} aria-hidden="true" style={{ left: pin.box.x, top: pin.box.y, width: pin.box.width, height: pin.box.height }}/>
          : <button data-state={pinState(pinned)} data-issue={id} class={'pin' + (verify ? ' verify-pin' : '') + state} disabled={sending} style={{ left: spot.x, top: spot.y }} aria-label={`${verify ? t.verify + ' · ' : ''}#${pin.issue.number || '…'} ${pin.issue.title}${pin.orphan ? ' · ' + t.moved : ''}`} aria-describedby={hoverable && card === id ? 'tuix-card' : undefined}
            onPointerEnter={event => { if (hoverable && cardable(id) && !sending && event.pointerType !== 'touch') planCard(id, CARD_DELAY); }} onPointerLeave={() => planCard(null, CARD_LINGER)}
            onFocus={() => { if (hoverable && cardable(id) && !sending && !refocusing.current) planCard(id, 0); }} onBlur={() => planCard(null, CARD_LINGER)} onClick={() => openMarker(pin.issue)} aria-haspopup={roomy() ? 'dialog' : undefined} aria-expanded={chat?.id === id ? true : undefined} aria-controls={chat?.id === id ? 'tuix-chat' : undefined}>{verify ? <CheckIcon/> : null}</button>}
          {hoverable && card === id && hoverCard(pin, markers.style === 'dot' ? spot : pin.box, markers.style === 'dot' ? undefined : cardPoint.current)}</Fragment>;
      })}
      {visible && picking && <>{ready && (touchPick ? <div class="pick-surface touch" aria-hidden="true"/> : <div class="pick-surface" onMouseMove={movePicker} onClick={event => { event.preventDefault(); event.stopPropagation(); const element = movePicker(event); if (element) void compose(element); }}/>)}
        {ready && touchPick && highlight && chosen.current && <div class={'pick-confirm' + (left ? ' left' : '')} role="group" aria-label={t.selectedElement}>
          <p><span class="muted">{t.selectedElement}</span><strong>{highlight.label}</strong></p>
          <div class="pick-actions">
            <button type="button" data-action="pick-parent" onClick={chooseParent}>{t.parentElement}</button>
            <button type="button" class="primary" data-action="pick-confirm" onClick={() => { const element = chosen.current; if (element) void compose(element); }}>{t.commentHere}</button>
          </div>
        </div>}
        {(hint || !ready) && <div class="picker-hint" role={!ready && error ? 'alert' : 'status'} data-state={ready ? 'ready' : error ? 'error' : 'loading'}>{ready ? <p><strong>{t.report}</strong><small>{touchPick ? t.pickingTouch : `${t.picking}. ${t.pickingHelp}`}</small></p> : <p>{error || t.loading}</p>}</div>}
        {ready && highlight && <div class="highlight" style={{ left: highlight.x, top: highlight.y, width: highlight.width, height: highlight.height }}><span>{highlight.label}</span></div>}</>}
      {visible && !picking && !draft && <section ref={panelRef} class={'panel' + (left ? ' left' : '')} aria-label={t.title}>
        <header><h2>{panelThread ? panelThread.title : allPages ? t.allReports : t.title}</h2><button class="icon-button" aria-label={t.close} onClick={close}><CloseIcon/></button></header>
        {ready && !panelThread && <div class="toolbar"><button data-action="add-comment" class="primary" disabled={busy} onClick={comment}>{t.add}</button></div>}
        <div class="content">
          {!chat && notice && <p class="notice" role="status">{notice}</p>}
          {!chat && error && <p class="error" role="alert">{error} <button onClick={() => { setError(''); if (ready) void fetchList(); else { setOpen(false); setTimeout(() => setOpen(true), 0); } }}>{t.retry}</button></p>}
          {!chat && loading && <p role="status">{t.loading}</p>}
          {/* Hosts without a launcher have no flyout, so their updates stay at the top of Reports. */}
          {!panelThread && ready && !slot && (updates.length > 0 || emailPreference?.email_available) && updatesSection}
          {!panelThread && ready && <PageReports api={api} environments={envFilter} lang={initial.lang} route={allPages ? undefined : route} pageUrl={allPages ? undefined : pageUrl} show={shown.show} onShowChange={show => savePreferences(initial.project, { show })} hideClosed={preferences.hideClosed} involving={shown.involving} onInvolvingChange={involving => savePreferences(initial.project, { involving })} onOpen={issue => void openThread(issue)} refreshKey={allPages ? undefined : located.current}/>}
          {panelThread && <><button onClick={() => { threadSequence.current++; shotSequence.current++; setReviewing(false); setShot(null); setCapturing(false); setPendingState(null); setThread(null); }}>{t.reports}</button>
            <p class="muted">#{panelThread.number} · {panelThread.author.name} · {panelThread.env_name}</p>
            <p class="report-kind">{t[panelThread.type as 'bug'] ?? panelThread.type}{panelThread.severity ? ` · ${t[panelThread.severity as 'major'] ?? panelThread.severity}` : ''}</p>
            <p class="thread-body">{panelThread.body}</p>
            {(panelThread.original_screenshot ?? panelThread.attachments)?.map(item => <figure class="evidence" key={item.id}>
              <figcaption>{t.originalEvidence}</figcaption>
              <EvidencePreview item={item} label={t.originalEvidence} unavailable={t.previewUnavailable} retry={t.retry} onRetry={() => void openThread(panelThread, false)}/>
            </figure>)}
            {!(panelThread.original_screenshot ?? panelThread.attachments)?.length && <div class="evidence-empty">
              <p>{panelThread.screenshot_status === 'none' ? t.noScreenshot : panelThread.screenshot_status === 'restricted' ? t.restrictedScreenshot : t.unavailableScreenshot}</p>
              {panelThread.screenshot_status === 'unavailable' && <button disabled={loading} onClick={() => void openThread(panelThread, false)}>{t.retry}</button>}
            </div>}
            <div class="thread-state" tabIndex={-1}>
              <span class="status" data-status={threadState}>{statusLabel(threadState, initial.lang)}</span>
              <span class="fixer-line">{panelThread.assignee ? <>{t.fixer}: <strong>{panelThread.assignee.me ? t.you : panelThread.assignee.name}</strong></> : t.noFixer}</span>
              {canAssign && <button type="button" data-action="assign" disabled={busy} onClick={() => void assignToMe()}>{t.assignToMe}</button>}
            </div>
            {fixPending(panelThread) && <p class="fix-pending">{t.fixPending}</p>}
            {!!panelThread.review_screenshot?.length && <details><summary>{t.reviewEvidence}</summary>{panelThread.review_screenshot.map(item => <EvidencePreview item={item} label={t.reviewEvidence} unavailable={t.previewUnavailable}/>)}</details>}
            {verifying && <VerifyTools t={t} thread={panelThread} busy={busy} reviewing={reviewing} capturing={capturing} note={reviewNote} works={may('done')} broken={may('open')}
              head={<><h3>{t.verifyTitle}</h3><p class="muted">{threadOrphan ? t.orphanVerify : t.compareLive}</p>
                {!(panelThread.original_screenshot ?? panelThread.attachments)?.length && <p class="muted">{t.noOriginal}</p>}</>}
              evidence={<details><summary>{t.reviewCapture}</summary>{capturing ? <p role="status">{t.capturing}</p> : preview ? <><img src={preview} alt={t.reviewCapture}/><button type="button" disabled={busy} onClick={() => { shotSequence.current++; setShot(null); }}>{t.remove}</button></> : <p class="muted">{t.skipped}</p>}{config.capture?.screenshot !== false && <button type="button" disabled={busy || capturing} onClick={() => void captureShot(resolve(panelThread.locators, document).element ?? document.body)}>{t.retake}</button>}</details>}
              onNote={setReviewNote} onWorks={() => void verifyThread('works')} onBroken={startReview} onCancel={cancelReview} onSend={() => void verifyThread('broken')}/>}
            {!reviewing && !pendingState && actions.length > 0 && <div class="thread-actions">{actions.map(([next, label]) =>
              <button type="button" key={next} data-state-action={next} disabled={busy} onClick={() => { if (needsNote(next)) { setPendingState(next); setStateNote(''); setError(''); } else void changeState(next); }}>{label}</button>)}</div>}
            {pendingState && <form class="state-note" onSubmit={event => { event.preventDefault(); if (stateNote.trim()) void changeState(pendingState, stateNote); }}>
              <label>{pendingState === 'wont_fix' ? t.wontFixNote : t.reviewNote}<textarea value={stateNote} onInput={event => setStateNote(event.currentTarget.value)} required maxLength={2000} disabled={busy}/></label>
              <div class="verification-actions"><button type="button" disabled={busy} onClick={() => { setPendingState(null); setStateNote(''); focusState(); }}>{t.cancel}</button><button type="submit" class="primary" disabled={busy || !stateNote.trim()}>{pendingState === 'wont_fix' ? t.actionWontFix : t.stillBroken}</button></div>
            </form>}
            {canFix && <details class="fix-tools">
              <summary>{t.markFixed}</summary>
              <form onSubmit={event => { event.preventDefault(); void markFixed(); }}>
                <p class="muted">{t.fixHelp}</p>
                <label>{t.fixNote}<textarea value={fixNote} onInput={event => setFixNote(event.currentTarget.value)} required maxLength={2000} disabled={busy}/></label>
                <p class="muted">{initial.commit || initial.release ? <>{t.fixBuild}: <code>{initial.commit || initial.release}</code></> : t.noFixBuild}</p>
                <button type="submit" class="primary" disabled={busy || !fixNote.trim()}>{busy ? t.recordingFix : t.markFixed}</button>
              </form>
            </details>}
            {(commentCursor.current || panelThread.comments_older) && <nav class="actions" aria-label={t.replyPages}>
              {commentCursor.current && <button disabled={loading || busy} onClick={() => void openThread(panelThread, false, null)}>{t.latestReplies}</button>}
              {panelThread.comments_older && <button disabled={loading || busy} onClick={() => void openThread(panelThread, false, panelThread.comments_older!)}>{t.olderReplies}</button>}
            </nav>}
            {panelThread.comments && <ThreadComments comments={panelThread.comments} lang={initial.lang} t={t}/>}
            {source && api.environment === 'local' && <div class="source-tools">
              <p><strong>{t.source}</strong><br/><code>{source.path}:{source.line}</code></p>
              {sourceLink && <a href={sourceLink}>{t.openEditor}</a>}
              {!sourceLink && <p class="muted">{t.editorSetup}</p>}
              <details><summary>{t.editorSettings}</summary>
                <form onSubmit={event => { event.preventDefault(); setEditorNotice(saveEditor(editor) ? t.editorSaved : t.editorInvalid); }}>
                  <label>{t.editorTemplate}<input value={editor} maxLength={2048} spellcheck={false} autoComplete="off" onInput={event => { setEditor(event.currentTarget.value); setEditorNotice(''); }}/></label>
                  <p class="muted">{t.editorHelp}<br/><code>{'vscode://file/home/you/app/{path}:{line}'}</code></p><button type="submit">{t.saveEditor}</button>
                  {editorNotice && <p role="status">{editorNotice}</p>}
                </form>
              </details>
            </div>}
            {!reviewing && !closedThread && <ReplyForm api={api} thread={panelThread} t={t} value={reply} onValue={setReply} busy={busy}
              picks={mentions} onPick={mention => setMentions(value => [...value.filter(kept => kept.id !== mention.id), mention])} escape={mentionEscape} onSubmit={() => void replyToThread()}/>}
          </>}
        </div>
      </section>}
      {visible && draft && <section class={'panel composer' + (left ? ' left' : '')} aria-label={t.report}>
        <header><h2>{t.report}</h2><button class="icon-button" aria-label={t.close} disabled={busy} onClick={close}><CloseIcon/></button></header>
        <form ref={formRef} onSubmit={event => { event.preventDefault(); void submit(); }}>
          <div class="selection-summary">
            <p>{t.selectedElement}: {draft.locators.text?.text || draft.locators.aria?.name || draft.locators.testid || draft.locators.css}</p>
            <button type="button" disabled={!ready || busy} onClick={() => {
              reselecting.current = draft; shotSequence.current++; setShot(null); setCapturing(false); setDraft(null); setPicking(true);
            }}>{t.changeElement}</button>
          </div>
          <label>{t.body}<textarea value={draft.body} onInput={event => editDraft({ body: event.currentTarget.value })} required maxLength={2000} disabled={busy}/></label>
          <div class="form-row"><label>{t.type}<select value={draft.type} onChange={event => editDraft({ type: event.currentTarget.value })} disabled={busy}>{(['bug','ux','question','idea'] as const).map(type => <option value={type}>{t[type]}</option>)}</select></label>{draft.type === 'bug' && <label>{t.severity}<select value={draft.severity} onChange={event => editDraft({ severity: event.currentTarget.value })} disabled={busy}><option value="">{t.optional}</option>{(['blocking','major','minor'] as const).map(level => <option value={level}>{t[level]}</option>)}</select></label>}</div>
          <section class="composer-evidence">
            <h3>{t.screenshot}</h3>
            {capturing ? <p role="status">{t.capturing}</p> : preview ? <>
              <img src={preview} alt={t.screenshot}/>
              <button type="button" disabled={busy} onClick={() => { setShot(null); shotSequence.current++; }}>{t.remove}</button>
            </> : <p>{config.capture?.screenshot === false ? t.captureDisabled : t.skipped}</p>}
            {config.capture?.screenshot !== false && <button type="button" disabled={!ready || busy || capturing} onClick={() => void captureShot(chosen.current ?? resolve(draft.locators, document).element ?? document.body)}>{t.retake}</button>}
          </section>
          <details><summary>{t.attach}</summary><p>{t.console}: {logs?.console_log.length ?? 0}<br/>{t.network}: {logs?.network_log.length ?? 0}<br/>{t.env}: {api.environment} · {innerWidth} × {innerHeight}</p>{chosen.current?.tagName === 'IFRAME' && <p>{t.iframe}</p>}</details>
          {error && <p class="error" role="alert">{error}</p>}
          <div class="actions"><button type="button" disabled={busy} onClick={() => { chosen.current = null; reselecting.current = null; setDraft(null); setShot(null); setCapturing(false); shotSequence.current++; }}>{t.cancel}</button><button type="submit" class="primary" disabled={!ready || busy || capturing}>{busy ? t.sending : t.send}</button></div>
        </form>
      </section>}
      {chat && chatPlace && <ChatWindow t={t} lang={initial.lang} api={api} issue={chatPin?.issue ?? chat} thread={chatThread} state={chatState} turn={chatTurn} tone={pinState(chatState)} place={chatPlace} windowRef={chatEl}
        gone={!chatPin && !chatAway && !terminal.includes(chatState)} moved={!!chatPin?.orphan} loading={loading} error={error} notice={notice} busy={busy} closed={closedThread}
        expanded={expanded} onExpand={() => { holdChatFocus(); setExpanded(true); }} reply={reply} onReply={setReply} picks={mentions} onPick={mention => setMentions(value => [...value.filter(kept => kept.id !== mention.id), mention])}
        escape={mentionEscape} onSend={() => { holdChatFocus(); void replyToThread(); }}
        verify={chatThread && verifying ? { works: may('done'), broken: may('open'), reviewing, note: reviewNote, onNote: setReviewNote, onWorks: () => { holdChatFocus(); void verifyThread('works'); }, onBroken: () => { holdChatFocus(); startReview(); }, onCancel: () => { holdChatFocus(); cancelReview(); }, onSend: () => { holdChatFocus(); void verifyThread('broken'); } } : null}
        onRetry={() => void openThread(chat, true, null, true)} onFull={fullThread} onClose={() => closeChat()}/>}
    </div>;
  }
  render(<App/>, container);
  return {
    reportError: () => runtime.error('entrypoint'), open: (filter?: OpenFilter) => browse(filter), comment: () => comment(), close: () => toggle(false),
    suspend: () => suspend(), settings: (value: boolean) => showSettings(value),
    destroy: () => {
      if (disposed) return;
      disposed = true; panelActive = false; chatActive = false; runtime.active(false);
      cleanup(() => api.destroy());
      // Release effects even if a transport or Preact teardown step fails.
      for (const stop of cleanups) stop();
      live = undefined;
      cleanup(() => render(null, container));
      if (slot) cleanup(() => render(null, slot));
      cleanup(() => style.remove()); cleanup(() => container.remove());
      for (const font of fonts) cleanup(() => { document.fonts.delete(font); });
    },
  };
}
