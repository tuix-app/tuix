export interface SourceLocation { path: string; line: number }
export const defaultEditor = 'vscode://file/{path}:{line}';
const storageKey = 'tuix:editor-template';

function location(path: unknown, line: unknown): SourceLocation | null {
  return typeof path === 'string' && path.length > 0 && path.length <= 2048 &&
    !/[\x00-\x1f\x7f]/.test(path) && typeof line === 'number' && Number.isInteger(line) && line > 0 && line <= 10000000
    ? { path, line } : null;
}
function comment(node: Node) { return node.nodeType === 8 ? (node.nodeValue ?? '').trim().slice(0, 4096) : ''; }
function phoenix(element: Element): SourceLocation | null {
  let budget = 500;
  for (let current: Element | null = element, depth = 0; current && depth < 30; current = current.parentElement, depth++) {
    const closed: string[] = [];
    for (let node = current.previousSibling; node && budget-- > 0; node = node.previousSibling) {
      const text = comment(node), end = /^<\/([^>]+)>$/.exec(text);
      if (end) { closed.push(end[1]); continue; }
      const start = /^<([^>]+)> (.+):([1-9][0-9]*)(?: \([^)]*\))?$/.exec(text);
      if (!start) continue;
      if (closed.length) { if (closed.pop() !== start[1]) return null; continue; }
      // Only recognize a paired component boundary surrounding this element.
      let nesting = 0;
      for (let following = current.nextSibling; following && budget-- > 0; following = following.nextSibling) {
        const marker = comment(following);
        if (marker.startsWith('<' + start[1] + '> ')) nesting++;
        if (marker === '</' + start[1] + '>') {
          if (nesting-- === 0) return location(start[2], Number(start[3]));
        }
      }
      return null;
    }
  }
  return null;
}
function own(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? Object.getOwnPropertyDescriptor(value, key)?.value : undefined;
}
function react(element: Element): SourceLocation | null {
  const key = Object.getOwnPropertyNames(element).find(name => name.startsWith('__reactFiber$') || name.startsWith('__reactInternalInstance$'));
  let fiber = key ? own(element, key) : undefined;
  const seen = new Set<unknown>();
  for (let depth = 0; fiber && !seen.has(fiber) && depth < 30; depth++) {
    seen.add(fiber);
    const source = own(fiber, '_debugSource');
    const result = location(own(source, 'fileName'), own(source, 'lineNumber'));
    if (result) return result;
    fiber = own(fiber, '_debugOwner') ?? own(fiber, 'return');
  }
  return null;
}

/** Local only. Returned paths must never be added to a report or telemetry payload. */
export function sourceLocation(element: Element | null, environment: string): SourceLocation | null {
  if (environment !== 'local' || !element) return null;
  try { return phoenix(element) ?? react(element); } catch { return null; }
}
export function validEditor(template: string): boolean {
  return template.length <= 2048 && !/[\x00-\x20\x7f]/.test(template) &&
    (/^(?:vscode|cursor):\/\/file\/[^?#{}]*\{path\}:\{line\}$/.test(template) ||
     /^idea:\/\/open\?file=[^&#{}]*\{path\}&line=\{line\}$/.test(template));
}
export function editorLink(template: string, source: SourceLocation): string | null {
  if (!validEditor(template) || !location(source.path, source.line)) return null;
  if (!/^(?:\/|[a-z]:[\\/])/i.test(source.path) && /(?:file\/|file=)\{path\}/.test(template)) return null;
  try {
    const path = template.startsWith('idea:') ? encodeURIComponent(source.path) : source.path.split('/').map(encodeURIComponent).join('/');
    return template.replace('{path}', path).replace('{line}', String(source.line));
  } catch { return null; }
}
export function readEditor(): string {
  try { const value = localStorage.getItem(storageKey); return value && validEditor(value) ? value : defaultEditor; }
  catch { return defaultEditor; }
}
export function saveEditor(template: string): boolean {
  if (!validEditor(template)) return false;
  try { localStorage.setItem(storageKey, template); return true; } catch { return false; }
}
