# Tuix Feedback, the WordPress plugin

`tuix-feedback/` is the plugin Tuix Feedback (wordpress.org slug `tuix-feedback`), under
the GNU General Public License, version 2 or later (`tuix-feedback/LICENSE`). Sites
install it from the wordpress.org plugin directory, through Plugins → Add New Plugin.
`python3 scripts/package-wordpress.py <target.zip>` packages it as a reproducible zip.
Tuix servers also serve that zip at `/downloads/tuix-feedback.zip` (the earlier
`/downloads/tuix-wordpress.zip` redirects there), for sites that cannot reach
wordpress.org; Project settings → Install tuix → WordPress plugin gives both ways with
setup steps. Customer-facing documentation is `tuix-feedback/readme.txt`, in the
wordpress.org readme format.

How it works:

- Output happens in `wp_footer` (and `admin_footer` when enabled) only for signed-in
  users who can work in wp-admin (`edit_posts`) and whose role is selected. Only such
  roles are offered, and neither stored settings nor the `tuix_should_load` filter can
  extend the widget to front-end accounts (Subscriber, WooCommerce Customer). Visitors
  and cached public pages never contain it.
- The user's WordPress ID is signed server-side with the project's signing key
  (HMAC-SHA256), matching `require_signed_identity`. With an email the signature
  covers the ID, a newline and the trimmed, lowercased email (identify v2), which is
  what lets the person sign in to Tuix from the widget. The key never reaches a browser.
- The loader comes from the Tuix server's `/widget/channels/stable.json`, validated like
  the Phoenix package and pinned with SRI. It is cached for five minutes; afterwards the
  last good loader is served while WP-Cron refreshes it, so pages never wait on Tuix. The
  very first lookup is synchronous (5 s timeout) and a failure is remembered for a minute.
- Values can be pinned in wp-config.php (`TUIX_API_URL`, `TUIX_PROJECT_KEY`,
  `TUIX_SECRET_KEY`, `TUIX_ENVIRONMENT`); pinned fields are read-only in the form.
- Settings → Tuix → Check connection performs a real signed identify against Tuix and
  explains origin, key and signature problems.

The "External services" section of `tuix-feedback/readme.txt` lists what the plugin and
the widget send to Tuix and when. Keep it in step with the code: wordpress.org requires it.

## The earlier plugin Tuix

Until version 0.1.1 the plugin was called Tuix and lived in the folder `tuix/`
(`tuix/tuix.php`). wordpress.org takes the slug from the name and refuses one shorter than
five characters, so it became Tuix Feedback in 0.2.0. WordPress sees the two as different
plugins. Tuix Feedback keeps the names that sites' own code and configuration use: the
filters `tuix_should_load` and `tuix_identity`, the wp-config.php constants `TUIX_*`, and
the settings page `options-general.php?page=tuix`. Its options are its own
(`tuix_feedback_settings`, `tuix_feedback_secret_key`, `tuix_feedback_runtime_last`), as
are its transients, cron hook, classes (`Tuix_Feedback_*`) and constants
(`TUIX_FEEDBACK_*`), so both plugins can be loaded at once without a fatal error, and
uninstalling either never touches the other's settings.

A site that has Tuix and installs Tuix Feedback (`Tuix_Feedback_Legacy`):

- While Tuix is active, Tuix Feedback stays out of the way and shows administrators a
  notice to deactivate Tuix and then delete it. The widget appears once, from Tuix.
- On the first request after Tuix is deactivated, Tuix Feedback copies Tuix's options
  (`tuix_settings`, `tuix_secret_key`, `tuix_runtime_last`) into its own, once, if it has
  no settings yet. The signing key stays out of autoload. On a network each site copies
  its own, on its first request with Tuix Feedback active.
- Deleting Tuix afterwards removes only Tuix's options. Deleting Tuix before Tuix Feedback
  has run once loses them, and the keys must be entered again.

Version: bump `Version`, `TUIX_FEEDBACK_VERSION` and `Stable tag` together; packaging
refuses a mismatch. "Tested up to" names the WordPress version the smoke test and Plugin
Check run on (`WORDPRESS_IMAGE` in both scripts); raise them together.

## Installing on a site

Customer instructions live in two places kept in step: Project settings → Install tuix →
WordPress plugin (with the project's values and a wp-config.php snippet filled in) and the
Installation and Troubleshooting sections of `tuix-feedback/readme.txt`.

## Testing

Both need Docker. From the repository root:

- Real WordPress (MariaDB, Playwright), also run in CI: build the widget
  (`npm run build -w @tuix/widget`), then `node scripts/wordpress-smoke.mjs`. It uses
  host networking and fixed ports 8089, 3307, 4390 and 4391, so on macOS enable host
  networking in Docker Desktop.
- Plugin Check, the tool the wordpress.org review uses: `bash scripts/wordpress-plugin-check.sh`.
  Any error or warning fails it, except the ones it lists as known.
