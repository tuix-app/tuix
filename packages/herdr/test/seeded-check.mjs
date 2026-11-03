// Regression check: a signed-in mod must render under `herdr-app check`
// (relocate() once called cx.notify() from render, which Herdr refuses).
// Usage: node test/seeded-check.mjs   (copies the mod to a temp folder; writes nothing under the app home)
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "tuix-seeded-"));
const mod = join(dir, "tuix");
try {
  cpSync(new URL("../mods/tuix", import.meta.url).pathname, mod, { recursive: true });
  const file = join(mod, "main.js");
  const marker = "    const auth = read(\"auth\", null);";
  const source = readFileSync(file, "utf8");
  if (!source.includes(marker)) throw new Error("seed marker not found in main.js");
  const base = `    this.client = { call: async () => ({}) }; this.canWrite = true; this.state = "project";
    this.projects = [{ id: "p", name: "Tuix", workspace: "W" }];
`;
  // A thread with comments (the agent's among them), a cached screenshot, context and a reply draft.
  // locKey is set so render() does not relocate (which would leave the thread) before drawing it.
  const thread = `    this.locKey = JSON.stringify(location()); this.project = this.projects[0]; this.me = "member:1";
    this.people = [{ id: "member:1", name: "Maja", team: true, me: true }, { id: "member:2", name: "Jan", team: true }];
    const issue = { id: "i1", number: 17, title: "Reply box loses draft", severity: "major", type: "bug", status: "in_progress", turn: "team", turn_person: "member:1", author: { name: "Anna" } };
    this.issues = [issue]; this.groups = { open: [], fixing: [], prOpen: [issue], inReview: [] }; this.confirming = "i1"; this.paneW = 340;
    this.state = "thread"; this.th = { id: "i1", issue, loading: false, loaded: true, failed: false, cursor: null, sel: 0, open: new Set(["element", "console"]), passOpen: true, replyError: "Nope", sending: false,
      shots: { s1: { path: "mods/tuix/.cache/i1-s1.png" }, s2: { failed: true } },
      comments: [
        { id: "c1", body: "I typed a long answer and it was gone.", inserted_at: "2026-10-31T10:00:00Z", via: null, author: { name: "Anna", team: false } },
        { id: "c2", body: "Draft kept per tab. PR https://github.com/example/app/pull/221", inserted_at: "2026-10-31T11:00:00Z", via: "Claude Code", author: { name: "Maja", team: true } } ],
      context: { page: { route: "/app/issues", environment: "production" },
        element: { tag: "textarea", accessible_name: "Reply", box: { x: 10, y: 20, width: 100, height: 30 }, viewport: { width: 1280, height: 720 }, scroll: { x: 0, y: 0 } },
        browser: { client_hints: { brands: [{ brand: "Google Chrome", version: "141" }], platform: "macOS" } }, console: [{ level: "error", msg: "TypeError" }],
        screenshots: [{ id: "s1", kind: "original", width: 1280, height: 720 }, { id: "s2", kind: "review", width: 1280, height: 720 }] } };
`;
  // The list with a running, a blocked, a stopped ("Couldn't start") and a PR-open run, and one with a queued run.
  const runsSeed = `    const mk = (n, title, status) => ({ id: "r" + n, number: n, title, status, reference: "Tuix #" + n, app_url: "https://tuix.app/i/" + n, turn: "team", author: { name: "Anna" } });
    const [a, b, c, d, e] = [mk(21, "Running fix", "in_progress"), mk(22, "Blocked fix", "in_progress"), mk(23, "Stopped fix", "open"), mk(24, "PR fix", "in_progress"), mk(25, "Queued fix", "open")];
    const run = (i, o) => ({ issueId: i.id, number: i.number, branch: "tuix-" + i.number, terminal: "t" + i.number, queuedAt: 1, startedAt: Date.now() - 600000, seenWorking: true, ...o });
    this.locKey = JSON.stringify(location()); this.project = this.projects[0]; this.me = "member:1"; this.repo = { main: "/code/app", name: "app" }; this.hasOrigin = true;
    const f = mk(26, "Stopped, shell open", "in_progress"); this.issues = [a, b, c, d, e, f]; this.paneW = 340; this.state = "list";
    this.runs = [run(a, { state: "running" }), run(b, { state: "blocked" }), run(c, { state: "stopped", terminal: null, error: "fatal: a worktree already exists" }), run(f, { state: "stopped" }),
      run(d, { state: "pr_open", prUrl: "https://github.com/example/app/pull/9", stackedOn: 12 }), run(e, { state: "queued", startedAt: null, terminal: null })];
    // Four active across two projects: three of them belong to issues that are not listed here.
    this.runs.push(run({ id: "z1", number: 91 }, { state: "running" }), run({ id: "z2", number: 92 }, { state: "blocked" }), run({ id: "z3", number: 93 }, { state: "running" }));
    this.groups = groupIssues(this.issues, this.runs);
`;
  // All projects: issues of two projects (only the matched one can be ticked), your turn in each, an archived project, a PR-open row.
  const allSeed = `    this.projects = [{ id: "p", name: "Tuix", workspace: "W" }, { id: "q", name: "Admin", workspace: "W" }, { id: "r", name: "Old", workspace: "W", archived: true }];
    this.locKey = JSON.stringify(location()); this.all = true; this.project = null; this.fixProject = this.projects[0]; this.paneW = 340; this.state = "list"; // fixProject: by name or the stored pick
    this.repo = { main: "/code/app", name: "app" }; this.hasOrigin = true; this.meBy = { p: "member:1", q: "member:9", r: null }; this.names = { "member:1": "Maja", "member:9": "Jan" };
    const mk = (n, title, status, pid, pname, person) => ({ id: "a" + n, number: n, title, status, projectId: pid, projectName: pname, turn: "team", turn_person: person, author: { name: "Anna" } });
    this.issues = [mk(1, "Admin login loops", "open", "q", "Admin", "member:9"), mk(2, "Old report", "open", "r", "Old", null), mk(3, "Checkout total off", "open", "p", "Tuix", "member:1"), mk(4, "Fixed, ship it", "in_progress", "q", "Admin", "member:9")];
    this.runs = [{ issueId: "a4", number: 4, branch: "tuix-4", terminal: null, state: "pr_open", prUrl: "https://github.com/example/app/pull/4", startedAt: 1, queuedAt: 1 }];
    this.groups = groupIssues(this.issues, this.runs);
`;
  const allPicker = `    this.projects = [{ id: "p", name: "Tuix", workspace: "W" }, { id: "q", name: "Admin", workspace: "W" }];
    this.all = true; this.state = "project";
`;
  let status = 0;
  const asList = thread.replace('this.state = "thread"', 'this.state = "list"');
  const failedLoad = thread.replace("loaded: true, failed: false,", "loaded: false, failed: true,").replace("comments: [", "comments: [], x: [");
  // The sign-in view: idle with a notice, and waiting for approval with a user code (no client, so state stays signin).
  const signinIdle = `    this.client = null; this.state = "signin"; this.notice = "Your Tuix session ended. Sign in again.";
`;
  const signinWaiting = `    this.client = null; this.state = "signin"; this.connecting = false;
    this.device = { user_code: "WDJB-MJHT", verification_uri: "https://tuix.app/device", verification_uri_complete: "https://tuix.app/device?user_code=WDJB-MJHT", expiresAt: Date.now() + 600000, interval: 5 };
`;
  // Each seed is code spliced into init(); it must end in the state it is meant to show (a stray comment once swallowed the state).
  const seeds = [[signinIdle, "signin"], [signinWaiting, "signin"], [base, "project"], [base + thread, "thread"], [base + asList, "list"], [base + failedLoad, "thread"], [base + runsSeed, "list"], [base + allSeed, "list"], [base + allPicker, "project"]];
  for (const [seed, expected] of seeds) {
    const probe = {};
    new Function("location", "groupIssues", seed).call(probe, () => ({}), () => ({ open: [], fixing: [], prOpen: [], inReview: [] }));
    if (probe.state !== expected) throw new Error(`seed ends in state ${probe.state}, expected ${expected}`);
    writeFileSync(file, source.replace(marker, seed + marker));
    const r = spawnSync("herdr-app", ["check", mod], { encoding: "utf8" });
    process.stdout.write(r.stdout + r.stderr);
    status ||= r.status ?? 1;
  }
  process.exitCode = status;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
