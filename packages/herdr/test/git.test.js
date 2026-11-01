import assert from "node:assert/strict";
import { test } from "node:test";
import { addWorktree, defaultBase, prUrl, remoteIsGithub, repoOf } from "../mods/tuix/lib/git.js";

const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const fail = (stderr = "") => ({ code: 1, stdout: "", stderr });
const fakeExec = (script) => {
  const calls = [];
  const exec = async (cmd, args, opts = {}) => {
    const key = [cmd, ...args].join(" ");
    calls.push({ key, cwd: opts.cwd });
    if (!(key in script)) throw new Error(`unscripted: ${key}`);
    const r = script[key];
    if (r instanceof Error) throw r;
    return r;
  };
  exec.calls = calls;
  return exec;
};
const repo = { top: "/r", main: "/r", name: "r" };

test("repoOf outside a repo", async () => {
  assert.equal(await repoOf("/tmp", fakeExec({ "git rev-parse --show-toplevel": fail("not a repo") })), null);
  assert.equal(await repoOf("/tmp", fakeExec({})), null);
});

test("repoOf in a linked worktree points at the main checkout", async () => {
  const e = fakeExec({
    "git rev-parse --show-toplevel": ok("/w\n"),
    "git rev-parse --path-format=absolute --git-common-dir": ok("/r/.git\n"),
  });
  assert.deepEqual(await repoOf("/w", e), { top: "/w", main: "/r", name: "r" });
  assert.equal(e.calls[0].cwd, "/w");
});

test("defaultBase reads origin/HEAD", async () => {
  const e = fakeExec({ "git symbolic-ref --short refs/remotes/origin/HEAD": ok("origin/main\n") });
  assert.equal(await defaultBase(repo, e), "origin/main");
});

test("defaultBase without origin", async () => {
  await assert.rejects(defaultBase(repo, fakeExec({})), /No origin remote/);
  await assert.rejects(defaultBase(repo, fakeExec({ "git symbolic-ref --short refs/remotes/origin/HEAD": fail("x") })), /No origin remote/);
});

test("addWorktree branches from the base", async () => {
  const e = fakeExec({
    "git fetch origin": ok(),
    "git show-ref --verify --quiet refs/heads/tuix-17-x": fail(),
    "git worktree add -b tuix-17-x /h/.herdr/worktrees/r/tuix-17-x origin/main": ok(),
  });
  assert.equal(await addWorktree({ repo, branch: "tuix-17-x", base: "origin/main", home: "/h", exec: e }), "/h/.herdr/worktrees/r/tuix-17-x");
  assert.equal(e.calls[0].cwd, "/r");
  assert.equal(e.calls[2].cwd, "/r");
});

test("addWorktree reuses an existing branch", async () => {
  const e = fakeExec({
    "git fetch origin": ok(),
    "git show-ref --verify --quiet refs/heads/b": ok(),
    "git worktree add /h/.herdr/worktrees/r/b b": ok(),
  });
  assert.equal(await addWorktree({ repo, branch: "b", base: "origin/main", home: "/h", exec: e }), "/h/.herdr/worktrees/r/b");
});

test("addWorktree throws with git's stderr", async () => {
  const e = fakeExec({
    "git fetch origin": ok(),
    "git show-ref --verify --quiet refs/heads/b": fail(),
    "git worktree add -b b /h/.herdr/worktrees/r/b origin/main": fail("fatal: boom"),
  });
  await assert.rejects(addWorktree({ repo, branch: "b", base: "origin/main", home: "/h", exec: e }), /fatal: boom/);
});

test("remoteIsGithub", async () => {
  const k = "git remote get-url origin";
  assert.equal(await remoteIsGithub(repo, fakeExec({ [k]: ok("https://github.com/a/b.git\n") })), true);
  assert.equal(await remoteIsGithub(repo, fakeExec({ [k]: ok("https://example.com/a/b\n") })), false);
  assert.equal(await remoteIsGithub(repo, fakeExec({})), false);
});

test("prUrl returns the url or null", async () => {
  const k = "gh pr view b --json url -q .url";
  assert.equal(await prUrl("/w", "b", fakeExec({ [k]: ok("https://github.com/a/b/pull/1\n") })), "https://github.com/a/b/pull/1");
  assert.equal(await prUrl("/w", "b", fakeExec({ [k]: fail("no pr") })), null);
  assert.equal(await prUrl("/w", "b", fakeExec({ [k]: ok("\n") })), null);
});

test("prUrl is null without gh", async () => {
  assert.equal(await prUrl("/w", "b", fakeExec({})), null);
});
