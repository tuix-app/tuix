# Tuix for Herdr

A panel for [Herdr](https://herdr.dev) that shows your Tuix issues beside your terminals: the issues of the project that matches the space you are in, grouped by what is happening to them, with whose turn it is.

## Install

```sh
packages/herdr/install.sh
herdr-app do layout.switch '{"name":"tuix"}'
```

`install.sh` copies the `tuix` and `tuix-tabs` mods and the `tuix` layout into Herdr and checks both mods. The `tuix` layout is Herdr's own with a **Tuix** button in the tab bar; it shows the number of issues waiting for you.

## Sign in

Needs a Tuix server whose MCP has `reply_to_issue` (see https://tuix.app and https://github.com/tuix-app/tuix).

1. In Tuix, open Project settings, then AI, and create a token. Choose "Let it change status and assignee, and reply" if you want Reply, Fix and Ready for review; a read-only token only lists and opens issues.
2. Open the Tuix panel in Herdr. On macOS the token goes into the Keychain with this command, run in a terminal (the panel shows it with your address filled in):

   ```sh
   security add-generic-password -s "Tuix for Herdr" -a <tuix origin> -T "" -U -w
   ```

   Run the command first, and copy the token from Tuix only when it asks for a password: the command and the token share the clipboard, so copying the command afterwards would replace the token. Paste the token at the prompt, then click **Connect**. When macOS asks whether the panel may read it, click **Allow**, never **Always Allow**: that would let any Herdr mod read the token. Elsewhere, paste the token into the panel; it is kept in memory only, so paste it again after Herdr restarts.

The panel never writes the token to a file, to Herdr's storage or to a log.

To change the address or the token, click **Sign out** in the panel header (on the project picker or the list). It forgets the connection in memory only; the Keychain item and any running agents stay. Run the command again with `-U` to replace a token in the Keychain.

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
