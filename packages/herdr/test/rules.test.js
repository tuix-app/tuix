import { test } from "node:test";
import assert from "node:assert/strict";
import { DEPLOY_MAX, autoOf, normalize, rulesFor, summary } from "../mods/tuix/lib/rules.js";

const OFF = { merge: false, review: false, deploy: "" };

test("normalize: review needs merge", () => {
  assert.deepEqual(normalize({ merge: true, review: true }), { merge: true, review: true, deploy: "" });
  assert.deepEqual(normalize({ merge: true }), { merge: true, review: false, deploy: "" });
  assert.deepEqual(normalize({ review: true, deploy: "x" }), { ...OFF, deploy: "x" });
});

test("normalize: the deploy text is cleaned and capped, and kept while review is off", () => {
  assert.equal(normalize({ merge: true, review: true, deploy: "  The Deploy\n workflow\t\tis  green \u0007 " }).deploy, "The Deploy workflow is green");
  assert.equal(normalize({ merge: true, review: true, deploy: "a".repeat(DEPLOY_MAX + 50) }).deploy.length, DEPLOY_MAX);
  assert.equal(normalize({ merge: true, review: false, deploy: "x" }).deploy, "x");
  assert.equal(normalize({ deploy: "x" }).deploy, "x");
  assert.equal(normalize({ merge: true, review: true, deploy: 5 }).deploy, "");
});

test("normalize: junk is all off", () => {
  for (const junk of [null, undefined, "merge", 3, true, [], [true]]) assert.deepEqual(normalize(junk), OFF);
  assert.deepEqual(normalize({ merge: "yes", review: 1 }), OFF);
});

test("rulesFor reads the repository's own entry", () => {
  const stored = { "/r": { merge: true, review: false, deploy: "" } };
  assert.equal(rulesFor(stored, "/r").merge, true);
  assert.deepEqual(rulesFor(stored, "/other"), OFF);
  assert.deepEqual(rulesFor(stored, undefined), OFF);
  assert.deepEqual(rulesFor(stored, null), OFF);
  assert.deepEqual(rulesFor(null, "/r"), OFF);
  assert.deepEqual(rulesFor("junk", "/r"), OFF);
  assert.deepEqual(rulesFor({}, "__proto__"), OFF);
  assert.deepEqual(rulesFor({}, "constructor"), OFF);
  assert.deepEqual(rulesFor(JSON.parse('{"__proto__":{"merge":true}}'), "__proto__"), { merge: true, review: false, deploy: "" });
});

test("autoOf and summary", () => {
  assert.equal(autoOf(OFF), null);
  assert.equal(autoOf(undefined), null);
  assert.equal(autoOf({ merge: true, review: false, deploy: "" }), "merge");
  assert.equal(autoOf({ merge: true, review: true, deploy: "" }), "review");
  assert.equal(summary(OFF), "After a fix: nothing more");
  assert.equal(summary({ merge: true, review: false, deploy: "" }), "After a fix: merge when checks pass");
  assert.equal(summary({ merge: true, review: true, deploy: "" }), "After a fix: merge, then In review once deployed");
});
