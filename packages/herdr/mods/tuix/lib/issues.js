// Issue helpers for the panel: project matching, grouping, turn labels, counts, branch names.
// Pure functions; no host imports.

const FINISHED = new Set(["done", "closed"]);
const FIXING_RUN_STATES = new Set(["queued", "running", "blocked", "stopped"]);

export function matchProject(repoName, projects) {
  const wanted = String(repoName ?? "").toLowerCase();
  const hits = projects.filter((p) => String(p.name ?? "").toLowerCase() === wanted);
  return hits.length === 1 ? { project: hits[0] } : { choices: projects };
}

export function groupIssues(issues, runs) {
  const stateByIssue = new Map();
  for (const r of runs) stateByIssue.set(r.issueId, r.state);
  const groups = { open: [], fixing: [], prOpen: [], inReview: [] };
  for (const issue of issues) {
    if (FINISHED.has(issue.status)) continue;
    const state = stateByIssue.get(issue.id);
    if (issue.status === "in_review") groups.inReview.push(issue);
    else if (state === "pr_open" && issue.status === "in_progress") groups.prOpen.push(issue);
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
  if (!person) return "Waiting for the team, nobody assigned";
  return `Waiting for ${known ?? "the team"}`;
}

// Is the issue waiting for this person? Without an id (a connection that can't list people): the team's turn.
export function isYourTurn(issue, me) {
  if (FINISHED.has(issue.status)) return false;
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
