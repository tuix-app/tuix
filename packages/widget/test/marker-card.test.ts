import { expect, it } from 'vitest';
import { cardPlacement } from '../src/marker-card';

const viewport = { width: 1000, height: 800 };

it('places the card below a marker, centred on it and inside the viewport', () => {
  expect(cardPlacement({ x: 486, y: 100, width: 28, height: 28 }, viewport)).toEqual({ left: 340, width: 320, top: 136, maxHeight: 656 });
  expect(cardPlacement({ x: 0, y: 100, width: 28, height: 28 }, viewport).left).toBe(8);
  expect(cardPlacement({ x: 980, y: 100, width: 28, height: 28 }, viewport).left).toBe(672);
});

it('places it above a marker near the bottom, and inside an element that fills the screen', () => {
  expect(cardPlacement({ x: 486, y: 700, width: 28, height: 28 }, viewport)).toEqual({ left: 340, width: 320, bottom: 108, maxHeight: 684 });
  expect(cardPlacement({ x: 0, y: -40, width: 1000, height: 860 }, viewport)).toEqual({ left: 340, width: 320, top: 8, maxHeight: 784 });
});

it('narrows to the viewport on a phone', () => {
  expect(cardPlacement({ x: 100, y: 100, width: 28, height: 28 }, { width: 320, height: 640 })).toEqual({ left: 8, width: 304, top: 136, maxHeight: 496 });
});

it('keeps the card inside a short viewport', () => {
  const place = cardPlacement({ x: 100, y: 120, width: 28, height: 28 }, { width: 800, height: 300 });
  expect(place.top! + place.maxHeight).toBeLessThanOrEqual(300 - 8);
});
