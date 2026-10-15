import { expect, it } from 'vitest';
import { placeChat, CHAT_W, CHAT_MAX_H, CHAT_GAP, CHAT_EDGE } from '../src/chat-placement';

const view = { left: 0, top: 0, right: 1200, bottom: 800 };
const size = { width: CHAT_W, height: 300 };
const at = (x: number, y: number, width = 40, height = 20) => ({ x, y, width, height });

it('prefers the right of the element, centred on it', () => {
  expect(placeChat(at(100, 400), size, view)).toEqual({ left: 100 + 40 + CHAT_GAP, top: 410 - 150, side: 'right', maxHeight: CHAT_MAX_H });
});

it('shifts along the side to stay inside the viewport', () => {
  expect(placeChat(at(100, 10), size, view).top).toBe(CHAT_EDGE);
  expect(placeChat(at(100, 790), size, view).top).toBe(800 - CHAT_EDGE - 300);
});

it('goes to the left when the right has no room, then below, then above', () => {
  const left = placeChat(at(1000, 400), size, view);
  expect(left).toMatchObject({ side: 'left', left: 1000 - CHAT_W - CHAT_GAP });
  // A wide element near the top: neither side has room.
  const below = placeChat(at(20, 20, 1160, 60), size, view);
  expect(below).toMatchObject({ side: 'below', top: 20 + 60 + CHAT_GAP, left: 20 + 580 - CHAT_W / 2 });
  const above = placeChat(at(20, 700, 1160, 60), size, view);
  expect(above).toMatchObject({ side: 'above', top: 700 - 300 - CHAT_GAP });
});

it('keeps the window inside the viewport, whatever side it lands on', () => {
  for (const [x, y, width, height] of [[0, 0, 40, 20], [1160, 780, 40, 20], [0, 0, 1200, 800], [600, 0, 1200, 30], [-300, -300, 500, 500], [1100, 700, 400, 400]]) {
    const placed = placeChat(at(x, y, width, height), size, view, at(x + width / 2 - 14, y + height / 2 - 14, 28, 28));
    expect(placed.left).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.left + CHAT_W).toBeLessThanOrEqual(1200 - CHAT_EDGE);
    expect(placed.top).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.top + 300).toBeLessThanOrEqual(800 - CHAT_EDGE);
  }
});

it('keeps the window on screen for an element scrolled out of view', () => {
  // A full-width element below the fold: the window sits above the bottom edge, not below the screen.
  expect(placeChat(at(0, 1200, 1024, 100), size, { ...view, right: 1024, bottom: 768 })).toMatchObject({ side: 'above', top: 768 - 300 - CHAT_GAP });
  // An element off to the right: the window goes to the left of the right edge.
  expect(placeChat(at(3000, 200, 100, 40), size, view)).toMatchObject({ side: 'left', left: 1200 - CHAT_W - CHAT_GAP });
  for (const [x, y, width, height] of [[0, 1200, 1200, 100], [3000, 200, 100, 40], [-2000, 200, 100, 40], [0, -900, 1200, 100], [3000, 3000, 50, 50], [-500, 1500, 200, 200]]) {
    const placed = placeChat(at(x, y, width, height), size, view);
    expect(placed.left).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.left + CHAT_W).toBeLessThanOrEqual(1200 - CHAT_EDGE);
    expect(placed.top).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.top + 300).toBeLessThanOrEqual(800 - CHAT_EDGE);
  }
});

it('passes over an element that fills the screen for the marker dot, and falls back to its middle without one', () => {
  const full = at(0, 0, 1200, 800), dot = at(586, 386, 28, 28);
  expect(placeChat(full, size, view, dot)).toMatchObject({ side: 'right', left: 586 + 28 + CHAT_GAP });
  expect(placeChat(full, size, view)).toMatchObject({ side: 'over', left: 600 - CHAT_W / 2, top: 400 - 150 });
});

it('keeps the window on screen when the marker spot is off screen', () => {
  const small = { ...view, right: 1024, bottom: 768 };
  // A viewport-covering element whose centre has scrolled off to the left, and one whose centre is far right and above.
  for (const [anchor, spot] of [[at(-9000, -100, 10000, 2000), at(-4014, 886, 28, 28)], [at(-100, -9000, 2000, 10000), at(886, -4014, 28, 28)], [at(-9000, -9000, 20000, 20000), at(986, 986, 28, 28)]] as const) {
    const placed = placeChat(anchor, size, small, spot);
    expect(placed.left).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.left + CHAT_W).toBeLessThanOrEqual(1024 - CHAT_EDGE);
    expect(placed.top).toBeGreaterThanOrEqual(CHAT_EDGE);
    expect(placed.top + 300).toBeLessThanOrEqual(768 - CHAT_EDGE);
  }
});

it('anchors a tall element by the part of it on screen', () => {
  // The element runs from far above the viewport to y = 600: the visible part is 0..600.
  expect(placeChat(at(100, -2000, 40, 2600), size, view)).toMatchObject({ side: 'right', top: 300 - 150 });
});

it('keeps out of the sidebar', () => {
  const sidebar = { ...view, right: 1200 - 360 };
  expect(placeChat(at(700, 400), size, sidebar)).toMatchObject({ side: 'left', left: 700 - CHAT_W - CHAT_GAP });
  const onLeft = { ...view, left: 360 };
  expect(placeChat(at(380, 400), size, onLeft)).toMatchObject({ side: 'right', left: 380 + 40 + CHAT_GAP });
  expect(placeChat(at(380, 400, 800, 20), size, onLeft).left).toBeGreaterThanOrEqual(360 + CHAT_EDGE);
});

it('bounds the height by the viewport and uses the content height when it is smaller', () => {
  expect(placeChat(at(100, 100), { width: CHAT_W, height: 900 }, view).maxHeight).toBe(CHAT_MAX_H);
  expect(placeChat(at(100, 100), size, { ...view, bottom: 400 }).maxHeight).toBe(400 - 2 * CHAT_EDGE);
  // A window shorter than its limit sits by its own height.
  expect(placeChat(at(100, 790), { width: CHAT_W, height: 100 }, view).top).toBe(800 - CHAT_EDGE - 100);
});
