# @tuix/widget

Element-anchored feedback. Core and screenshot code load on demand. The launcher remains hidden until identity is supplied.

```sh
npm install @tuix/widget
```

For Node signing and React/Next.js lifecycle handling, add `@tuix/server` and
`@tuix/react`; `examples/nextjs` demonstrates the server boundary. MIT licensed.

Email links with `?tuix=<issue UUID>` activate the widget after host identification and open that report. They preserve normal API access checks. Reading a thread acknowledges its notifications; other unread reports retain the launcher badge. Without an activation link, `showPinsOnLoad`, a stored marker preference or a recent visit (below), the SDK remains lazy until opened.

The widget speaks version 2 of the widget API (`X-Tuix-Widget: 2`): it shows each report as Open, Fix ready, Fixed or Closed, read from `state_name`, else `state` (open, in_review, done, closed; an older server's in_progress reads as open and wont_fix as closed), else the legacy `status`. Report actions (Fix ready, Works, Still broken, Close, Reopen, Take it) come from the `actions` the server sends, or from `allowed_states` and `can_be_fixer` against a server before actions; a server that sends neither leaves reports read-only. The header is sent on every request, `/identify` included, so the API's widget CORS preflight must list `x-tuix-widget` in `access-control-allow-headers`; against a server that does not, browsers refuse every widget request.

```ts
import { tuix } from '@tuix/widget';
tuix.init({ project: 'YOUR_PUBLIC_PROJECT_KEY', environment: 'uat' });
tuix.identify({ id: user.id, name: user.name, email: user.email, hash: user.tuixHash });
// Optional host controls:
tuix.open(); // report browsing (not the launcher's element-picking flow)
tuix.open({ show: 'verify', involving: 'me', scope: 'all' }); // browsing with a filter
tuix.close();
tuix.identify(null); // logout: removes UI and aborts API work
tuix.destroy();
```

Reports go to tuix at `https://api.tuix.app`; tuix is a hosted service and cannot be self-hosted. `api` overrides the address for development. HTTP is accepted only for localhost/127.0.0.1 development. Other options include `lang: 'en' | 'pl'`, `release`, `capture`, `context`, `route`, `keepQuery`, `theme.accent`, `position`, `launcher: false`, and `nonce`. `tuix.config(partialOptions)` rebuilds the instance with updated configuration. Destroy restores the host functions the widget wrapped, provided another integration has not subsequently replaced them. Capture begins at first activation and its bounded buffers survive closing/reopening; destroy clears them.

Markers update their positions on scroll (including nested containers) and window resize. Navigation and report changes resolve their elements again. Tuix does not watch every DOM mutation. If your application replaces content or changes layout without navigation, dispatch this event after the DOM update:

```js
window.dispatchEvent(new Event('tuix:refresh-markers'));
```

The event refreshes active markers using already loaded reports; it does not fetch data or open the widget. Ordinary typing and background DOM changes do not trigger marker searches. Report/settings synchronization continues, but unchanged responses do not refresh markers.

Keys pressed in the widget, typed into its fields or pressed on its buttons and markers, stop at its shadow root, so the host page's keyboard listeners never see them: on the document or window they would arrive with the `<tuix-widget>` element as their target, which a shortcut handler that skips keys typed into inputs (`event.target.closest('input,textarea')`) cannot tell from a key pressed on the page, and cancelling Space or Enter there would stop the widget's buttons. Escape still reaches the page.

## Script distribution

Build with `mise exec -- npm run build -w @tuix/widget`. Deploy the entire `dist/` tree together at an immutable version directory: the small `tuix.js` loader, ESM files, screenshot chunk and fonts. `manifest.json` records the loader's real SHA-384 integrity and gzip budgets. Initialize the queue before the async loader:

```html
<script nonce="YOUR_NONCE">
  window.tuix = window.tuix || function () { (tuix.q = tuix.q || []).push(arguments); };
  tuix('init', { project: 'YOUR_PUBLIC_PROJECT_KEY', environment: 'uat', nonce: 'YOUR_NONCE' });
  tuix('identify', { id: currentUser.id, name: currentUser.name, hash: currentUser.tuixHash });
</script>
<script async src="https://YOUR_CDN/0.1.0/tuix.js"
  integrity="USE_THE_BUILD_MANIFEST_HASH" crossorigin="anonymous" nonce="YOUR_NONCE"></script>
```

CDN must serve ESM and fonts with CORS. Host CSP must allow your CDN in `script-src` and `font-src`, API/upload origins in `connect-src`, and `blob: data:` in `img-src` for previews. Widget style elements accept a nonce; the screenshot library also needs the exact empty-stylesheet hash `sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=` in `style-src`; widget positioning uses inline style attributes, so a policy that forbids all style attributes needs an explicit `style-src-attr` allowance. Test exact CSP on the real host before deployment. Do not use a made-up or stale SRI value.

## Launcher, reports and settings

Clicking the actual tuix launcher opens the sidebar already in element-picking mode. Hover highlights a target; clicking it opens the composer inside the sidebar, not in a floating card. Escape, the X or clicking the launcher closes the widget and discards the selection; the next launcher click starts element picking again. Opening Settings while composing, or clicking the page outside the widget, hides the composer instead and keeps its selection and text in memory; the launcher or the Reports dot returns to it. A click outside the widget closes the sidebar too, except in element picking, where clicking the page chooses the element; a chat window stays open. Successful submission shows the report thread and **Add another**. Public `tuix.open()` continues to open report browsing; report deep links open the requested thread.

Hovering or focusing the launcher raises two dots: **Reports** and **Settings**. The compact, approximately 280px settings flyout groups **Page markers** (Appearance: Dots / Outlines / Fills, plus **Show markers when the feedback panel is closed**), **Developer options** (Environment, local development only), and **Notifications** (the five newest updates in a scroll, Mark all as read, and existing email preferences). Marker help explains that these are unresolved reports attached to this page, independent of report-list filters. Dots are the default; showing markers with the feedback panel closed is off by default. Outlines and fills let clicks through. Email preferences and schedules are unchanged. A quiet **Open tuix.app** link follows the groups. The flyout fits the viewport and scrolls. Clicking Settings loads the core so updates render, without opening the side panel. The small reply dot opens Settings. Hosts with `launcher: false` keep notifications at the top of Reports.

**Open tuix.app** (its address is the dashboard's `/login`, for a middle click or a copied link) asks the server for a one-time handoff (`POST /v1/account/handoff`) and opens it in a new tab with `noopener,noreferrer`. It needs a signed email (identify hash v2) and a person already linked to the project; when the server answers 403 `handoff_unavailable` the widget falls back to `POST /v1/account/link`, which emails a sign-in or join link. Any other failure shows a retry message and sends no email. With `noopener` a browser never reports a blocked tab, and a slow handoff can outlive the click's permission to open one, so the flyout also shows the handoff as a direct **Continue to tuix.app** link (`target="_blank" rel="noopener noreferrer"`) until shortly before its 60-second code expires. The link appears only when `/v1/config` returns the dashboard origin (`app_url`).

The reports panel keeps its filters together: **Pages: This page / All pages**, **Show: Your turn / Open / All**, both as short segmented choices. Defaults are This page and Open. Your turn lists the conversations waiting for you (a fix to check included); Open lists every open one, Fix ready included; All adds closed ones, which also show as muted dots on the page. A row is the urgent mark, number, title, one line of the newest message and a quiet word (Fix ready, Fixed, Closed), with a small peach dot when it is your turn. Filtering never closes an open thread, and report links still open closed conversations. Show filtering happens on the server before pagination; earlier stored values (Unresolved, To verify, Finished) read as Open, Your turn and All.

One count beside the launcher, "Your turn n", shows the conversations waiting for you (their turn, fixes to check included) from `GET /v1/me/summary` (`waiting`; against a server before it, `to_verify` plus `assigned_active`). It opens Reports on All pages with Your turn. The capsule hides while the menu dots, a panel or the flyout show, and the launcher itself comes up while something waits.

A conversation shows ONE turn line ("Your turn", "Waiting for Anna", "Waiting for the team" for a reporter, "Unclaimed" for team viewers, "Closed", "Closed · Fixed", from `turn_holder` and the state), the report, then replies and small lines in time order (`timeline`; a reply that sent the turn carries "→ Anna" from `sent_to`). Buttons come from what the server says you may do (`actions`): **Send** (in a signed team session with **Send to**: the people in `turn_options`, preselected by `default_turn`, ending with "Keep with me"), **Works** and **Still broken** (note required) for the reporter of a fix to check, **Fix ready**, **Take it**, **Close**, **Reopen** (it may carry a note; a closed conversation takes no replies and says so) and the urgent toggle (not on a closed conversation). One button per view is primary. Against servers before these fields the widget falls back to `turn`, `allowed_states` and `can_take`; a server that sends none of them leaves the conversation read-only. In local development, fixers get **Mark fixed** in place of Fix ready; the thread then says "Fix waiting for deploy" until a deployment containing the fix moves it to review.

Resting the pointer on a marker (a dot, or the box of an outline or fill) for about 200ms, or focusing a dot, shows a **hover card** beside it: "#number title", the state with a line saying whose turn it is ("Waiting for your reply", "The team is on it", "Fix ready for you to check" for the reporter; "Your turn", "Waiting for the reporter" and the like for the fixer and everyone else; hidden for a finished report or an older server), the latest reply (author and the first two lines), or, without one, the start of the description in place of the title (its first line, the title, on a line of its own; four lines at most; the list rows carry it as `excerpt`, 280 characters at most), or "No replies yet" under the title against an older server, an unread dot when the report has updates for you, and "Element moved" when its element was not found. The card comes from the list the markers already loaded, so hovering makes no requests (older servers that send no reply, unread or excerpt fields get a card without them). Clicking the card opens the report like clicking the dot; Escape (which leaves the sidebar open and keeps the card away until the pointer leaves the marker), scrolling, leaving, and the sidebar opening close it; a report still sending has no card. Outlines and fills let clicks through, so while they are drawn the widget compares the pointer with their boxes once per frame (the smallest box where they overlap). Touch-first devices get no card; a tap opens the report.

Clicking a dot (or a hover card) on a pointer device with a viewport at least 640px wide opens the report in a **chat window** beside its element instead of the sidebar: the state and the same turn line in its header, the newest five replies (with **Show earlier**), a reply box with @-mentions, **Done** / **Still broken** for the reporter of a report in review, and **Open full thread**, which shows the report in the sidebar. The window follows the element as the page scrolls or resizes, keeps to the screen edge when the element scrolls out of view, stays put and says so if the element leaves the page, takes focus when it opens and returns it to the dot (or the launcher, for outlines and fills) when it closes (Escape or the close button), and there is only one at a time. Touch-first devices and narrow screens keep the sidebar thread; `?tuix=<id>` links open the sidebar.

Where the server allows it (`can_mention`: a signed identity on an open report), typing **@** in the reply box suggests team members by name and people already in the thread, listed under the textarea; arrows move, Enter or Tab picks and Escape closes only the list. Picking inserts "@Name", and the reply mentions the people still named in it. Mentions show as "@Name" chips, and a mention appears in **Updates on your reports** as "Mentioned you".

All these settings are remembered per project in `localStorage`: marker style (`dot`, `border` or `fill`) and visibility retain the existing `tuix:markers:<project>` format; report preferences (Pages, Show and Environment) are stored separately. Saved Open and To verify choices read as Open and Your turn, and an older saved Involving choice is ignored (there is no control for it; a host's `tuix.open({ involving })` still applies to that view). New writes use preference format version 2.

Merely hovering or focusing the launcher does not activate API requests or capture. An untouched browser stays idle: no identify, no requests, no core. Once someone opens tuix for the project in a browser, the core writes `tuix:active:<project>` (a timestamp, refreshed on every open and ignored after 30 days). The script loader then loads the SDK eagerly (the launcher stays usable; a click during that download is queued and replayed), and the SDK fetches the summary once the page is idle (or, without `requestIdleCallback`, one second after the `load` event) with its small API client, without loading the core. Hosts with `launcher: false` show no capsule, so the core never writes the mark for them and the loader ignores it. The summary refreshes when the panel closes and on live updates. **Reports** explicitly activates browsing. Project defaults and the kill switch are fetched on activation and refreshed while open. `showPinsOnLoad` must be supplied by the host when eager activation is wanted; discovering a remote setting would itself require an idle request. Project settings includes its default-off **Show pins on load** value in generated snippets; update installed configuration after changing it. Shopify reviewer bootstrap obtains the saved option during its existing session exchange.

Markers and **This page** reports are scoped to concrete `page_url`: origin + pathname, not the normalized route key. Query strings and hashes do not distinguish pages, and `?tuix=…` does not change page identity. Arbitrary query parameters are not captured. **All** reports groups paginated results by concrete URL. **Status: All reports** includes finished reports; markers ignore the panel filters and always show unresolved reports from everyone. All page, report and screenshot links navigate in the same tab.

## Component names

Add `data-tuix-component="CheckoutButton"` to the root element of a component (React apps built with Babel get it automatically from the plugin `@tuix/react/babel`) and each report carries that name, so people and AI apps can connect it to the component in your code and in your design files. A report records the name on the chosen element, if it has one, followed by the names on its ancestors, nearest first (at most 8): a button inside a form inside a page gives a chain such as `CheckoutButton`, `CheckoutForm`, `CheckoutPage`. A name starts with a letter or underscore, continues with letters, digits and `_ . : / -`, and is at most 100 characters; anything else is skipped. Names are collected inside `data-tuix-mask` elements too, because they are your own attribute values and not page text. The name is sent with the report, so do not put secrets or personal data in it. It does not affect how the widget finds the element again. Phoenix and Rails apps can have the attribute written for them with `tuix_component` from `tuix_phoenix` and `tuix_rails` (see their READMEs).

A design (Figma) link can be saved per component in Tuix, by a person on the issue page or by an AI app, and then comes back with every report on that component. Team members also see it in the report's thread in the widget, as an "Open in Figma" link; people from your app never do.

## Capture and privacy

Form controls, editable content and `data-tuix-mask` elements become gray placeholders in a detached screenshot clone. The original page is not edited. The selected element is highlighted by a band drawn onto the image, so page CSS cannot hide it. Scrolled panes are captured as the reporter sees them. Output is PNG at the device pixel ratio, at most 3,200px on the longest side and redrawn smaller when over 3.7 MB, the most the hosted MCP server attaches for AI agents, and capture skips after eight seconds including the lazy import. Screenshots are optional and removable. Console values are bounded; object arguments are not enumerated. Network metadata includes method, sanitized URL, status and duration, never bodies or headers. Identity requires a backend-generated HMAC by default: `user.tuixHash` is the lowercase hex HMAC-SHA256 of the exact user ID, generated using the project secret on the host server. Never expose that secret. Explicit unsigned mode is only for trusted development/internal fixtures, not customer authentication.

Screenshot evidence has explicit **available**, **none**, **restricted** and **unavailable** states, with retry for unavailable evidence. Anyone authorized to view a report can view its original and review screenshots, regardless of authorship or status. The same tenant, project and environment visibility rules apply to reports and screenshots; restricted evidence exposes no image URL. Console and network logs remain private to the author.

Composer text, locators, tokens and screenshots live only in memory while the composer is open; nothing is written to `sessionStorage`. A failed send keeps the text and retries with the same idempotency key; closing discards everything. Shared devices should sign out using `identify(null)` and clear their browser session.

## Development

From the repository root: `npm ci`, then `npm test`, `npm run typecheck` and `npm run build -w @tuix/widget`. The tests use synthetic fixtures; they are regression checks, not a measure of how the widget does on a real application.

With `environment: 'local'`, threads can show enclosing HEEx or supported React development source metadata and a locally configured editor link. Source paths and the editor preference stay in the browser.
