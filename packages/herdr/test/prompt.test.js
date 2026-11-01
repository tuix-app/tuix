import assert from "node:assert/strict";
import { test } from "node:test";
import { fixPrompt } from "../mods/tuix/lib/prompt.js";

test("fixPrompt names the issue and the stack", () => {
  const p = fixPrompt({ issue: { reference: "Tuix #17", app_url: "https://tuix.app/x" }, branch: "tuix-17-x", stackable: [{ number: 12, branch: "tuix-12-a" }] });
  assert.match(p, /Fix Tuix issue Tuix #17 \(https:\/\/tuix\.app\/x\)/);
  assert.match(p, /on this branch \(tuix-17-x\)/);
  assert.match(p, /#12 on tuix-12-a\. If your fix/);
  assert.match(p, /Never set the issue to in_review yourself/);
  assert.match(p, /\n1\. Claim it: set_issue_status in_progress, with no note\.\n/);
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
