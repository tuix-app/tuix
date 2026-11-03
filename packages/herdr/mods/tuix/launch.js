// The view side of fix runs: queue, start (worktree + a new Herdr space with a Claude Code agent) and track.
// Every function takes the View `v`. Nothing here calls cx.notify() synchronously from a render:
// trackSoon only schedules a task, and the task notifies when it is done.
import * as herdr from "herdr";
import { agents, terminals, exec, home } from "herdr";
import { branchName } from "./lib/issues.js";
import { advance, toStart } from "./lib/runs.js";
import { reloadFor } from "./lib/all.js";
import { applyIfCurrent, listedOf, probe, queueRun, removeRun, startRun, trackRun } from "./lib/launch.js";

const GRACE_MS = 5000; // a just-started terminal may not be listed yet
const PAGES = 20;

const active = (r) => r.state === "running" || r.state === "blocked";
// Active runs, and stopped ones whose shell is still open (they may resume or have closed with a comment).
const watched = (r, terms) => active(r) || (r.state === "stopped" && Boolean(r.terminal) && Boolean(listedOf(terms, r)));
// A run on a machine that isn't connected is left as it was: its terminal is missing from terminals()
// only because the machine is away, not because the agent stopped.
// `machines` is read off the module, so a Herdr without it still loads the panel (and treats no machine as connected).
const connected = () => new Set((herdr.machines?.() ?? []).filter((m) => m.name && m.layout === "ready").map((m) => m.name));
const reachable = (r, ready) => !r.machine || ready.has(r.machine);

// Queues the issues (replacing any earlier run of the same issue), then starts what fits.
export function queueFixes(v, issues, cx) {
  const now = Date.now();
  for (const issue of issues) {
    v.runs = queueRun(v.runs, issue, { branch: branchName(issue), repoMain: v.repo?.main ?? null, machine: v.machine ?? null, projectId: issue.projectId ?? v.project?.id ?? null, now });
  }
  for (const issue of issues) v.selected.delete(issue.id); // only what was queued leaves the selection
  v.saveRuns(); v.regroup(); cx.notify();
  cx.spawn(async (cx) => { await pumpRuns(v, cx); });
}

export function dropRun(v, issueId, cx) {
  v.runs = removeRun(v.runs, issueId); v.saveRuns(); v.regroup(); cx.notify();
}

// Starts queued runs while a slot is free. One pump at a time.
export async function pumpRuns(v, cx) {
  if (v.pumping) return;
  v.pumping = true;
  try {
    for (;;) {
      // Before every start: a restored queue must not start under a read-only connection, an archived project,
      // a machine that went away or lacks Claude Code, or after the repo or the sign-in went away. Only the
      // shown space's repo on the shown space's machine starts.
      const repo = v.repo;
      if (!repo || !v.client || v.fixBlock()) break;
      const live = new Set(v.issues.filter((i) => !v.archivedIssue(i) && v.inFixProject(i)).map((i) => i.id));
      const run = toStart(v.runs, live, { repoMain: repo.main, machine: v.machine ?? null })[0];
      if (!run) break;
      const issue = v.issues.find((i) => i.id === run.issueId);
      const next = await startRun({ run, issue, runs: v.runs, repo, home: home(), exec, now: Date.now });
      v.runs = applyIfCurrent(v.runs, run, next);
      v.saveRuns(); v.regroup(); cx.notify();
    }
  } finally {
    v.pumping = false;
  }
}

async function commentsOf(v, id) {
  const comments = []; let cursor = null;
  for (let page = 0; page < PAGES; page++) {
    const r = await v.client.call("get_issue", { id, include: ["page"], ...(cursor ? { cursor } : {}) });
    comments.push(...(r.comments ?? []));
    cursor = r.next_comments_cursor ?? null;
    if (!cursor) break;
  }
  return comments;
}

// Applies what Herdr shows about each active run. With `read`, each active run's issue is read once for the
// agent's closing comment; without it, only a run about to stop is read (so a finished agent isn't missed).
export async function trackRuns(v, cx, read) {
  if (v.tracking || !v.client) return;
  const now = Date.now(), ags = agents(), terms = terminals(), ready = connected();
  const runs = v.runs.filter((r) => reachable(r, ready) && watched(r, terms) && now - (r.startedAt ?? 0) >= GRACE_MS);
  if (!runs.length) return;
  v.tracking = true;
  let changed = false; const changedRuns = [];
  try {
    for (const run of runs) {
      let comments = [];
      const stopping = run.state !== "stopped" && advance(run, { ...probe(run, ags, terms), closing: null }).state === "stopped";
      if (read || stopping) {
        // An unreadable issue (deleted, no access, another Tuix) must not hold a slot forever: track without a comment.
        try { comments = await commentsOf(v, run.issueId); } catch (e) { if (e?.code === "unauthorized") { v.fail(e); break; } }
      }
      const next = await trackRun({ run, agents: ags, terminals: terms, comments, panelLabel: v.panelLabel, exec });
      if (next.state !== run.state || next.seenWorking !== run.seenWorking) {
        const runs = applyIfCurrent(v.runs, run, next);
        if (runs !== v.runs) { v.runs = runs; changed = true; changedRuns.push(run); }
      }
    }
  } finally {
    v.tracking = false;
    if (changed) { v.saveRuns(); v.regroup(); cx.notify(); }
  }
  if (changed) { await v.load(cx, v.all ? reloadFor(changedRuns) : null); await pumpRuns(v, cx); }
}

// Called from render: schedules a track when what Herdr shows about the active runs changed.
export function trackSoon(v, cx) {
  if (v.tracking) return;
  const ags = agents(), terms = terminals(), ready = connected();
  const sig = v.runs.filter((r) => reachable(r, ready) && watched(r, terms)).map((r) => { const p = probe(r, ags, terms); return `${r.terminal}:${p.agentStatus}:${p.terminalAlive}`; }).join("|");
  if (sig === v.trackSig) return;
  v.trackSig = sig;
  cx.spawn(async (cx) => { await trackRuns(v, cx, false); });
}
