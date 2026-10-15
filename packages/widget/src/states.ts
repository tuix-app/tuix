/**
 * Report states (people-and-statuses §5). Servers send `state`; older servers only the legacy `status`, which
 * the widget still reads so lists and markers show. Actions are not backfilled: they need a §6 server.
 */
export type State = 'open' | 'in_progress' | 'in_review' | 'done' | 'wont_fix' | 'closed';
const legacy: Record<string, State> = { acknowledged: 'in_progress', fixed_awaiting_deploy: 'in_progress', awaiting_verification: 'in_review', resolved: 'done' };
/** Markers and "open" counts. */
export const unresolved: readonly string[] = ['open', 'in_progress', 'in_review'];
export const terminal: readonly string[] = ['done', 'wont_fix', 'closed'];
/** Maps either vocabulary to the new one; unknown values (such as the optimistic `sending`) pass through. */
export function normalizeState(value?: string | null): string { return legacy[value ?? ''] ?? value ?? ''; }
export function stateOf(issue: { state?: string | null; status?: string }): string { return issue.state ? issue.state : normalizeState(issue.status); }
/**
 * Whose move it is on a report (people-and-statuses §5), as the server derives it: `team` (no reply yet, or the reporter's or someone
 * else's came last), `reporter` (the team replied last), `verify` (in review: the reporter checks the fix). `null` once finished; absent
 * from servers before turns, and then nothing is shown.
 */
export type Turn = 'team' | 'reporter' | 'verify';
const turns: readonly string[] = ['team', 'reporter', 'verify'];
export function turnOf(issue: { turn?: string | null }): Turn | null { return issue.turn && turns.includes(issue.turn) ? issue.turn as Turn : null; }
/**
 * The turn once the viewer's reply is in, before the server confirms it: the same rule as the server's. A reporter's reply hands the report
 * to the team; a fixer's to the reporter; anyone else's counts as "someone else" and leaves it with the team. In review and finished
 * reports keep theirs, and so does a server without turns.
 */
export function turnAfterReply(issue: { turn?: Turn | null; reporter?: boolean; fixer?: boolean }): Turn | null | undefined {
  if (issue.turn !== 'team' && issue.turn !== 'reporter') return issue.turn;
  return !issue.reporter && issue.fixer ? 'reporter' : 'team';
}
export function fixPending(issue: { fix_pending?: boolean; status?: string }): boolean { return issue.fix_pending ?? issue.status === 'fixed_awaiting_deploy'; }

/** A browser that opened tuix for this project within 30 days loads the SDK eagerly. The ES5 loader reads the same key. */
const ACTIVE_MS = 30 * 24 * 60 * 60 * 1000;
export function markActive(project: string) { try { localStorage.setItem('tuix:active:' + project, String(Date.now())); } catch { /* Blocked storage keeps the widget lazy. */ } }
export function recentlyActive(project: string): boolean {
  try { const time = Number(localStorage.getItem('tuix:active:' + project)); return time > 0 && Date.now() - time < ACTIVE_MS; } catch { return false; }
}
