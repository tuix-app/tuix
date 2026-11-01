// What the list shows, in order. Pure: no host imports. The view draws each row; it never decides which rows exist.

// The confirmation controls, left to right. Cancel first: Yes is never where the Ready button was.
export const CONFIRM = ["cancel", "yes"];

export const SECTIONS = [["open", "Open"], ["fixing", "Being fixed"], ["prOpen", "PR open"], ["inReview", "In review"]];

// Rows: { kind: "header", id, label, count } | { kind: "empty" } |
//   { kind: "issue", issue, section, checkbox, actions } where `actions` lists the controls under the issue, left to right:
//   [] (none), ["ready"] (the Ready for review button) or ["cancel", "yes"] (the confirmation; Cancel comes first,
//   so Yes never sits where the Ready button was).
// `canWrite` / `archived` come from the view; `ready(issue)` says whether Ready for review is offered;
// `asking` is the id of the issue whose confirmation is open.
export function rowsOf(groups, { canWrite = false, archived = false, ready = () => false, asking = null } = {}) {
  const rows = [];
  for (const [id, label] of SECTIONS) {
    const issues = groups[id] ?? [];
    if (!issues.length && id !== "open") continue;
    rows.push({ kind: "header", id, label, count: issues.length });
    if (!issues.length) rows.push({ kind: "empty" });
    for (const issue of issues) {
      const offered = id === "prOpen" && ready(issue);
      rows.push({
        kind: "issue", issue, section: id,
        checkbox: id === "open" && canWrite && !archived,
        actions: !offered ? [] : asking === issue.id ? [...CONFIRM] : ["ready"],
      });
    }
  }
  return rows;
}

// "3 min", "1 h 5 min": time since a run started.
export function elapsed(ms) {
  const min = Math.max(0, Math.floor(ms / 60000));
  if (min < 1) return "under 1 min";
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}

const isHttps = (url) => /^https:\/\/[^\s]+$/.test(String(url ?? ""));

// What a run's row says. `icon`: "spinner" | "dot" | null; `tone`: "alert" | "dim" | null;
// `focus`: a click goes to the agent's terminal (`focusable`: the terminal still exists); `remove`: the Remove action is offered;
// `link`: an https pull request link (opened only on click), else `branch` is shown.
export function runLine(run, now, { focusable = false } = {}) {
  const since = run.startedAt != null ? elapsed(now - run.startedAt) : null;
  const reach = focusable && Boolean(run.terminal);
  const base = { icon: null, tone: "dim", text: "", focus: false, remove: false, link: null, branch: null, stacked: run.stackedOn ?? null };
  switch (run.state) {
    case "queued": return { ...base, text: "queued" };
    case "running": return { ...base, icon: "spinner", tone: null, text: `working · ${since}`, focus: reach };
    case "blocked": return { ...base, icon: "dot", tone: "alert", text: `needs you · ${since}`, focus: reach };
    case "stopped": return { ...base, tone: "alert", remove: true, focus: reach, text: run.error ? `Couldn't start: ${run.error}` : "stopped, needs you" };
    case "pr_open": return { ...base, remove: true, link: isHttps(run.prUrl) ? run.prUrl : null, branch: run.branch };
    default: return base;
  }
}
