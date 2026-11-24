import assert from "node:assert/strict";
import { test } from "node:test";
import { fixPrompt } from "../mods/tuix/lib/prompt.js";

test("fixPrompt names the issue and the stack", () => {
  const p = fixPrompt({ issue: { reference: "Tuix #17", app_url: "https://tuix.app/x" }, branch: "tuix-17-x", stackable: [{ number: 12, branch: "tuix-12-a" }] });
  assert.match(p, /Fix Tuix issue Tuix #17 \(https:\/\/tuix\.app\/x\)/);
  assert.match(p, /on this branch \(tuix-17-x\)/);
  assert.match(p, /#12 on tuix-12-a\. If your fix/);
  assert.match(p, /Never set the issue to fix_ready yourself/);
  assert.match(p, /\n1\. Take it: pass_turn with person me, with no note\.\n/);
  assert.match(p, /\n4\. Reply on the issue/);
});

test("fixPrompt without stackable fixes has no stack lines", () => {
  const p = fixPrompt({ issue: { reference: "R", app_url: "u" }, branch: "b", stackable: [] });
  assert.doesNotMatch(p, /already pushed/);
  assert.match(p, /Otherwise push the branch\.\n4\. Reply/);
});

test("fixPrompt lists several stackable fixes", () => {
  const p = fixPrompt({ issue: { reference: "R", app_url: "u" }, branch: "b", stackable: [{ number: 12, branch: "x" }, { number: 14, branch: "y" }] });
  assert.match(p, /#12 on x, #14 on y\./);
});

const base = { issue: { reference: "R", app_url: "u" }, branch: "b", stackable: [] };
const OFF = { merge: false, review: false, deploy: "" };

test("fixPrompt with no rules, or all off, is the text without steps 5 and 6", () => {
  const plain = fixPrompt(base);
  assert.equal(fixPrompt({ ...base, rules: OFF }), plain);
  assert.equal(fixPrompt({ ...base, rules: undefined }), plain);
  assert.doesNotMatch(plain, /\n5\. /);
  assert.match(plain, /link\.\n\nNever set the issue to fix_ready yourself\. Only do it if I tell you to here, after it's deployed\. Never close or reassign it\./);
});

test("fixPrompt with merge adds step 5 and still forbids fix_ready", () => {
  const p = fixPrompt({ ...base, rules: { merge: true, review: false, deploy: "" } });
  assert.match(p, /\n5\. If you opened a pull request, stay with it until it is merged\./);
  assert.match(p, /gh pr checks --watch/);
  assert.match(p, /never use --admin/);
  assert.match(p, /\n\nNever set the issue to fix_ready yourself\. Only do it if I tell you/);
  assert.doesNotMatch(p, /\n6\. /);
  assert.ok(p.startsWith(fixPrompt(base).split("\n\nNever set")[0]));
});

test("fixPrompt with review adds step 6 with the deploy text and replaces the last paragraph", () => {
  const p = fixPrompt({ ...base, rules: { merge: true, review: true, deploy: "The Deploy workflow on main has finished for the merge commit." } });
  assert.match(p, /\n6\. Only if you merged the pull request in step 5: wait until the fix is deployed, checking no more than once every five minutes\. How I tell that it is deployed: The Deploy workflow on main has finished for the merge commit\. When the deploy has succeeded, set_issue_status fix_ready with no note/);
  assert.match(p, /\n\nSet the issue to fix_ready only as step 6 says\. Never close or reassign it\. If you can't fix it or need a decision, stop and ask me\.\n$/);
  assert.doesNotMatch(p, /Never set the issue to fix_ready yourself/);
  assert.match(fixPrompt({ ...base, rules: { merge: true, review: true, deploy: "Vercel shows Ready" } }), /How I tell that it is deployed: Vercel shows Ready\. When/);
  assert.match(fixPrompt({ ...base, rules: { merge: true, review: true, deploy: "Run this: " } }), /deployed: Run this\. When/);
  // Without a pull request, or without the merge, there is no deploy to wait for and the status stays.
  assert.match(p, /If you didn't open or didn't merge a pull request, stop after step 4 and leave the conversation as it is\.\n/);
  assert.match(p, /if that one isn't merged when yours is ready, stop and tell me\./);
});

test("fixPrompt with review and no deploy text looks for the deploy itself", () => {
  const p = fixPrompt({ ...base, rules: { merge: true, review: true, deploy: "" } });
  assert.match(p, /five minutes\. Find what the merge deploys with \(a workflow run or a GitHub deployment for the merge commit\) and watch that\. When the deploy/);
  assert.doesNotMatch(p, /How I tell/);
});

test("fixPrompt without merge has no step 6 even if review is set", () => {
  const p = fixPrompt({ ...base, rules: { merge: false, review: true, deploy: "x" } });
  assert.doesNotMatch(p, /\n[56]\. /);
  assert.match(p, /Never set the issue to fix_ready yourself/);
});
