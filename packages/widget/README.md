# @tuix/widget

Element-anchored feedback. Core and screenshot code load on demand. The launcher remains hidden until identity is supplied.

```sh
npm install @tuix/widget
```

For Node signing and React/Next.js lifecycle handling, add `@tuix/server` and
`@tuix/react`; `examples/nextjs` demonstrates the server boundary. MIT licensed.

Email links with `?tuix=<issue UUID>` activate the widget after host identification and open that report. They preserve normal API access checks. Reading a thread acknowledges its notifications; other unread reports retain the launcher badge. Without an activation link, `showPinsOnLoad`, a stored marker preference or a recent visit (below), the SDK remains lazy until opened.

The widget speaks version 2 of the widget API (`X-Tuix-Widget: 2`): it reads each report's `state` (open, in_progress, in_review, done, wont_fix, closed) and falls back to the legacy `status` an older server sends. Report actions (Done, Close, Still broken, Start and the other fixer actions) come only from the `allowed_states` and `can_be_fixer` the server sends, so against an older server reports are read-only. The header is sent on every request, `/identify` included, so the API's widget CORS preflight must list `x-tuix-widget` in `access-control-allow-headers`; against a server that does not, browsers refuse every widget request.

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

For a self-hosted server, pass `api: 'https://your-api.example'`. HTTP is accepted only for localhost/127.0.0.1 development. Other options include `lang: 'en' | 'pl'`, `release`, `capture`, `context`, `route`, `keepQuery`, `theme.accent`, `position`, `launcher: false`, and `nonce`. `tuix.config(partialOptions)` rebuilds the instance with updated configuration. Destroy restores the host functions the widget wrapped, provided another integration has not subsequently replaced them. Capture begins at first activation and its bounded buffers survive closing/reopening; destroy clears them.

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

Clicking the actual tuix launcher opens the sidebar already in element-picking mode. Hover highlights a target; clicking it opens the composer inside the sidebar, not in a floating card. Escape, the X or clicking the launcher closes the widget and discards the selection; the next launcher click starts element picking again. Opening Settings while composing hides the composer instead and keeps its selection and text in memory; the launcher or the Reports dot returns to it. Successful submission shows the report thread and **Add another**. Public `tuix.open()` continues to open report browsing; report deep links open the requested thread.

Hovering or focusing the launcher raises two dots: **Reports** and **Settings**. The compact, approximately 280px settings flyout opens beside the launcher on click, with **Pages: This page / All**, **Hide closed** (on by default), **Dots / Outlines / Fills** (outlines and fills let clicks through), **Keep visible when closed**, the local-development-only environment filter, then **Updates on your reports** (the five newest in a scroll, **Mark all as read** and, when the host supplied an email, the email switch and **How often to email me**: Immediately, Every 15 minutes, Every hour, Twice a day or Daily, saved with the browser's time zone) and a quiet **Open tuix.app** link. The flyout fits the viewport and scrolls. Clicking Settings loads the core so updates render, without opening the side panel. The gold reply dot beside the launcher opens Settings. Hosts with `launcher: false` have no flyout, so their updates stay at the top of the reports panel.

**Open tuix.app** (its address is the dashboard's `/login`, for a middle click or a copied link) asks the server for a one-time handoff (`POST /v1/account/handoff`) and opens it in a new tab with `noopener,noreferrer`. It needs a signed email (identify hash v2) and a person already linked to the project; when the server answers 403 `handoff_unavailable` the widget falls back to `POST /v1/account/link`, which emails a sign-in or join link. Any other failure shows a retry message and sends no email. With `noopener` a browser never reports a blocked tab, and a slow handoff can outlive the click's permission to open one, so the flyout also shows the handoff as a direct **Continue to tuix.app** link (`target="_blank" rel="noopener noreferrer"`) until shortly before its 60-second code expires. The link appears only when `/v1/config` returns the dashboard origin (`app_url`).

The reports panel filters with **Show: Open / To verify / All** (open and in progress; in review; everything) and **Involving: Me / Everyone** (reports you sent or fix; all). Defaults are Open and Everyone. **Hide closed** in Settings, on by default as on the dashboard, keeps Done, Won't fix and Closed reports out of the list, so All means open, in progress and in review until it is turned off. It never closes an open thread, and a report link to a closed report still opens it.

A summary capsule beside the launcher shows **To verify n** (your reports in review) and **Open n** (open or in-progress reports you fix), from `GET /v1/me/summary`. Each segment opens Reports on All pages with To verify or Open and Involving: Me; the list can hold more rows than the count, because it also includes reports where you are the other party. The capsule hides while the menu dots, a panel or the flyout show.

Threads show the fixer ("Fixer: name" or "No fixer yet") and **Assign to me** for people the server lets fix (`can_be_fixer`). Status buttons come from the states the server allows you (`allowed_states`): reporters see **Done** and **Close**, and **Still broken** with a note while a report is in review; fixers see **Start**, **Ready for review** and **Won't fix** with a note. Start on an unassigned report assigns you first. In local development, fixers can **Mark fixed**; the thread then says "Fix waiting for deploy" until a deployment containing the fix moves it to review.

Resting the pointer on a marker (a dot, or the box of an outline or fill) for about 200ms, or focusing a dot, shows a **hover card** beside it: "#number title", the state with a line saying whose turn it is ("Waiting for your reply", "The team is on it", "Fix ready for you to check" for the reporter; "Your turn", "Waiting for the reporter" and the like for the fixer and everyone else; hidden for a finished report or an older server), the latest reply (author and the first two lines), or, without one, the start of the description in place of the title (its first line, the title, on a line of its own; four lines at most; the list rows carry it as `excerpt`, 280 characters at most), or "No replies yet" under the title against an older server, an unread dot when the report has updates for you, and "Element moved" when its element was not found. The card comes from the list the markers already loaded, so hovering makes no requests (older servers that send no reply, unread or excerpt fields get a card without them). Clicking the card opens the report like clicking the dot; Escape (which leaves the sidebar open and keeps the card away until the pointer leaves the marker), scrolling, leaving, and the sidebar opening close it; a report still sending has no card. Outlines and fills let clicks through, so while they are drawn the widget compares the pointer with their boxes once per frame (the smallest box where they overlap). Touch-first devices get no card; a tap opens the report.

Clicking a dot (or a hover card) on a pointer device with a viewport at least 640px wide opens the report in a **chat window** beside its element instead of the sidebar: the state and the same turn line in its header, the newest five replies (with **Show earlier**), a reply box with @-mentions, **Done** / **Still broken** for the reporter of a report in review, and **Open full thread**, which shows the report in the sidebar. The window follows the element as the page scrolls or resizes, keeps to the screen edge when the element scrolls out of view, stays put and says so if the element leaves the page, takes focus when it opens and returns it to the dot (or the launcher, for outlines and fills) when it closes (Escape or the close button), and there is only one at a time. Touch-first devices and narrow screens keep the sidebar thread; `?tuix=<id>` links open the sidebar.

Where the server allows it (`can_mention`: a signed identity on an open report), typing **@** in the reply box suggests team members by name and people already in the thread, listed under the textarea; arrows move, Enter or Tab picks and Escape closes only the list. Picking inserts "@Name", and the reply mentions the people still named in it. Mentions show as "@Name" chips, and a mention appears in **Updates on your reports** as "Mentioned you".

All these settings are remembered per project in `localStorage`: marker style (`dot`, `border` or `fill`) and visibility retain the existing `tuix:markers:<project>` format; report preferences (Pages, Show, Involving, Hide closed and Environment) are stored separately. A stored Show: Open keeps its name and now means open or in progress; a stored Reported by: Me becomes Involving: Me. Preferences never contain identity, issue data or tokens. Blocked or corrupt storage falls back safely. **Keep visible when closed** is an opt-in to eager marker loading on later page loads, with page tracking and polling while closed. Diagnostic capture still waits for explicit sidebar activation.

Merely hovering or focusing the launcher does not activate API requests or capture. An untouched browser stays idle: no identify, no requests, no core. Once someone opens tuix for the project in a browser, the core writes `tuix:active:<project>` (a timestamp, refreshed on every open and ignored after 30 days). The script loader then loads the SDK eagerly (the launcher stays usable; a click during that download is queued and replayed), and the SDK fetches the summary once the page is idle (or, without `requestIdleCallback`, one second after the `load` event) with its small API client, without loading the core. Hosts with `launcher: false` show no capsule, so the core never writes the mark for them and the loader ignores it. The summary refreshes when the panel closes and on live updates. **Reports** explicitly activates browsing. Project defaults and the kill switch are fetched on activation and refreshed while open. `showPinsOnLoad` must be supplied by the host when eager activation is wanted; discovering a remote setting would itself require an idle request. Project settings includes its default-off **Show pins on load** value in generated snippets; update installed configuration after changing it. Shopify reviewer bootstrap obtains the saved option during its existing session exchange.

Markers and **This page** reports are scoped to concrete `page_url`: origin + pathname, not the normalized route key. Query strings and hashes do not distinguish pages, and `?tuix=…` does not change page identity. Arbitrary query parameters are not captured. **All** reports groups paginated results by concrete URL. **Show: All** includes closed reports only with Hide closed off; markers ignore the panel filters and Hide closed and always show unresolved reports from everyone. All page, report and screenshot links navigate in the same tab.

## Capture and privacy

Form controls, editable content and `data-tuix-mask` elements become gray placeholders in a detached screenshot clone. The original page is not edited. The selected element is highlighted by a band drawn onto the image, so page CSS cannot hide it. Scrolled panes are captured as the reporter sees them. Output is PNG at the device pixel ratio, at most 3,200px on the longest side and redrawn smaller when over 3.7 MB, the most the hosted MCP server attaches for AI agents, and capture skips after eight seconds including the lazy import. Screenshots are optional and removable. Console values are bounded; object arguments are not enumerated. Network metadata includes method, sanitized URL, status and duration, never bodies or headers. Identity requires a backend-generated HMAC by default: `user.tuixHash` is the lowercase hex HMAC-SHA256 of the exact user ID, generated using the project secret on the host server. Never expose that secret. Explicit unsigned mode is only for trusted development/internal fixtures, not customer authentication.

Screenshot evidence has explicit **available**, **none**, **restricted** and **unavailable** states, with retry for unavailable evidence. Anyone authorized to view a report can view its original and review screenshots, regardless of authorship or status. The same tenant, project and environment visibility rules apply to reports and screenshots; restricted evidence exposes no image URL. Console and network logs remain private to the author.

Composer text, locators, tokens and screenshots live only in memory while the composer is open; nothing is written to `sessionStorage`. A failed send keeps the text and retries with the same idempotency key; closing discards everything. Shared devices should sign out using `identify(null)` and clear their browser session.

## Development

From the repository root: `npm ci`, then `npm test`, `npm run typecheck` and `npm run build -w @tuix/widget`. The tests use synthetic fixtures; they are regression checks, not a measure of how the widget does on a real application.

With `environment: 'local'`, threads can show enclosing HEEx or supported React development source metadata and a locally configured editor link. Source paths and the editor preference stay in the browser.
