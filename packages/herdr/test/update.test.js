import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHECK_EVERY, MODS, SWAP, TARBALL_URL, VERSION_URL, applyUpdate, checkDue, hashOf, latestHash, updateAvailable } from "../mods/tuix/lib/update.js";

const H1 = "a".repeat(64), H2 = "b".repeat(64);
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });

test("hashOf reads only a well-formed hash", () => {
  assert.equal(hashOf(JSON.stringify({ hash: H1 })), H1);
  assert.equal(hashOf('{"hash":"nope"}'), null);
  assert.equal(hashOf("not json"), null);
  assert.equal(hashOf(null), null);
});

test("a copy without a version never checks; others check once a day", () => {
  assert.equal(checkDue({ installed: null, checkedAt: 0, now: 1e13 }), false);
  assert.equal(checkDue({ installed: H1, checkedAt: 0, now: 1e13 }), true);
  assert.equal(checkDue({ installed: H1, checkedAt: 1e13 - CHECK_EVERY + 1, now: 1e13 }), false);
  assert.equal(checkDue({ installed: H1, checkedAt: 1e13 - CHECK_EVERY, now: 1e13 }), true);
});

test("an update is offered only for a different known hash", () => {
  assert.equal(updateAvailable({ installed: H1, latest: H2 }), true);
  assert.equal(updateAvailable({ installed: H1, latest: H1 }), false);
  assert.equal(updateAvailable({ installed: H1, latest: null }), false);
  assert.equal(updateAvailable({ installed: null, latest: H2 }), false);
});

test("latestHash reads the public version.json, null when offline", async () => {
  let asked = null;
  assert.equal(await latestHash(async (c, a) => { asked = a.at(-1); return ok(JSON.stringify({ hash: H2 })); }), H2);
  assert.equal(asked, VERSION_URL);
  assert.equal(await latestHash(async () => ({ code: 6, stdout: "", stderr: "offline" })), null);
  assert.equal(await latestHash(async () => { throw new Error("no curl"); }), null);
});

// A fake exec: records calls; `fail` names the first word pair that fails.
function fake({ fail = null, version = JSON.stringify({ hash: H2 }) } = {}) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    const key = `${cmd} ${args[0] ?? ""}`;
    if (fail && key.startsWith(fail)) return { code: 1, stdout: "", stderr: "x" };
    if (cmd === "cat") return ok(version);
    return ok();
  };
  return { exec, calls };
}

test("applyUpdate downloads, unpacks, checks both mods, then swaps in one process", async () => {
  const f = fake();
  assert.equal(await applyUpdate({ exec: f.exec, appHome: "/h" }), H2);
  const cmds = f.calls.map((c) => c[0]);
  assert.deepEqual(cmds, ["rm", "mkdir", "curl", "tar", "cat", "herdr-app", "herdr-app", "mv", "sh"]);
  assert.ok(f.calls[2].includes(TARBALL_URL));
  assert.deepEqual(f.calls.filter((c) => c[0] === "herdr-app").map((c) => c[2]), MODS.map((m) => `/h/.tuix-update/new/${m}`));
  const sh = f.calls.at(-1);
  assert.deepEqual(sh.slice(3), ["swap", "/h/mods", "/h/.tuix-update/new", "/h/.tuix-update/old", "tuix-tabs", "tuix"]);
});

test("applyUpdate changes nothing installed when a step before the swap fails", async () => {
  for (const [fail, reason] of [["curl", /download/], ["tar", /unpack/], ["herdr-app check", /check/]]) {
    const f = fake({ fail });
    await assert.rejects(applyUpdate({ exec: f.exec, appHome: "/h" }), reason);
    assert.ok(!f.calls.some((c) => c[0] === "sh" || (c[0] === "mv" && c[1].startsWith("/h/mods"))), fail);
  }
  const f = fake({ version: "{}" });
  await assert.rejects(applyUpdate({ exec: f.exec, appHome: "/h" }), /no version/);
});

// The real swap script, on real folders.
function tree() {
  const d = mkdtempSync(join(tmpdir(), "tuix-swap-"));
  for (const where of ["mods", "new", "old"]) mkdirSync(join(d, where));
  for (const m of MODS) {
    mkdirSync(join(d, "mods", m)); writeFileSync(join(d, "mods", m, "main.js"), `old ${m}`);
    mkdirSync(join(d, "new", m)); writeFileSync(join(d, "new", m, "main.js"), `new ${m}`);
  }
  return d;
}
const swap = (d) => { try { execFileSync("sh", ["-c", SWAP, "swap", join(d, "mods"), join(d, "new"), join(d, "old"), ...MODS], { stdio: "ignore" }); return 0; } catch (e) { return e.status; } };
const content = (d, m) => readFileSync(join(d, "mods", m, "main.js"), "utf8");

test("the swap script installs every mod", () => {
  const d = tree();
  try {
    assert.equal(swap(d), 0);
    for (const m of MODS) assert.equal(content(d, m), `new ${m}`);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test("the swap script puts every mod back when one fails", () => {
  const d = tree();
  try {
    rmSync(join(d, "new", "tuix"), { recursive: true }); // the second mod can't be moved in
    assert.equal(swap(d), 1);
    for (const m of MODS) assert.equal(content(d, m), `old ${m}`);
    assert.ok(existsSync(join(d, "new", "tuix-tabs", "main.js")), "the first mod's new copy is back in new/");
  } finally { rmSync(d, { recursive: true, force: true }); }
});
