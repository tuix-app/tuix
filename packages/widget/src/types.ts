import type { LocatorBundle } from './locators';
import type { OpenFilter } from './preferences';
import type { State, Turn } from './states';
export interface Identity { id: string; name: string; email?: string; group?: string; group_name?: string; avatar?: string; traits?: Record<string, unknown>; hash?: string; reviewerSession?: string }
export interface Config {
  project: string; api?: string; environment?: string; release?: string; commit?: string; lang?: 'en' | 'pl';
  position?: 'bottom-right' | 'bottom-left'; showPinsOnLoad?: boolean; launcher?: boolean;
  capture?: { screenshot?: boolean; console?: boolean; network?: boolean };
  /** @deprecated Ignored: the widget always uses the tuix palette. Accepted so existing hosts keep working. */
  theme?: { accent?: string };
  context?: (() => Record<string, unknown>) | Record<string, unknown>; route?: () => string; keepQuery?: string[];
  nonce?: string; enabled?: boolean; telemetry?: boolean; network_allow?: string[]; network_deny?: string[];
}
/** Server configuration response; compatibility metadata is not a host init option. */
export interface RemoteConfig extends Partial<Config> { widget_min_version: string; /** Dashboard origin for "Open tuix.app". */ app_url?: string | null }
export interface Issue {
  /** `status` is the legacy vocabulary; widgets read `state` and fall back to `status` (see states.ts). */
  id: string; number: number; title: string; status: string; state?: State | null; /** open, fix_ready, fixed, closed; from servers with actions. */ state_name?: string | null; env_name: string;
  url?: string; route_key?: string; locators: LocatorBundle; author: { id?: string; name: string }; comment_count: number;
  inserted_at: string; updated_at: string; body?: string; own?: boolean;
  /** When the current review round began (the report entered `in_review`); on list entries and threads from servers that send it. */
  verification_started_at?: string | null;
  /** The start of `body` (280 characters at most) on list rows, for the markers' hover cards; missing from older servers. */
  excerpt?: string;
  comments_older?: string | null;
  comments?: { pending?: boolean; id: string; body: string; segments?: Segment[]; author: { name: string }; team: boolean; inserted_at: string; /** Where the reply sent the turn ("→ Anna"); missing from servers before timelines. */ sent_to?: Who | null; keeps?: boolean }[];
  /** Thread only: small lines between the replies (takes, passes, urgent, fix ready, works, still broken, close, reopen), oldest first; missing from servers before timelines. */
  timeline?: TimelineEvent[];
  fixed_note?: { body: string; segments?: Segment[]; author: { name: string } } | null;
  original_screenshot?: Evidence[]; review_screenshot?: Evidence[];
  screenshot_status?: 'available' | 'none' | 'restricted' | 'unavailable';
  verified_by?: { id?: string; name: string } | null; auto_closed_at?: string | null;
  attachments?: { id: string; url: string; width: number; height: number }[];
  /** A local fix waits for a deploy containing its build. */
  fix_pending?: boolean;
  /** Older servers' assignee, kept for the fallback header; newer servers send `turn_holder`. */
  assignee?: { name: string; me: boolean } | null;
  /** Who holds the turn (name, whether the viewer does, whether it is the reporter); null when unclaimed or finished; missing from servers before stored turns. */
  turn_holder?: { name: string | null; me: boolean; reporter: boolean } | null;
  /** Thread only: people a signed team reply may send the turn to, in the server's order (empty otherwise), the value to preselect (null: nobody) and whether Take it is offered. */
  turn_options?: { value: string; name: string; team?: boolean; reporter?: boolean }[];
  default_turn?: string | null;
  can_take?: boolean;
  /**
   * Caller relations and what the caller may do (conversations §6). Thread actions come from `actions`, else from
   * `allowed_states`; against a server that sends neither a report is read-only.
   */
  reporter?: boolean; fixer?: boolean; can_be_fixer?: boolean; allowed_states?: State[];
  /** What the caller may do now: reply, fix_ready, works, still_broken, close, reopen, take, pass, urgent. Absent from servers before actions: derived from `allowed_states`. */
  actions?: string[];
  /** The reply composer offers people to mention; missing from servers before mentions. */
  can_mention?: boolean;
  /**
   * The saved design (Figma) link of the report's nearest component, in a thread only and only for team members
   * (design links): absent for everyone else and from servers before design links. Display only; `figmaHref` checks the URL.
   */
  design_link?: { component: string; url: string; source: 'manual' | 'agent' };
  /**
   * For the hover card, on list entries (people-and-statuses §6): the newest reply as plain text (null when there is none)
   * and whether the caller has unread updates on the report. Missing from servers before cards: the card then shows less.
   */
  latest_comment?: { author: { name: string }; team: boolean; body: string; inserted_at: string } | null;
  unread?: boolean;
  /** Marked urgent: missing from servers before urgent. */
  urgent?: boolean;
  /** The caller may set or clear urgent: the reporter, the team, or a person in a signed session; missing from servers before urgent. */
  can_set_urgent?: boolean;
  /** Whose move it is (§5): on list entries and threads; null once finished. Missing from servers before turns: nothing is shown. */
  turn?: Turn | null;
  /** Who holds the turn: `member:<uuid>` or `end_user:<uuid>`; null when finished or nobody owns it yet. Read into the type only; missing from older servers. */
  turn_person?: string | null;
}
/** Somebody a reply sent the turn to, or an event names. Only names the viewer may see; `name` is null when the server holds it back. */
export interface Who { name: string | null; me?: boolean; reporter?: boolean }
export type TimelineKind = 'turn_taken' | 'turn_passed' | 'urgent_set' | 'urgent_cleared' | 'fix_ready' | 'works' | 'still_broken' | 'closed' | 'reopened' | 'auto_closed';
/** One small line of the conversation. A pass made by a reply (`with_reply`) is already said by the reply's own arrow and shows no line. */
export interface TimelineEvent { id: string; kind: TimelineKind | string; at: string; actor?: Who | null; /** Who acted when there is no person: a release (`deployment`) or the system. */ by?: 'deployment' | 'system' | null; to?: Who | null; from?: Who | null; with_reply?: boolean; comment_id?: string | null }
/** A comment with mentions, in order: plain text and mentioned labels (without "@"). Rendered as text, never HTML. */
export type Segment = { text: string } | { mention: string };
/** Someone the reply composer may mention (`GET /issues/:id/people`): names only, never emails. */
export interface Person { id: string; name: string; team: boolean }
export interface Evidence { id: string; url: string; width: number; height: number }
/** The largest screenshot, in bytes, the Tuix server accepts (the server's `@max_bytes`). */
export const MAX_SCREENSHOT_BYTES = 5_242_880;
export interface Core {
  open(filter?: OpenFilter): void; comment?(): void; close(): void; destroy(): void; reportError?(): void;
  /** Hides a visible composer, keeping it in memory; false when there is nothing to keep. */
  suspend?(): boolean;
  /** Opens the panel on one report's thread, as clicking its pin does (the verify prompt's Check it). */
  openIssue?(id: string): void;
  /** The settings flyout opened or closed: updates render into it while open. */
  settings?(open: boolean): void;
}
/** Counts beside the launcher: `waiting` is everything waiting for the viewer (their turn, fixes to check included); older servers send `to_verify` and `assigned_active` only. */
export interface Summary { to_verify: number; assigned_active: number; waiting?: number }
/** An unread reporter update from `/notifications`. */
export interface Update { id: string; issue_id: string; kind: string; state_kind?: string; inserted_at: string; issue: { number: number; title: string; status: string; state?: string | null; state_name?: string | null; url?: string | null; route_key?: string } | null }
/** The reporter's email settings; `email_schedule` comes from servers with email schedules. */
export interface EmailPreference { email_available: boolean; notify_email: boolean; email_schedule?: string }
