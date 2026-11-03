// Starting and tracking fix runs. Pure orchestration over an injected exec(cmd, args, { cwd, on }) and
// clock; no host imports. The agent gets only fixPrompt's text: never the Tuix token.
// A run belongs to one machine (`machine`, null for this computer): its git and gh commands run there
// through exec's `on`, and Herdr opens its space there. Only `herdr-app` itself always runs here.
import { addWorktree, defaultBase, prUrl, remoteIsGithub, worktreePath } from "./git.js";
import { fixPrompt } from "./prompt.js";
import { advance, closingComment, stackable, startTimeout } from "./runs.js";

export const AGENT_ARGV = ["claude", "--permission-mode", "auto"];

// A queued run for an issue; it replaces any earlier record of the same issue.
export function queueRun(runs, issue, { branch, repoMain, machine = null, projectId = null, now }) {
  const run = {
    issueId: issue.id, number: issue.number, title: issue.title ?? "", reference: issue.reference, appUrl: issue.app_url,
    branch, base: null, stackedOn: null, worktree: null, terminal: null, state: "queued",
    queuedAt: now, startedAt: null, seenWorking: false, prUrl: null, error: null, repoMain, machine, projectId,
  };
  return [...runs.filter((r) => r.issueId !== issue.id), run];
}

export const removeRun = (runs, issueId) => runs.filter((r) => r.issueId !== issueId);

// The arguments of `herdr-app do space.new`. The space stays unnamed; Herdr's spaces mod nests it under the repo's space by git worktree linkage, not by name.
// With `machine`, the space (and the agent's terminal) opens on that machine; without, on this computer.
export const spaceNewArgs = ({ worktree, task, machine = null }) =>
  ["do", "space.new", JSON.stringify({ folder: worktree, argv: AGENT_ARGV, task, ...(machine ? { machine } : {}) })];

// An exec that runs on the run's machine (unchanged for this computer).
export const execOn = (exec, machine) => (machine ? (cmd, args, opts) => exec(cmd, args, { ...opts, on: machine }) : exec);

// Remote terminal addresses carry a `<machine>/` prefix in agents() and terminals(); add it if Herdr
// returned the address local to that machine.
export const qualify = (terminal, machine) => (machine && terminal && !terminal.startsWith(`${machine}/`) ? `${machine}/${terminal}` : terminal);

// The home folder on another machine (worktrees go under it there). `exec` already runs on that machine.
export async function remoteHome(exec, machine) {
  let r = null;
  try { r = await exec("printenv", ["HOME"], {}); } catch { /* unreachable: reported below */ }
  const home = r?.code === 0 ? String(r.stdout ?? "").trim() : "";
  if (!home.startsWith("/")) throw new Error(`Couldn't find the home folder on ${machine}.`);
  return home;
}

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

// Is Claude Code known NOT to be installed on the machine? `known` is knownAgents()'s list; an agent
// Herdr doesn't list (or a failed check, null) proves nothing, so only an explicit "not installed" counts.
export function claudeMissing(known) {
  const isClaude = (a) => [a?.id, a?.name, String(a?.run?.[0] ?? "").split("/").pop()].some((x) => String(x ?? "").toLowerCase() === "claude");
  const entry = (known ?? []).find(isClaude);
  return Boolean(entry) && entry.installed === false;
}

// Starts one queued run. Never throws: a failure leaves the run stopped with the reason in `error`.
// `home` is this computer's; a run on another machine asks that machine for its own.
export async function startRun({ run, issue, runs, repo, home, exec, now }) {
  const machine = run.machine ?? null, there = execOn(exec, machine);
  try {
    const base = await defaultBase(repo, there);
    const homeDir = machine ? await remoteHome(there, machine) : home;
    const worktree = await worktreeFor({ repo, branch: run.branch, base, home: homeDir, exec: there });
    const task = fixPrompt({ issue, branch: run.branch, stackable: stackable(runs, repo.main) });
    const space = parseSpaceNew(await exec("herdr-app", spaceNewArgs({ worktree, task, machine }), {}));
    return { ...run, base, worktree, terminal: qualify(space.terminal, machine), state: "running", startedAt: now(), seenWorking: false, error: null };
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
  // The run's own worktree, on its own machine, is the place to ask, whichever repo the panel shows now.
  const there = execOn(exec, run.machine ?? null);
  const github = run.worktree ? await remoteIsGithub({ top: run.worktree }, there) : false;
  return { ...next, stackedOn: stackedOn(closing), prUrl: github ? await prUrl(run.worktree, run.branch, there) : null };
}

// Replaces the record of `snapshot` with `next` only if that record is still the same run (same
// terminal and start): a result computed before an await must not overwrite a newer run of the issue.
export function applyIfCurrent(runs, snapshot, next) {
  const cur = runs.find((r) => r.issueId === snapshot.issueId);
  if (!cur || cur.terminal !== snapshot.terminal || cur.startedAt !== snapshot.startedAt) return runs;
  return runs.map((r) => (r === cur ? next : r));
}
