import { createContext, destroyContext, domToCanvas, type Context } from 'modern-screenshot';
import { MAX_SCREENSHOT_BYTES } from './types';
/** Longest side, in image pixels, the Tuix server accepts (the server's `@max_side`). */
export const MAX_SIDE = 3200;
/** Older widgets' cap, where the redraw of a capture too large to inline ends up. */
const FALLBACK_SIDE = 1600;
/**
 * Largest PNG the hosted MCP server hands AI agents as an image (the server's
 * `@inline_bytes`); a larger one reaches them only as a short-lived URL.
 */
export const INLINE_BYTES = 3_700_000;
/** The highlight band and the dark halo just outside it, in CSS pixels. */
export const HIGHLIGHT_WIDTH = 5, HALO_WIDTH = 1.5;
/** The tuix dark ground, translucent: it edges the accent band on light pages and on dark ones. */
const HALO = 'rgba(28,24,48,.6)';
const privateSelector = '[data-tuix-mask],input,textarea,select,[contenteditable],iframe';
/** Stand-in for images outside the captured region or unavailable in the fast pass. */
const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
/** Sanitize the detached clone before embedding assets or exporting image bytes. */
export function sanitizeClone(root: Element) {
  if (root.matches(privateSelector)) {
    root.replaceChildren();
    for (const attribute of [...root.attributes]) root.removeAttribute(attribute.name);
    (root as HTMLElement).style.cssText = 'background:#d4d8d6!important;width:100%;height:100%';
    return;
  }
  for (const node of root.querySelectorAll(privateSelector)) {
    const placeholder = root.ownerDocument.createElement('div');
    const style = (node as HTMLElement).style;
    placeholder.style.cssText = style?.cssText ?? '';
    placeholder.style.setProperty('background', '#d4d8d6', 'important');
    placeholder.style.setProperty('color', 'transparent', 'important');
    placeholder.style.setProperty('border-color', '#d4d8d6', 'important');
    placeholder.style.setProperty('box-shadow', 'none', 'important');
    placeholder.style.setProperty('overflow', 'hidden', 'important');
    node.replaceWith(placeholder);
  }
  root.querySelectorAll('script,style,tuix-widget').forEach(node => node.remove());
  for (const node of [root, ...root.querySelectorAll('*')]) {
    for (const attribute of [...node.attributes]) {
      if (attribute.name.startsWith('on') || attribute.name === 'value' || attribute.name === 'srcdoc') node.removeAttribute(attribute.name);
    }
  }
}
export interface Region { x: number; y: number; width: number; height: number }
/**
 * The reporter's view: one viewport of the document. It follows the current
 * scroll position, or centres the target when that lies outside the viewport.
 */
export function captureRegion(target: Element): Region {
  const root = document.documentElement;
  // In quirks mode the root's client size is the document's; <body>'s is the viewport's.
  const view = document.compatMode === 'BackCompat' && document.body || root;
  const width = view.clientWidth || innerWidth, height = view.clientHeight || innerHeight;
  const box = target.getBoundingClientRect();
  const visible = box.bottom > 0 && box.top < height && box.right > 0 && box.left < width;
  const clamp = (value: number, size: number, total: number) => Math.max(0, Math.min(value, Math.max(0, total - size)));
  const x = visible ? scrollX : clamp(scrollX + box.left + box.width / 2 - width / 2, width, root.scrollWidth);
  const y = visible ? scrollY : clamp(scrollY + box.top + box.height / 2 - height / 2, height, root.scrollHeight);
  return { x: Math.round(x), y: Math.round(y), width, height };
}
/** Image sources whose elements intersect the region; everything else is replaced by a blank. */
function regionImages(region: Region) {
  const inside = new Set<string>(), outside = new Set<string>();
  for (const image of document.images) {
    const source = image.currentSrc || image.src;
    if (!source) continue;
    const box = image.getBoundingClientRect();
    const top = box.top + scrollY, left = box.left + scrollX;
    const hit = box.width > 0 && box.height > 0 && top < region.y + region.height && top + box.height > region.y && left < region.x + region.width && left + box.width > region.x;
    (hit ? inside : outside).add(source);
  }
  return (url: string) => !inside.has(url) && outside.has(url);
}
/** Pages without a painted root background show white in the browser, not transparency. */
function pageBackground() {
  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;
    const color = getComputedStyle(element).backgroundColor;
    if (color && !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(color)) return color;
  }
  return '#fff';
}
/** Device pixels, so a Retina report keeps its detail, up to MAX_SIDE on the longest side. */
export function captureScale(region: Region, dpr = devicePixelRatio) {
  return Math.min(dpr || 1, MAX_SIDE / Math.max(region.width, region.height));
}
export interface Box { left: number; top: number; width: number; height: number }
/**
 * The highlight's outer edge on the canvas: the target's box, taken with the scroll
 * offset at capture time, relative to the region, grown by the band and its halo and
 * clamped to the canvas. Null when the target lies wholly outside the region, or when
 * its visible part fills 95% of the image both ways: a frame around it all marks nothing.
 */
export function highlightRect(box: Box, scroll: { x: number; y: number }, region: Region, scale: number, canvas: { width: number; height: number }): Box | null {
  const left = (box.left + scroll.x - region.x) * scale, top = (box.top + scroll.y - region.y) * scale;
  const right = left + box.width * scale, bottom = top + box.height * scale;
  if (right <= 0 || bottom <= 0 || left >= canvas.width || top >= canvas.height) return null;
  if (Math.min(right, canvas.width) - Math.max(left, 0) >= .95 * canvas.width && Math.min(bottom, canvas.height) - Math.max(top, 0) >= .95 * canvas.height) return null;
  const grow = (HIGHLIGHT_WIDTH + HALO_WIDTH) * scale, x = Math.max(0, left - grow), y = Math.max(0, top - grow);
  return { left: x, top: y, width: Math.min(canvas.width, right + grow) - x, height: Math.min(canvas.height, bottom + grow) - y };
}
/** Stroked onto the pixels, so page CSS (`outline: none`, a clipping ancestor) cannot hide it. */
function drawHighlight(canvas: HTMLCanvasElement, rect: Box, scale: number, accent: string) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const halo = HALO_WIDTH * scale, band = HIGHLIGHT_WIDTH * scale;
  context.strokeStyle = HALO; context.lineWidth = halo;
  context.strokeRect(rect.left + halo / 2, rect.top + halo / 2, rect.width - halo, rect.height - halo);
  context.strokeStyle = accent; context.lineWidth = band;
  context.strokeRect(rect.left + halo + band / 2, rect.top + halo + band / 2, Math.max(0, rect.width - 2 * halo - band), Math.max(0, rect.height - 2 * halo - band));
}
const png = (canvas: HTMLCanvasElement) => new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
async function redraw(canvas: HTMLCanvasElement, factor: number) {
  const smaller = document.createElement('canvas');
  smaller.width = Math.max(1, Math.floor(canvas.width * factor)); smaller.height = Math.max(1, Math.floor(canvas.height * factor));
  const context = smaller.getContext('2d');
  if (!context) return null;
  context.imageSmoothingQuality = 'high';
  context.drawImage(canvas, 0, 0, smaller.width, smaller.height);
  return png(smaller);
}
/**
 * A PNG AI agents get as an image. Over INLINE_BYTES, up to two smaller redraws of the
 * finished canvas: the size the bytes call for but not below the old 1600 cap, then at
 * most that cap. Out of time, or still too large, the last PNG the server accepts is kept;
 * `keep` hears of each, so one survives a redraw cut off by the pass deadline.
 */
async function encode(canvas: HTMLCanvasElement, deadline: number, keep: (blob: Blob) => void): Promise<Blob | null> {
  const longest = Math.max(canvas.width, canvas.height);
  let side = longest, blob = await png(canvas);
  if (blob && blob.size <= MAX_SCREENSHOT_BYTES) keep(blob);
  for (let step = 0; step < 2 && blob && blob.size > INLINE_BYTES && performance.now() <= deadline; step++) {
    // PNG bytes grow with the area; the margin covers the denser detail of a smaller image.
    const estimate = Math.floor(side * .9 * Math.sqrt(INLINE_BYTES / blob.size));
    side = step === 0 && side > FALLBACK_SIDE ? Math.max(estimate, FALLBACK_SIDE) : Math.min(estimate, FALLBACK_SIDE);
    const smaller = await redraw(canvas, side / longest);
    if (!smaller) break;
    blob = smaller;
    if (blob.size <= MAX_SCREENSHOT_BYTES) keep(blob);
  }
  return blob && blob.size <= MAX_SCREENSHOT_BYTES ? blob : null;
}
/**
 * restoreScrollPosition shifts the children of every scrolled element, the page's own
 * scroller among them. The root's offset already places the region, and a transform on
 * <body> would carry its fixed elements along, so that one shift is taken back.
 */
function unshiftPage(clone: Element) {
  const scroller = document.scrollingElement, x = scroller?.scrollLeft ?? 0, y = scroller?.scrollTop ?? 0;
  const host = scroller === document.documentElement ? clone : scroller === document.body ? clone.querySelector(':scope>body') : null;
  if (!host || (!x && !y)) return;
  for (const child of host.children) {
    if (!(child instanceof HTMLElement)) continue;
    const matrix = new DOMMatrix(child.style.transform);
    matrix.e += x; matrix.f += y;
    child.style.transform = matrix.isIdentity ? '' : matrix.toString();
  }
}
const scrolls = (element: HTMLElement) => /auto|scroll|hidden|overlay/.test(element.style.overflowX + element.style.overflowY);
/**
 * restoreScrollPosition shows a scrolled pane by shifting its children, while the copy lays
 * the pane out unscrolled. The shift is read off a child's transform against its own one
 * (`before`, recorded ahead of the shift).
 * - A sticky element in the pane would stick for scroll 0 and move off with the shift, so
 *   its insets take the scroll.
 * - Shifted children paint like positioned ones, in tree order, so they would cover a
 *   positioned sibling before them that has no z-index; on the page it covers them.
 * - A fixed child, or an absolute one anchored outside the pane, does not scroll with it.
 *   (A fixed element deeper in the pane still moves: its shifted ancestor contains it.)
 */
function restorePanes(clone: Element, before: WeakMap<Element, string>) {
  const shifts = new Map<Element, { x: number; y: number }>();
  for (const pane of clone.querySelectorAll<HTMLElement>('[style*=overflow]')) {
    const first = [...pane.children].find(child => child instanceof HTMLElement) as HTMLElement | undefined;
    if (!first || !scrolls(pane)) continue;
    const shifted = new DOMMatrix(first.style.transform), own = new DOMMatrix(before.get(first) ?? '');
    const x = own.e - shifted.e, y = own.f - shifted.f;
    if (!x && !y) continue;
    shifts.set(pane, { x, y });
    for (const child of pane.children) {
      const style = (child as HTMLElement).style;
      if (!style || !/sticky|absolute|relative|fixed/.test(style.position)) continue;
      if (/^(auto)?$/.test(style.zIndex)) style.zIndex = '1';
      if (style.position === 'fixed' || style.position === 'absolute' && /^(static)?$/.test(pane.style.position) && !pane.style.transform) style.transform = before.get(child) ?? '';
    }
  }
  for (const sticky of clone.querySelectorAll<HTMLElement>('[style*=sticky]')) {
    let pane = sticky.parentElement;
    while (pane && pane !== clone && !scrolls(pane)) pane = pane.parentElement;
    const shift = pane && shifts.get(pane);
    if (!shift || sticky.style.position !== 'sticky') continue;
    // The copy carries logical insets too; declared after the physical ones, they would win.
    for (const logical of ['inset-block', 'inset-inline']) sticky.style.removeProperty(logical);
    for (const [side, scroll] of [['top', shift.y], ['bottom', -shift.y], ['left', shift.x], ['right', -shift.x]] as const) {
      const inset = sticky.style.getPropertyValue(side);
      if (scroll && inset && inset !== 'auto') sticky.style.setProperty(side, `calc(${inset} ${scroll < 0 ? '-' : '+'} ${Math.abs(scroll)}px)`);
    }
  }
}
type Mode = 'full' | 'fast';
async function attempt(target: Element, accent: string, mode: Mode, deadline: number, region: Region): Promise<Blob | null> {
  const root = document.documentElement;
  const remaining = () => deadline - performance.now();
  if (remaining() <= 0) return null;
  const abort = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const offscreen = regionImages(region), scale = captureScale(region);
  // A target in a frame has a box in that frame's viewport, not in the captured page;
  // a frame around the whole page marks nothing.
  const marked = target.ownerDocument === document && target !== document.body && target !== root;
  let seen = null as { box: DOMRect; scroll: { x: number; y: number } } | null, kept: Blob | null = null;
  const before = new WeakMap<Element, string>();
  let context: Context<HTMLElement> | undefined;
  const work = (async () => {
    context = await createContext(root, {
      width: region.width, height: region.height, backgroundColor: pageBackground(), scale,
      // `timeout` first bounds the wait for page images. Lazy images outside the
      // viewport never load, so waiting the full asset budget would stall every capture.
      timeout: Math.min(mode === 'full' ? 400 : 50, remaining()),
      // The root keeps its full height so its background paints the shifted region. In the
      // copy it is no longer the root, so a first child's top margin would collapse through
      // it and move what is positioned against it; flow-root keeps the margin inside.
      style: { position: 'relative', top: `${-region.y}px`, left: `${-region.x}px`, height: `${Math.max(root.scrollHeight, region.y + region.height)}px`, display: 'flow-root' },
      font: mode === 'full' ? undefined : false,
      drawImageInterval: 40,
      // Scrolled panes show what the reporter sees; modern-screenshot clones them at the top.
      features: { restoreScrollPosition: true },
      fetch: { requestInit: { signal: abort.signal, credentials: 'omit' }, placeholderImage: blank },
      // The fast pass never waits on the network: it keeps layout, not remote pixels.
      fetchFn: async url => mode === 'fast' || offscreen(url) ? blank : false,
      filter(node) {
        if (performance.now() > deadline) throw new Error('Screenshot timeout');
        if (node.nodeType !== 1) return !node.parentElement?.closest(privateSelector);
        const element = node as Element;
        return !element.closest('tuix-widget') && !element.parentElement?.closest(privateSelector);
      },
      onCloneEachNode(cloned) {
        const transform = (cloned as HTMLElement).style?.transform;
        if (transform) before.set(cloned as Element, transform);
      },
      onCloneNode(cloned) {
        if (performance.now() > deadline) throw new Error('Screenshot timeout');
        unshiftPage(cloned as Element);
        // Before masking: a mask placeholder has no recorded transform to read a shift against.
        restorePanes(cloned as Element, before);
        sanitizeClone(cloned as Element);
        // The target's place as this clone has it, after any shift while page images loaded.
        if (marked) seen = { box: target.getBoundingClientRect(), scroll: { x: scrollX, y: scrollY } };
      },
      onCreateForeignObjectSvg() {
        // Firefox and Safari redraw once per embedded image to let SVG images decode.
        // A few passes decode a viewport; one pass per page image took seconds.
        if (context) context.drawImageCount = Math.min(context.drawImageCount, 4);
      },
    });
    context.timeout = Math.max(1, Math.min(mode === 'full' ? 3000 : 1000, remaining()));
    const canvas = await domToCanvas(context);
    const rect = seen && highlightRect(seen.box, seen.scroll, region, scale, canvas);
    if (rect) drawHighlight(canvas, rect, scale, accent);
    return encode(canvas, deadline, blob => { kept = blob; });
  })().catch(() => kept).finally(() => { if (context) destroyContext(context); });
  try {
    return await Promise.race([work, new Promise<Blob | null>(resolve => { timer = setTimeout(() => { abort.abort(); resolve(kept); }, Math.max(0, remaining())); })]);
  } catch { return null; } finally { if (timer) clearTimeout(timer); }
}
/**
 * Captures what the reporter sees. A faithful pass embeds fonts and visible
 * images; if it fails or runs out of time, a network-free pass keeps the layout.
 */
export async function screenshot(target: Element, accent: string, budget = 8000): Promise<Blob | null> {
  const start = performance.now(), deadline = start + budget;
  const region = captureRegion(target);
  const full = await attempt(target, accent, 'full', start + budget * 0.65, region);
  if (full?.size) return full;
  const fast = await attempt(target, accent, 'fast', deadline, region);
  return fast?.size ? fast : null;
}
