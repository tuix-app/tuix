import { ignored } from './locators';
/** A transparent picking surface intercepts clicks; hit-testing still sees the page beneath it. */
export function pickElement(x: number, y: number, parent = false, root: Document = document): Element | null {
  let scope = root, element: Element | undefined;
  for (let depth = 0; depth < 10; depth++) {
    element = scope.elementsFromPoint(x, y).find(node => !ignored(node));
    if (!element || element.tagName !== 'IFRAME') break;
    try {
      const frame = element as HTMLIFrameElement;
      const child = frame.contentDocument;
      if (!child?.documentElement) break;
      const box = frame.getBoundingClientRect();
      x -= box.x + frame.clientLeft; y -= box.y + frame.clientTop;
      scope = child;
    } catch { break; }
  }
  if (parent && element?.parentElement && !ignored(element.parentElement)) return element.parentElement;
  return element ?? null;
}
