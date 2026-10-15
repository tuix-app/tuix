# Tuix integrations

[Tuix](https://tuix.app) puts element-anchored feedback on your web application: your
team points at anything on a page and leaves a comment, with a screenshot, and you
triage it in Tuix. This repository holds what you install into your own application
to do that. Tuix itself is a hosted service; its server is not here.

| Directory | Package | What it is |
| --- | --- | --- |
| `packages/widget` | [`@tuix/widget`](https://www.npmjs.com/package/@tuix/widget) (npm) | The browser widget, for a bundler or a script tag |
| `packages/react` | [`@tuix/react`](https://www.npmjs.com/package/@tuix/react) (npm) | React 19 and Next.js lifecycle around the widget |
| `packages/server` | [`@tuix/server`](https://www.npmjs.com/package/@tuix/server) (npm) | Server-side identity signing for Node.js and Next.js |
| `packages/mcp` | [`@tuix/mcp`](https://www.npmjs.com/package/@tuix/mcp) (npm) | A local MCP server, so AI clients can read your Tuix reports |
| `packages/phoenix` | [`tuix_phoenix`](https://hex.pm/packages/tuix_phoenix) (Hex) | Phoenix integration with an Igniter installer |
| `packages/rails` | [`tuix_rails`](https://rubygems.org/gems/tuix_rails) (RubyGems) | Rails integration with a generator |
| `apps/wordpress` | Tuix Feedback (wordpress.org) | The WordPress plugin |
| `examples/nextjs` | | A Next.js App Router example |
| `packages/test-fixtures` | | Signing test vectors shared by the Node, Phoenix and Rails tests |

Each directory has a README with installation steps. Tuix → Project settings → Install
tuix shows them with your project's values filled in.

## Licenses

Everything here is under the MIT License (`LICENSE`), except the WordPress plugin in
`apps/wordpress`, which is under the GNU General Public License, version 2 or later
(`apps/wordpress/tuix-feedback/LICENSE`), as wordpress.org requires. The widget bundles Preact,
the Phoenix JavaScript client, modern-screenshot and the Karla font; their licenses are
in `packages/widget/THIRD_PARTY_NOTICES.md`.

## Development

You need Node.js 22.12 or newer. The Phoenix package also needs Elixir 1.15 or newer, the
Rails gem Ruby 3.2 or newer, and the WordPress checks Docker. `mise install` sets up the
versions CI uses.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

`.github/workflows/ci.yml` runs these and the Phoenix, Rails and WordPress checks; each
package README describes its own. Releases run from the `publish-*.yml` workflows: each
is started by hand with the exact version, and builds and tests before it publishes.
npm and RubyGems releases use trusted publishing, so no long-lived token is stored here.

## About this repository

This is a mirror. The integrations are developed in Tuix's private repository, together
with the server, and copied here for each release. See `CONTRIBUTING.md` for issues and
changes, and `SECURITY.md` to report a vulnerability.
