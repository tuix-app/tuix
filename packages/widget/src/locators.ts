/** Locator data deliberately excludes form values and masked text. */
export interface LocatorBundle {
  section?: { id: string; path: string; fingerprint: string };
  testid?: string;
  aria?: { role: string; name: string };
  text?: { tag: string; text: string };
  css: string;
  fingerprint: string;
  frames?: LocatorBundle[];
  rect: { x: number; y: number; w: number; h: number; vw: number; vh: number; sx: number; sy: number };
}
export interface Resolution { element: Element | null; method: string; orphaned: boolean }
const generated = /^(?:css-|sc-|_[a-z\d]{5})|(?:[a-z]+\d+[a-z\d]*|\d+[a-z]+[a-z\d]*){1,}/i;
const safeTag = /^[a-z][a-z\d-]*$/i;
const quote = (value: string) => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/[\n\r\f]/g, ' ') + '"';
export const masked = (element: Element) => !!element.closest('[data-tuix-mask],input,textarea,select,[contenteditable]');
export const ignored = (element: Element) => !!element.closest('[data-tuix-ignore],tuix-widget');

function textOf(element: Element): string {
  if (masked(element)) return '';
  // A parent may include masked descendants. Clone first so their text never enters locators.
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('[data-tuix-mask],input,textarea,select,[contenteditable],script,style').forEach(node => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
function roleOf(element: Element): string {
  const explicit = element.getAttribute('role');
  if (explicit) return explicit;
  const tag = element.tagName.toLowerCase();
  if (tag === 'a' && element.hasAttribute('href')) return 'link';
  return ({ button: 'button', select: 'combobox', textarea: 'textbox', img: 'img', h1: 'heading', h2: 'heading', h3: 'heading' } as Record<string,string>)[tag] ?? '';
}
function nameOf(element: Element): string {
  if (masked(element)) return '';
  const label = element.getAttribute('aria-labelledby');
  if (label) {
    return label.split(/\s+/).map(id => element.ownerDocument.getElementById(id)).filter((node): node is HTMLElement => !!node).map(textOf).join(' ').slice(0, 80);
  }
  return (element.getAttribute('aria-label') ?? element.getAttribute('alt') ?? textOf(element)).trim().slice(0, 80);
}
function stable(element: Element): string | undefined {
  if (masked(element)) return;
  for (const attr of ['data-testid', 'data-tuix-id', 'id']) {
    const value = element.getAttribute(attr);
    if (value && value.length <= 200 && (attr !== 'id' || !generated.test(value))) return `[${attr}=${quote(value)}]`;
  }
}
function fingerprint(element: Element, stop?: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  for (let i = 0; current && i < 4; i++, current = current.parentElement) {
    parts.push(current.tagName.toLowerCase() + (stable(current) ?? '') + ':' + roleOf(current));
    if (current === stop) break;
  }
  let hash = 2166136261;
  for (const char of parts.join('/')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(16);
}
function cssPath(element: Element, stop?: Element): string {
  const path: string[] = [];
  let current: Element | null = element;
  for (let i = 0; current && i < 8; i++, current = current.parentElement) {
    if (current === stop) return path.join(' > ');
    const tag = current.tagName.toLowerCase();
    if (!safeTag.test(tag)) break;
    const siblings: Element[] = current.parentElement ? Array.from(current.parentElement.children).filter(child => child.tagName === current!.tagName) : [current];
    path.unshift(siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(current) + 1})` : tag);
    if (tag === 'body') break;
  }
  if (stop) return ''; // Never produce an unanchored path for a deeply nested target.
  return path.join(' > ');
}
function sectionLocator(element: Element): LocatorBundle['section'] {
  const section = element.closest('[id^="shopify-section-"]');
  if (!section || masked(section) || !/^shopify-section-[a-zA-Z0-9_-]{1,200}$/.test(section.id)) return;
  const path = cssPath(element, section);
  if (element !== section && !path) return;
  return { id: section.id, path, fingerprint: fingerprint(element, section) };
}
export function locate(element: Element): LocatorBundle {
  const view = element.ownerDocument.defaultView!;
  const box = element.getBoundingClientRect();
  const role = roleOf(element), name = nameOf(element), text = textOf(element);
  const result: LocatorBundle = {
    section: sectionLocator(element),
    testid: stable(element), aria: role && name ? { role, name } : undefined,
    text: text ? { tag: element.tagName.toLowerCase(), text } : undefined,
    css: cssPath(element), fingerprint: fingerprint(element),
    rect: { x: box.x + view.scrollX, y: box.y + view.scrollY, w: box.width, h: box.height, vw: view.innerWidth, vh: view.innerHeight, sx: view.scrollX, sy: view.scrollY }
  };
  try {
    if (view.frameElement) {
      const frame = locate(view.frameElement);
      result.frames = [...(frame.frames ?? []), { ...frame, frames: undefined }];
    }
  } catch { /* Cross-origin frame: pick its outer iframe element instead. */ }
  return result;
}
function query(root: Document, selector: string): Element[] {
  if (typeof selector !== 'string' || !selector || selector.length > 2048) return [];
  try { return Array.from(root.querySelectorAll(selector)).filter(node => !ignored(node)); } catch { return []; }
}
function resolveHere(bundle: LocatorBundle, root: Document, local: boolean): Resolution {
  const candidates: [string, () => Element[], boolean][] = [
    ['testid', () => bundle.testid ? query(root, bundle.testid) : [], false],
    ['aria', () => bundle.aria ? query(root, 'button,a,input,select,textarea,img,h1,h2,h3,[role]').filter(el => roleOf(el) === bundle.aria!.role && nameOf(el) === bundle.aria!.name) : [], false],
    ['text', () => bundle.text && safeTag.test(bundle.text.tag) ? query(root, bundle.text.tag).filter(el => textOf(el) === bundle.text!.text) : [], true],
    ['css', () => query(root, bundle.css), true]
  ];
  if (local) [candidates[2], candidates[3]] = [candidates[3], candidates[2]];
  // Keep this first in every environment, without changing the ordinary fallback order.
  candidates.unshift(['section', () => {
    const anchor = bundle.section;
    if (!anchor || typeof anchor.id !== 'string' || !/^shopify-section-[a-zA-Z0-9_-]{1,200}$/.test(anchor.id) ||
        typeof anchor.path !== 'string' || anchor.path.length > 2048) return [];
    const sections = query(root, `[id=${quote(anchor.id)}]`);
    if (sections.length !== 1) return [];
    const section = sections[0];
    try {
      const matches = anchor.path ? Array.from(section.querySelectorAll(':scope > ' + anchor.path)) : [section];
      return matches.filter(element => !ignored(element) && fingerprint(element, section) === anchor.fingerprint);
    } catch { return []; }
  }, false]);
  for (const [method, find, confirm] of candidates) {
    const matches = find();
    if (matches.length === 1 && (!confirm || fingerprint(matches[0]) === bundle.fingerprint)) return { element: matches[0], method, orphaned: false };
  }
  return { element: null, method: 'geometry', orphaned: true };
}
export function resolve(bundle: LocatorBundle, root: Document = document, local = false): Resolution {
  const orphan = { element: null, method: 'geometry', orphaned: true };
  if (!bundle || typeof bundle !== 'object' || (bundle.frames != null && !Array.isArray(bundle.frames))) return orphan;
  let scope = root;
  for (const frame of (bundle.frames ?? []).slice(0, 10)) {
    if (!frame || typeof frame !== 'object') return orphan;
    const match = resolveHere(frame, scope, local).element;
    try {
      const doc = match?.tagName === 'IFRAME' ? (match as HTMLIFrameElement).contentDocument : null;
      if (!doc) return { element: null, method: 'geometry', orphaned: true };
      scope = doc;
    } catch { return { element: null, method: 'geometry', orphaned: true }; }
  }
  return resolveHere(bundle, scope, local);
}
export function routeKey(input: string, keepQuery: string[] = []): string {
  const url = new URL(input, 'https://tuix.invalid');
  const path = url.pathname.split('/').map(segment => /^(?:\d+|[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|[\w-]{20,})$/i.test(segment) ? ':param' : segment).join('/');
  const query = new URLSearchParams();
  for (const key of [...keepQuery].sort()) for (const value of url.searchParams.getAll(key)) query.append(key, value);
  return path + (query.size ? '?' + query.toString() : '');
}
