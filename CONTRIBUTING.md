# Contributing

Thank you for looking.

## This repository is a mirror

The integrations are developed in Tuix's private repository, next to the server they
talk to, and copied here for each release. Each copy replaces the content of this
repository, so a commit made only here is lost at the next one.

## Issues are welcome

Open an issue for a bug, a question or an idea about any of the packages here: the widget,
the React, Node, Phoenix and Rails integrations, or the WordPress plugin. Say which package
and version you use, what you did, what you expected and what happened. Leave out
project keys, signing keys and personal data.

For a problem with the Tuix service itself, such as your account or your data, write to
support from Tuix instead. For a security problem, follow `SECURITY.md`; do not open a
public issue.

## Changes

A pull request is welcome as a proposal. We cannot merge it here, but we read it, and if
it fits we make the change in the source repository, crediting you, and it arrives here
with the next copy. A small, focused change with a test is the easiest to take. For a
larger change, open an issue first.

By sending a change you agree that it is licensed under the license of the package it
changes: MIT, or GPL-2.0-or-later for the WordPress plugin.

## Checks

From the repository root, `npm ci`, then `npm run typecheck` and `npm test`. The README
of each package lists its own checks; `.github/workflows/ci.yml` runs them all.
