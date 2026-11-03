import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const find = (node, id) => (node.id === id ? node : (node.children ?? []).map((c) => find(c, id)).find(Boolean));

test("layout tuix: tab bar is tuix-tabs and the panel stack has the tuix block", () => {
  const layout = JSON.parse(read("layouts/tuix.json"));
  assert.equal(find(layout, "tabs").content.mod, "tuix-tabs");
  const body = find(layout, "panel-body");
  assert.deepEqual(body.children.map((c) => c.id), ["files", "changes", "tuix"]);
  assert.deepEqual(find(layout, "tuix"), { id: "tuix", type: "block", content: { mod: "tuix" } });
});

test("tuix-tabs: Tuix button, own svg paths", () => {
  const source = read("mods/tuix-tabs/main.js");
  assert.match(source, /"tuix"\]/);
  assert.match(source, /panelButton\("tuix", count \? `Tuix \$\{count\}` : "Tuix", "mods\/tuix\/tuix\.svg"\)/);
  assert.doesNotMatch(source, /mods\/tabs\//);
});

test("tokens and the device code are never stored by the panel", () => {
  const allowedWrites = new Set(["auth", "projects", "fixPick", "runs", "clients"]), allowedShared = new Set(["tuix.count"]);
  for (const file of ["main.js", "signin.js", "list.js", "thread.js", "shots.js", "launch.js", "lib/launch.js", "lib/session.js", "lib/oauth.js"]) {
    const source = read(`mods/tuix/${file}`);
    for (const m of source.matchAll(/\bwrite\(\s*"([^"]*)"/g)) assert.ok(allowedWrites.has(m[1]), `${file} writes ${m[1]}`);
    for (const m of source.matchAll(/\bsetShared\(\s*"([^"]*)"/g)) assert.ok(allowedShared.has(m[1]), `${file} shares ${m[1]}`);
    for (const m of source.matchAll(/\b(write|setShared|setItem|exec|writeTextFile|console\.log)\(([^;\n]*)/g)) {
      assert.doesNotMatch(m[2], /token|device_code|secret/i, `${file}: ${m[0]}`);
    }
    // Every write/setShared/setItem key is a string literal (no computed key can smuggle the token in).
    for (const m of source.matchAll(/\b(write|setShared)\(\s*([^"\s][^,)]*)/g)) assert.fail(`${file}: non-literal key ${m[0]}`);
  }
});

test("only Ready for review sets in_review, and only after the Yes", () => {
  const main = read("mods/tuix/main.js");
  for (const file of ["list.js", "thread.js", "shots.js", "signin.js"]) assert.doesNotMatch(read(`mods/tuix/${file}`), /set_issue_status|in_review/, file);
  assert.equal(main.match(/set_issue_status/g).length, 1);
  assert.match(main, /readyForReview\(id, cx\) \{\s*const client = this\.client;\s*if \(!client \|\| this\.confirming !== id\) return;/);
});

test("report content is plain text: no markdown views, no exec of report content, curl gets only an argument array", () => {
  for (const file of ["main.js", "list.js", "thread.js", "shots.js"]) assert.doesNotMatch(read(`mods/tuix/${file}`), /TextView|markdown|innerHTML/i, file);
  assert.match(read("mods/tuix/shots.js"), /exec\("curl", \["-sSf", "--max-time", "20", "-o", part, shot\.url\]\)/);
});

test("sign out forgets the in-memory session and never touches the runs or storage", () => {
  const source = read("mods/tuix/main.js");
  const body = source.slice(source.indexOf("signOut(cx) {"), source.indexOf("// Sign in with Tuix:"));
  assert.ok(body.length > 0, "signOut exists before signInWithTuix");
  for (const cleared of ["this.dropSession()", "this.client = null", "this.device = null", 'this.state = "signin"']) {
    assert.ok(body.includes(cleared), cleared);
  }
  assert.doesNotMatch(body, /exec\(|this\.runs\s*=|write\(/);
  const drop = source.slice(source.indexOf("dropSession() {"), source.indexOf("// Back to sign-in"));
  assert.ok(drop.includes("this.session = null") && drop.includes("session.forget().then("), "dropSession forgets the tokens");
  assert.match(source, /"tuix-signout", "Sign out"/);
  assert.match(source, /this\.state === "project" \|\| this\.state === "list"\), \(e\) => e\.child\(this\.button\("tuix-signout"/);
});

test("sign-in is the device flow: no Keychain, no pasted token, the browser opens once, polling uses cx.timer", () => {
  assert.throws(() => read("mods/tuix/secret.js"), /ENOENT/);
  for (const file of ["main.js", "signin.js", "lib/session.js"]) {
    assert.doesNotMatch(read(`mods/tuix/${file}`), /keychain|security add|find-generic|tokenInput|readToken|setTimeout|setInterval/i, file);
  }
  const main = read("mods/tuix/main.js"), signin = read("mods/tuix/signin.js");
  assert.equal(main.match(/\.open_url\(/g).length, 2, "once after the code, once for Open browser");
  assert.match(main, /if \(device\.openUrl\) cx\.open_url\(device\.openUrl\)/);
  const start = main.slice(main.indexOf("signInWithTuix(cx) {"), main.indexOf("async startFlow"));
  assert.equal(start.match(/open_url\(/g).length, 1);
  assert.match(main, /cx\.timer\.after\(device\.interval \* 1000, \(cx\) => this\.poll\(device, cx\)\)/);
  assert.match(main, /cx\.timer\.after\(step\.seconds \* 1000/);
  const init = main.slice(main.indexOf("init(_props, cx) {"), main.indexOf("mono() {"));
  assert.doesNotMatch(init, /open_url|discover|connectWith/, "a saved address never signs in by itself");
  for (const copy of ["Sign in with Tuix", "Opening your browser… Approve the code there.", "Open browser", "Cancel"]) assert.ok(signin.includes(copy), copy);
  assert.ok(main.includes("Your Tuix session ended. Sign in again."));
});
