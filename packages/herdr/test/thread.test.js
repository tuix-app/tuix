import assert from "node:assert/strict";
import { test } from "node:test";
import { chipsOf, fitSize, isAgent, linksOf, outline, passChoices, relTime } from "../mods/tuix/lib/thread.js";

test("relTime", () => {
  const now = Date.parse("2026-10-31T12:00:00Z");
  assert.equal(relTime("2026-10-31T11:59:40Z", now), "just now");
  assert.equal(relTime("2026-10-31T11:40:00Z", now), "20m");
  assert.equal(relTime("2026-10-31T10:00:00Z", now), "2h");
  assert.equal(relTime("2026-10-28T12:00:00Z", now), "3d");
  assert.equal(relTime(null, now), "");
});

test("fitSize keeps the aspect and never scales up", () => {
  assert.deepEqual(fitSize(1280, 720, 320, 260), { width: 320, height: 180 });
  assert.deepEqual(fitSize(100, 100, 320, 260), { width: 100, height: 100 });
  assert.deepEqual(fitSize(null, null, 320, 260), { width: 320, height: 180 });
});

test("outline: fractions of the viewport, minus the scroll", () => {
  const element = { box: { x: 640, y: 1360, width: 128, height: 72 }, viewport: { width: 1280, height: 720 }, scroll: { x: 0, y: 1000 } };
  const o = outline(element);
  assert.deepEqual([o.left, o.top], [0.5, 0.5]);
  assert.ok(Math.abs(o.width - 0.1) < 1e-9 && Math.abs(o.height - 0.1) < 1e-9);
  assert.equal(outline({ ...element, box: { x: 0, y: 0, width: 10, height: 10 } }), null); // scrolled out of view
  assert.equal(outline({ ...element, box: null }), null);
  assert.equal(outline({ ...element, viewport: null }), null);
  const clipped = outline({ box: { x: 1200, y: 10, width: 400, height: 20 }, viewport: { width: 1280, height: 720 } });
  assert.ok(Math.abs(clipped.left + clipped.width - 1) < 1e-9);
});

test("isAgent: via set and not the panel's own label", () => {
  assert.equal(isAgent({ via: "Claude Code" }, "Tuix for Herdr"), true);
  assert.equal(isAgent({ via: "Tuix for Herdr" }, "Tuix for Herdr"), false);
  assert.equal(isAgent({ via: null }, "Tuix for Herdr"), false);
  assert.equal(isAgent({}, undefined), false);
});

test("linksOf: http(s) only, trimmed, deduplicated, capped", () => {
  const body = "PR https://github.com/acme/app/pull/221. Branch (https://github.com/acme/app/tree/x) javascript:alert(1) file:///etc/passwd https://github.com/acme/app/pull/221";
  assert.deepEqual(linksOf(body).map((l) => l.url), ["https://github.com/acme/app/pull/221", "https://github.com/acme/app/tree/x"]);
  assert.equal(linksOf(body)[0].host, "github.com");
  assert.equal(linksOf("a https://a.test b https://b.test c https://c.test d https://d.test").length, 3);
  assert.deepEqual(linksOf(null), []);
});

test("chipsOf: element, browser, console errors; nothing without a context", () => {
  assert.deepEqual(chipsOf(null), []);
  const chips = chipsOf({
    element: { tag: "button", accessible_name: "Save order", role: "button", box: { x: 1, y: 2, width: 3, height: 4 }, selectors: { css: "main > button" } },
    browser: { client_hints: { brands: [{ brand: "Chromium", version: "141" }, { brand: "Not A;Brand", version: "99" }, { brand: "Google Chrome", version: "141" }], platform: "macOS" }, language: "en-GB" },
    console: [{ level: "error", msg: "TypeError: x" }, { level: "log", msg: "hi" }, { level: "error", msg: "again" }],
  });
  assert.deepEqual(chips.map((c) => c.key), ["element", "browser", "console"]);
  assert.equal(chips[0].label, "button “Save order”");
  assert.ok(chips[0].lines.includes("css: main > button"));
  assert.equal(chips[1].label, "Chrome 141 · macOS");
  assert.equal(chips[2].label, "2 console errors");
  assert.deepEqual(chips[2].lines, ["TypeError: x", "again"]);
});

test("chipsOf: tag when there is no accessible name; browser from the user agent; no chip for zero errors", () => {
  const chips = chipsOf({ element: { tag: "div" }, browser: { user_agent: "Mozilla/5.0 Firefox/130.0" }, console: [{ level: "warn", msg: "w" }] });
  assert.deepEqual(chips.map((c) => [c.key, c.label]), [["element", "div"], ["browser", "Firefox 130"]]);
});

test("passChoices: the reporter first, then teammates but not me", () => {
  const people = [{ id: "member:1", name: "Maja", team: true, me: true }, { id: "member:2", name: "Jan", team: true }, { id: "end_user:9", name: "Anna", team: false }];
  assert.deepEqual(passChoices({ author: { name: "Anna" } }, people, "member:1"), [
    { label: "Anna (reporter)", to: "reporter" }, { label: "Jan", to: "member:2" }]);
  assert.equal(passChoices({}, [], null)[0].label, "the reporter (reporter)");
});
