// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { followShopifyBar, shopifyBarHeight } from '../src/storefront-lift';

function bar(id: string, top: number, height: number) {
  const el = document.createElement('div');
  el.id = id;
  el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 1024, width: 1024, x: 0, y: top, toJSON() {} });
  document.body.append(el);
  return el;
}
beforeEach(() => { vi.useFakeTimers(); Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true }); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); document.documentElement.removeAttribute('style'); });

it('measures a Shopify bar on the bottom edge and ignores everything else', () => {
  expect(shopifyBarHeight()).toBe(0);
  bar('shop-footer', 740, 60);
  bar('PBarNextFrameWrapper', 0, 60);
  bar('admin-bar-iframe', 100, 700);
  expect(shopifyBarHeight()).toBe(0);
  bar('PBarNextFrameWrapper2', 742, 58);
  expect(shopifyBarHeight()).toBe(58);
});

it('lifts the widget while the bar is there and lets go when it leaves', async () => {
  const stop = followShopifyBar();
  expect(document.documentElement.style.getPropertyValue('--tuix-lift')).toBe('');
  const el = bar('preview-bar-iframe', 750, 50);
  await vi.advanceTimersByTimeAsync(600);
  expect(document.documentElement.style.getPropertyValue('--tuix-lift')).toBe('50px');
  el.remove();
  await vi.advanceTimersByTimeAsync(1500);
  expect(document.documentElement.style.getPropertyValue('--tuix-lift')).toBe('');
  bar('admin-bar-iframe', 760, 40);
  await vi.advanceTimersByTimeAsync(4000);
  expect(document.documentElement.style.getPropertyValue('--tuix-lift')).toBe('40px');
  stop();
  expect(document.documentElement.style.getPropertyValue('--tuix-lift')).toBe('');
});
