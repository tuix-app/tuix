import assert from "node:assert/strict";
import { test } from "node:test";
import { branchName, groupIssues, matchProject, turnLabel, yourTurnCount } from "../mods/tuix/lib/issues.js";

const i = (number, status, extra = {}) => ({ id: `i${number}`, number, status, ...extra });
const run = (n, state) => ({ issueId: `i${n}`, state });
const ids = (g) => Object.fromEntries(Object.entries(g).map(([k, v]) => [k, v.map((x) => x.number)]));

test("matchProject by name, case-insensitive", () => {
  const ps = [{ id: "1", name: "Tuix" }, { id: "2", name: "Checkout" }];
  assert.deepEqual(matchProject("tuix", ps), { project: ps[0] });
  assert.deepEqual(matchProject("herdr", ps), { choices: ps });
  assert.deepEqual(matchProject("tuix", [...ps, { id: "3", name: "TUIX" }]).choices.length, 3);
});

test("groupIssues", () => {
  const issues = [i(1, "open"), i(2, "in_progress"), i(3, "in_progress"), i(4, "in_review"), i(5, "done"), i(6, "closed")];
  const g = groupIssues(issues, [run(2, "running"), run(3, "pr_open")]);
  assert.deepEqual(ids(g), { open: [1], fixing: [2], prOpen: [3], inReview: [4] });
});

test("groupIssues: queued, blocked and stopped runs are fixing; other run states leave the issue open", () => {
  const issues = [i(1, "open"), i(2, "open"), i(3, "open"), i(4, "open")];
  const g = groupIssues(issues, [run(1, "queued"), run(2, "blocked"), run(3, "stopped"), run(4, "finished")]);
  assert.deepEqual(ids(g), { open: [4], fixing: [1, 2, 3], prOpen: [], inReview: [] });
});

test("groupIssues: pr_open run on an issue not in progress does not count", () => {
  assert.deepEqual(ids(groupIssues([i(1, "open")], [run(1, "pr_open")])), { open: [1], fixing: [], prOpen: [], inReview: [] });
});

test("runs for missing issues are ignored", () => {
  assert.deepEqual(ids(groupIssues([i(1, "open")], [run(9, "running")])), { open: [1], fixing: [], prOpen: [], inReview: [] });
});

test("turnLabel", () => {
  const names = { "member:a": "Anna" };
  assert.equal(turnLabel({ turn: "team", turn_person: "member:me" }, { me: "member:me", names }), "Your turn");
  assert.equal(turnLabel({ turn: "team", turn_person: "member:a" }, { me: "member:me", names }), "Waiting for Anna");
  assert.equal(turnLabel({ turn: "verify", turn_person: "end_user:x", author: { name: "Ada" } }, { me: null, names }), "Waiting for Ada to check the fix");
  assert.equal(turnLabel({ turn: "team", turn_person: null }, { me: null, names }), "Waiting for the team, nobody assigned");
  assert.equal(turnLabel({ turn: null }, { me: null, names }), "");
});

test("turnLabel: reporter, name fallbacks", () => {
  const names = { "end_user:x": "Xavier" };
  assert.equal(turnLabel({ turn: "reporter", turn_person: "end_user:x", author: { name: "Ada" } }, { me: null, names }), "Waiting for Xavier (reporter)");
  assert.equal(turnLabel({ turn: "reporter", turn_person: "end_user:y", author: { name: "Ada" } }, { me: null, names }), "Waiting for Ada (reporter)");
  assert.equal(turnLabel({ turn: "reporter", turn_person: null }, { me: null, names }), "Waiting for the reporter (reporter)");
  assert.equal(turnLabel({ turn: "verify", turn_person: null }, { me: null, names }), "Waiting for the reporter to check the fix");
  assert.equal(turnLabel({ turn: "team", turn_person: "member:z", author: { name: "Ada" } }, { me: null, names }), "Waiting for the team");
  assert.equal(turnLabel({ turn: "team", turn_person: null }, { me: "member:me", names }), "Waiting for the team, nobody assigned");
});

test("yourTurnCount", () => {
  const issues = [
    i(1, "open", { turn: "team", turn_person: "member:me" }),
    i(2, "in_progress", { turn: "team", turn_person: "member:a" }),
    i(3, "open", { turn: "team", turn_person: null }),
    i(4, "done", { turn: "team", turn_person: "member:me" }),
    i(5, "closed", { turn: "team", turn_person: null }),
    i(6, "open", { turn: "reporter", turn_person: "member:me" }),
  ];
  assert.equal(yourTurnCount(issues, "member:me"), 2);
  assert.equal(yourTurnCount(issues, null), 3);
});

test("branchName", () => {
  assert.equal(branchName({ number: 17, title: "Reply box loses draft on tab switch!" }), "tuix-17-reply-box-loses-draft-on-tab-switch");
  assert.equal(branchName({ number: 3, title: "  --Hello,   World--  " }), "tuix-3-hello-world");
  const long = branchName({ number: 1, title: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa bbbbbbbbbb" });
  assert.equal(long, "tuix-1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(branchName({ number: 2, title: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-b" }), "tuix-2-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.equal(branchName({ number: 4, title: "!!!" }), "tuix-4");
});

test("relocation keeps an open list or thread within the same repo and project", async () => {
  const { relocation } = await import("../mods/tuix/lib/issues.js");
  const next = { key: "/code/app|p1", hasProject: true };
  assert.equal(relocation({ state: "thread", key: "/code/app|p1" }, next), "keep");
  assert.equal(relocation({ state: "list", key: "/code/app|p1" }, next), "keep");
  assert.equal(relocation({ state: "thread", key: "/code/other|p1" }, next), "reset");
  assert.equal(relocation({ state: "project", key: "/code/app|p1" }, next), "reset");
  assert.equal(relocation({ state: "list", key: "/code/app|p1" }, { key: "/code/app|", hasProject: false }), "reset");
});
