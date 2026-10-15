// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Options } from 'modern-screenshot';
import { createContext, destroyContext, domToCanvas } from 'modern-screenshot';
import { HALO_WIDTH, HIGHLIGHT_WIDTH, INLINE_BYTES, MAX_SIDE, captureRegion, captureScale, highlightRect, screenshot } from '../src/screenshot';
import { MAX_SCREENSHOT_BYTES } from '../src/types';

vi.mock('modern-screenshot', () => ({
  createContext: vi.fn(),
  destroyContext: vi.fn(),
  domToCanvas: vi.fn(),
}));

/** A PNG of `size` bytes; encoding only reads the size. */
const png = (size: number) => ({ size, type: 'image/png' }) as Blob;
type Stroke = { style: string; width: number; rect: number[] };
/** A canvas whose 2D context records strokes and whose PNG has `bytes` bytes. */
function fakeCanvas(width: number, height: number, bytes = 16) {
  const strokes: Stroke[] = [];
  const context = { strokeStyle: '', lineWidth: 1, strokeRect(...rect: number[]) { strokes.push({ style: this.strokeStyle, width: this.lineWidth, rect }); } };
  const canvas = { width, height, getContext: () => context, toBlob: (done: BlobCallback) => done(png(bytes)) };
  return { canvas: canvas as unknown as HTMLCanvasElement, strokes };
}
const context = {} as Awaited<ReturnType<typeof createContext>>;
/**
 * Mocks the renderer as modern-screenshot runs it: createContext waits for page images,
 * then domToCanvas clones the page (`cloning` stands in for the per-node work) and draws.
 */
function renderer(canvas: HTMLCanvasElement | (() => HTMLCanvasElement), { clone = document.documentElement.cloneNode(true) as Element, loading = () => {}, cloning = (_options: Options) => {} } = {}) {
  const options: Options[] = [];
  vi.mocked(createContext).mockImplementation(async (_node, option?: Options) => { options.push(option!); loading(); return context; });
  vi.mocked(domToCanvas).mockImplementation(async () => {
    cloning(options[options.length - 1]);
    await options[options.length - 1].onCloneNode?.(clone);
    return typeof canvas === 'function' ? canvas() : canvas;
  });
  return { options, clone };
}
/** Sizes and bytes of the redraws, which encode on real canvas elements. */
function redraws(bytes: (width: number) => number) {
  const sizes: number[][] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, done: BlobCallback) {
    sizes.push([this.width, this.height]);
    done(png(bytes(this.width)));
  });
  return sizes;
}
function viewport(width: number, height: number, dpr: number) {
  for (const [name, value] of [['innerWidth', width], ['innerHeight', height], ['devicePixelRatio', dpr]] as const) {
    Object.defineProperty(window, name, { configurable: true, value });
  }
}
const originalViewport = [innerWidth, innerHeight, devicePixelRatio] as const;
/** jsdom has no DOMMatrix; this covers the 2D matrices the capture reads and writes. */
class Matrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  constructor(text: string) { const values = /matrix\(([^)]*)\)/.exec(text)?.[1].split(',').map(Number); if (values) [this.a, this.b, this.c, this.d, this.e, this.f] = values; }
  get isIdentity() { return this.a === 1 && !this.b && !this.c && this.d === 1 && !this.e && !this.f; }
  toString() { return `matrix(${[this.a, this.b, this.c, this.d, this.e, this.f].join(', ')})`; }
}
const target = (html = '<button id="selected">Save</button>') => { document.body.innerHTML = html; return document.querySelector<HTMLElement>('#selected')!; };

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  viewport(...originalViewport);
  for (const name of ['scrollHeight', 'scrollTop', 'scrollLeft']) Reflect.deleteProperty(document.documentElement, name);
  Reflect.deleteProperty(document, 'scrollingElement');
  document.body.replaceChildren();
});

describe('screenshot scale', () => {
  it('captures at the device pixel ratio, up to MAX_SIDE on the longest side', () => {
    expect(MAX_SIDE).toBe(3200);
    expect(captureScale({ x: 0, y: 0, width: 1920, height: 1080 }, 1)).toBe(1);
    expect(captureScale({ x: 0, y: 0, width: 800, height: 600 }, 1)).toBe(1);
    expect(captureScale({ x: 0, y: 0, width: 1280, height: 800 }, 2)).toBe(2);
    expect(captureScale({ x: 0, y: 0, width: 390, height: 844 }, 3)).toBe(3);
    expect(captureScale({ x: 0, y: 0, width: 1672, height: 925 }, 2)).toBeCloseTo(3200 / 1672);
    expect(captureScale({ x: 0, y: 0, width: 1920, height: 1080 }, 3)).toBeCloseTo(3200 / 1920);
    expect(captureScale({ x: 0, y: 0, width: 3840, height: 2160 }, 1)).toBeCloseTo(3200 / 3840);
    expect(captureScale({ x: 0, y: 0, width: 1024, height: 768 }, 0)).toBe(1);
  });

  it('never yields an image side over MAX_SIDE or a scale above the ratio', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3]) {
      for (let width = 320; width <= 4000; width += 37) {
        const region = { x: 0, y: 0, width, height: Math.round(width * 0.55) }, scale = captureScale(region, dpr);
        expect(scale).toBeLessThanOrEqual(dpr);
        expect(Math.floor(width * scale)).toBeLessThanOrEqual(MAX_SIDE);
      }
    }
  });
});

describe('screenshot highlight rectangle', () => {
  const region = { x: 0, y: 0, width: 1000, height: 800 }, canvas = { width: 2000, height: 1600 }, still = { x: 0, y: 0 };
  const grow = (HIGHLIGHT_WIDTH + HALO_WIDTH) * 2;

  it('is a 5px band with a 1.5px halo at CSS scale', () => {
    expect([HIGHLIGHT_WIDTH, HALO_WIDTH]).toEqual([5, 1.5]);
  });

  it('surrounds the target in canvas pixels, relative to the region', () => {
    expect(highlightRect({ left: 100, top: 50, width: 200, height: 40 }, still, region, 2, canvas))
      .toEqual({ left: 200 - grow, top: 100 - grow, width: 400 + 2 * grow, height: 80 + 2 * grow });
    // Scrolled 300px down, with the region starting 250px into the document.
    expect(highlightRect({ left: 100, top: 100, width: 200, height: 40 }, { x: 0, y: 300 }, { ...region, y: 250 }, 2, canvas))
      .toMatchObject({ top: 300 - grow, left: 200 - grow });
    // Scrolled sideways, the region centred on a target to the right of the viewport.
    expect(highlightRect({ left: 1500, top: 100, width: 200, height: 40 }, { x: 400, y: 0 }, { ...region, x: 1350 }, 2, canvas))
      .toEqual({ left: 1100 - grow, top: 200 - grow, width: 400 + 2 * grow, height: 80 + 2 * grow });
  });

  it('places the band on portrait captures, at a phone ratio and capped ones', () => {
    const phone = { x: 0, y: 1200, width: 390, height: 844 };
    expect(highlightRect({ left: 20, top: 300, width: 350, height: 48 }, { x: 0, y: 1200 }, phone, 3, { width: 1170, height: 2532 }))
      .toEqual({ left: 60 - 19.5, top: 900 - 19.5, width: 1050 + 39, height: 144 + 39 });
    const tall = { x: 0, y: 0, width: 1200, height: 4000 }, scale = 3200 / 4000;
    const rect = highlightRect({ left: 100, top: 3900, width: 200, height: 200 }, still, tall, scale, { width: 960, height: 3200 })!;
    const expected = { left: 80 - 6.5 * scale, top: 3120 - 6.5 * scale, width: 160 + 13 * scale, height: 80 + 6.5 * scale };
    for (const side of ['left', 'top', 'width', 'height'] as const) expect(rect[side]).toBeCloseTo(expected[side]);
  });

  it('clamps to the canvas when the target crosses its edges', () => {
    expect(highlightRect({ left: -50, top: -20, width: 200, height: 100 }, still, region, 2, canvas))
      .toEqual({ left: 0, top: 0, width: 300 + grow, height: 160 + grow });
    expect(highlightRect({ left: 900, top: 700, width: 300, height: 300 }, still, region, 2, canvas))
      .toEqual({ left: 1800 - grow, top: 1400 - grow, width: 200 + grow, height: 200 + grow });
    expect(highlightRect({ left: 200, top: -500, width: 600, height: 2000 }, still, region, 2, canvas))
      .toEqual({ left: 400 - grow, top: 0, width: 1200 + 2 * grow, height: 1600 });
  });

  it('is absent when the target lies wholly outside the region', () => {
    expect(highlightRect({ left: 100, top: 900, width: 200, height: 40 }, still, region, 2, canvas)).toBeNull();
    expect(highlightRect({ left: -300, top: 100, width: 300, height: 40 }, still, region, 2, canvas)).toBeNull();
    expect(highlightRect({ left: 1000, top: 100, width: 10, height: 10 }, still, region, 2, canvas)).toBeNull();
    expect(highlightRect({ left: 100, top: 100, width: 200, height: 40 }, still, { ...region, y: 2000 }, 2, canvas)).toBeNull();
    expect(highlightRect({ left: 100, top: 100, width: 200, height: 40 }, still, { ...region, x: 400 }, 2, canvas)).toBeNull();
  });

  it('is absent when the visible target fills 95% of the image both ways', () => {
    expect(highlightRect({ left: -10, top: -10, width: 2000, height: 2000 }, still, region, 2, canvas)).toBeNull();
    expect(highlightRect({ left: 25, top: 20, width: 950, height: 760 }, still, region, 2, canvas)).toBeNull();
    // 94% of the width, or all of it but 94% of the height, still marks something.
    expect(highlightRect({ left: 30, top: 0, width: 940, height: 800 }, still, region, 2, canvas)).not.toBeNull();
    expect(highlightRect({ left: 0, top: 48, width: 1000, height: 752 }, still, region, 2, canvas)).not.toBeNull();
  });
});

describe('selected element in screenshot evidence', () => {
  it('strokes the halo and accent around the target on the canvas and leaves page and clone unstyled', async () => {
    viewport(1672, 925, 2);
    const selected = target('<main><button id="selected" style="outline:none!important">Save</button><button id="other">Cancel</button></main>');
    selected.getBoundingClientRect = () => ({ left: 281, top: 586, width: 668, height: 48 }) as DOMRect;
    const original = document.documentElement.outerHTML;
    const scale = 3200 / 1672, { canvas, strokes } = fakeCanvas(3200, Math.floor(925 * scale));
    const { options, clone } = renderer(canvas);

    expect((await screenshot(selected, '#f0906a'))?.type).toBe('image/png');
    expect(options[0].scale).toBeCloseTo(scale);
    expect(options[0].features).toEqual({ restoreScrollPosition: true });
    // The copied root keeps a first child's top margin inside, as the page's root does.
    expect(options[0].style).toMatchObject({ position: 'relative', display: 'flow-root' });
    expect(clone.querySelector('#selected')!.getAttribute('style')).toBe('outline:none!important');
    expect(clone.querySelector('#other')!.getAttribute('style')).toBeNull();
    expect(document.documentElement.outerHTML).toBe(original);
    const halo = HALO_WIDTH * scale, band = HIGHLIGHT_WIDTH * scale;
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).toMatchObject({ style: expect.stringMatching(/^rgba\(/), width: halo });
    expect(strokes[1]).toMatchObject({ style: '#f0906a', width: band });
    // The halo's outer edge, then the band's centre line just inside it.
    expect(strokes[0].rect[0] - halo / 2).toBeCloseTo(281 * scale - band - halo);
    const [x, y, width, height] = strokes[1].rect;
    expect(x + band / 2).toBeCloseTo(281 * scale);
    expect(y + band / 2).toBeCloseTo(586 * scale);
    expect(width - band).toBeCloseTo(668 * scale);
    expect(height - band).toBeCloseTo(48 * scale);
    expect(domToCanvas).toHaveBeenCalledWith(context);
    expect(destroyContext).toHaveBeenCalledWith(context);
  });

  it('places the band where the target is when the page is cloned, after a shift while images loaded', async () => {
    viewport(1000, 800, 1);
    const selected = target();
    selected.getBoundingClientRect = () => ({ left: 100, top: 100, width: 200, height: 40 }) as DOMRect;
    const { canvas, strokes } = fakeCanvas(1000, 800);
    renderer(canvas, { loading: () => { selected.getBoundingClientRect = () => ({ left: 100, top: 400, width: 200, height: 40 }) as DOMRect; } });

    await screenshot(selected, '#f0906a');
    expect(strokes[1].rect[1] + HIGHLIGHT_WIDTH / 2).toBeCloseTo(400);
  });

  it('draws nothing for a target outside the captured region', async () => {
    viewport(1024, 768, 1);
    const selected = target();
    // Beyond the end of the document, so the region stops short of it.
    selected.getBoundingClientRect = () => ({ left: 10, top: 4000, right: 60, bottom: 4020, width: 50, height: 20 }) as DOMRect;
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 800 });
    const { canvas, strokes } = fakeCanvas(1024, 768);
    renderer(canvas);
    expect(await screenshot(selected, '#f0906a')).not.toBeNull();
    expect(strokes).toEqual([]);
  });

  it('draws nothing for the whole page or for a target inside a frame', async () => {
    viewport(1024, 768, 1);
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const inner = frame.contentDocument!.createElement('button');
    frame.contentDocument!.body.append(inner);
    inner.getBoundingClientRect = () => ({ left: 10, top: 10, right: 60, bottom: 30, width: 50, height: 20 }) as DOMRect;
    // The verification fallback captures document.body when the reported element is gone;
    // a short page's body need not fill the image.
    for (const element of [inner, document.body, document.documentElement]) {
      if (element !== inner) element.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1024, bottom: 300, width: 1024, height: 300 }) as DOMRect;
      const { canvas, strokes } = fakeCanvas(1024, 768);
      const { options } = renderer(canvas);
      expect(await screenshot(element, '#f0906a')).not.toBeNull();
      expect(options).toHaveLength(1);
      expect(strokes).toEqual([]);
      Reflect.deleteProperty(element, 'getBoundingClientRect');
    }
  });

  it('takes back the scroll shift restoreScrollPosition gives the page scroller children', async () => {
    vi.stubGlobal('DOMMatrix', Matrix);
    const selected = target('<div id="pane"><button id="selected">Save</button></div><p>Note</p>');
    for (const [scroller, host] of [[document.documentElement, (clone: Element) => clone], [document.body, (clone: Element) => clone.querySelector(':scope>body')!]] as const) {
      Object.defineProperty(document, 'scrollingElement', { configurable: true, value: scroller });
      Object.defineProperties(scroller, { scrollLeft: { configurable: true, value: 300 }, scrollTop: { configurable: true, value: 800 } });
      const clone = document.documentElement.cloneNode(true) as Element;
      const [first, second] = host(clone).children as unknown as HTMLElement[];
      first.style.transform = 'matrix(1, 0, 0, 1, -300, -800)';
      second.style.transform = 'matrix(2, 0, 0, 2, -290, -790)';
      // A scrolled pane inside the page keeps its own shift.
      clone.querySelector<HTMLElement>('#selected')!.style.transform = 'matrix(1, 0, 0, 1, 0, -120)';
      renderer(fakeCanvas(1024, 768).canvas, { clone });
      await screenshot(selected, '#f0906a');
      expect([first.style.transform, second.style.transform]).toEqual(['', 'matrix(2, 0, 0, 2, 10, 10)']);
      expect(clone.querySelector<HTMLElement>('#selected')!.style.transform).toBe('matrix(1, 0, 0, 1, 0, -120)');
      for (const name of ['scrollLeft', 'scrollTop']) Reflect.deleteProperty(scroller, name);
    }
  });

  it('keeps sticky elements of a scrolled pane where the reporter saw them', async () => {
    vi.stubGlobal('DOMMatrix', Matrix);
    const selected = target(`<main style="overflow-x: auto; overflow-y: auto"><table><thead><tr><th id="head" style="position: sticky; top: 0px">Status</th></tr></thead>
      <tfoot><tr><td id="foot" style="position: sticky; bottom: 4px; inset-block: 0px 4px">Total</td></tr></tfoot></table><div id="side" style="position: sticky; left: 10px; right: auto"><span id="selected">x</span></div></main>
      <section style="overflow-x: hidden; overflow-y: hidden"><p id="still" style="position: sticky; top: 0px">Unscrolled pane</p></section><p id="page" style="position: sticky; top: 0px">Window</p>`);
    const clone = document.documentElement.cloneNode(true) as Element, $ = (id: string) => clone.querySelector<HTMLElement>('#' + id)!;
    const table = clone.querySelector<HTMLElement>('table')!;
    renderer(fakeCanvas(1024, 768).canvas, {
      clone,
      // The table has its own transform before its pane's shift, scrolled 40 sideways and 1500 down.
      cloning: options => {
        table.style.transform = 'matrix(2, 0, 0, 2, 5, 30)';
        options.onCloneEachNode?.(table);
        table.style.transform = 'matrix(2, 0, 0, 2, -35, -1470)';
        $('side').style.transform = 'matrix(1, 0, 0, 1, -40, -1500)';
      },
    });
    await screenshot(selected, '#f0906a');
    // jsdom folds calc(0px + 1500px) into calc(1500px).
    expect([$('head').style.top, $('foot').style.bottom]).toEqual(['calc(1500px)', 'calc(-1496px)']);
    // Logical insets, which would override the physical ones, are gone.
    expect($('foot').style.cssText).not.toContain('inset-block');
    expect([$('side').style.left, $('side').style.right, $('side').style.top]).toEqual(['calc(50px)', 'auto', '']);
    // A pane that is not scrolled, and the page's own scroller, are left alone.
    expect([$('still').style.top, $('page').style.top]).toEqual(['0px', '0px']);
  });

  it('keeps positioned children of a scrolled pane above its rows and fixed ones in place', async () => {
    vi.stubGlobal('DOMMatrix', Matrix);
    const pane = (id: string, position: string, children: string) => `<div id="${id}" style="overflow-x: auto; overflow-y: auto; position: ${position}">${children}</div>`;
    const selected = target(pane('main', 'static', '<div id="bar" style="position: sticky; top: 0px"></div><div id="raised" style="position: relative; z-index: 3"></div><div id="fab" style="position: fixed; transform: matrix(1, 0, 0, 1, 7, 0)"></div><div id="out" style="position: absolute"></div><p id="row">Row</p>')
      + pane('side', 'relative', '<div id="inside" style="position: absolute"></div><p id="selected">Row</p>')
      + pane('still', 'static', '<div id="calm" style="position: relative"></div>'));
    const clone = document.documentElement.cloneNode(true) as Element, $ = (id: string) => clone.querySelector<HTMLElement>('#' + id)!;
    renderer(fakeCanvas(1024, 768).canvas, {
      clone,
      // The library shifts every child of the two scrolled panes; #fab has its own transform.
      cloning: options => {
        options.onCloneEachNode?.($('fab'));
        for (const id of ['main', 'side']) for (const child of $(id).children as unknown as HTMLElement[]) {
          const own = new Matrix(child.style.transform); own.f -= 600; child.style.transform = own.toString();
        }
      },
    });
    await screenshot(selected, '#f0906a');
    expect(['bar', 'raised', 'fab', 'out', 'row', 'inside', 'calm'].map(id => $(id).style.zIndex)).toEqual(['1', '3', '1', '1', '', '1', '']);
    // Fixed, or absolute in a pane that does not contain it: back to its own transform.
    expect(['fab', 'out', 'inside', 'row'].map(id => $(id).style.transform)).toEqual(['matrix(1, 0, 0, 1, 7, 0)', '', 'matrix(1, 0, 0, 1, 0, -600)', 'matrix(1, 0, 0, 1, 0, -600)']);
  });

  it('leaves panes that are not scrolled alone, a masked first child included', async () => {
    vi.stubGlobal('DOMMatrix', Matrix);
    // A clipped card whose first child, a field, has its own transform; the copy records it
    // before masking turns the field into a placeholder without a record.
    const selected = target(`<div id="card" style="overflow-x: hidden; overflow-y: hidden"><input style="transform: matrix(1, 0, 0, 1, 5, 0)"><span id="badge" style="position: relative">New</span></div>
      <div id="clip" style="overflow-x: hidden; overflow-y: hidden"><div id="pop" style="position: absolute; transform: matrix(1, 0, 0, 1, 0, 9)"></div></div><p id="selected">Save</p>`);
    const clone = document.documentElement.cloneNode(true) as Element, $ = (id: string) => clone.querySelector<HTMLElement>('#' + id)!;
    renderer(fakeCanvas(1024, 768).canvas, { clone, cloning: options => { for (const element of clone.querySelectorAll('[style*=transform]')) options.onCloneEachNode?.(element); } });
    await screenshot(selected, '#f0906a');
    expect([$('badge').style.zIndex, $('pop').style.zIndex, $('pop').style.transform]).toEqual(['', '', 'matrix(1, 0, 0, 1, 0, 9)']);
    expect(clone.querySelector('#card input')).toBeNull();
  });

  it('falls back to a network-free pass when the faithful capture fails', async () => {
    const selected = target();
    const contexts: Options[] = [];
    vi.mocked(createContext).mockImplementation(async (_node, options?: Options) => {
      contexts.push(options!);
      return {} as Awaited<ReturnType<typeof createContext>>;
    });
    vi.mocked(domToCanvas).mockRejectedValueOnce(new Error('tainted')).mockResolvedValueOnce(fakeCanvas(1024, 768).canvas);

    expect((await screenshot(selected, '#0f766e'))?.size).toBe(16);
    expect(contexts).toHaveLength(2);
    expect(contexts[0].font).toBeUndefined();
    expect(contexts[1].font).toBe(false);
    expect(await contexts[1].fetchFn!('https://cdn.example.com/photo.jpg')).toMatch(/^data:image\/gif/);
    expect(destroyContext).toHaveBeenCalledTimes(2);
  });

  it('returns no evidence when both passes fail', async () => {
    const selected = target();
    vi.mocked(createContext).mockResolvedValue({} as Awaited<ReturnType<typeof createContext>>);
    vi.mocked(domToCanvas).mockRejectedValue(new Error('unavailable'));
    expect(await screenshot(selected, '#0f766e')).toBeNull();
  });

  it('takes the viewport from <body> in quirks mode, where the root has the document size', () => {
    const selected = target();
    selected.getBoundingClientRect = () => ({ top: 100, bottom: 120, left: 10, right: 60, width: 50, height: 20 }) as DOMRect;
    Object.defineProperty(document, 'compatMode', { configurable: true, value: 'BackCompat' });
    Object.defineProperties(document.documentElement, { clientWidth: { configurable: true, value: 1280 }, clientHeight: { configurable: true, value: 4800 } });
    Object.defineProperties(document.body, { clientWidth: { configurable: true, value: 1280 }, clientHeight: { configurable: true, value: 800 } });
    expect(captureRegion(selected)).toMatchObject({ width: 1280, height: 800 });
    Reflect.deleteProperty(document, 'compatMode');
    expect(captureRegion(selected)).toMatchObject({ width: 1280, height: 4800 });
    for (const element of [document.documentElement, document.body]) for (const name of ['clientWidth', 'clientHeight']) Reflect.deleteProperty(element, name);
  });

  it('captures the current viewport, or centres a target outside it', () => {
    const selected = target();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 300 });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 5000 });
    selected.getBoundingClientRect = () => ({ top: 100, bottom: 120, left: 10, right: 60, width: 50, height: 20 }) as DOMRect;
    expect(captureRegion(selected)).toMatchObject({ y: 300, width: innerWidth, height: innerHeight });
    selected.getBoundingClientRect = () => ({ top: 2000, bottom: 2020, left: 10, right: 60, width: 50, height: 20 }) as DOMRect;
    expect(captureRegion(selected).y).toBe(Math.round(300 + 2010 - innerHeight / 2));
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
  });
});

describe('screenshot size for AI agents', () => {
  it('keeps PNGs the hosted MCP server attaches inline, under the server limit', () => {
    expect(INLINE_BYTES).toBe(3_700_000);
    expect(INLINE_BYTES).toBeLessThan(MAX_SCREENSHOT_BYTES);
  });

  it('keeps a capture that fits inline as it is', async () => {
    viewport(1672, 925, 2);
    renderer(fakeCanvas(3200, 1770, INLINE_BYTES).canvas);
    const sizes = redraws(() => 0);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(INLINE_BYTES);
    expect(sizes).toEqual([]);
  });

  it('steps down to the size the bytes call for, above the old 1600 cap', async () => {
    viewport(1672, 925, 2);
    renderer(fakeCanvas(3200, 1770, 4_500_000).canvas);
    const sizes = redraws(() => 3_000_000);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(3_000_000);
    // 0.9 × √(3.7 / 4.5) of the side.
    expect(sizes).toEqual([[2611, 1444]]);
  });

  it('then tries the 1600 cap, and below it only when that is still too large', async () => {
    viewport(1672, 925, 2);
    renderer(fakeCanvas(3200, 1770, 4_900_000).canvas);
    let sizes = redraws(width => width > 1600 ? 4_000_000 : 1_000_000);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(1_000_000);
    expect(sizes).toEqual([[2502, 1383], [1600, 885]]);

    vi.restoreAllMocks();
    renderer(fakeCanvas(3200, 1770, 20_000_000).canvas);
    sizes = redraws(width => width >= 1600 ? 4_000_000 : 2_000_000);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(2_000_000);
    // Far over: straight to 1600, then 0.9 × √(3.7 / 4) of it.
    expect(sizes).toEqual([[1600, 885], [1384, 765]]);
  });

  it('steps down from a capture already at most 1600 pixels wide', async () => {
    viewport(1440, 900, 1);
    renderer(fakeCanvas(1440, 900, 4_000_000).canvas);
    const sizes = redraws(() => 3_000_000);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(3_000_000);
    expect(sizes).toEqual([[1246, 778]]);
  });

  it('keeps the last PNG the server accepts when two redraws are not enough', async () => {
    renderer(fakeCanvas(3200, 1770, 6_000_000).canvas);
    const sizes = redraws(width => width > 2000 ? 4_500_000 : 4_200_000);
    expect((await screenshot(target(), '#f0906a'))?.size).toBe(4_200_000);
    expect(sizes).toHaveLength(2);

    vi.restoreAllMocks();
    renderer(() => fakeCanvas(3200, 1770, 6_000_000).canvas);
    redraws(() => MAX_SCREENSHOT_BYTES + 1);
    expect(await screenshot(target(), '#f0906a')).toBeNull();
  });

  it('keeps a PNG the server accepts when the pass deadline cuts off a redraw', async () => {
    renderer(fakeCanvas(3200, 1770, 4_500_000).canvas);
    // The redraw never finishes; the pass's deadline settles it.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {});
    expect((await screenshot(target(), '#f0906a', 60))?.size).toBe(4_500_000);
    expect(domToCanvas).toHaveBeenCalledTimes(1);

    vi.restoreAllMocks();
    renderer(() => fakeCanvas(3200, 1770, MAX_SCREENSHOT_BYTES + 1).canvas);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(() => {});
    expect(await screenshot(target(), '#f0906a', 60)).toBeNull();
  });

  it('out of time, keeps a PNG the server accepts and redraws nothing', async () => {
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const sizes = redraws(() => 1);
    const late = (bytes: number) => { const { canvas } = fakeCanvas(3200, 1770, bytes); canvas.toBlob = done => { now = 1e9; done(png(bytes)); }; return canvas; };
    renderer(late(4_500_000));
    expect((await screenshot(target(), '#f0906a', 8000))?.size).toBe(4_500_000);

    now = 0;
    renderer(() => late(MAX_SCREENSHOT_BYTES + 1));
    expect(await screenshot(target(), '#f0906a', 8000)).toBeNull();
    expect(sizes).toEqual([]);
  });
});
