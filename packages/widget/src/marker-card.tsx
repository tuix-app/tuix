import { statusLabel } from './i18n';
import { stateOf } from './states';
import type { Issue } from './types';

/** The hover card's id: a dot it describes points `aria-describedby` here. */
export const cardId = 'tuix-marker-card';
/** Pointer hover waits this long before a card shows, and before it hides, so passing over markers stays calm. */
export const CARD_SHOW_MS = 150, CARD_HIDE_MS = 120;

interface Box { x: number; y: number; width: number; height: number }
export interface CardPlacement { left: number; width: number; maxHeight: number; top?: number; bottom?: number }

/**
 * Where the card sits for a marker's box (viewport coordinates): below it, or above it when the space below is
 * short and the space above is larger, centred on it and kept 8px inside the viewport. An element that fills
 * the screen gets the card just inside its top edge. It never runs past the viewport: a short one cuts it
 * (`maxHeight`). Without anchor positioning the card is placed by hand, like the markers.
 */
export function cardPlacement(box: Box, viewport: { width: number; height: number }): CardPlacement {
  const gap = 8, margin = 8, room = 160, least = 60;
  const width = Math.max(0, Math.min(320, viewport.width - 2 * margin));
  const left = Math.max(margin, Math.min(box.x + box.width / 2 - width / 2, viewport.width - margin - width));
  const below = viewport.height - (box.y + box.height), above = box.y;
  const fit = (height: number) => Math.max(0, height - margin);
  if (below >= room || (below >= above && below >= least)) return { left, width, top: box.y + box.height + gap, maxHeight: fit(below - gap) };
  if (above >= least) return { left, width, bottom: viewport.height - box.y + gap, maxHeight: fit(above - gap) };
  const top = Math.max(margin, box.y + gap);
  return { left, width, top, maxHeight: fit(viewport.height - top) };
}

/**
 * A marker's hover card: number, state and the start of the description (`excerpt`; a server without it gives
 * the title), plus "Element moved" for a marker that lost its element. Text only, never HTML. It lets clicks
 * through to the page; the core finds the pointer on it by position (`element`), so it stays while the pointer
 * moves onto it (WCAG 1.4.13).
 */
export function MarkerCard({ issue, box, orphan, lang, moved, element }: {
  issue: Issue; box: Box; orphan: boolean; lang?: string; moved: string; element: (element: HTMLElement | null) => void;
}) {
  const place = cardPlacement(box, { width: innerWidth, height: innerHeight });
  return <div id={cardId} class="marker-card" role="tooltip" data-placement={place.bottom === undefined ? 'below' : 'above'}
    style={{ left: place.left, width: place.width, maxHeight: place.maxHeight, ...(place.bottom === undefined ? { top: place.top } : { bottom: place.bottom }) }}
    ref={element}>
    <p class="marker-card-meta">#{issue.number || '…'} · {statusLabel(stateOf(issue), lang)}</p>
    <p class="marker-card-body">{issue.excerpt || issue.title}</p>
    {orphan && <p class="marker-card-meta">{moved}</p>}
  </div>;
}
