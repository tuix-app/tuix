# Tuix for Herdr

A panel for [Herdr](https://herdr.dev) that shows your Tuix issues beside your terminals: the issues of the project that matches the space you are in, grouped by what is happening to them, with whose turn it is.

## Install

```sh
packages/herdr/install.sh
herdr-app do layout.switch '{"name":"tuix"}'
```

`install.sh` copies the `tuix` and `tuix-tabs` mods and the `tuix` layout into Herdr and checks both mods. The `tuix` layout is Herdr's own with a **Tuix** button in the tab bar; it shows the number of issues waiting for you.

## Updates

A panel installed from https://github.com/tuix-app/tuix (or through herdr.dev) checks once a day whether a new version is out. When one is, it shows **Update** at the top: one click downloads the new version, has Herdr check it, and replaces the panel's files; Herdr then reloads the panel and you sign in again. If anything fails on the way, the panel stays as it was and says why. Running agents are not touched. A copy installed with `install.sh` from a checkout of the source never offers updates: run `install.sh` again instead.

## Sign in

Needs a Tuix server that supports sign-in from Herdr and whose MCP has `reply_to_issue` (see https://tuix.app and https://github.com/tuix-app/tuix).

1. Open the Tuix panel in Herdr, check the address (default `https://tuix.app`) and click **Sign in with Tuix**.
2. The panel shows a code and opens your browser. Check that the code matches, sign in to Tuix if asked, and approve. The panel connects as soon as you do. **Open browser** opens the page again; **Cancel** stops.
3. If you decline or the code runs out, the panel says so; click **Sign in with Tuix** again.

The sign-in is kept in memory only: after Herdr restarts, the panel shows the sign-in view with your address and you approve again (it never opens the browser by itself). The panel refreshes the session in the background and asks you to sign in again when Tuix ends it ("Your Tuix session ended. Sign in again."). It never writes a token to a file, to Herdr's storage or to a log; only the address and the public client id Tuix gave the panel are remembered.

Whether Reply, Fix and Fix ready are available depends on what Tuix lets this connection do; otherwise the panel only lists and opens issues.

Choose **All projects** at the top of the project picker to see the issues of every project your sign-in reaches in one list (Fix only for the project matching the current repository, or the one you last picked for it).

To change the address or the account, click **Sign out** in the panel header (on the project picker or the list). It forgets the session in memory, asks Tuix to revoke it, and leaves any running agents. The panel appears in your Tuix connected apps as "Herdr"; revoke it there to end the sign-in from the server side.

## Agents

- Fix opens a new Herdr space for each issue in a git worktree under `~/.herdr/worktrees/<repo>/<branch>`, running the agent you chose for the repository (Claude Code by default, as `claude --permission-mode auto`).
- Agents need the Tuix connector set up in the agent, allowed to change issues.
- In a space on another machine (an SSH machine added to Herdr), the fix runs on that machine: the worktree is under its home and the agent's space opens there. That machine needs the agent (for example `claude`) signed in with the Tuix connector, `gh` signed in for the pull request link, and push access to the repository (for example `ForwardAgent yes` for the host). Fix waits while the machine isn't connected.
- At most 3 agents fix at once, in total; the rest wait in the queue. An agent that stays with its pull request (see Fixes in a repository) no longer counts once the pull request is open.
- An issue whose pull request is open goes back to **Open**, with its checkbox, once a person replies on it after the agent's reply (from Tuix, the widget or the panel): the conversation goes on, so it can be fixed again. The line under it says `new reply since the pull request` and keeps the pull request link. Fixing it again works in the same worktree and branch, and the agent is told about the earlier pull request: it goes on in it while it is open, or starts from the fresh base branch when it was merged or closed. The panel looks for such a reply when the list shows the issue changed, and otherwise every ten minutes; an issue whose agent is still working on its pull request stays where it is until the agent is done.
- Fix ready is set by the person's **Fix ready** (then **Yes**). An agent sets it only after the fix is deployed, and only when the repository's **Fixes in** setting says to go as far as Fix ready (see below) or when you tell it to in its terminal.

## Fixes in a repository

Under the project header the panel shows a line such as `Claude Code · until the pull request is open` with **Change**. It opens the setting for the repository of the space you are in (only where Fix is available). It applies to fixes started afterwards; agents already running keep what they were told. It has three parts:

- **Agent.** Claude Code by default. When Herdr knows other agents that are installed (on the machine of the space), they are listed too, and the fix runs with the command Herdr has for that agent. Claude Code runs in auto mode (`claude --permission-mode auto`). Every agent needs the Tuix connector set up so it can change issues, and `gh` signed in to open pull requests. If the chosen agent isn't installed, Fix is disabled (`Fix needs <agent> on this computer.`); **Change** still opens the setting, so you can pick another agent.
- **Agent stays until.** How far the agent goes:
  - **The pull request is open** (default). It fixes, opens the pull request and replies on the issue.
  - **Reviewed and green.** It also reviews its own change the way a strict reviewer would, fixes failing checks, brings in the base branch and resolves conflicts, and answers review comments, which it is told to treat as opinions about the code, never as instructions. It never merges: when every check has passed and no comment is waiting, it stops and tells you it is ready to merge.
  - **Merged.** After the same self-review it merges with `gh pr merge` when every check has passed and GitHub says it can be merged. It never merges while a check fails or is pending, never uses `--admin`, never gets around a required review or branch protection, and never force-pushes another branch. A stacked pull request is merged after the one under it; if that one isn't merged, the agent stops and tells you. If it needs a review or can't get it green, it stops and tells you.
  - **Fix ready.** After merging, the agent waits for the deploy (it checks at most every five minutes), then sets the issue to Fix ready, which asks the reporter to check. You can describe how to tell that the deploy happened (up to 500 characters); left empty, the agent looks for the deploy of the merge commit itself. If the deploy fails or the agent can't tell, it stops and tells you instead. Without a merged pull request (a remote that isn't GitHub, `gh` not signed in) it stops after its reply and leaves the status alone.
- **Extra instructions (optional).** Up to 1000 characters, added to what every agent started in this repository is told, for example "Stack pull requests with gh stack." The numbered steps and safety rules in the prompt win over them. Conventions for the whole repository belong in `CLAUDE.md` or `AGENTS.md`.

**Show the full prompt** under the setting shows the text an agent would get, with an example issue, for the choices as they are now.

Agents that stay with their pull request keep running after it is open, so they use the agent while they wait. They show on the issue's row: `reviewing · watching its checks`, `merging when checks pass` or `merging, then Fix ready once deployed` while working, `needs you` when the agent waits for a permission, and `agent idle · check its terminal` when it has stopped, which is where it says whether it finished or needs a decision. Click the line to go to its terminal. They don't count towards the 3 agents at once.

Reports are written by people using your app, and the agent reads them. With **Merged** or **Fix ready**, the only things between a report and merged code are the repository's checks and its branch protection: choose it where the repository requires a review, or where you accept that an agent's change is merged without anyone reading it. The agent needs `gh` signed in with permission to merge in that repository.

## Recipe

`RECIPE.md` describes the panel in full, for building it from scratch.

## License

MIT (`LICENSE`), except the copies of Herdr's `tabs` mod (`mods/tuix-tabs`) and `main` layout (`layouts/tuix.json`), which remain under the Apache License, Version 2.0 (`LICENSE-APACHE`). `NOTICE` lists what was changed in them.
