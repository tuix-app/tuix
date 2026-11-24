// What the list shows, in order. Pure: no host imports. The view draws each row; it never decides which rows exist.

// The confirmation controls, left to right. Cancel first: Yes is never where the Ready button was.
export const CONFIRM = ["cancel", "yes"];

export const SECTIONS = [["open", "Open"], ["fixing", "Being fixed"], ["prOpen", "PR open"], ["inReview", "Fix ready"]];

// Rows: { kind: "header", id, label, count } | { kind: "empty" } |
//   { kind: "issue", issue, section, checkbox, actions } where `actions` lists the controls under the issue, left to right:
//   [] (none), ["ready"] (the Fix ready button) or ["cancel", "yes"] (the confirmation; Cancel comes first,
//   so Yes never sits where the Ready button was).
// `canWrite` / `archived` come from the view; `ready(issue)` says whether Fix ready is offered;
// `checkable(issue)` says whether the issue can be ticked for Fix (All projects: only the matched project's).
// `asking` is the id of the issue whose confirmation is open.
export function rowsOf(groups, { canWrite = false, archived = false, ready = () => false, asking = null, checkable = () => true } = {}) {
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
        checkbox: id === "open" && canWrite && !archived && checkable(issue),
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
// A PR-open run whose agent keeps going (`auto`) shows what the agent is doing while its terminal is there. Remove is
// not offered while it works or waits for the person: removing the record would not stop the agent.
export function runLine(run, now, { focusable = false, agentStatus = null } = {}) {
  const since = run.startedAt != null ? elapsed(now - run.startedAt) : null;
  const reach = focusable && Boolean(run.terminal);
  const base = { icon: null, tone: "dim", text: "", focus: false, remove: false, link: null, branch: null, stacked: run.stackedOn ?? null };
  switch (run.state) {
    case "queued": return { ...base, text: "queued" };
    case "running": return { ...base, icon: "spinner", tone: null, text: `working · ${since}`, focus: reach };
    case "blocked": return { ...base, icon: "dot", tone: "alert", text: `needs you · ${since}`, focus: reach };
    case "stopped": return { ...base, tone: "alert", remove: true, focus: reach, text: run.error ? `Couldn't start: ${run.error}` : "stopped, needs you" };
    case "pr_open": {
      const pr = { ...base, remove: true, link: isHttps(run.prUrl) ? run.prUrl : null, branch: run.branch };
      if (run.auto && agentStatus === "blocked") return { ...pr, remove: false, icon: "dot", tone: "alert", text: "needs you", focus: reach };
      if (run.auto && agentStatus === "working") return { ...pr, remove: false, icon: "spinner", tone: null, text: run.auto === "review" ? "merging, then Fix ready once deployed" : "merging when checks pass", focus: reach };
      // Idle or done with the issue not yet Fix ready: it merged and has nothing more to do, or it stopped to ask.
      // The row can't tell which, so it points at the terminal.
      if (run.auto && reach && (agentStatus === "idle" || agentStatus === "done")) return { ...pr, text: "agent idle · check its terminal", focus: true };
      return pr;
    }
    default: return base;
  }
}
