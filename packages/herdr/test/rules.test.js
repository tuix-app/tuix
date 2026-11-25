import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPLOY_MAX, EXTRA_MAX, UNTIL, agentName, autoOf, normalize, rulesFor, summary } from "../mods/tuix/lib/rules.js";

const DEFAULT = { agent: null, until: "pr", deploy: "", extra: "" };

test("normalize: the default is Claude Code until the pull request is open", () => {
  assert.deepEqual(normalize({}), DEFAULT);
  assert.deepEqual(UNTIL, ["pr", "reviewed", "merged", "fix_ready"]);
  for (const junk of [null, undefined, "merge", 3, true, [], [true]]) assert.deepEqual(normalize(junk), DEFAULT);
});

test("normalize: legacy merge and review map to until, and a valid until wins", () => {
  assert.equal(normalize({ merge: true, review: true }).until, "fix_ready");
  assert.equal(normalize({ merge: true, review: "in_review" }).until, "fix_ready");
  assert.equal(normalize({ merge: true }).until, "merged");
  assert.equal(normalize({ merge: true, review: false }).until, "merged");
  assert.equal(normalize({ review: true }).until, "pr");
  assert.equal(normalize({ merge: false, review: "in_review" }).until, "pr");
  assert.equal(normalize({ merge: "yes", review: 1 }).until, "pr");
  assert.equal(normalize({ until: "reviewed", merge: true, review: true }).until, "reviewed");
  assert.equal(normalize({ until: "pr", merge: true }).until, "pr");
  assert.equal(normalize({ until: "bogus", merge: true }).until, "merged");
  assert.equal(normalize({ until: 5, merge: true, review: true }).until, "fix_ready");
  assert.equal(normalize({ until: "__proto__" }).until, "pr");
  const out = normalize({ merge: true, review: true, until: "merged" });
  assert.ok(!("merge" in out) && !("review" in out));
});

test("normalize: deploy and extra are cleaned and capped, deploy kept whatever until is", () => {
  assert.equal(normalize({ until: "fix_ready", deploy: "  The Deploy\n workflow\t\tis  green \u0007 " }).deploy, "The Deploy workflow is green");
  assert.equal(normalize({ deploy: "a".repeat(DEPLOY_MAX + 50) }).deploy.length, DEPLOY_MAX);
  assert.equal(normalize({ until: "pr", deploy: "x" }).deploy, "x");
  assert.equal(normalize({ deploy: 5 }).deploy, "");
  assert.equal(normalize({ extra: "  Stack\npull   requests. \u0000" }).extra, "Stack pull requests.");
  assert.equal(normalize({ extra: "b".repeat(EXTRA_MAX + 5) }).extra.length, EXTRA_MAX);
  assert.equal(EXTRA_MAX, 1000);
  assert.equal(normalize({ extra: ["x"] }).extra, "");
  assert.equal(normalize({ extra: { toString: () => "x" } }).extra, "");
});

test("normalize: agent is null for Claude Code, else { id, name }", () => {
  assert.deepEqual(normalize({ agent: { id: "codex", name: "Codex" } }).agent, { id: "codex", name: "Codex" });
  assert.deepEqual(normalize({ agent: { id: "codex", name: "" } }).agent, { id: "codex", name: "codex" });
  assert.deepEqual(normalize({ agent: { id: "codex", name: 7 } }).agent, { id: "codex", name: "codex" });
  assert.equal(normalize({ agent: { id: "x", name: "n".repeat(100) } }).agent.name.length, 60);
  for (const bad of [null, "codex", 5, [], [{ id: "codex" }], {}, { id: "" }, { id: "  " }, { id: 5 }, { id: null }, { id: "Claude", name: "x" }, { id: "CLAUDE" }]) {
    assert.equal(normalize({ agent: bad }).agent, null, JSON.stringify(bad));
  }
  assert.equal(normalize(JSON.parse('{"agent":{"__proto__":{"id":"codex"}}}')).agent, null);
});

test("rulesFor reads the repository's own entry", () => {
  const stored = { "/r": { merge: true, review: false, deploy: "" } };
  assert.equal(rulesFor(stored, "/r").until, "merged");
  assert.deepEqual(rulesFor(stored, "/other"), DEFAULT);
  assert.deepEqual(rulesFor(stored, undefined), DEFAULT);
  assert.deepEqual(rulesFor(stored, null), DEFAULT);
  assert.deepEqual(rulesFor(null, "/r"), DEFAULT);
  assert.deepEqual(rulesFor("junk", "/r"), DEFAULT);
  assert.deepEqual(rulesFor({}, "__proto__"), DEFAULT);
  assert.deepEqual(rulesFor({}, "constructor"), DEFAULT);
  assert.deepEqual(rulesFor(JSON.parse('{"__proto__":{"until":"merged"}}'), "__proto__"), { ...DEFAULT, until: "merged" });
});

test("autoOf, agentName and summary", () => {
  assert.equal(autoOf(DEFAULT), null);
  assert.equal(autoOf(undefined), null);
  assert.equal(autoOf({ until: "reviewed" }), "watch");
  assert.equal(autoOf({ until: "merged" }), "merge");
  assert.equal(autoOf({ until: "fix_ready" }), "review");
  assert.equal(agentName(DEFAULT), "Claude Code");
  assert.equal(agentName(undefined), "Claude Code");
  assert.equal(agentName({ agent: { id: "codex", name: "Codex" } }), "Codex");
  assert.equal(summary(DEFAULT), "Claude Code · until the pull request is open");
  assert.equal(summary({ ...DEFAULT, until: "reviewed" }), "Claude Code · until reviewed and green");
  assert.equal(summary({ ...DEFAULT, until: "merged" }), "Claude Code · until merged");
  assert.equal(summary({ agent: { id: "codex", name: "Codex" }, until: "fix_ready" }), "Codex · until Fix ready");
});

test("normalize: invisible characters are removed and a cut never splits a character", () => {
  assert.equal(normalize({ extra: "a\u0085b\u202ec\u200bd" }).extra, "a b c d");
  const cut = normalize({ extra: "x".repeat(999) + "\u{1F600}" }).extra;
  assert.equal(cut, "x".repeat(999));
});

test("normalize: an agent id that cleaning would change is Claude Code", () => {
  for (const id of ["a  b", " codex", "co\u0000dex", "x".repeat(61), ""]) assert.equal(normalize({ agent: { id, name: "X" } }).agent, null, JSON.stringify(id));
  assert.deepEqual(normalize({ agent: { id: "codex", name: "Codex" } }).agent, { id: "codex", name: "Codex" });
});
