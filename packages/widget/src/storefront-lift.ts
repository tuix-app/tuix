/**
 * Shopify shows staff a bar along the bottom of their storefront (the preview and
 * admin bars), which would cover the launcher. Everything the widget anchors to the
 * bottom edge adds `--tuix-lift`; this keeps it at the height of that bar, and at 0
 * when there is none (shoppers' pages, invited reviewers, a bar the visitor hid).
 */
const BARS = '[id^="PBar"],#preview-bar-iframe,#admin-bar-iframe';
const MAX = 160;

export function shopifyBarHeight(doc: Document = document): number {
  const view = doc.defaultView;
  if (!view) return 0;
  let height = 0;
  doc.querySelectorAll<HTMLElement>(BARS).forEach(bar => {
    const box = bar.getBoundingClientRect();
    // Only a bar that sits on the bottom edge of the window and looks like a bar.
    if (box.height > 0 && box.height <= MAX && box.bottom >= view.innerHeight - 2 && box.top > view.innerHeight / 2) {
      height = Math.max(height, Math.round(view.innerHeight - box.top));
    }
  });
  return Math.min(height, MAX);
}

/** Follows the bar as Shopify adds, resizes or removes it. Returns a function that stops. */
export function followShopifyBar(doc: Document = document): () => void {
  const root = doc.documentElement, view = doc.defaultView;
  let last = -1, timer: ReturnType<typeof setTimeout> | undefined;
  const apply = () => {
    timer = undefined;
    let height = 0;
    try { height = shopifyBarHeight(doc); } catch { /* A measuring failure leaves the widget where it was. */ return; }
    if (height === last) return;
    last = height;
    if (height > 0) root.style.setProperty('--tuix-lift', height + 'px');
    else root.style.removeProperty('--tuix-lift');
  };
  const schedule = () => { if (timer === undefined) timer = setTimeout(apply, 100); };
  apply();
  // The bar arrives after the page: Shopify appends it to the body, then its frame sizes itself.
  const observer = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(schedule);
  if (doc.body) observer?.observe(doc.body, { childList: true });
  view?.addEventListener('resize', schedule);
  view?.addEventListener('load', schedule);
  const settle = [500, 1500, 4000].map(delay => setTimeout(apply, delay));
  return () => {
    observer?.disconnect();
    view?.removeEventListener('resize', schedule);
    view?.removeEventListener('load', schedule);
    settle.forEach(clearTimeout);
    if (timer !== undefined) clearTimeout(timer);
    root.style.removeProperty('--tuix-lift');
  };
}
