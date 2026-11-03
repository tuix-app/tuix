import assert from "node:assert/strict";
import { test } from "node:test";
import { advance, closingComment, retirePrOpen, stackable, startTimeout, toStart } from "../mods/tuix/lib/runs.js";

const r = (id, state, queuedAt = 0, extra = {}) => ({ issueId: id, number: 1, branch: `b-${id}`, state, queuedAt, startedAt: null, seenWorking: false, ...extra });
const live = (...ids) => new Set(ids);
const c = (via, at) => ({ id: at, body: "x", inserted_at: at, author: { name: "A" }, via });
const step = (run, agentStatus, extra = {}) => advance(run, { agentStatus, terminalAlive: true, closing: null, ...extra });

test("toStart keeps at most 3 active", () => {
  const rs = [r("a", "running"), r("b", "blocked"), r("c", "queued", 1), r("d", "queued", 2)];
  assert.deepEqual(toStart(rs, live("a", "b", "c", "d")).map((x) => x.issueId), ["c"]);
});

test("every active run takes a slot, whatever its project or whether its issue is listed", () => {
  const rs = [r("a", "running"), r("b", "running"), r("x", "running"), r("c", "queued", 1)];
  assert.deepEqual(toStart(rs, live("a", "b", "c")), []);
  // Three running in another project (not listed here) leave nothing for this project's queue.
  const other = [r("o1", "running"), r("o2", "blocked"), r("o3", "running"), r("q1", "queued", 1), r("q2", "queued", 2)];
  assert.deepEqual(toStart(other, live("q1", "q2")), []);
  // One active elsewhere leaves two slots here.
  const some = [r("o1", "running"), r("q1", "queued", 1), r("q2", "queued", 2), r("q3", "queued", 3)];
  assert.deepEqual(toStart(some, live("q1", "q2", "q3")).map((x) => x.issueId), ["q1", "q2"]);
});

test("toStart takes the oldest queued first and none when full", () => {
  const rs = [r("n", "queued", 5), r("o", "queued", 1), r("m", "queued", 3)];
  assert.deepEqual(toStart(rs, live("n", "o", "m")).map((x) => x.issueId), ["o", "m", "n"]);
  const full = [r("a", "running"), r("b", "running"), r("c", "blocked"), r("d", "queued")];
  assert.deepEqual(toStart(full, live("a", "b", "c", "d")), []);
});

test("idle before first work", () => {
  assert.equal(step(r("a", "running"), "idle").state, "running");
});

test("idle after work stops", () => {
  const w = step(r("a", "running"), "working");
  assert.equal(w.seenWorking, true);
  assert.equal(step(w, "idle").state, "stopped");
  assert.equal(step(w, "done").state, "stopped");
});

test("blocked and back to working", () => {
  const b = step(r("a", "running"), "blocked");
  assert.equal(b.state, "blocked");
  assert.equal(step(b, "working").state, "running");
});

test("terminal gone", () => {
  assert.equal(step(r("a", "running"), null, { terminalAlive: false }).state, "stopped");
});

test("closing comment wins", () => {
  const w = step(r("a", "running"), "working");
  assert.equal(step(w, "idle", { closing: c("Claude Code", "2026-11-01T10:06:00Z") }).state, "pr_open");
  assert.equal(step(r("a", "running"), null, { terminalAlive: false, closing: c("Claude Code", "t") }).state, "pr_open");
});

test("pr_open is final", () => {
  const p = r("a", "pr_open");
  assert.equal(step(p, "working"), p);
  assert.equal(step(p, null, { terminalAlive: false, closing: c("Claude Code", "t") }), p);
});

test("a stopped run opens its PR on a closing comment and resumes when the agent works again", () => {
  const s = r("a", "stopped", 0, { seenWorking: true });
  assert.equal(step(s, null, { closing: c("Claude Code", "t") }).state, "pr_open");
  assert.equal(step(s, "working").state, "running");
  assert.equal(step(s, "blocked").state, "blocked");
  assert.equal(step(s, "idle"), s);
  assert.equal(step(s, null), s);
  assert.equal(step(s, "working", { terminalAlive: false }), s);
});

test("closingComment ignores the panel's own replies and older comments", () => {
  const run = { startedAt: Date.parse("2026-11-01T10:00:00Z") };
  const cs = [c("Claude Code", "2026-11-01T09:00:00Z"), c("Herdr", "2026-11-01T10:05:00Z"), c("Claude Code", "2026-11-01T10:06:00Z")];
  assert.equal(closingComment(cs, run, "Herdr"), cs[2]);
});

test("closingComment ignores comments without via and finds none", () => {
  const run = { startedAt: Date.parse("2026-11-01T10:00:00Z") };
  assert.equal(closingComment([c(null, "2026-11-01T10:05:00Z")], run, "Herdr"), null);
  assert.equal(closingComment([], run, "Herdr"), null);
  assert.equal(closingComment([c("Claude Code", "2026-11-01T10:00:00Z")], run, "Herdr").via, "Claude Code");
});

test("stackable lists runs with an open pull request", () => {
  const rs = [r("a", "pr_open", 0, { number: 12, branch: "tuix-12-a", repoMain: "/code/a" }), r("b", "running", 0, { repoMain: "/code/a" })];
  assert.deepEqual(stackable(rs, "/code/a"), [{ number: 12, branch: "tuix-12-a" }]);
});

test("stackable never offers another repository's pull request", () => {
  const rs = [r("a", "pr_open", 0, { number: 12, branch: "tuix-12-a", repoMain: "/code/a" }), r("b", "pr_open", 0, { number: 13, branch: "tuix-13-b", repoMain: "/code/b" })];
  assert.deepEqual(stackable(rs, "/code/b"), [{ number: 13, branch: "tuix-13-b" }]);
  assert.deepEqual(stackable(rs, "/code/c"), []);
});

test("retirePrOpen drops finished PR-open runs of the loaded project only", () => {
  const pr = (id, projectId) => r(id, "pr_open", 0, { projectId });
  const rs = [pr("moved", "p1"), pr("gone", "p1"), pr("still", "p1"), pr("other", "p2"), pr("legacy", undefined), r("run", "running", 0, { projectId: "p1" })];
  const issues = [{ id: "moved", status: "in_review" }, { id: "still", status: "in_progress" }, { id: "run", status: "open" }];
  assert.deepEqual(retirePrOpen(rs, "p1", issues).map((x) => x.issueId), ["still", "other", "legacy", "run"]);
  assert.equal(retirePrOpen(rs, "p1", [{ id: "still", status: "in_progress" }, { id: "moved", status: "in_progress" }, { id: "gone", status: "in_progress" }]), rs);
  assert.equal(retirePrOpen(rs, "p1", issues, { cut: true }), rs);
});

test("dead terminal stops even a working or blocked agent", () => {
  assert.equal(step(r("a", "running"), "blocked", { terminalAlive: false }).state, "stopped");
  assert.equal(step(r("a", "running"), "working", { terminalAlive: false }).state, "stopped");
});

test("blocked then idle stops", () => {
  const b = step(r("a", "running"), "blocked");
  assert.equal(b.seenWorking, true);
  assert.equal(step(b, "idle").state, "stopped");
});

test("toStart skips queued runs whose issue is gone", () => {
  const rs = [r("gone", "queued", 1), r("c", "queued", 2)];
  assert.deepEqual(toStart(rs, live("c")).map((x) => x.issueId), ["c"]);
});

test("toStart takes this repo's queue first, with free slots from all active runs", () => {
  const rs = [r("a", "running", 0, { repoMain: "/A" }), r("oldB", "queued", 1, { repoMain: "/B" }), r("a2", "queued", 2, { repoMain: "/A" }), r("a3", "queued", 3, { repoMain: "/A" }), r("a4", "queued", 4, { repoMain: "/A" })];
  const ids = live("oldB", "a2", "a3", "a4");
  assert.deepEqual(toStart(rs, ids, { repoMain: "/A" }).map((x) => x.issueId), ["a2", "a3"]);
  assert.deepEqual(toStart(rs, ids, { repoMain: "/B" }).map((x) => x.issueId), ["oldB"]);
});

test("a run never seen working stops after two minutes", () => {
  const run = r("a", "running", 0, { startedAt: 1000 });
  assert.equal(startTimeout(run, 1000 + 119999), run);
  const t = startTimeout(run, 1000 + 120000);
  assert.deepEqual([t.state, t.error], ["stopped", "The agent didn't start."]);
  assert.equal(startTimeout({ ...run, seenWorking: true }, 1e9).state, "running");
  assert.equal(startTimeout({ ...run, state: "blocked", seenWorking: true }, 1e9).state, "blocked");
});

test("toStart with a machine starts only that machine's queue; old records count as this computer", () => {
  const q = (issueId, machine, queuedAt) => ({ issueId, state: "queued", repoMain: "/r", queuedAt, ...(machine === undefined ? {} : { machine }) });
  const rs = [q("a", "vps", 1), q("b", undefined, 2), q("c", null, 3)];
  const ids = new Set(["a", "b", "c"]);
  assert.deepEqual(toStart(rs, ids, { repoMain: "/r", machine: "vps" }).map((r) => r.issueId), ["a"]);
  assert.deepEqual(toStart(rs, ids, { repoMain: "/r", machine: null }).map((r) => r.issueId), ["b", "c"]);
});
