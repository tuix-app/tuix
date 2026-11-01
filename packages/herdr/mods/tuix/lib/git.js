// Git and GitHub CLI helpers over an injected exec(cmd, args, { cwd }) ->
// Promise<{ code, stdout, stderr }>. exec has no shell: arguments are always
// passed as an array. It rejects only when the program cannot start, which
// is treated here like any other failure.

const run = async (exec, cmd, args, cwd) => {
  try {
    const r = await exec(cmd, args, { cwd });
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (e) {
    return { code: -1, stdout: "", stderr: String(e?.message ?? e) };
  }
};

export async function repoOf(folder, exec) {
  const top = await run(exec, "git", ["rev-parse", "--show-toplevel"], folder);
  if (top.code !== 0) return null;
  const common = await run(exec, "git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], folder);
  if (common.code !== 0) return null;
  const topPath = top.stdout.trim();
  const commonDir = common.stdout.trim();
  if (!topPath || !commonDir) return null;
  const main = commonDir.replace(/\/\.git\/?$/, "");
  return { top: topPath, main, name: main.split("/").filter(Boolean).pop() };
}

export async function defaultBase(repo, exec) {
  const r = await run(exec, "git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repo.main);
  const base = r.stdout.trim();
  if (r.code !== 0 || !base) throw new Error("No origin remote to branch from.");
  return base;
}

export const worktreePath = ({ repo, branch, home }) => `${home}/.herdr/worktrees/${repo.name}/${branch}`;

export async function addWorktree({ repo, branch, base, home, exec }) {
  const path = worktreePath({ repo, branch, home });
  await run(exec, "git", ["fetch", "origin"], repo.main);
  const exists = await run(exec, "git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], repo.top);
  const args = exists.code === 0 ? ["worktree", "add", path, branch] : ["worktree", "add", "-b", branch, path, base];
  const r = await run(exec, "git", args, repo.top);
  if (r.code !== 0) throw new Error(r.stderr.trim() || `git worktree add failed (${r.code})`);
  return path;
}

export async function remoteIsGithub(repo, exec) {
  const r = await run(exec, "git", ["remote", "get-url", "origin"], repo.top);
  return r.code === 0 && r.stdout.includes("github.com");
}

export async function prUrl(worktree, branch, exec) {
  const r = await run(exec, "gh", ["pr", "view", branch, "--json", "url", "-q", ".url"], worktree);
  const url = r.stdout.trim();
  return r.code === 0 && url ? url : null;
}
