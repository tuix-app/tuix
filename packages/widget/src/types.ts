import type { LocatorBundle } from './locators';
import type { OpenFilter } from './preferences';
import type { State, Turn } from './states';
export interface Identity { id: string; name: string; email?: string; avatar?: string; traits?: Record<string, unknown>; hash?: string; reviewerSession?: string }
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
  id: string; number: number; title: string; status: string; state?: State | null; type: string; severity?: string | null; env_name: string;
  url?: string; route_key?: string; locators: LocatorBundle; author: { id?: string; name: string }; comment_count: number;
  inserted_at: string; updated_at: string; body?: string; own?: boolean;
  /** The start of `body` (280 characters at most) on list rows, for the markers' hover cards; missing from older servers. */
  excerpt?: string;
  comments_older?: string | null;
  comments?: { pending?: boolean; id: string; body: string; segments?: Segment[]; author: { name: string }; team: boolean; inserted_at: string }[];
  fixed_note?: { body: string; segments?: Segment[]; author: { name: string } } | null;
  original_screenshot?: Evidence[]; review_screenshot?: Evidence[];
  screenshot_status?: 'available' | 'none' | 'restricted' | 'unavailable';
  verified_by?: { id?: string; name: string } | null; auto_closed_at?: string | null;
  attachments?: { id: string; url: string; width: number; height: number }[];
  /** A local fix waits for a deploy containing its build. */
  fix_pending?: boolean;
  assignee?: { name: string; me: boolean } | null;
  /**
   * Caller relations and the states the caller may set (people-and-statuses §6). Thread actions come only from
   * these: against an older server that omits them a report is read-only (its `/state` route does not exist).
   */
  reporter?: boolean; fixer?: boolean; can_be_fixer?: boolean; allowed_states?: State[];
  /** The reply composer offers people to mention; missing from servers before mentions. */
  can_mention?: boolean;
  /**
   * For the hover card, on list entries (people-and-statuses §6): the newest reply as plain text (null when there is none)
   * and whether the caller has unread updates on the report. Missing from servers before cards: the card then shows less.
   */
  latest_comment?: { author: { name: string }; team: boolean; body: string; inserted_at: string } | null;
  unread?: boolean;
  /** Whose move it is (§5): on list entries and threads; null once finished. Missing from servers before turns: nothing is shown. */
  turn?: Turn | null;
}
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
  /** The settings flyout opened or closed: updates render into it while open. */
  settings?(open: boolean): void;
}
export interface Summary { to_verify: number; assigned_active: number }
/** An unread reporter update from `/notifications`. */
export interface Update { id: string; issue_id: string; kind: string; state_kind?: string; inserted_at: string; issue: { number: number; title: string; status: string; state?: string | null; url?: string | null; route_key?: string } | null }
/** The reporter's email settings; `email_schedule` comes from servers with email schedules. */
export interface EmailPreference { email_available: boolean; notify_email: boolean; email_schedule?: string }
