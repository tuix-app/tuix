/** Show: Open means active work (open, in progress); To verify is in review. Stored `open` keeps its name. */
export type Show = 'unresolved' | 'open' | 'verify' | 'finished' | 'all';
export type Involving = 'me' | 'everyone';
/** Report-list preferences, separate from page-marker appearance and visibility. */
export interface Preferences { scope: 'page' | 'all'; show: Show; involving: Involving; environment: '' | 'all' | 'local' | 'uat' | 'production' }
/** A filter a host, the loader queue or the summary capsule can open Reports with. */
export type OpenFilter = Partial<Pick<Preferences, 'scope' | 'show' | 'involving'>>;
const defaults: Preferences = { scope: 'page', show: 'unresolved', involving: 'everyone', environment: '' };
const sessions = new Map<string, Preferences>();
export const preferenceEvent = 'tuix:preferences';
/** The API calls open + in progress `active`; all other choices are explicit. */
export const showQuery = (show: Show) => show === 'open' ? 'active' : show;
function storedShow(value: Record<string, unknown> | null): Show {
  // Older All excluded terminal states unless Hide closed was explicitly off.
  if (value?.show === 'all') return value.version === 2 || value.hideClosed === false ? 'all' : 'unresolved';
  return typeof value?.show === 'string' && ['unresolved', 'open', 'verify', 'finished'].includes(value.show) ? value.show as Show : 'unresolved';
}
export function readPreferences(project: string): Preferences {
  if (sessions.has(project)) return sessions.get(project)!;
  try {
    const value = JSON.parse(localStorage.getItem('tuix:preferences:' + project) ?? '{}');
    return {
      scope: value?.scope === 'all' ? 'all' : 'page',
      show: storedShow(value),
      // Earlier builds stored `author: mine`; it becomes Involving: Me on the next save.
      involving: ['me', 'everyone'].includes(value?.involving) ? value.involving : value?.author === 'mine' ? 'me' : 'everyone',
      environment: ['', 'all', 'local', 'uat', 'production'].includes(value?.environment) ? value.environment : '',
    };
  } catch { return { ...defaults }; }
}
/** The `preferenceEvent` detail when a person chooses preferences (marker changes send none). */
export interface PreferenceChange { project: string; keys: (keyof Preferences)[] }
export function savePreferences(project: string, change: Partial<Preferences>) {
  const value = { ...readPreferences(project), ...change };
  try { localStorage.setItem('tuix:preferences:' + project, JSON.stringify({ ...value, version: 2 })); sessions.delete(project); }
  catch { sessions.set(project, value); /* Session choice remains usable. */ }
  const detail: PreferenceChange = { project, keys: Object.keys(change) as (keyof Preferences)[] };
  window.dispatchEvent(new CustomEvent(preferenceEvent, { detail }));
}
/** Accepts only known filter values from untyped host or queued input. */
export function cleanFilter(value: unknown): OpenFilter | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const input = value as Record<string, unknown>, filter: OpenFilter = {};
  if (input.scope === 'page' || input.scope === 'all') filter.scope = input.scope;
  if (input.show === 'unresolved' || input.show === 'open' || input.show === 'verify' || input.show === 'finished' || input.show === 'all') filter.show = input.show;
  if (input.involving === 'me' || input.involving === 'everyone') filter.involving = input.involving;
  return Object.keys(filter).length ? filter : undefined;
}
