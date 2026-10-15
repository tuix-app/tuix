/** Show: Open means active work (open, in progress); To verify is in review. Stored `open` keeps its name. */
export type Show = 'open' | 'verify' | 'all';
export type Involving = 'me' | 'everyone';
/** `hideClosed` keeps Done, Won't fix and Closed reports out of the report lists; on unless turned off. */
export interface Preferences { scope: 'page' | 'all'; show: Show; involving: Involving; environment: '' | 'all' | 'local' | 'uat' | 'production'; hideClosed: boolean }
/** A filter a host, the loader queue or the summary capsule can open Reports with. */
export type OpenFilter = Partial<Pick<Preferences, 'scope' | 'show' | 'involving'>>;
const defaults: Preferences = { scope: 'page', show: 'open', involving: 'everyone', environment: '', hideClosed: true };
const sessions = new Map<string, Preferences>();
export const preferenceEvent = 'tuix:preferences';
/** The `show` query value for GET /issues: with Hide closed, All is every unresolved report (open, in progress, in review). */
export const showQuery = (show: Show, hideClosed = false) => show === 'open' ? 'active' : show === 'all' && hideClosed ? 'unresolved' : show;
export function readPreferences(project: string): Preferences {
  if (sessions.has(project)) return sessions.get(project)!;
  try {
    const value = JSON.parse(localStorage.getItem('tuix:preferences:' + project) ?? '{}');
    return {
      scope: value?.scope === 'all' ? 'all' : 'page',
      show: ['verify', 'all'].includes(value?.show) ? value.show : 'open',
      // Earlier builds stored `author: mine`; it becomes Involving: Me on the next save.
      involving: ['me', 'everyone'].includes(value?.involving) ? value.involving : value?.author === 'mine' ? 'me' : 'everyone',
      environment: ['', 'all', 'local', 'uat', 'production'].includes(value?.environment) ? value.environment : '',
      hideClosed: value?.hideClosed !== false,
    };
  } catch { return { ...defaults }; }
}
/** The `preferenceEvent` detail when a person chooses preferences (marker changes send none). */
export interface PreferenceChange { project: string; keys: (keyof Preferences)[] }
export function savePreferences(project: string, change: Partial<Preferences>) {
  const value = { ...readPreferences(project), ...change };
  try { localStorage.setItem('tuix:preferences:' + project, JSON.stringify(value)); sessions.delete(project); }
  catch { sessions.set(project, value); /* Session choice remains usable. */ }
  const detail: PreferenceChange = { project, keys: Object.keys(change) as (keyof Preferences)[] };
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail }));
}
/** Accepts only known filter values from untyped host or queued input. */
export function cleanFilter(value: unknown): OpenFilter | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>, filter: OpenFilter = {};
  if (input.scope === 'page' || input.scope === 'all') filter.scope = input.scope;
  if (input.show === 'open' || input.show === 'verify' || input.show === 'all') filter.show = input.show;
  if (input.involving === 'me' || input.involving === 'everyone') filter.involving = input.involving;
  return Object.keys(filter).length ? filter : undefined;
}
