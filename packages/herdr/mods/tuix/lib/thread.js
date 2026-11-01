// Thread helpers: context chips, screenshot geometry, comment looks, pass choices.
// Pure functions; no host imports. Everything they return is plain text for display.

const clip = (value, n) => {
  const s = String(value ?? "");
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function relTime(iso, now = Date.now()) {
  const at = Date.parse(iso ?? "");
  if (Number.isNaN(at)) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// The size an image of w x h takes inside maxW x maxH, never scaled up.
export function fitSize(w, h, maxW, maxH) {
  const known = num(w) > 0 && num(h) > 0, iw = known ? w : 16, ih = known ? h : 9;
  const k = Math.min(maxW / iw, maxH / ih, known ? 1 : Infinity);
  return { width: Math.max(1, Math.round(iw * k)), height: Math.max(1, Math.round(ih * k)) };
}

// Where the reported element sits in the screenshot, as fractions of its width and height.
// The box is in document pixels; the screenshot shows the viewport, so subtract the scroll.
export function outline(element) {
  const box = element?.box, vp = element?.viewport, sc = element?.scroll ?? {};
  if (!box || !vp || !(num(vp.width) > 0) || !(num(vp.height) > 0)) return null;
  const x = num(box.x), y = num(box.y), w = num(box.width), h = num(box.height);
  if (x === null || y === null || !(w > 0) || !(h > 0)) return null;
  const left = Math.max(0, (x - (num(sc.x) ?? 0)) / vp.width), top = Math.max(0, (y - (num(sc.y) ?? 0)) / vp.height);
  const right = Math.min(1, (x - (num(sc.x) ?? 0) + w) / vp.width), bottom = Math.min(1, (y - (num(sc.y) ?? 0) + h) / vp.height);
  if (right <= left || bottom <= top) return null;
  return { left, top, width: right - left, height: bottom - top };
}

// A comment with `via` that is not this panel's own label was posted by an agent.
export const isAgent = (comment, ownLabel) => Boolean(comment?.via) && comment.via !== ownLabel;

// http(s) links in a comment, at most `max`, without trailing punctuation. Shown as text, opened only on a click.
export function linksOf(body, max = 3) {
  const found = String(body ?? "").match(/https?:\/\/[^\s<>"')\]]+/g) ?? [];
  const out = [];
  for (const raw of found) {
    const url = raw.replace(/[.,;:!?]+$/, "");
    try {
      const u = new URL(url);
      if ((u.protocol === "https:" || u.protocol === "http:") && !out.some((l) => l.url === url)) out.push({ url, host: u.hostname });
    } catch { /* not a link */ }
    if (out.length >= max) break;
  }
  return out;
}

function browserLabel(browser) {
  const brands = (browser?.client_hints?.brands ?? []).filter((b) => b?.brand && !/not.?a.?brand/i.test(b.brand));
  const best = brands.find((b) => !/^chromium$/i.test(b.brand)) ?? brands[0];
  const platform = browser?.client_hints?.platform;
  let name = best ? `${best.brand.replace(/^Google /, "")}${best.version ? ` ${best.version}` : ""}` : null;
  if (!name) {
    const m = String(browser?.user_agent ?? "").match(/(Firefox|Edg|Chrome|Version)\/(\d+)/);
    name = m ? `${m[1] === "Edg" ? "Edge" : m[1] === "Version" ? "Safari" : m[1]} ${m[2]}` : null;
  }
  return [name, platform].filter(Boolean).join(" · ");
}

// Chips for a full-scope context: element, browser, console errors. Each has a key, a label and plain-text detail lines.
export function chipsOf(context) {
  if (!context) return [];
  const chips = [], el = context.element, br = context.browser;
  if (el && (el.accessible_name || el.tag)) {
    const label = el.accessible_name ? `${el.tag ? `${el.tag} ` : ""}“${clip(el.accessible_name, 40)}”` : el.tag;
    const box = el.box ? `box ${Math.round(el.box.x)},${Math.round(el.box.y)} ${Math.round(el.box.width)}×${Math.round(el.box.height)}` : null;
    const lines = [el.tag && `tag: ${el.tag}`, el.role && `role: ${el.role}`, el.accessible_name && `name: ${clip(el.accessible_name, 200)}`,
      el.text && `text: ${clip(el.text, 200)}`, el.selectors?.testid && `testid: ${clip(el.selectors.testid, 200)}`,
      el.selectors?.css && `css: ${clip(el.selectors.css, 300)}`, box].filter(Boolean);
    chips.push({ key: "element", label, lines });
  }
  const bl = browserLabel(br);
  if (br && bl) {
    const lines = [br.user_agent && `user agent: ${clip(br.user_agent, 300)}`,
      br.viewport && `viewport: ${br.viewport.width}×${br.viewport.height}`, br.device_pixel_ratio && `pixel ratio: ${br.device_pixel_ratio}`,
      br.language && `language: ${br.language}`, br.timezone && `timezone: ${br.timezone}`].filter(Boolean);
    chips.push({ key: "browser", label: bl, lines });
  }
  const errors = (context.console ?? []).filter((e) => e?.level === "error");
  if (errors.length) {
    chips.push({ key: "console", label: `${errors.length} console ${errors.length === 1 ? "error" : "errors"}`,
      lines: errors.slice(0, 10).map((e) => clip(e.msg, 300)) });
  }
  return chips;
}

// "Page · environment" under the title, from context.page.
export function pageLine(context) {
  const p = context?.page;
  return [p?.route, p?.environment].filter(Boolean).join(" · ");
}

// Who a reply can be passed to: the reporter first, then teammates (not the person themself).
export function passChoices(issue, people, me) {
  const reporter = issue?.author?.name ?? "the reporter";
  const choices = [{ label: `${reporter} (reporter)`, to: "reporter" }];
  for (const p of people ?? []) if (p.team && p.id !== me && !p.me) choices.push({ label: p.name, to: p.id });
  return choices;
}
