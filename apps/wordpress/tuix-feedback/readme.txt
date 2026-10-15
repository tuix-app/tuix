=== Tuix Feedback ===
Contributors: PLACEHOLDER-wordpress-org-username
Tags: feedback, review, qa, annotations, bug reporting
Requires at least: 6.3
Tested up to: 7.1
Requires PHP: 7.4
Stable tag: 0.2.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Element-anchored feedback for your WordPress site. Your team points at anything on a page and leaves a comment; you triage it in Tuix.

== Description ==

Tuix adds a small "tuix." button for signed-in team members. They click it, select any element on the page and describe what needs attention. Tuix attaches a screenshot of what they saw, the page address and browser details, and you triage everything in the Tuix dashboard.

* Only your team can comment: the widget loads only for signed-in people who work in wp-admin (Contributors and up, Shop managers), in the roles you choose. Visitors, subscribers and shop customers never see it.
* Team members are identified by their WordPress account. The plugin signs their identity, including their email, on your server, so nobody can pose as them.
* A signed email lets team members open Tuix from the widget and sign in to the dashboard. Tuix trusts the email of the WordPress account as the person's own address, and WordPress does not confirm an address an administrator types in, so keep each team member's email correct.
* The widget is loaded from your Tuix server with a Subresource Integrity hash, so widget updates arrive without plugin updates.
* Works with Content Security Policy plugins that add script nonces.

Tuix is a hosted service. The plugin needs a Tuix account and project; see External services below for what it sends and when.

= Source code =

The plugin's PHP is not minified. The widget it loads from Tuix is built and minified; its human-readable source, and this plugin's, are at https://github.com/tuix-app/tuix (the widget in packages/widget, the plugin in apps/wordpress/tuix-feedback). Both are open source.

== External services ==

This plugin connects your site to Tuix, the feedback service at https://tuix.app (or the Tuix address you enter in Settings → Tuix). Without it the plugin does nothing. It sends nothing until you enter a project key and a signing key, and nothing for visitors or for users outside the roles you choose.

What your WordPress server sends to Tuix:

* The current widget's address and integrity hash, read from the public file /widget/channels/stable.json. Your server fetches it the first time the widget is shown to a team member and then at most every five minutes, in the background. The request carries no personal data, only the usual request details, such as your server's IP address and WordPress's user agent, which includes your site's address.
* When an administrator clicks Check connection: that administrator's WordPress user ID, display name and email, signed with your signing key, together with the project key, the environment and your site's address. Tuix answers whether they match.

What the browser of a signed-in team member, in a role you chose, sends to Tuix:

* It loads the widget's script and font from your Tuix address.
* When they open the widget: their WordPress user ID, display name and email with the signature from your server, the project key, the environment and the address of the page.
* When they leave a comment: the comment, a description of the element they selected, the page address, browser details and, as set in your Tuix project, a screenshot and the page's console and network entries (method, address and status, never bodies or headers). Form fields and editable content are blanked in screenshots.
* If "Anonymous performance and locator telemetry" is on in your Tuix project settings: how long the widget took to load, the kind of a widget error (never its message), and which method found each comment's element on the page. You can turn it off there.

Tuix terms of service: https://tuix.app/terms. Tuix privacy policy: https://tuix.app/privacy.

== Installation ==

You need a Tuix project and a Tuix admin account. Tuix → Project settings → Install tuix → WordPress plugin shows these steps with your project's values filled in.

1. **Allow your site in Tuix.** In Tuix → Project settings, add the site's exact address, such as https://www.example.com, to Allowed origins and save. Add both the www and bare domain if the site answers on both. Use a separate Tuix environment (uat) for a staging site.
2. **Install the plugin.** Download tuix-feedback.zip from Tuix → Project settings → Install tuix → WordPress plugin. In WordPress open Plugins → Add New Plugin → Upload Plugin, choose the zip, then Install Now and Activate.
3. **Connect it.** In WordPress open Settings → Tuix and enter:
   * Tuix address: where your Tuix runs, for example https://tuix.app
   * Public project key: Tuix → Project settings → Public project key (starts with pk_)
   * Signing key: Tuix → Project settings → Server-only signing key → Reveal signing key
   * Environment: production for the live site, uat for staging, local for a site on localhost
4. **Choose who sees it.** Administrators and Editors by default. Only roles that work in wp-admin are offered; subscribers and customers can never comment. Optionally also show it in wp-admin. Save.
5. **Check the connection.** Click Check connection. It signs in to Tuix from your server exactly as the widget would and should say "Connected".
6. **Try it.** Open your site while signed in, click tuix. in the bottom corner, click any element and leave a comment. It appears in your Tuix project.

= Keeping keys out of the database (recommended) =

Instead of entering values on the settings screen, add them to wp-config.php above "That's all, stop editing!". The settings screen then shows them as set in wp-config.php:

    define( 'TUIX_API_URL', 'https://tuix.app' );
    define( 'TUIX_PROJECT_KEY', 'pk_live_your_project_key' );
    define( 'TUIX_SECRET_KEY', 'your-signing-key' );
    define( 'TUIX_ENVIRONMENT', 'production' ); // optional

= Troubleshooting =

* **"Tuix refused this site"**: the site's address is missing from Allowed origins, or the project key belongs to another project. A site on localhost needs the Allowed origin `local` and the environment `local`.
* **"Tuix rejected the signature"**: the signing key does not match the project. Reveal it again in Tuix and paste it without spaces.
* **"Could not reach Tuix"**: check the Tuix address, and that your server may make outgoing HTTPS requests to it.
* **No tuix. button on the site**: sign in with one of the selected roles and make sure Check connection says Connected. If a caching plugin serves cached pages to signed-in users, exclude signed-in users from the cache.
* Keep "Require HMAC-signed commenter identity" on in Tuix. The plugin signs every identity on your server.

== Frequently Asked Questions ==

= Does it slow down my site? =

Visitors and users outside the chosen roles get nothing extra. For team members the widget loads asynchronously and does nothing until clicked. The plugin remembers the widget's address and refreshes it in the background, so pages never wait on Tuix; an unreachable Tuix can delay at most one page load before it is remembered as unavailable for a minute.

= Where does the widget come from? =

From your Tuix server, pinned with a Subresource Integrity hash. Widget updates arrive without plugin updates. Its source is at https://github.com/tuix-app/tuix.

= What does Check connection do? =

It signs you in to Tuix from your server, exactly as the widget would, and tells you whether the project key, signing key or allowed origin needs fixing.

= Can developers change who sees it? =

Yes. Filter `tuix_should_load` (bool, WP_User) to narrow who sees it, and `tuix_identity` for the name and email sent to Tuix. The plugin signs whatever email the filter leaves, and Tuix trusts it as the person's own address, so return only an address you know is theirs; without one, people can still comment but cannot sign in to Tuix from the widget. The filter cannot extend the widget to accounts without wp-admin access (the edit_posts capability).

= What happens on uninstall? =

The plugin's settings are removed from every site. Reports stay in Tuix.

= I use the earlier plugin called Tuix. What do I do? =

Tuix Feedback replaces it. Install and activate Tuix Feedback; while Tuix is active, Tuix keeps showing the widget and Tuix Feedback shows a reminder. Deactivate Tuix: on the next page, Tuix Feedback copies Tuix's settings, once, and takes over, so you do not enter your keys again. Then delete Tuix. Delete Tuix only after that step, or its settings go with it.

== Changelog ==

= 0.2.0 =
* Renamed Tuix Feedback, in the folder tuix-feedback, for the wordpress.org plugin directory. Replaces the plugin Tuix and copies its settings, once, into its own.
* Lists in External services what the plugin sends to Tuix.

= 0.1.1 =
* Signs the email together with the user ID, so team members can open Tuix from the widget and sign in. Update with the matching Tuix server.

= 0.1.0 =
* First release.
