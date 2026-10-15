/** Per-browser marker preference. The sidebar always draws markers; this decides what stays when it closes. */
export type MarkerStyle = 'dot' | 'border' | 'fill';
export interface MarkerPreference { pinned: boolean; style: MarkerStyle }
export const defaultMarkers: MarkerPreference = { pinned: false, style: 'dot' };
const storageKey = (project: string) => 'tuix:markers:' + project;
const sessions = new Map<string, MarkerPreference>();

/** One compact token so the ES5 loader can read the same value without a parser. */
export function markerToken(preference: MarkerPreference): string {
  return (preference.pinned ? 'on' : 'off') + ':' + preference.style;
}
export function readMarkers(project: string): MarkerPreference {
  if (sessions.has(project)) return sessions.get(project)!;
  try {
    const [pinned, style] = (localStorage.getItem(storageKey(project)) ?? '').split(':');
    return { pinned: pinned === 'on', style: style === 'border' || style === 'fill' ? style : 'dot' };
  } catch { return sessions.get(project) ?? defaultMarkers; }
}
export function saveMarkers(project: string, preference: MarkerPreference): void {
  try { localStorage.setItem(storageKey(project), markerToken(preference)); sessions.delete(project); }
  catch { sessions.set(project, preference); }
}
/** Eager loading is the commenter's own choice; an unreadable store keeps the widget idle. */
export function markersPinned(project: string): boolean {
  return readMarkers(project).pinned;
}
