// Loads the app-side files (main.js, launch.js and the views) in Node with stand-ins for Herdr's
// host modules. It catches what lib tests can't: a syntax error, an import of a name the host
// doesn't export, a broken module graph. The stand-in `herdr` exports only names in Herdr's API
// (herdr.d.ts), so importing anything else fails here as it would in the app.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Herdr's `herdr` module, as documented in herdr.d.ts. Each call goes to globalThis.__herdr, so a
// test can answer it; unanswered calls return undefined.
const HERDR = [
  "spaces", "panes", "focused", "terminals", "agents", "exec", "hc", "home", "appHome", "readTextFile",
  "writeTextFile", "knownAgents", "pickFolder", "machines", "theme", "settings", "setShared", "shared",
  "props", "openOverlay", "closeOverlay", "run", "window", "layout", "setAgentOrder", "playSound",
];
const herdrSource = HERDR.map((n) => `export const ${n} = (...a) => globalThis.__herdr?.${n}?.(...a);`).join("\n");
const kitSource = `export class View {}
const el = () => new Proxy(function () {}, { get: () => el(), apply: () => el() });
export const div = el, svg = el, image = el;`;
const baseSource = `const el = () => new Proxy(function () {}, { get: () => el(), apply: () => el() });
export const v_flex = el, h_flex = el, Input = el, Textarea = el;
export class InputState {} export class TextareaState {}`;

const url = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const hooks = `
const stubs = ${JSON.stringify({ herdr: url(herdrSource), "gpui-kit": url(kitSource), "gpui-base": url(baseSource) })};
export async function resolve(spec, ctx, next) {
  return stubs[spec] ? { url: stubs[spec], shortCircuit: true } : next(spec, ctx);
}`;
register(url(hooks));

const { default: Tuix } = await import("../mods/tuix/main.js");

test("the app-side files load against Herdr's API", async () => {
  assert.equal(typeof Tuix, "function");
  for (const f of ["launch.js", "list.js", "thread.js", "signin.js", "shots.js", "rules.js"]) await import(`../mods/tuix/${f}`);
});

// A view with just what fixBlock reads.
const view = (over) => Object.assign(Object.create(Tuix.prototype), { canWrite: true, all: false, project: { archived: false }, repo: { main: "/r" }, hasOrigin: true, machine: null, noClaude: false }, over);

test("Fix on another machine: allowed when connected, disabled with the reason when not", () => {
  globalThis.__herdr = { machines: () => [{ name: null, layout: "ready" }, { name: "vps", layout: "ready" }, { name: "box", layout: "unavailable" }] };
  assert.equal(view({ machine: "vps" }).fixBlock(), null);
  assert.equal(view({ machine: "box" }).fixBlock(), "box isn't connected.");
  assert.equal(view({ machine: "gone" }).fixBlock(), "gone isn't connected.");
  assert.equal(view({ machine: "vps", noClaude: true }).fixBlock(), "Fix needs Claude Code on vps.");
  assert.equal(view({ noClaude: true }).fixBlock(), "Fix needs Claude Code on this computer.");
  assert.equal(view({}).fixBlock(), null);
});

test("a Herdr without machines() still allows Fix on another machine", () => {
  globalThis.__herdr = {};
  assert.equal(view({ machine: "vps" }).fixBlock(), null);
});

test("the After a fix setting is all off without a repository, and for one never set", () => {
  globalThis.__herdr = {};
  const off = { merge: false, review: false, deploy: "" };
  assert.deepEqual(view({ repo: null }).rules(), off);
  assert.deepEqual(view({ repo: { main: "/never-set" } }).rules(), off);
  // closeRules is safe when closed, and when open without a repository.
  view({ repo: null }).closeRules();
  view({ repo: null, rulesOpen: true, deployInput: { value: () => "x" } }).closeRules();
  view({ repo: null }).setRules({ merge: true }, { notify() {} });
});

test("the After a fix setting is kept per repository, and closing saves the text for the repository it was typed in", () => {
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => { store.set(k, String(v)); } };
  try {
    let notified = 0; const cx = { notify() { notified++; } };
    const a = view({ repo: { main: "/a" }, rulesOpen: false, deployInput: { value: () => "  the Deploy run\nis green " } });
    a.setRules({ merge: true, review: true }, cx);
    view({ repo: { main: "/b" } }).setRules({ merge: true }, cx);
    assert.equal(notified, 2);
    assert.deepEqual(a.rules(), { merge: true, review: true, deploy: "" });
    assert.deepEqual(view({ repo: { main: "/b" } }).rules(), { merge: true, review: false, deploy: "" });
    assert.deepEqual(view({ repo: { main: "/c" } }).rules(), { merge: false, review: false, deploy: "" });
    a.rulesOpen = true; a.closeRules();
    assert.equal(a.rulesOpen, false);
    assert.deepEqual(a.rules(), { merge: true, review: true, deploy: "the Deploy run is green" });
    assert.deepEqual(JSON.parse(store.get("rules"))["/b"], { merge: true, review: false, deploy: "" });
  } finally { delete globalThis.localStorage; }
});
