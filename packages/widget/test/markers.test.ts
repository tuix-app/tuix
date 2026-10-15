// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defaultMarkers, markerToken, readMarkers, saveMarkers, markersPinned } from '../src/markers';

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

it('round-trips every marker style through the stored token', () => {
  for (const style of ['dot', 'border', 'fill'] as const) for (const pinned of [true, false]) {
    saveMarkers('p', { pinned, style });
    expect(localStorage.getItem('tuix:markers:p')).toBe(`${pinned ? 'on' : 'off'}:${style}`);
    expect(readMarkers('p')).toEqual({ pinned, style });
    expect(markerToken({ pinned, style })).toBe(`${pinned ? 'on' : 'off'}:${style}`);
  }
  expect(markersPinned('p')).toBe(false);
});

it('reads an unknown or missing style as dot', () => {
  localStorage.setItem('tuix:markers:p', 'on:sparkles');
  expect(readMarkers('p')).toEqual({ pinned: true, style: 'dot' });
  localStorage.setItem('tuix:markers:p', 'off:');
  expect(readMarkers('p')).toEqual({ pinned: false, style: 'dot' });
  localStorage.removeItem('tuix:markers:p');
  expect(readMarkers('p')).toEqual(defaultMarkers);
});

it('keeps border and fill overlays click-through in the stylesheet', () => {
  const css = readFileSync(resolve(__dirname, '../src/widget.css'), 'utf8');
  expect(css).toMatch(/\.tuix-app \.marker\{[^}]*pointer-events:none/);
  // The fill layer sits inside the marker, which is already click-through, and carries the state color at half opacity.
  expect(css).toMatch(/\.marker\.fill:before\{[^}]*opacity:\.5/);
  expect(css).toMatch(/\.marker\.fill\[data-state=warm\]:before\{background:var\(--tx-gold\)/);
  expect(css).toMatch(/\.marker\.fill\[data-state=verify\]:before\{background:var\(--tx-aqua\)/);
});
