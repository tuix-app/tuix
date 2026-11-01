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

test("the token is never stored by the panel", () => {
  const allowedWrites = new Set(["auth", "projects", "runs"]), allowedShared = new Set(["tuix.count"]);
  for (const file of ["main.js", "signin.js", "secret.js", "list.js", "thread.js", "shots.js", "launch.js", "lib/launch.js"]) {
    const source = read(`mods/tuix/${file}`);
    for (const m of source.matchAll(/\bwrite\(\s*"([^"]*)"/g)) assert.ok(allowedWrites.has(m[1]), `${file} writes ${m[1]}`);
    for (const m of source.matchAll(/\bsetShared\(\s*"([^"]*)"/g)) assert.ok(allowedShared.has(m[1]), `${file} shares ${m[1]}`);
    for (const m of source.matchAll(/\b(write|setShared|setItem|exec|writeTextFile|console\.log)\(([^;\n]*)/g)) {
      assert.doesNotMatch(m[2], /token/i, `${file}: ${m[0]}`);
    }
    // Every write/setShared/setItem key is a string literal (no computed key can smuggle the token in).
    for (const m of source.matchAll(/\b(write|setShared)\(\s*([^"\s][^,)]*)/g)) assert.fail(`${file}: non-literal key ${m[0]}`);
  }
});

test("only Ready for review sets in_review, and only after the Yes", () => {
  const main = read("mods/tuix/main.js");
  for (const file of ["list.js", "thread.js", "shots.js", "signin.js", "secret.js"]) assert.doesNotMatch(read(`mods/tuix/${file}`), /set_issue_status|in_review/, file);
  assert.equal(main.match(/set_issue_status/g).length, 1);
  assert.match(main, /readyForReview\(id, cx\) \{\s*const client = this\.client;\s*if \(!client \|\| this\.confirming !== id\) return;/);
});

test("report content is plain text: no markdown views, no exec of report content, curl gets only an argument array", () => {
  for (const file of ["main.js", "list.js", "thread.js", "shots.js"]) assert.doesNotMatch(read(`mods/tuix/${file}`), /TextView|markdown|innerHTML/i, file);
  assert.match(read("mods/tuix/shots.js"), /exec\("curl", \["-sSf", "--max-time", "20", "-o", part, shot\.url\]\)/);
});

test("sign out drops the in-memory secret and never touches the Keychain or the runs", () => {
  const source = read("mods/tuix/main.js");
  const body = source.slice(source.indexOf("signOut(cx) {"), source.indexOf("connect(cx) {"));
  assert.ok(body.length > 0, "signOut exists before connect");
  for (const cleared of ["this.token = null", "this.client = null", "this.credential = null", 'this.state = "signin"']) {
    assert.ok(body.includes(cleared), cleared);
  }
  assert.doesNotMatch(body, /security|exec\(|delete-generic-password|this\.runs\s*=|write\(/);
  assert.match(source, /"tuix-signout", "Sign out"/);
  assert.match(source, /this\.state === "project" \|\| this\.state === "list"\), \(e\) => e\.child\(this\.button\("tuix-signout"/);
});

test("macOS sign-in: copy and run the command first, copy the token only at the prompt", () => {
  const source = read("mods/tuix/signin.js");
  const command = source.indexOf("1. Copy this command and run it in a terminal.");
  const token = source.indexOf("2. When it asks for a password, copy your token");
  const connect = source.indexOf("3. Click Connect.");
  assert.ok(command > 0 && command < token && token < connect, "steps in order");
  assert.match(source, /Copy the token only now: copying the command again would replace it\./);
  assert.match(source, /never Always Allow/);
});
