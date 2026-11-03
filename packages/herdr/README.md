# Tuix for Herdr

A panel for [Herdr](https://herdr.dev) that shows your Tuix issues beside your terminals: the issues of the project that matches the space you are in, grouped by what is happening to them, with whose turn it is.

## Install

```sh
packages/herdr/install.sh
herdr-app do layout.switch '{"name":"tuix"}'
```

`install.sh` copies the `tuix` and `tuix-tabs` mods and the `tuix` layout into Herdr and checks both mods. The `tuix` layout is Herdr's own with a **Tuix** button in the tab bar; it shows the number of issues waiting for you.

## Sign in

Needs a Tuix server that supports sign-in from Herdr and whose MCP has `reply_to_issue` (see https://tuix.app and https://github.com/tuix-app/tuix).

1. Open the Tuix panel in Herdr, check the address (default `https://tuix.app`) and click **Sign in with Tuix**.
2. The panel shows a code and opens your browser. Check that the code matches, sign in to Tuix if asked, and approve. The panel connects as soon as you do. **Open browser** opens the page again; **Cancel** stops.
3. If you decline or the code runs out, the panel says so; click **Sign in with Tuix** again.

The sign-in is kept in memory only: after Herdr restarts, the panel shows the sign-in view with your address and you approve again (it never opens the browser by itself). The panel refreshes the session in the background and asks you to sign in again when Tuix ends it ("Your Tuix session ended. Sign in again."). It never writes a token to a file, to Herdr's storage or to a log; only the address and the public client id Tuix gave the panel are remembered.

Whether Reply, Fix and Ready for review are available depends on what Tuix lets this connection do; otherwise the panel only lists and opens issues.

Choose **All projects** at the top of the project picker to see the issues of every project your sign-in reaches in one list (Fix only for the project matching the current repository, or the one you last picked for it).

To change the address or the account, click **Sign out** in the panel header (on the project picker or the list). It forgets the session in memory, asks Tuix to revoke it, and leaves any running agents. The panel appears in your Tuix connected apps as "Herdr"; revoke it there to end the sign-in from the server side.

## Agents

- Fix opens a new Herdr space for each issue in a git worktree under `~/.herdr/worktrees/<repo>/<branch>`, running `claude --permission-mode auto`.
- Agents need the Tuix connector in Claude Code, allowed to change issues.
- Fixes run on this computer only for now.
- At most 3 agents run at once, in total; the rest wait in the queue.
- In review is set only by the person's **Ready for review** (then **Yes**). An agent sets it only if the person tells it to in its terminal, after the fix is deployed.

## Recipe

`RECIPE.md` describes the panel in full, for building it from scratch.

## License

MIT (`LICENSE`), except the copies of Herdr's `tabs` mod (`mods/tuix-tabs`) and `main` layout (`layouts/tuix.json`), which remain under the Apache License, Version 2.0 (`LICENSE-APACHE`). `NOTICE` lists what was changed in them.
