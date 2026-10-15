# tuix_phoenix

Install the tuix feedback widget into an existing Phoenix application with Igniter. The package serves a small local integration bootstrap, signs authenticated identities on the server, and follows LiveView navigation and logout. By default it loads the widget JavaScript, chunks and fonts from the configured Tuix API origin. Host applications need no npm dependency, JavaScript import, or widget build step.

A project admin sets up the app's project and allowed URL in Tuix, installs this package, configures the project keys and user mapping below, and deploys. People using the widget keep using their existing host-app identity; they need no Tuix account or separate login to report. Because the package signs their email too, they can open the Tuix dashboard from the widget and join the project when it allows that.

Requires Elixir 1.15+, Phoenix 1.7/1.8 and LiveView 1.x. The installer supports conventional `Web.Endpoint`, `Web.Layouts`, `layouts/root.html.heex`, and either `Layouts.app/1` or `layouts/app.html.heex`. It reports unsupported layouts before writing changes.

## Install

MIT licensed. Until the package is on Hex, install it from a checkout of this repository: run `npm ci && npm run build:phoenix` at the repository root, then, in the host application (install Igniter first if it is not already available):

```sh
mix archive.install hex igniter_new
mix igniter.install tuix_phoenix@path:/absolute/path/to/tuix/packages/phoenix
```

Igniter presents the proposed changes for review. `--dry-run` previews them; `--yes` accepts them for automation. For a nonstandard web module, append `--web MyAppWeb`. Run the command from the Phoenix web application's directory, including when it lives in an umbrella.

A built package (`mix hex.build`, or the CI `phoenix-package` artifact) works the same way once unpacked:

```sh
mkdir -p tuix_phoenix/archive
tar -xf /path/to/tuix_phoenix-0.2.0.tar -C tuix_phoenix/archive
tar -xzf tuix_phoenix/archive/contents.tar.gz -C tuix_phoenix
```

Then point the Igniter path command above at the unpacked `tuix_phoenix` directory.

The installer adds:

- `TuixPhoenix.Plug` before endpoint plugs, serving `/tuix-assets/`.
- A bootstrap component in the root layout and a current-identity component in the application layout.
- `MyAppWeb.Tuix.identity/1`, a small authentication adapter you own.
- Runtime configuration reading the four environment variables below.

If any host config file already configures `:tuix_phoenix`, the installer leaves configuration untouched and prints a notice. Re-running installation preserves existing configuration and the identity adapter and does not duplicate components or plugs. No database migration, host supervision child, controller route, or asset pipeline modification is required.

## Configure

Set these in the **host application's server environment**, then restart it:

| Variable | Value |
| --- | --- |
| `TUIX_PROJECT_KEY` | Public project key from tuix project settings |
| `TUIX_API_URL` | Your tuix origin, e.g. `https://feedback.example.com` |
| `TUIX_SECRET_KEY` | That project's secret signing key; never put this in browser configuration |
| `TUIX_ENVIRONMENT` | Deployment environment, default `uat` |

In tuix project settings, allow the host application's exact origin and enable signed identity. Use different configuration per deployment where appropriate. HTTPS is required for the API except `http://localhost` and `http://127.0.0.1` during local development.

The widget stays inactive while configuration is incomplete or the identity adapter returns `nil`. Only public options and a per-user HMAC are rendered into HTML. IDs must be stable, nonempty strings or integers; names must be nonempty strings. A user map should include `email`: it is used for notifications and, because the package then signs the ID together with the trimmed, lowercased email (Tuix identify v2), it is what lets the person sign in to Tuix from the widget. Without an email the hash signs the ID alone and the person can report but not sign in. Tuix treats a signed email as the person's proven address, so return only an email your app has verified (for example, confirmed by a link sent to it); the package signs whatever the adapter returns. If every email you return is verified, turn on "Your app verifies email addresses before it signs them" in the project's settings, so people who joined by reporting, commenting or reviewing open the Tuix dashboard from the widget without confirming their email first.

### Hosted delivery and bundled fallback

`config :tuix_phoenix, delivery: :hosted` is the default. Authenticated pages fetch
`GET <TUIX_API_URL>/widget/channels/stable.json`, then load its immutable
`/widget/<version>/<digest>/tuix.js` with SHA-384 integrity and anonymous CORS.
Only the stable channel exists; unknown channels return 404 rather than silently
falling back. The manifest is public release metadata (no project, identity or
report data), cached publicly for 60 seconds with ETag revalidation. Immutable
assets have a one-year cache lifetime.

The page remembers one validated runtime until a full page reload. LiveView
patches do not refetch the manifest or swap a runtime under an active draft.
Identity changes and logout invalidate pending initialization; anonymous pages
make no manifest requests. Manifest/loader failures leave the host usable and
retry on subsequent navigation (8-second manifest and 15-second loader timeouts).
No manifest or identity is saved in localStorage.

For an offline-assets/pinned rollback escape hatch, set
`config :tuix_phoenix, delivery: :bundled` and deploy a package containing its
bundled widget assets. This uses the package's immutable local loader and fonts,
with no manifest request; widget API operations still require Tuix. CI packages
include this fallback. A hosted-only package cannot use `:bundled`.

## Authentication and LiveView

The generated adapter recognizes Phoenix authentication's `assigns.current_scope.user`. Review it against your application's authorization model. For a host using `assigns.current_user`, for example:

```elixir
def identity(%{current_user: %{id: id, name: name, email: email}}) do
  %{id: to_string(id), name: name, email: email}
end

def identity(_assigns), do: nil
```

Use trusted server assigns, not URL parameters or browser-provided IDs. Set the authenticated assign for controller renders and LiveView mounts, and pass it to `<Layouts.app ...>` when your layout component has its own assigns. A page that omits the application layout is intentionally inactive; add `<TuixPhoenix.widget user={MyAppWeb.Tuix.identity(assigns)} />` to an alternative authenticated layout if needed. Render exactly one identity component per page.

LiveView patches update the identity element. The bootstrap destroys the previous widget before initializing the new identity. Removing the component or returning `nil` clears identity; full navigation and browser back/forward restoration are also handled. Failed loader requests retry on the next navigation, without a mutation retry loop. Widget features still load lazily on activation.

## Content security policy

The integration does not replace the host's CSP. Allow scripts and fonts from `'self'` **and the configured Tuix API origin**, API HTTP/WebSocket connections to that origin (including the manifest fetch), and the storage origin shown in tuix project settings for screenshot uploads/reads. Allow `blob:` and `data:` image previews. Tuix serves the public manifest and runtime assets with `Access-Control-Allow-Origin: *`; they do not require browser credentials.

For a nonce-based policy, expose the matching response nonce as `assigns.csp_nonce` in both layouts; the generated components propagate it to bootstrap, loader and widget styles. Keep it consistent with the current document policy across LiveView updates. Merge nonce permissions into `script-src-elem` / `style-src-elem` too if those directives exist. Screenshot capture also needs `style-src-attr 'unsafe-inline'` and the empty stylesheet hash `'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='` in the applicable style directive. Tuix → Project settings → Install tuix → Content Security Policy lists the exact sources for your project. The storage service must also allow your host origin in its CORS policy.

## Releases and maintenance

The local bootstrap (and bundled fallback assets in CI packages) lives in `priv/static` and is served by Plug.Static with content-addressed URLs, SHA-384 integrity and immutable caching. OTP releases include it automatically. Source maps are not served. Hosted runtime updates arrive through the Tuix stable manifest on subsequent full page loads, without rebuilding the Phoenix host. Retain old immutable assets at Tuix for cached pages and active clients; likewise retain local assets at the host during rolling deployments.

**Deploying Tuix does not deploy your Phoenix host application.** Once this hosted integration is installed, ordinary widget updates require only a Tuix deployment. Existing older integrations need a one-time package upgrade and host deployment to adopt hosted delivery. Bootstrap changes and hosts opting into `:bundled` still require a host rebuild and deployment. Upgrade the package like any other dependency when a release needs it; no installer rerun is needed for an ordinary package upgrade.

Installing from a built archive needs no local widget build. These commands build and test the package itself, from the repository root:

```sh
npm ci
npm run build:phoenix
cd packages/phoenix
mix deps.get
mix check
node --test test/bootstrap.test.mjs
mix hex.build
```

`build:phoenix` builds the widget first, then packages it with the integration bootstrap. The Hex package is published from the release workflow, not from a local build. The license is MIT (see `LICENSE`); `THIRD_PARTY_NOTICES.md` covers the bundled widget's dependencies and font.

To build only the small local integration without a widget build, run
`node scripts/build-assets.mjs --hosted-only` from `packages/phoenix`.
This intentionally omits the bundled fallback. CI and releases include both modes.

Version 0.1.1 adds severity-colored feedback and screenshot frames, pulsing unnumbered pins (respecting reduced motion), background posting, and constrained screenshot previews. Replace the vendored package with the new built artifact and rebuild the host release; no installer rerun is needed. Deploy the matching Tuix server update so responses include severity.

Version 0.1.2 adds the sidebar’s project-wide report browser, grouped by clickable page paths with pagination. Deploy its matching server update before updating the host package. Dashboard list paths are now links to the original host page.

Version 0.1.3 signs the user's email with the ID when the identity includes one (identify v2), so people can open the Tuix dashboard from the widget and sign in. Its bundled widget adds the To verify and Open badges beside the launcher, the Show and Involving report filters, Assign to me with the reporter and fixer actions for the new statuses, and updates on your reports in Settings. Deploy the matching Tuix server first: an older server rejects the v2 signature, which leaves the widget inactive for users with an email.

Version 0.2.0 bundles widget 0.2.0: a report thread no longer shows Add comment, screenshots open in a new tab, and Settings gains a version line and calmer spacing, plus everything since 0.1.2 listed in the widget changelog. Deploy the matching Tuix server first.
