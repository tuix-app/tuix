// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { pickElement } from '../src/picker';
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function hits(doc: Document, elements: Element[]) {
  const fn = vi.fn().mockReturnValue(elements);
  Object.defineProperty(doc, 'elementsFromPoint', { configurable: true, value: fn });
  return fn;
}
it('looks beneath its own closed host and honors ignored elements and Alt parent selection', () => {
  document.body.innerHTML = '<tuix-widget></tuix-widget><span data-tuix-ignore>Ignore</span><section><button>Pick</button></section>';
  const button = document.querySelector('button')!;
  hits(document, [document.querySelector('tuix-widget')!, document.querySelector('span')!, button]);
  expect(pickElement(10, 20)).toBe(button);
  expect(pickElement(10, 20, true)).toBe(button.parentElement);
});
it('descends into same-origin frames with local coordinates', () => {
  document.body.innerHTML = '<iframe></iframe>';
  const frame = document.querySelector('iframe')!;
  frame.contentDocument!.body.innerHTML = '<button>Inside</button>';
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ x: 100, y: 50 } as DOMRect);
  hits(document, [frame]);
  const button = frame.contentDocument!.querySelector('button')!;
  const childHits = hits(frame.contentDocument!, [button]);
  expect(pickElement(120, 80)).toBe(button);
  expect(childHits).toHaveBeenCalledWith(20, 30);
});
it('selects an opaque cross-origin frame itself', () => {
  document.body.innerHTML = '<iframe></iframe>';
  const frame = document.querySelector('iframe')!;
  Object.defineProperty(frame, 'contentDocument', { get() { throw new DOMException('Cross-origin', 'SecurityError'); } });
  hits(document, [frame]);
  expect(pickElement(20, 30)).toBe(frame);
});
