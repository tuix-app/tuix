import { test } from "node:test";
import assert from "node:assert/strict";
import { applyIfCurrent, probe, AGENT_ARGV, hasWorktree, parseSpaceNew, queueRun, removeRun, spaceNewArgs, startRun, stackedOn, trackRun } from "../mods/tuix/lib/launch.js";

const repo = { top: "/code/app", main: "/code/app", name: "app" };
const issue = { id: "i1", number: 7, title: "Broken", reference: "Tuix #7", app_url: "https://tuix.app/i/7" };
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const PATH = "/home/u/.herdr/worktrees/app/tuix-7-broken";

// A fake exec that records calls and answers by command.
function fake({ worktrees = "", spaceOut = '{"space":"s1","tab":"t1","terminal":"term1"}', spaceCode = 0, addFails = false } = {}) {
  const calls = [], optsSeen = [];
  const exec = async (cmd, args, opts) => {
    calls.push([cmd, ...args]);
    optsSeen.push(opts);
    const key = `${cmd} ${args.slice(0, 2).join(" ")}`;
    if (key.startsWith("git symbolic-ref")) return ok("origin/main\n");
    if (key.startsWith("git worktree list")) return ok(worktrees);
    if (key.startsWith("git worktree add")) return addFails ? { code: 128, stdout: "", stderr: "fatal: nope\n" } : ok();
    if (cmd === "herdr-app") return { code: spaceCode, stdout: spaceOut, stderr: "" };
    return ok();
  };
  return { exec, calls, optsSeen };
}
const queued = () => queueRun([], issue, { branch: "tuix-7-broken", repoMain: repo.main, now: 100 })[0];
const start = (f, runs) => startRun({ run: queued(), issue, runs: runs ?? [queued()], repo, home: "/home/u", exec: f.exec, now: () => 500 });

test("queueRun replaces the record of the same issue", () => {
  const old = { ...queued(), state: "stopped" };
  const runs = queueRun([old, { issueId: "other" }], issue, { branch: "b", repoMain: "/r", now: 9 });
  assert.equal(runs.length, 2);
  assert.equal(runs.find((r) => r.issueId === "i1").state, "queued");
  assert.deepEqual(removeRun(runs, "i1").map((r) => r.issueId), ["other"]);
});

test("space.new arguments carry the folder, the agent argv and the task, in one JSON argument", () => {
  const args = spaceNewArgs({ worktree: "/w", task: "do it" });
  assert.deepEqual(args.slice(0, 2), ["do", "space.new"]);
  assert.deepEqual(JSON.parse(args[2]), { folder: "/w", argv: ["claude", "--permission-mode", "auto"], task: "do it" });
  assert.deepEqual(AGENT_ARGV, ["claude", "--permission-mode", "auto"]);
});

test("parseSpaceNew reads ids and reports errors", () => {
  assert.deepEqual(parseSpaceNew({ code: 0, stdout: '{"space":"s","tab":"t","terminal":"x"}', stderr: "" }), { space: "s", tab: "t", terminal: "x" });
  assert.throws(() => parseSpaceNew({ code: 1, stdout: '{"error":"no such folder"}', stderr: "" }), /no such folder/);
  assert.throws(() => parseSpaceNew({ code: 1, stdout: "", stderr: "boom\n" }), /boom/);
  assert.throws(() => parseSpaceNew({ code: 0, stdout: "{}", stderr: "" }), /did not start/);
});

test("hasWorktree matches a whole path", () => {
  const out = `worktree /code/app\nHEAD abc\nbranch refs/heads/main\n\nworktree ${PATH}\nHEAD def\n`;
  assert.ok(hasWorktree(out, PATH));
  assert.ok(!hasWorktree(out, `${PATH}-2`));
  assert.ok(!hasWorktree(out, "/home"));
});

test("startRun adds a worktree and launches the agent", async () => {
  const f = fake();
  const run = await start(f);
  assert.equal(run.state, "running");
  assert.equal(run.terminal, "term1");
  assert.equal(run.worktree, PATH);
  assert.equal(run.startedAt, 500);
  assert.equal(run.base, "origin/main");
  assert.ok(f.calls.some((c) => c[0] === "git" && c[1] === "worktree" && c[2] === "add"));
  const launch = f.calls.find((c) => c[0] === "herdr-app");
  const spec = JSON.parse(launch[3]);
  assert.equal(spec.folder, PATH);
  assert.match(spec.task, /Fix Tuix issue Tuix #7/);
});

test("startRun reuses an existing worktree at the target path", async () => {
  const f = fake({ worktrees: `worktree ${PATH}\nHEAD x\n` });
  const run = await start(f);
  assert.equal(run.state, "running");
  assert.ok(!f.calls.some((c) => c[0] === "git" && c[1] === "worktree" && c[2] === "add"));
});

test("a failed worktree or launch leaves the run stopped with the reason", async () => {
  const a = await start(fake({ addFails: true }));
  assert.equal(a.state, "stopped");
  assert.equal(a.error, "fatal: nope");
  const b = await start(fake({ spaceOut: '{"error":"no space"}', spaceCode: 1 }));
  assert.equal(b.state, "stopped");
  assert.equal(b.error, "no space");
  const noOrigin = { exec: async () => ({ code: 1, stdout: "", stderr: "" }), calls: [] };
  assert.equal((await start(noOrigin)).error, "No origin remote to branch from.");
});

test("the agent never receives the token: not in the argv, the task or the environment", async () => {
  const SECRET = "tuix_write_SECRET123";
  const f = fake();
  // The secret is within reach of the inputs (the issue record, an extra argument) and must not travel.
  const run = await startRun({ run: queued(), issue: { ...issue, credential: SECRET }, runs: [queued()], repo, home: "/home/u", exec: f.exec, now: () => 500, token: SECRET });
  assert.equal(run.state, "running");
  assert.ok(!JSON.stringify(f.calls).includes(SECRET));
  assert.ok(!JSON.stringify(run).includes(SECRET));
  for (const o of f.optsSeen) assert.ok(!o || !("env" in o));
});

test("probe: an agent that worked and is no longer listed has exited, though its shell is open", () => {
  const run = { terminal: "t1", seenWorking: true };
  const shell = [{ address: "t1" }];
  assert.deepEqual(probe(run, [], shell), { agentStatus: null, shellAlive: true, terminalAlive: false });
  assert.equal(probe(run, [{ address: "t1", status: "idle" }], shell).terminalAlive, true);
  // Never seen working: still starting, not exited.
  assert.equal(probe({ ...run, seenWorking: false }, [], shell).terminalAlive, true);
  assert.equal(probe(run, [], []).terminalAlive, false);
});

test("stackedOn reads the number from the reply", () => {
  assert.equal(stackedOn({ body: "Done, stacked on #12." }), 12);
  assert.equal(stackedOn({ body: "Done." }), null);
  assert.equal(stackedOn(null), null);
});

const running = { issueId: "i1", number: 7, branch: "tuix-7-broken", worktree: PATH, terminal: "term1", state: "running", startedAt: 1000, seenWorking: true };
const agent = { address: "term1", status: "working" };

test("trackRun follows the agent, and a dead terminal stops the run", async () => {
  const f = fake();
  const common = { run: running, comments: [], panelLabel: "Tuix for Herdr", repo, exec: f.exec };
  assert.equal((await trackRun({ ...common, agents: [agent], terminals: [{ address: "term1" }] })).state, "running");
  assert.equal((await trackRun({ ...common, agents: [], terminals: [] })).state, "stopped");
  assert.equal((await trackRun({ ...common, agents: [{ address: "term1", status: "blocked" }], terminals: [{ address: "term1" }] })).state, "blocked");
});

test("trackRun moves to PR open on the agent's closing comment and finds the link", async () => {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd === "git") return ok("https://github.com/example/app.git\n");
    return ok("https://github.com/example/app/pull/9\n");
  };
  const comments = [{ via: "Claude Code", inserted_at: new Date(2000).toISOString(), body: "Fixed, stacked on #5" }];
  const next = await trackRun({ run: running, agents: [agent], terminals: [{ address: "term1" }], comments, panelLabel: "Tuix for Herdr", repo, exec });
  assert.equal(next.state, "pr_open");
  assert.equal(next.prUrl, "https://github.com/example/app/pull/9");
  assert.equal(next.stackedOn, 5);
  // Already open: no second lookup.
  calls.length = 0;
  await trackRun({ run: next, agents: [], terminals: [], comments, panelLabel: "Tuix for Herdr", repo, exec });
  assert.equal(calls.length, 0);
});

test("a non-GitHub remote keeps the branch, with no link", async () => {
  const exec = async () => ok("https://gitlab.example.com/a/b.git\n");
  const comments = [{ via: "Claude Code", inserted_at: new Date(2000).toISOString(), body: "Pushed" }];
  const next = await trackRun({ run: running, agents: [agent], terminals: [{ address: "term1" }], comments, panelLabel: "x", repo, exec });
  assert.equal(next.state, "pr_open");
  assert.equal(next.prUrl, null);
});

test("trackRun: an exited agent with an open shell stops; a stopped run closes with its comment; the PR is looked up in the run's worktree", async () => {
  const cwds = [];
  const exec = async (cmd, args, opts) => { cwds.push(opts?.cwd); return cmd === "git" ? ok("https://github.com/example/app.git\n") : ok("https://github.com/example/app/pull/3\n"); };
  const shell = [{ address: "term1" }];
  const gone = await trackRun({ run: running, agents: [], terminals: shell, comments: [], panelLabel: "x", exec });
  assert.equal(gone.state, "stopped");
  const comments = [{ via: "Claude Code", inserted_at: new Date(2000).toISOString(), body: "Done" }];
  const other = { ...gone, repoMain: "/elsewhere" };
  const closed = await trackRun({ run: other, agents: [], terminals: shell, comments, panelLabel: "x", exec });
  assert.equal(closed.state, "pr_open");
  assert.equal(closed.prUrl, "https://github.com/example/app/pull/3");
  assert.deepEqual(cwds, [PATH, PATH]);
});

test("runs whose issue can't be read still stop when their terminals are gone, freeing every slot", async () => {
  const mk = (id) => ({ ...running, issueId: id, terminal: `t-${id}` });
  let runs = [mk("a"), mk("b"), mk("c")];
  for (const run of [...runs]) {
    const next = await trackRun({ run, agents: [], terminals: [], comments: [], panelLabel: "x", exec: async () => ok() });
    runs = applyIfCurrent(runs, run, next);
  }
  assert.deepEqual(runs.map((r) => r.state), ["stopped", "stopped", "stopped"]);
});

test("trackRun stops a run whose agent never started after the timeout (now injected)", async () => {
  const run = { ...running, seenWorking: false, startedAt: 1000 };
  const args = { run, agents: [], terminals: [{ address: "term1" }], comments: [], panelLabel: "x", exec: async () => ok() };
  assert.equal((await trackRun({ ...args, now: () => 1000 + 60000 })).state, "running");
  const late = await trackRun({ ...args, now: () => 1000 + 120000 });
  assert.deepEqual([late.state, late.error], ["stopped", "The agent didn't start."]);
});

test("applyIfCurrent ignores a result for a run that was replaced", () => {
  const old = { ...running }, runs = [{ ...running, terminal: "other", startedAt: 9 }];
  assert.equal(applyIfCurrent(runs, old, { ...old, state: "stopped" }), runs);
  assert.equal(applyIfCurrent([], old, old).length, 0);
  const same = [old];
  assert.equal(applyIfCurrent(same, old, { ...old, state: "stopped" })[0].state, "stopped");
});

test("startRun tells the agent only about pull requests open in its own repository", async () => {
  const pr = (number, repoMain) => ({ ...queueRun([], { ...issue, id: `i${number}`, number }, { branch: `tuix-${number}-x`, repoMain, now: 1 })[0], state: "pr_open" });
  const f = fake();
  await start(f, [queued(), pr(12, "/code/app"), pr(13, "/code/other")]);
  const task = JSON.parse(f.calls.find((c) => c[0] === "herdr-app")[3]).task;
  assert.match(task, /#12 on tuix-12-x/);
  assert.doesNotMatch(task, /#13/);
});

test("queueRun keeps the project the run belongs to", () => {
  assert.equal(queueRun([], issue, { branch: "b", repoMain: "/r", projectId: "p9", now: 1 })[0].projectId, "p9");
});
