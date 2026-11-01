// Run states, the queue and closing-comment detection. Pure functions; no host imports.
//
// Contract: there is at most ONE run record per issue (keyed by issueId). Every function
// here assumes it. A run is { issueId, number, reference, appUrl, branch, base, stackedOn,
// worktree, terminal, state, queuedAt, startedAt, seenWorking, prUrl }; times are epoch ms.

export const LIMIT = 3;

const ACTIVE = new Set(["running", "blocked"]);

// Queued runs, oldest first, that fit beside ALL active runs (whatever their project or repo: the limit is
// on agents running at once). A queued run starts only while fewer than LIMIT are active; runs whose issue
// is no longer in the list are skipped. With `repoMain`, only that repo's queue is considered (the free
// slots still count every active run).
export function toStart(runs, liveIssueIds, { repoMain } = {}) {
  const active = runs.filter((r) => ACTIVE.has(r.state)).length;
  const slots = Math.max(0, LIMIT - active);
  return runs
    .filter((r) => r.state === "queued" && liveIssueIds.has(r.issueId) && (repoMain === undefined || r.repoMain === repoMain))
    .sort((a, b) => a.queuedAt - b.queuedAt)
    .slice(0, slots);
}

// Next state of a started run from what the agent and its terminal report. A pull request is final.
// A stopped run can still come back: a closing comment opens its PR, and an agent that is listed as
// working or blocked again (the person resumed it) takes it back.
export function advance(run, { agentStatus, terminalAlive, closing }) {
  if (run.state === "pr_open") return run;
  if (closing) return { ...run, state: "pr_open" };
  if (run.state === "stopped") {
    if (!terminalAlive) return run;
    if (agentStatus === "blocked") return { ...run, state: "blocked", seenWorking: true, error: null };
    if (agentStatus === "working") return { ...run, state: "running", seenWorking: true, error: null };
    return run;
  }
  if (!terminalAlive) return { ...run, state: "stopped" };
  if (agentStatus === "blocked") return { ...run, state: "blocked", seenWorking: true };
  if (agentStatus === "working") return { ...run, state: "running", seenWorking: true };
  if ((agentStatus === "idle" || agentStatus === "done") && run.seenWorking) return { ...run, state: "stopped" };
  return run;
}

// The agent's closing reply: the first comment posted through a connection other than the
// panel's own, at or after the run started.
export function closingComment(comments, run, panelLabel) {
  if (run.startedAt == null) return null;
  return (
    (comments ?? []).find(
      (c) => c.via && c.via !== panelLabel && Date.parse(c.inserted_at) >= run.startedAt,
    ) ?? null
  );
}

// Fixes whose pull request is open, so a new fix can stack on them.
// Only the given repo's: a branch pushed in another repository is no base for this one.
export function stackable(runs, repoMain) {
  return runs.filter((r) => r.state === "pr_open" && r.repoMain === repoMain).map((r) => ({ number: r.number, branch: r.branch }));
}

// After a complete read of a project's issues: its PR-open runs whose issue is no longer in progress (moved on,
// closed, or gone) are finished records and go. Other projects' runs, and runs without a projectId, stay;
// a cut-off list proves nothing about what is missing from it.
export function retirePrOpen(runs, projectId, issues, { cut = false } = {}) {
  if (cut) return runs;
  const inProgress = new Set(issues.filter((i) => i.status === "in_progress").map((i) => i.id));
  const kept = runs.filter((r) => !(r.state === "pr_open" && r.projectId === projectId && !inProgress.has(r.issueId)));
  return kept.length === runs.length ? runs : kept;
}

export const START_TIMEOUT = 120000;

// A run that was never seen working or blocked within two minutes of its start (the agent didn't start,
// though its shell is open) is stopped.
export function startTimeout(run, now) {
  if (run.state !== "running" || run.seenWorking || run.startedAt == null || now - run.startedAt < START_TIMEOUT) return run;
  return { ...run, state: "stopped", error: "The agent didn't start." };
}
