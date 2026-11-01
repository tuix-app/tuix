// Starting and tracking fix runs. Pure orchestration over an injected exec(cmd, args, { cwd }) and
// clock; no host imports. The agent gets only fixPrompt's text: never the Tuix token.
import { addWorktree, defaultBase, prUrl, remoteIsGithub, worktreePath } from "./git.js";
import { fixPrompt } from "./prompt.js";
import { advance, closingComment, stackable, startTimeout } from "./runs.js";

export const AGENT_ARGV = ["claude", "--permission-mode", "auto"];

// A queued run for an issue; it replaces any earlier record of the same issue.
export function queueRun(runs, issue, { branch, repoMain, projectId = null, now }) {
  const run = {
    issueId: issue.id, number: issue.number, title: issue.title ?? "", reference: issue.reference, appUrl: issue.app_url,
    branch, base: null, stackedOn: null, worktree: null, terminal: null, state: "queued",
    queuedAt: now, startedAt: null, seenWorking: false, prUrl: null, error: null, repoMain, projectId,
  };
  return [...runs.filter((r) => r.issueId !== issue.id), run];
}

export const removeRun = (runs, issueId) => runs.filter((r) => r.issueId !== issueId);

// The arguments of `herdr-app do space.new`. The space stays unnamed; Herdr's spaces mod nests it under the repo's space by git worktree linkage, not by name.
export const spaceNewArgs = ({ worktree, task }) =>
  ["do", "space.new", JSON.stringify({ folder: worktree, argv: AGENT_ARGV, task })];

// stdout is {"space","tab","terminal"} or {"error"} (exit 1).
export function parseSpaceNew({ code, stdout, stderr }) {
  let out = null;
  try { out = JSON.parse(stdout); } catch { /* not JSON */ }
  if (code !== 0 || !out || out.error || !out.terminal) {
    throw new Error(String(out?.error ?? (stderr || "").trim() ?? "") || "Herdr did not start the agent.");
  }
  return { space: out.space, tab: out.tab, terminal: out.terminal };
}

// Does `git worktree list --porcelain` already list a worktree at `path`?
export const hasWorktree = (porcelain, path) =>
  String(porcelain ?? "").split("\n").some((line) => line === `worktree ${path}`);

// Reuses the worktree of an earlier try, else adds one.
async function worktreeFor({ repo, branch, base, home, exec }) {
  const path = worktreePath({ repo, branch, home });
  let listed = null;
  try { listed = await exec("git", ["worktree", "list", "--porcelain"], { cwd: repo.main }); } catch { /* add instead */ }
  if (listed?.code === 0 && hasWorktree(listed.stdout, path)) return path;
  return addWorktree({ repo, branch, base, home, exec });
}

// Starts one queued run. Never throws: a failure leaves the run stopped with the reason in `error`.
export async function startRun({ run, issue, runs, repo, home, exec, now }) {
  try {
    const base = await defaultBase(repo, exec);
    const worktree = await worktreeFor({ repo, branch: run.branch, base, home, exec });
    const task = fixPrompt({ issue, branch: run.branch, stackable: stackable(runs, repo.main) });
    const space = parseSpaceNew(await exec("herdr-app", spaceNewArgs({ worktree, task }), {}));
    return { ...run, base, worktree, terminal: space.terminal, state: "running", startedAt: now(), seenWorking: false, error: null };
  } catch (e) {
    return { ...run, state: "stopped", error: String(e?.message ?? e) };
  }
}

// "stacked on #12" in the agent's closing reply.
export function stackedOn(comment) {
  const m = /stacked on #(\d+)/i.exec(String(comment?.body ?? ""));
  return m ? Number(m[1]) : null;
}

// What the host shows about a run's agent and terminal, given agents() and terminals().
// `shellAlive`: the terminal exists (Herdr keeps the shell open after the agent exits).
// `terminalAlive`: the agent's terminal is usable; a run that has worked and is no longer listed
// among the agents has exited, however alive its shell is.
export function probe(run, agents, terminals) {
  const listed = agents.find((a) => a.address === run.terminal);
  const shellAlive = terminals.some((t) => t.address === run.terminal);
  return { agentStatus: listed?.status ?? null, shellAlive, terminalAlive: shellAlive && !(run.seenWorking && !listed) };
}

// The next record of a started run. On the move to PR open: the stack it names and the pull request link
// (GitHub remotes only; otherwise the branch is what the row shows).
export async function trackRun({ run, agents, terminals, comments, panelLabel, exec, now = Date.now }) {
  const closing = closingComment(comments, run, panelLabel);
  const next = startTimeout(advance(run, { ...probe(run, agents, terminals), closing }), now());
  if (next.state !== "pr_open" || run.state === "pr_open") return next;
  // The run's own worktree is the place to ask, whichever repo the panel shows now.
  const github = run.worktree ? await remoteIsGithub({ top: run.worktree }, exec) : false;
  return { ...next, stackedOn: stackedOn(closing), prUrl: github ? await prUrl(run.worktree, run.branch, exec) : null };
}

// Replaces the record of `snapshot` with `next` only if that record is still the same run (same
// terminal and start): a result computed before an await must not overwrite a newer run of the issue.
export function applyIfCurrent(runs, snapshot, next) {
  const cur = runs.find((r) => r.issueId === snapshot.issueId);
  if (!cur || cur.terminal !== snapshot.terminal || cur.startedAt !== snapshot.startedAt) return runs;
  return runs.map((r) => (r === cur ? next : r));
}
