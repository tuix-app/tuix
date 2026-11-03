import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CONFIRM, rowsOf } from "../mods/tuix/lib/rows.js";

const i = (n) => ({ id: `i${n}`, number: n });
const groups = { open: [i(1)], fixing: [i(2)], prOpen: [i(3)], inReview: [i(4)] };
const issues = (rows) => rows.filter((r) => r.kind === "issue");

test("sections in order with their issues; empty groups other than Open are left out", () => {
  const rows = rowsOf({ open: [], fixing: [], prOpen: [i(3)], inReview: [] });
  assert.deepEqual(rows.map((r) => r.kind === "issue" ? r.issue.number : r.kind === "header" ? r.id : r.kind), ["open", "empty", "prOpen", 3]);
  assert.deepEqual(rowsOf(groups).filter((r) => r.kind === "header").map((r) => r.id), ["open", "fixing", "prOpen", "inReview"]);
});

test("checkbox only on open, writable, non-archived rows", () => {
  const boxes = (opts) => issues(rowsOf(groups, opts)).map((r) => r.checkbox);
  assert.deepEqual(boxes({ canWrite: true }), [true, false, false, false]);
  assert.deepEqual(boxes({ canWrite: false }), [false, false, false, false]);
  assert.deepEqual(boxes({ canWrite: true, archived: true }), [false, false, false, false]);
});

test("Ready for review only on PR open rows the view offers it for", () => {
  assert.deepEqual(issues(rowsOf(groups)).map((r) => r.actions), [[], [], [], []]);
  assert.deepEqual(issues(rowsOf(groups, { ready: () => true })).map((r) => r.actions), [[], [], ["ready"], []]);
});

test("the confirmation is one row; Yes never takes the Ready control's slot", () => {
  const ready = (rows) => issues(rows).find((r) => r.issue.id === "i3");
  const before = ready(rowsOf(groups, { ready: () => true })), after = ready(rowsOf(groups, { ready: () => true, asking: "i3" }));
  assert.deepEqual(after.actions, ["cancel", "yes"]);
  assert.equal(after.actions.indexOf("yes"), 1);
  assert.notEqual(before.actions[0], "yes");
  assert.notEqual(after.actions[before.actions.indexOf("ready")], "yes");
  assert.equal(rowsOf(groups, { ready: () => true, asking: "i3" }).length, rowsOf(groups, { ready: () => true }).length);
});

test("asking about another issue changes nothing here", () => {
  assert.deepEqual(issues(rowsOf(groups, { ready: () => true, asking: "i9" })).map((r) => r.actions), [[], [], ["ready"], []]);
});

test("the thread header uses the same confirmation order, and puts the question on its own line", () => {
  assert.deepEqual(CONFIRM, ["cancel", "yes"]);
  const source = readFileSync(new URL("../mods/tuix/thread.js", import.meta.url), "utf8");
  assert.match(source, /CONFIRM\.map/);
  assert.match(source, /v_flex\(\)\.gap\(6\)\.child\(div\(\)\.text_size\(12\)\.child\(`Ask \$\{who\} to check\?`\)\)\.child\(h_flex\(\)/);
});

import { elapsed, runLine } from "../mods/tuix/lib/rows.js";

test("elapsed time reads in minutes and hours", () => {
  assert.equal(elapsed(30000), "under 1 min");
  assert.equal(elapsed(5 * 60000), "5 min");
  assert.equal(elapsed(65 * 60000), "1 h 5 min");
  assert.equal(elapsed(-5), "under 1 min");
});

test("runLine describes each state of a run", () => {
  const at = 10 * 60000, run = (o) => ({ state: "running", startedAt: 0, branch: "b", ...o });
  assert.equal(runLine(run({ state: "queued", startedAt: null }), at).text, "queued");
  const working = runLine(run({ terminal: "t1" }), at, { focusable: true });
  assert.deepEqual([working.icon, working.text, working.focus], ["spinner", "working · 10 min", true]);
  const blocked = runLine(run({ state: "blocked", terminal: "t1" }), at, { focusable: true });
  assert.deepEqual([blocked.icon, blocked.tone, blocked.text, blocked.focus], ["dot", "alert", "needs you · 10 min", true]);
  const stopped = runLine(run({ state: "stopped" }), at);
  assert.deepEqual([stopped.text, stopped.remove, stopped.focus], ["stopped, needs you", true, false]);
  // A stopped run is reachable while its terminal is set and still exists.
  assert.equal(runLine(run({ state: "stopped", terminal: "t1" }), at, { focusable: true }).focus, true);
  assert.equal(runLine(run({ state: "stopped", terminal: "t1" }), at, { focusable: false }).focus, false);
  assert.equal(runLine(run({ state: "stopped", terminal: null }), at, { focusable: true }).focus, false);
  assert.equal(runLine(run({ terminal: "t1" }), at).focus, false);
  assert.equal(runLine(run({ state: "stopped", error: "fatal: nope" }), at).text, "Couldn't start: fatal: nope");
  const pr = runLine(run({ state: "pr_open", prUrl: "https://github.com/example/app/pull/9", stackedOn: 5 }), at);
  assert.deepEqual([pr.link, pr.stacked, pr.remove], ["https://github.com/example/app/pull/9", 5, true]);
  assert.equal(runLine(run({ state: "pr_open", prUrl: "javascript:alert(1)" }), at).link, null);
  assert.equal(runLine(run({ state: "pr_open", prUrl: null }), at).branch, "b");
});

test("rowsOf: checkable limits the checkbox per issue (All projects)", () => {
  const groups = { open: [{ id: "a", projectId: "p1" }, { id: "b", projectId: "p2" }], fixing: [], prOpen: [], inReview: [] };
  const rows = rowsOf(groups, { canWrite: true, checkable: (i) => i.projectId === "p1" }).filter((r) => r.kind === "issue");
  assert.deepEqual(rows.map((r) => r.checkbox), [true, false]);
});
