// Issue helpers for the panel: project matching, grouping, turn labels, counts, branch names.
// Pure functions; no host imports.

const FINISHED = new Set(["fixed", "closed"]);
// What people see: open, fix_ready, fixed, closed. Servers send `state`; an older one only the status.
const BY_STATUS = { open: "open", in_progress: "open", acknowledged: "open", fixed_awaiting_deploy: "open", in_review: "fix_ready", awaiting_verification: "fix_ready", done: "fixed", resolved: "fixed", closed: "closed", wont_fix: "closed" };
const STATE_WORDS = new Set(["open", "fix_ready", "fixed", "closed"]);
export const STATE_LABEL = { open: "Open", fix_ready: "Fix ready", fixed: "Fixed", closed: "Closed" };
export function stateOf(issue) {
  if (STATE_WORDS.has(issue?.state)) return issue.state;
  return BY_STATUS[issue?.status] ?? "open";
}
const FIXING_RUN_STATES = new Set(["queued", "running", "blocked", "stopped"]);

export function matchProject(repoName, projects) {
  const wanted = String(repoName ?? "").toLowerCase();
  const hits = projects.filter((p) => String(p.name ?? "").toLowerCase() === wanted);
  return hits.length === 1 ? { project: hits[0] } : { choices: projects };
}

// Each issue lands in exactly one group, once, however often the list names it.
// A PR-open issue a person replied to since (`reopened` on its run) is open again: it can be fixed again.
export function groupIssues(issues, runs) {
  const runByIssue = new Map();
  for (const r of runs) runByIssue.set(r.issueId, r);
  const groups = { open: [], fixing: [], prOpen: [], inReview: [] }, seen = new Set();
  for (const issue of issues) {
    if (seen.has(issue.id)) continue;
    seen.add(issue.id);
    const shown = stateOf(issue);
    if (FINISHED.has(shown)) continue;
    const run = runByIssue.get(issue.id), state = run?.state;
    if (shown === "fix_ready") groups.inReview.push(issue);
    else if (state === "pr_open" && !run.reopened) groups.prOpen.push(issue);
    else if (state === "pr_open") groups.open.push(issue);
    else if (FIXING_RUN_STATES.has(state)) groups.fixing.push(issue);
    else groups.open.push(issue);
  }
  return groups;
}

export function turnLabel(issue, { me, names }) {
  if (!issue.turn) return "";
  const person = issue.turn_person ?? null;
  if (me && person === me) return "Your turn";
  const known = person ? names?.[person] : undefined;
  const author = issue.author?.name;
  if (issue.turn === "verify") return `Waiting for ${known ?? author ?? "the reporter"} to check the fix`;
  if (issue.turn === "reporter") return `Waiting for ${known ?? author ?? "the reporter"} (reporter)`;
  if (!person) return "Unclaimed";
  return `Waiting for ${known ?? "the team"}`;
}

// Is the issue waiting for this person? Without an id (a connection that can't list people): the team's turn.
export function isYourTurn(issue, me) {
  if (FINISHED.has(stateOf(issue))) return false;
  return me ? issue.turn_person === me : issue.turn === "team";
}

export function yourTurnCount(issues, me) {
  return issues.filter((issue) => isYourTurn(issue, me)).length;
}

export function branchName(issue) {
  const slug = String(issue.title ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug ? `tuix-${issue.number}-${slug}` : `tuix-${issue.number}`;
}

// When the folder changes: keep the open list or thread if it lands in the same repo and project
// (a subfolder, a cd, a new space of the same repo), else start over at the new project.
export function relocation({ state, key }, next) {
  return next.hasProject && key === next.key && (state === "list" || state === "thread") ? "keep" : "reset";
}
