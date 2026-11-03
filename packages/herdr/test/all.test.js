import assert from "node:assert/strict";
import { test } from "node:test";
import { byProject, fixProjectFor, labelOf, mapLimit, mergeLoaded, mergeRead, queueReload, reloadFor, targetsFor, tagIssues, yourTurnAll } from "../mods/tuix/lib/all.js";
import { groupIssues } from "../mods/tuix/lib/issues.js";

const P = { id: "p1", name: "Shop" }, Q = { id: "p2", name: "admin" };
const iss = (id, status, extra = {}) => ({ id, number: Number(id.slice(1)), status, ...extra });

test("tagIssues puts the project on each issue without touching the original", () => {
  const a = iss("i1", "open");
  const [t] = tagIssues([a], P);
  assert.equal(t.projectId, "p1"); assert.equal(t.projectName, "Shop"); assert.equal(a.projectId, undefined);
});

test("byProject: by name, case-insensitive, stable inside a project", () => {
  const list = [...tagIssues([iss("i1", "open"), iss("i2", "open")], P), ...tagIssues([iss("i3", "open")], Q)];
  assert.deepEqual(byProject(list).map((i) => i.id), ["i3", "i1", "i2"]);
});

test("mergeLoaded and groupIssues: statuses group across projects, each issue keeps its project", () => {
  const m = mergeLoaded([
    { project: P, issues: [iss("i1", "open"), iss("i2", "in_review")], people: [{ id: "m:1", name: "Maja", me: true }] },
    { project: Q, issues: [iss("i3", "open")], people: [{ id: "m:9", name: "Jan", me: true }] },
  ]);
  const g = groupIssues(m.issues, []);
  assert.deepEqual(g.open.map((i) => [i.id, i.projectName]), [["i3", "admin"], ["i1", "Shop"]]);
  assert.deepEqual(g.inReview.map((i) => i.id), ["i2"]);
  assert.deepEqual(m.meBy, { p1: "m:1", p2: "m:9" });
  assert.deepEqual(m.names, { "m:1": "Maja", "m:9": "Jan" });
  assert.deepEqual(Object.keys(m.peopleBy), ["p1", "p2"]);
});

test("mergeLoaded without people (read-only connection)", () => {
  const m = mergeLoaded([{ project: P, issues: [iss("i1", "open")], people: [] }]);
  assert.deepEqual(m.meBy, { p1: null });
});

test("yourTurnAll uses the person's id in each project", () => {
  const issues = [
    ...tagIssues([iss("i1", "open", { turn: "team", turn_person: "m:1" }), iss("i2", "open", { turn: "team", turn_person: "m:9" })], P),
    ...tagIssues([iss("i3", "open", { turn: "team", turn_person: "m:9" }), iss("i4", "done", { turn: "team", turn_person: "m:9" })], Q),
  ];
  assert.equal(yourTurnAll(issues, { p1: "m:1", p2: "m:9" }), 2);
  // Without an id (read-only): the team's turn.
  assert.equal(yourTurnAll(issues, { p1: null, p2: null }), 3);
  assert.equal(yourTurnAll([], {}), 0);
});

test("mapLimit keeps order and never exceeds the limit", async () => {
  let live = 0, peak = 0;
  const out = await mapLimit([1, 2, 3, 4, 5, 6, 7], 4, async (n) => {
    live++; peak = Math.max(peak, live);
    await new Promise((r) => setTimeout(r, 5 * (8 - n)));
    live--; return n * 2;
  });
  assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
  assert.equal(peak, 4);
});

test("mapLimit: after a failure nothing new starts and the first error is thrown", async () => {
  const started = [];
  await assert.rejects(mapLimit([1, 2, 3, 4, 5, 6], 2, async (n) => {
    started.push(n);
    if (n === 1) throw new Error("boom");
    await new Promise((r) => setTimeout(r, 5));
  }), /boom/);
  assert.ok(started.length < 6);
  assert.deepEqual(await mapLimit([], 4, async () => 1), []);
});

const rd = (project, issues, extra = {}) => ({ project, issues, people: [], cut: false, ...extra });
const R = { id: "p3", name: "Docs" };

test("labelOf: workspace only when two projects share a name", () => {
  const a = { id: "1", name: "Web", workspace: "Acme" }, b = { id: "2", name: "web", workspace: "Beta" }, c = { id: "3", name: "Api", workspace: "Acme" };
  assert.equal(labelOf(a, [a, b, c]), "Web · Acme");
  assert.equal(labelOf(c, [a, b, c]), "Api");
  assert.equal(mergeLoaded([rd(a, [iss("i1", "open")]), rd(b, [iss("i2", "open")])]).issues.map((i) => i.projectName).join("|"), "Web · Acme|web · Beta");
});

test("fixProjectFor: the name wins, else the stored pick, else none", () => {
  const ps = [P, Q, R];
  assert.equal(fixProjectFor("shop", ps, "p3"), P);
  assert.equal(fixProjectFor("other", ps, "p3"), R);
  assert.equal(fixProjectFor("other", ps, "gone"), null);
  assert.equal(fixProjectFor(null, ps, "p3"), null);
});

test("targetsFor: only reads the named projects when all were read before", () => {
  const ps = [P, Q];
  assert.deepEqual(targetsFor({ projects: ps, cached: { p1: 1, p2: 1 }, only: new Set(["p2"]) }), [Q]);
  assert.deepEqual(targetsFor({ projects: ps, cached: { p1: 1 }, only: new Set(["p2"]) }), ps);
  assert.deepEqual(targetsFor({ projects: ps, cached: { p1: 1, p2: 1 }, only: null }), ps);
});

test("targetsFor: unknown ids read nothing when everything is cached", () => {
  assert.deepEqual(targetsFor({ projects: [P, Q], cached: { p1: 1, p2: 1 }, only: new Set(["gone"]) }), []);
});

test("mergeRead: a partial read keeps the others as last read", () => {
  const cached = { p1: rd(P, [iss("i1", "open")]), p2: rd(Q, [iss("i2", "open")]) };
  const m = mergeRead({ projects: [P, Q], cached, read: [rd(Q, [iss("i3", "open")])], only: new Set(["p2"]) });
  assert.deepEqual(m.issues.map((i) => i.id).sort(), ["i1", "i3"]);
  assert.deepEqual(m.retire, ["p2"]);
});

test("mergeRead: runs retire only for projects read completely and not cut", () => {
  const m = mergeRead({ projects: [P, Q, R], cached: {}, read: [rd(P, []), rd(Q, [], { cut: true }), { project: R, error: new Error("x") }], only: null });
  assert.deepEqual(m.retire, ["p1"]);
  assert.deepEqual(m.cut, ["admin"]);
  assert.deepEqual(m.failed, ["Docs"]);
});

test("mergeRead: a failed project keeps its last result and is named", () => {
  const cached = { p1: rd(P, [iss("i1", "open")]) };
  const m = mergeRead({ projects: [P, Q], cached, read: [{ project: P, error: new Error("x") }, rd(Q, [iss("i2", "open")])], only: null });
  assert.deepEqual(m.issues.map((i) => i.id).sort(), ["i1", "i2"]);
  assert.deepEqual(m.failed, ["Shop"]);
  assert.deepEqual(m.retire, ["p2"]);
});

test("queueReload: all wins, otherwise the union of projects asked for", () => {
  assert.equal(queueReload(undefined, null), "all");
  assert.equal(queueReload("all", new Set(["a"])), "all");
  assert.equal(queueReload(new Set(["a"]), null), "all");
  assert.deepEqual([...queueReload(undefined, new Set(["a"]))], ["a"]);
  assert.deepEqual([...queueReload(new Set(["a"]), new Set(["b"]))], ["a", "b"]);
});

test("reloadFor: the projects of the changed runs, everything if one has no project", () => {
  assert.deepEqual([...reloadFor([{ projectId: "p1" }, { projectId: "p1" }, { projectId: "p2" }])], ["p1", "p2"]);
  assert.equal(reloadFor([{ projectId: "p1" }, {}]), null);
  assert.equal(reloadFor([]), null);
});
