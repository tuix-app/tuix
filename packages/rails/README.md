# tuix_rails

Rails integration for the existing Tuix widget: server-signed identities, hosted
widget delivery, CSP nonces and Turbo navigation. Requires Ruby 3.2+ and Rails
7.2–8.x (Rails itself may require a newer Ruby). No database, npm installation,
asset precompile or separate Tuix login is needed by the host application.

MIT licensed, on [RubyGems](https://rubygems.org/gems/tuix_rails).

## Install

In the host application:

```sh
bundle add tuix_rails
bin/rails generate tuix:install
```

To try a change before its release, use `gem "tuix_rails", path: "/absolute/path/to/packages/rails"`
in the Gemfile instead.

The generator creates `config/initializers/tuix.rb`. It prints the layout steps
instead of guessing your authentication library or rewriting custom layouts.
Re-running it uses Rails' normal file conflict handling; `--skip` preserves a
custom initializer.

Set `TUIX_PROJECT_KEY`, `TUIX_SECRET_KEY`, `TUIX_API_URL` (default
`https://tuix.app`) and `TUIX_ENVIRONMENT` (default `uat`) on the host server.
Allow the host's exact origin in Tuix project settings and keep signed identity
enabled. HTTP API origins are accepted only for localhost/127.0.0.1 development.

Add the asset helper inside your layout's `<head>`:

```erb
<%= tuix_assets %>
```

Add one identity helper inside `<body>`, outside any fragment shared across users:

```erb
<%= tuix_widget(user: current_user && {
  id: current_user.id,
  name: current_user.name,
  email: current_user.email
}) %>
```

Adapt `current_user` to your authentication system. Pass `nil` for signed-out
users or users who should not have feedback access. Supply only trusted server
identity data, never request parameters. Include email only when your application
has verified it. Tuix uses the signed email for dashboard access and notifications;
omit it if you cannot vouch for the address. IDs must be stable strings or integers.

The gem signs the exact ID with HMAC-SHA256, or the ID, a newline and the trimmed,
lowercased email when present (Tuix identity v2). The signing secret never goes
into HTML. `TuixRails.identity(user)` is also available to sign identities for a
separate JavaScript frontend. `config.release` optionally identifies a deployed
build. Missing project/secret or an anonymous user leaves the widget inactive;
invalid supplied configuration or identity raises an actionable argument error.

## Navigation and delivery

The gem serves its small bootstrap at a content-addressed `/tuix-rails/` URL.
Authenticated pages fetch the configured Tuix origin's public
`/widget/channels/stable.json` without cookies, validate the manifest, then load
the immutable widget with SHA-384 integrity. One runtime is selected per document.
Widget updates arrive on a subsequent full page load without upgrading the gem.
Bootstrap changes require upgrading the gem and deploying the host.

Turbo renders, frames and streams can replace the identity element. The bridge
destroys the old widget before identifying the new user. Removing the element or
rendering `user: nil` clears it. Pending loads cannot re-identify after logout.
The bridge has bounded manifest/script timeouts and retries after navigation.
Anonymous pages do not request the manifest or widget runtime.

Before Turbo caches a page, the bridge removes its widget and signed identity.
Cached previews stay inactive; a fresh server render restores feedback. A history
restoration served entirely from Turbo's cache therefore has no feedback identity.
For authenticated pages that need feedback on every back/forward visit, add this
to the layout's `<head>` so Turbo fetches fresh server identity:

```html
<meta name="turbo-cache-control" content="no-cache">
```

Clear your application's Turbo cache on logout as part of its normal session
handling. Do not mark the identity element `data-turbo-permanent` or put it in a
shared full-page cache. Browser back/forward cache follows the host's existing
session policy; the bridge destroys the widget on `pagehide` and re-reads the
current page on `pageshow`. See the [Turbo lifecycle documentation](https://turbo.hotwired.dev/handbook/building).

## Content security policy

Helpers use Rails' `content_security_policy_nonce` by default; an explicit
`nonce:` can be passed to both. The bootstrap passes it to the widget loader and
styles. Keep the nonce consistent with the document's policy across Turbo visits.
Keep Rails' `<%= csp_meta_tag %>` in the layout head so Turbo can also use that
nonce for its own scripts and progress styles. The gem does not replace the host's policy.

Allow the local bootstrap and the Tuix origin in applicable script directives,
Tuix fonts, Tuix HTTP/WebSocket connections (including manifest fetches), and
the storage origin shown in Project settings for uploads and images. Image
previews need `blob:` and `data:`. Capture requires `style-src-attr 'unsafe-inline'`
and the empty stylesheet hash
`'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='` in the applicable style
directive. Account for `script-src-elem`/`style-src-elem` when present. Test capture
against the real host policy; Tuix → Project settings → Install tuix → Content
Security Policy lists the exact sources for your project.

## Development

```sh
cd packages/rails
bundle install
bundle exec ruby -Ilib test/integration_test.rb
bundle exec ruby ../../scripts/package-rails.rb
# From the repository root, after npm ci:
npm test -w @tuix/rails
npm run build -w @tuix/widget
npm run test:browser -w @tuix/rails
```

`RAILS_VERSION='~> 7.2.0' bundle update` selects a different supported Rails line.
CI covers Rails 7.2/Ruby 3.2, Rails 8.0/Ruby 3.3 and Rails 8.1/Ruby 3.4.
Integration tests boot a real Rails application, render helpers, fetch the asset
through middleware, check identity signing/escaping, and exercise the generator.
The package command builds `output/releases/tuix_rails-0.1.0.gem`, verifies its
contents and reruns integration tests against a temporary gem installation before copying
the artifact into place. It never publishes. CI uploads the same local artifact, and the
release workflow publishes that artifact.

Browser regression tests need Playwright Chromium (`npx playwright install chromium`).
They boot Rails on loopback and exercise the actual Turbo library and built Tuix
widget: Drive, frames, streams, logout, back navigation, CSP nonces and SRI rejection.
The remote Tuix API is a deterministic local fixture that verifies Ruby signatures
with an independent Node HMAC implementation. jsdom tests cover pending-load races
and recovery. No store/account, Docker or production keys are needed.

Locally verified on 11 October 2026 with Ruby 3.2.4: all 9 integration tests passed
on Rails 7.2.4, 8.0.5.1 and 8.1.4; all 8 bootstrap tests and the Chromium/Turbo
8.0.23 browser smoke passed. The CI matrix also exercises newer Ruby versions;
its remote run is separate from these local results.

Before rolling out to your users, try report creation, screenshots and notifications
against a real Tuix project using the host's authentication, origin and CSP.
