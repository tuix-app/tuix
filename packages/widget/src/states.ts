/**
 * Report states (conversations §3). Stored: open, in_review (shown as "Fix ready"), done (shown as "Fixed"), closed. Servers send
 * `state_name` (open, fix_ready, fixed, closed) and `state` (the stored value); older servers only the legacy `status`, which the
 * widget still reads so lists and markers show.
 */
export type State = 'open' | 'in_review' | 'done' | 'closed';
/** Other names (older servers' `in_progress`, the legacy statuses, the people-facing words) mapped to the stored ones. */
const legacy: Record<string, State> = { in_progress: 'open', acknowledged: 'open', fixed_awaiting_deploy: 'open', fix_ready: 'in_review', awaiting_verification: 'in_review', fixed: 'done', resolved: 'done', wont_fix: 'closed' };
/** Markers and "open" counts. */
export const unresolved: readonly string[] = ['open', 'in_review'];
export const terminal: readonly string[] = ['done', 'closed'];
/** Maps any vocabulary to the stored one; unknown values (such as the optimistic `sending`) pass through. */
export function normalizeState(value?: string | null): string { return legacy[value ?? ''] ?? value ?? ''; }
export function stateOf(issue: { state_name?: string | null; state?: string | null; status?: string }): string { return normalizeState(issue.state_name || issue.state || issue.status); }
/**
 * What the caller may do now (conversations §6): the server's `actions`, else derived from the legacy `allowed_states` so an older
 * server behaves as before. Only the workflow actions are derived; Take it and urgent have their own flags.
 */
export type Action = 'fix_ready' | 'works' | 'still_broken' | 'close' | 'reopen';
export function actionsOf(issue: { actions?: string[]; state_name?: string | null; state?: string | null; status?: string; allowed_states?: string[]; can_be_fixer?: boolean; fixer?: boolean; assignee?: unknown }): string[] {
  if (issue.actions) return issue.actions;
  const state = stateOf(issue), allowed = issue.allowed_states ?? [], review = state === 'in_review', finished = terminal.includes(state);
  const takeable = !!issue.can_be_fixer && !finished && (!!issue.fixer || !issue.assignee);
  const actions: string[] = [];
  if (!review && issue.can_be_fixer && (allowed.includes('in_review') || takeable)) actions.push('fix_ready');
  if (state !== 'done' && allowed.includes('done')) actions.push('works');
  if (state !== 'open' && allowed.includes('open')) { if (review) actions.push('still_broken'); else if (finished) actions.push('reopen'); }
  if (state !== 'closed' && allowed.includes('closed')) actions.push('close');
  return actions;
}
/** The state name an older server's `/state` route knows for an action. */
export const legacyState: Record<string, State> = { fix_ready: 'in_review', works: 'done', still_broken: 'open', close: 'closed', reopen: 'open' };
/**
 * Whose move it is on a report, as the server derives it: `team` (the team's), `reporter` (the reporter's), `verify` (in review: the
 * reporter checks the fix). `null` once finished; absent from servers before turns, and then nothing is shown.
 */
export type Turn = 'team' | 'reporter' | 'verify';
const turns: readonly string[] = ['team', 'reporter', 'verify'];
export function turnOf(issue: { turn?: string | null }): Turn | null { return issue.turn && turns.includes(issue.turn) ? issue.turn as Turn : null; }
/** The viewer holds the turn: from the stored holder (`turn_holder`), else from `turn` and the viewer's relation, as servers before stored turns say it. */
export function myTurn(issue: { turn?: string | null; reporter?: boolean; fixer?: boolean; turn_holder?: { me: boolean } | null; state_name?: string | null; state?: string | null; status?: string }): boolean {
  if (!unresolved.includes(stateOf(issue))) return false;
  if (issue.turn_holder !== undefined) return !!issue.turn_holder?.me;
  const turn = turnOf(issue);
  return !!turn && (issue.reporter ? turn !== 'team' : turn === 'team' && !!issue.fixer);
}
/** Whether the viewer is on the team's side: the server offers them Take it, Send to or the fixer's actions. Reporters and other people from the app are not. */
export function teamViewer(issue: { can_be_fixer?: boolean; can_take?: boolean; turn_options?: unknown[]; actions?: string[] }): boolean {
  return !!(issue.can_be_fixer || issue.can_take || issue.turn_options?.length || issue.actions?.includes('take') || issue.actions?.includes('pass'));
}
/** The dot's state on the page: your turn (filled), open (outline) or closed (muted outline, shown under All only). */
export type DotState = 'turn' | 'open' | 'closed';
export function dotState(issue: Parameters<typeof myTurn>[0]): DotState {
  const state = stateOf(issue);
  return terminal.includes(state) ? 'closed' : myTurn(issue) ? 'turn' : 'open';
}
/**
 * The turn once the viewer's reply is in, before the server confirms it. A reply names where it goes: `keep` leaves the turn where it
 * is, `reporter` or a picked reporter hands it to them, another person is someone else's; no choice follows the server's own default
 * (the team's reply goes to the reporter, anyone else's to the team). In review and finished reports keep theirs, and so does a server
 * without turns. The holder is not known before the server answers (the next refresh corrects it).
 */
export type TurnChoice = string; // 'keep', 'reporter', or a picker value (`member:<uuid>`, `end_user:<uuid>`)
export function turnAfterReply(issue: { turn?: Turn | null; reporter?: boolean; fixer?: boolean; turn_options?: { value: string; reporter?: boolean }[] }, choice?: TurnChoice): Turn | null | undefined {
  if (issue.turn !== 'team' && issue.turn !== 'reporter') return issue.turn;
  if (choice === 'keep') return issue.turn;
  if (choice === 'reporter' || issue.turn_options?.some(option => option.value === choice && option.reporter)) return 'reporter';
  if (choice) return 'team';
  return !issue.reporter && issue.fixer ? 'reporter' : 'team';
}
export function fixPending(issue: { fix_pending?: boolean; status?: string }): boolean { return issue.fix_pending ?? issue.status === 'fixed_awaiting_deploy'; }

/** A browser that opened tuix for this project within 30 days loads the SDK eagerly. The ES5 loader reads the same key. */
const ACTIVE_MS = 30 * 24 * 60 * 60 * 1000;
export function markActive(project: string) { try { localStorage.setItem('tuix:active:' + project, String(Date.now())); } catch { /* Blocked storage keeps the widget lazy. */ } }
export function recentlyActive(project: string): boolean {
  try { const time = Number(localStorage.getItem('tuix:active:' + project)); return time > 0 && Date.now() - time < ACTIVE_MS; } catch { return false; }
}
