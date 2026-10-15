/** Where the anchored chat window sits (people-and-statuses §7 item 16). Pure, so the placement rules are tested without a page. */
export interface Rect { x: number; y: number; width: number; height: number }
/** The part of the viewport the window may use: the sidebar, when it is open, is left out. */
export interface Bounds { left: number; top: number; right: number; bottom: number }
export type Side = 'right' | 'left' | 'below' | 'above' | 'over';
export interface Placement { left: number; top: number; side: Side; maxHeight: number }

/** Window width and tallest height (`.chat-window` in widget.css), the gap to the element and the margin kept to the viewport edge. */
export const CHAT_W = 320, CHAT_MAX_H = 480, CHAT_GAP = 12, CHAT_EDGE = 8;
/** Below this width, or on a touch-first device, a report opens in the side panel instead. */
export const CHAT_MIN_WIDTH = 640;

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(value, high));

/**
 * Beside the element if there is room, in this order: right, left, below, above; shifted along that side to stay inside `bounds`.
 * An element that leaves no free side (one that fills the screen) is passed over for `spot`, the marker's own small box, which always has one;
 * without it the window sits over the middle of the element.
 */
export function placeChat(anchor: Rect, size: { width: number; height: number }, bounds: Bounds, spot?: Rect): Placement {
  const maxHeight = Math.max(0, Math.min(CHAT_MAX_H, bounds.bottom - bounds.top - 2 * CHAT_EDGE));
  const { width } = size, height = Math.min(size.height, maxHeight);
  const minX = bounds.left + CHAT_EDGE, minY = bounds.top + CHAT_EDGE;
  const maxX = Math.max(minX, bounds.right - CHAT_EDGE - width), maxY = Math.max(minY, bounds.bottom - CHAT_EDGE - height);
  // A tall or wide element is anchored by the part of it on screen; one scrolled out of view on any side by the screen edge it left through.
  const x = clamp(anchor.x, bounds.left, bounds.right), y = clamp(anchor.y, bounds.top, bounds.bottom);
  const shown = { x, y, width: Math.max(0, Math.min(anchor.x + anchor.width, bounds.right) - x), height: Math.max(0, Math.min(anchor.y + anchor.height, bounds.bottom) - y) };
  const around = (box: Rect): Omit<Placement, 'maxHeight'> | null => {
    const top = clamp(box.y + box.height / 2 - height / 2, minY, maxY), left = clamp(box.x + box.width / 2 - width / 2, minX, maxX);
    const after = box.x + box.width + CHAT_GAP, before = box.x - width - CHAT_GAP, under = box.y + box.height + CHAT_GAP, over = box.y - height - CHAT_GAP;
    if (after <= maxX) return { left: after, top, side: 'right' };
    if (before >= minX && before <= maxX) return { left: before, top, side: 'left' };
    if (under <= maxY) return { left, top: under, side: 'below' };
    if (over >= minY && over <= maxY) return { left, top: over, side: 'above' };
    return null;
  };
  // The spot is kept in view too: its centre comes from the unclamped anchor, which can be far off screen.
  const kept = spot && { ...spot, x: clamp(spot.x, bounds.left, Math.max(bounds.left, bounds.right - spot.width)), y: clamp(spot.y, bounds.top, Math.max(bounds.top, bounds.bottom - spot.height)) };
  const found = around(shown) ?? (kept && around(kept)) ?? { left: clamp(shown.x + shown.width / 2 - width / 2, minX, maxX), top: clamp(shown.y + shown.height / 2 - height / 2, minY, maxY), side: 'over' as const };
  return { ...found, maxHeight };
}
