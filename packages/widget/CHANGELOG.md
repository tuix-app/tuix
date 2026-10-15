# Widget changelog

## 0.3.0

- **Fill** marker style: a third marker style besides dot and border, the element's box filled with the state colour at 50% opacity. Like border markers, it lets clicks pass through to the host app.
- The hover card (0.2.5) is now clickable and opens the chat. It also shows the latest message with an unread dot and, below it, whose turn it is. Without a reply it shows the start of the description (four lines at most) in place of the title, and it works for fill markers like the other styles. Hovering still makes no requests.
- Anchored chat window: clicking a dot or the card opens a small chat window beside the element with the last messages, a reply box with mentions, the verify actions and **Open full thread**, which moves to the side panel. Touch and narrow screens keep the side panel.
- Whose turn: a line on the card, in the chat window, on the dashboard and in MCP output shows whether the team, the reporter or verification is next. Derived by the server from the state and the latest message. Against an older server the line is absent.

## 0.2.5

- Markers have hover cards. Pointing at a dot, or at an element an outline marks (outlines let the pointer through, so the element under it counts; the smallest marked one wins), shows a small card after 150ms with the report's number and state and the start of its description, six lines at most, plus "Element moved" when the element is gone. It shows whenever markers do: with the sidebar open, or closed with **Keep visible when closed**. The card sits below the marker, or above it near the bottom of the screen, and never runs past the viewport. It stays while the pointer moves onto it, yet lets clicks through to the page; leaving both, picking an element, or the marker scrolling away hides it, and it does not come back until the pointer points at the marker again. Escape dismisses it and only it: the sidebar stays open (a second Escape closes it as before). Keyboard focus on a dot shows it at once and describes the dot (`aria-describedby`). Touch screens have no hover, so a tap still opens the thread. Elements inside frames get no card for their outlines. The dots' native tooltip, which showed only the title, is gone. Deploy dependency: the server sends the description's start as `excerpt` on list rows (280 characters at most); against an older server the card shows the title.

## 0.2.4

- Keys pressed in the widget no longer reach the host page. The widget lives in a shadow root, so a page's keyboard listeners see a key typed into the widget's reply box as typed on its `<tuix-widget>` element, and a shortcut handler that skips keys typed into inputs (by checking `event.target.closest('input,textarea')`) took them as shortcuts and could cancel them. That is the likely reason someone on one host app could not type spaces in a report's comment; on tuix's own dashboard, which runs the widget in local development, j and k typed in the widget moved the issue list's selection instead. A host that cancels Space or Enter the same way also stopped the widget's buttons and pins from activating from the keyboard. Every key pressed in the widget (typed into the composer, replies, notes, the editor template or Settings, pressed on its buttons and pins, or in the Shopify reviewer sign-in) now stops at the widget (keydown, keypress and keyup). Escape still reaches the page, so the settings flyout and host dialogs close on it as before.
- **Hide closed** in Settings, on by default, as on the dashboard: Done, Won't fix and Closed reports stay out of Reports, on This page and on All pages, so **Show: All** lists open, in progress and in review reports (the list asks the server for `show=unresolved`). Turning it off shows them again at once. The choice is remembered in this browser with the other report preferences (`tuix:preferences:<project>`). A thread already open stays open, a report link (`?tuix=`) to a closed report still opens it, and markers, the summary capsule and Updates on your reports are unchanged; markers never show closed reports. Polish: "Ukryj zamknięte".

## 0.2.3

- **How often to email me** in Settings, under **Updates on your reports**, beside the email switch: Immediately, Every 15 minutes (the default), Every hour, Twice a day (09:00 and 16:00) or Daily (09:00). It shows for anyone whose app shares their email, also without the status opt-in, because replies and mentions are emailed anyway. Saving sends the browser's time zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) with the choice, so summaries go out at the reader's own times; a failed save restores the previous choice with the usual error. Polish strings included. Against a server without email schedules (no `email_schedule` in `/preferences`) nothing new shows.

## 0.2.2

- Sticky elements inside a scrolled pane (a table's header in an app shell's scrolling main area, a sticky first column or footer) stay where the reporter saw them in the screenshot, and the band marks them there. In 0.2.1 they moved out of the image with the pane's content, and a header chosen as the target was outlined over the row beneath it.
- Positioned elements that are direct children of a scrolled pane keep their place in the screenshot: a sticky bar or an absolutely positioned element stays above the rows that scroll beneath it, as on the page, instead of being painted over by them, and a fixed element (or an absolute one anchored outside the pane) stays where it was on screen instead of scrolling away with the pane's content. A fixed element nested deeper in a scrolled pane can still be missing.
- Absolutely positioned elements placed against the page (overlays, dropdowns, tooltips) are no longer drawn too low by the first element's top margin, which the copy let collapse through the page root.
- A redraw that runs past the capture's deadline no longer discards the screenshot: the last PNG within the server's 5 MB limit is kept.
- Quirks-mode pages (no doctype) are captured one viewport tall, as the reporter sees them, instead of the whole document squeezed into one image.

## 0.2.1

- Sharper screenshots: capture at the device pixel ratio, up to 3,200 pixels on the longest side, instead of scaling every capture to 1,600 CSS pixels. A Retina screen keeps its detail (1672×925 at 2× becomes 3200×1770, not 1600×885) and a 1920-pixel screen keeps 1920. A PNG over 3.7 MB, too large for the hosted MCP server to hand AI agents as an image, is redrawn smaller within the same capture budget: first to the size its bytes call for, then to 1,600 pixels at most; out of time, a PNG within the server's 5 MB limit is kept. Deploy dependency: the server must accept screenshots up to 3,200 pixels per side (`Tuix.Storage`, shipped with this widget); an older server refuses a report whose screenshot is wider than 1,600.
- The selected element's highlight is drawn onto the screenshot instead of styling the element in the page copy, so page CSS (`outline: none !important`, a clipping ancestor) can no longer hide it. It is a 5px peach band with a thin dark halo, visible on light and dark pages, placed where the element is when the page is copied. Scrolled panes, such as an app shell's scrolling main area or a scrolled list, are captured as the reporter sees them instead of scrolled to the top, so the band marks the right row. No frame is drawn around the whole image: not for the page itself (a Still broken capture whose element is gone) nor for an element that fills nearly all of it. An element inside a frame still gets no highlight.
- Selects (report type and severity, the Environment setting) draw their own chevron in the theme's muted ink, with room from the right border; the native one sat against it.
- **Open tuix.app** points at the dashboard's sign-in (`/login`) instead of its bare origin, which becomes the marketing page at launch. A middle click, a copied link or a browser that skips the click handler lands on sign-in; a normal click still opens the one-time handoff.
- Mention people in a reply: typing **@** in a report's reply box lists team members by name and people already in the conversation, under the textarea; arrows move, Enter or Tab picks, Escape closes only the list. Picking inserts "@Name"; the reply sends the people still named in it, and they hear about it. Replies show mentions as soft "@Name" chips (rendered as text, never HTML), and **Updates on your reports** labels a mention "Mentioned you". Only threads the server marks `can_mention` (signed sessions on open reports) offer suggestions; lookups wait 300 ms, ask each query once per thread and hide quietly on any failure. Deploy dependency: release this widget only after the server with mentions runs everywhere; against an older server the reply box stays plain.

## 0.2.0

- Reading a report no longer shows the panel's **Add comment** button: a thread has its own reply form, and **Reports** returns to the list where the button lives. Screenshot previews open in a new tab so the host page keeps its place. The settings flyout breathes more (20px between groups, legends aligned with their controls, a hairline before Updates) and ends with a small `tuix <version>` line.
- Use the new report states everywhere: Open, In progress, In review, Done, Won't fix and Closed (Otwarte, W toku, Do sprawdzenia, Gotowe, Bez poprawki, Zamknięte). The widget reads `state` and falls back to the legacy `status` from older servers, and sends `X-Tuix-Widget: 2` on every API call. Deploy dependency: the server's widget CORS (`TuixWeb.Plugs.WidgetAuth`) must allow the `x-tuix-widget` request header first, or browsers reject every preflight. Pins: peach open, gold in progress, an aqua ring in review.
- Show who fixes a report: "Fixer: {name}" or "No fixer yet", with **Assign to me** for people allowed to fix. Status actions follow the states the server allows for you, on finished reports too: reporters get **Done** and **Close** (and **Still broken** with a note while a report is in review, now in every environment); fixers get **Start**, **Ready for review** and **Won't fix** (with a note). Fixer actions, Assign to me and Mark fixed show only when your session may take them (a signed identity or a linked account). On an unassigned report, Start assigns you first. A note form takes keyboard focus, and a finished action or Cancel returns focus to the report's status line. **Mark fixed** stays in local development and the thread says "Fix waiting for deploy" until the fix ships.
- Filter the reports panel with **Show** (Open, To verify, All) and **Involving** (Me, Everyone). A stored Show: Open keeps its name and now means open or in progress; a stored Reported by: Me becomes Involving: Me. Defaults are Open and Everyone. Page markers ignore these filters and always show unresolved reports from everyone.
- Settings flyout: Pages, Markers, Keep visible when closed and Environment (local), then **Updates on your reports** (five newest in a scroll, Mark all as read, the email switch) and a quiet **Open tuix.app** link, which opens a one-time handoff when you are linked and signed, and emails you a sign-in link only when the server says no handoff is available (other failures ask you to retry). A browser never says when it blocked the new tab, so the flyout also offers the handoff as a direct **Continue to tuix.app** link until it is about to expire. Show and Reported by moved to the reports panel. The flyout fits the viewport and scrolls. Clicking Settings loads the core without opening the side panel; hovering still makes no requests. The gold reply dot opens Settings. Hosts with `launcher: false` keep Updates at the top of Reports.
- A summary capsule beside the launcher: "To verify n" (aqua) and "Open n" (peach) from `/me/summary`. Each segment opens Reports on all pages, filtered to you. It replaces the page-scoped "Verify n" capsule and hides while the menu dots, a panel or the flyout show. `tuix.open(filter)` and a queued `tuix('open', filter)` accept `{ scope, show, involving }`.
- Keep an untouched browser idle. Once someone opens tuix for a project, the browser remembers it for 30 days (`tuix:active:<project>`): the loader then loads the SDK eagerly and the SDK fetches the summary once the page is idle (without `requestIdleCallback`, one second after the page loads), without loading the core. The summary refreshes when the panel closes and on live updates. Hosts with `launcher: false` have no capsule, so they are never marked and never load early. An eager load leaves the bootstrap launcher usable: a click during the download is queued and replayed once the SDK arrives, and only a load someone asked for offers "Click to retry" when it fails. The launcher menu adds document listeners only while its dots or the flyout show, so an idle page carries none.
- Opening Settings while composing hides the composer and keeps its selection and text in memory; the launcher or the Reports dot returns to it. While hidden it counts as closed: page markers show only with Keep visible when closed, the report list stops polling, and hiding neither refetches the summary nor moves focus back to the page. X, Escape or the launcher while the composer is visible still close it and discard everything, and so does choosing another view while it is hidden (a capsule segment or `tuix.open(filter)`, an update, a marker).
- Restyle the widget in Evening Light: peach, gold and aqua lights on a lavender-grey panel, with light and dark themes that follow the visitor's own setting.
- Turn the launcher into a small menu: hovering or focusing it raises two dots, Reports and Settings. The settings flyout no longer has a Reports button.
- Color pins by conversation state (open, answered, ready to verify) instead of report type and severity; the screenshot outline is always peach.
- Replace Public Sans with Karla, loaded only when the panel first opens.
- Ignore project accent colors (`theme.accent` and stored settings); every site shows the tuix palette.
- Serve the Phoenix-hosted runtime through a short-cached stable manifest; retain bundled delivery as an explicit fallback.
- Require signed identities by default and reject unsigned sessions when a project requires signatures.
- Add read-only organization/project credentials and an MCP adapter for paginated issue/status access.
- Keep markers below all Tuix panels and controls.
- Share screenshots with any authorized report viewer, while keeping private logs and upload ownership restricted.
- Remove the draft feature: nothing is written to sessionStorage and there is no "Restore draft" notice. The composer keeps its text in memory while open; a failed send keeps the text and retries with the same idempotency key so it cannot duplicate the report.
- Fix: closing the composer (X, Escape or the launcher) discards the chosen element, so the next launcher click starts element picking instead of reopening the old composer.
- Opening the settings flyout closes any open reports or thread panel (a composer is hidden and kept instead); opening Reports closes the flyout. Hovering alone still makes no API request.
- Open the sidebar directly in element-picking mode from the launcher; compose beside the page inside the sidebar, discard the selection on close, and show the submitted thread with Add another.
- Keep public `tuix.open()` report browsing and report deep-link behavior compatible.
- Move settings into a compact launcher-adjacent hover/focus flyout with delayed reveal, dismissal grace and an explicit keyboard/touch toggle.
- Remember project-scoped Pages, Show and local-only environment preferences separately from the compatible marker preferences; synchronize report filters and fail safely when browser storage is unavailable or corrupt.
- Scope current-page reports and open-issue markers to concrete origin + pathname rather than normalized routes, without arbitrary query capture.
- Keep hover settings idle until activation or persistent-marker opt-in; navigate report, page and screenshot links in the same tab.
- Explain screenshot availability with available, none, restricted and unavailable states and retry, without widening existing screenshot permissions.

## 0.1.2

- Centre report markers on their elements and offer outlines beside dots, in the same report colors.
- Keep markers on the page after closing the sidebar when the commenter chooses it; the choice persists per browser and survives reloads.
- Filter the project-wide report list between all reports and open ones only.
- Replace the launcher icon with the small product wordmark, which no longer reads as host-application chat.
- Browse project reports across pages, grouped by concrete URLs with links to individual reports.
- Load older reports while retaining project and environment visibility.

## 0.1.1

- Color reports, pins and screenshot frames by severity and feedback type.
- Replace pin numbers with a gentle pulse, respecting reduced motion.
- Post reports and replies in the background while preserving failed drafts.
- Show constrained screenshot previews with readable loading and failure states.

## 0.1.0

Prepared for private installation; this entry does not announce a public release.

- Capture element-anchored feedback with screenshots, privacy masks and optional diagnostics.
- Identify commenters through the host application, with optional server-signed identity.
- Browse page-scoped reports and complete conversations, including older replies.
- Review deployed fixes, keep local source annotations in the browser, and receive live updates.
- Support English and Polish interfaces and invited Shopify storefront reviewers.

The release workflow attaches the exact source commit, pinned asset directory and SHA-384 loader hashes to the prepared changelog artifact. A shipped release must be recorded separately after deployment verification; building this version does not send upgrade email or publish a package.
