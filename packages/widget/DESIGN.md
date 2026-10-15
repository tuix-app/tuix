---
name: "tuix widget"
description: "Evening Light: notes are small lights left on someone else's page."
colors:
  bg: "#f3f0fb"
  surface: "#fff"
  raised: "#f6f3fc"
  line: "#d6cfea"
  line-soft: "#e5dff2"
  line-control: "#8b83ab"
  ink: "#231d3d"
  muted: "#5d5680"
  peach: "#f0906a"
  on-peach: "#2b1812"
  peach-text: "#a4461f"
  gold: "#f2c14e"
  on-gold: "#2b2310"
  aqua: "#2aa392"
  on-aqua: "#0b2622"
  aqua-text: "#157a6c"
  pin-ring: "#fff"
  focus: "#8a3d1f"
  error: "#a3322a"
  dark-bg: "#1c1830"
  dark-surface: "#262041"
  dark-raised: "#30294f"
  dark-ink: "#efeaff"
  dark-muted: "#b2a9d6"
  dark-peach: "#ffb38f"
  dark-gold: "#f4d58d"
  dark-aqua: "#86e0d0"
  dark-focus: "#ffd3bf"
typography:
  title:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-.015em"
  body:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.4
  metadata:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "12px"
    lineHeight: 1.5
  element:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "11.5px"
    fontWeight: 500
rounded:
  control: "12px"
  card: "14px"
  panel-corner: "18px"
  pill: "999px"
  circle: "50%"
components:
  launcher:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.on-peach}"
    rounded: "{rounded.circle}"
    width: "44px"
    height: "44px"
  menu-dot:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.circle}"
    width: "36px"
    height: "36px"
  pin:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.on-peach}"
    rounded: "{rounded.circle}"
    width: "28px"
    height: "28px"
  pin-in-progress:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.on-gold}"
  pin-in-review:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.aqua-text}"
    borderColor: "{colors.aqua}"
  summary-capsule:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line}"
    rounded: "{rounded.pill}"
    height: "36px"
  button-primary:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.on-peach}"
    rounded: "{rounded.control}"
    height: "42px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-control}"
    rounded: "{rounded.control}"
    height: "42px"
  panel:
    backgroundColor: "{colors.surface}"
    width: "360px"
---

# Design System: tuix widget

## Overview

**Creative North Star: "Evening Light"**

The widget is a guest on someone else's page. Notes are small lights left where something was noticed: a peach light is an open note, gold means someone is working on it, an aqua ring means a fix is ready to check. Everything is calm, rounded and quiet until someone asks for it. The shared reference is the tuix design system; this file records what the widget implements.

**Key Characteristics:**

- One family, Karla, loaded only when the panel first opens.
- Light and dark themes that follow the visitor's own setting, never the host page.
- Color says where a conversation is; words always say it too.
- Visible focus, English and Polish copy, inspectable attachments.

## Colors

All colors are `--tx-*` custom properties from `src/tokens.ts`, declared on the shadow root's top-level children so host-page variables never leak in. The light values are in the frontmatter; dark values (prefixed `dark-` above) apply under `prefers-color-scheme: dark`.

- **Grounds:** `bg` behind fields and messages, `surface` for the panel, flyout and menu dots, `raised` for lifted content (updates, attachments, hints).
- **Ink:** `ink`, then `muted` for metadata. `line-soft` divides, `line` outlines quiet containers, `line-control` (at least 3:1) outlines every field and secondary button.
- **Peach:** the launcher, primary actions, new pins, the element highlight and its chip, the comment-mode frame. Text on it is `on-peach`; peach text on grounds uses `peach-text`.
- **Gold:** in-progress pins, the reply dot and the "Fix waiting for deploy" chip.
- **Aqua:** the in-review ring, the capsule's "To verify" segment, the email switch, update kinds.
- **Peach (again):** the capsule's "Open" segment.
- **Status chips:** Open peach, In progress gold, In review aqua, Done, Won't fix and Closed lavender, TEAM aqua fill. Labels come from `statusLabel`, which also maps the legacy names an older server sends.

Projects can no longer choose a color. `theme.accent` in `init` and stored project accents are accepted and ignored, so every site shows the same lights.

## Typography

The core registers self-hosted Karla (Latin and Latin Extended, variable 200–800) as `Tuix Karla` through the FontFace API the first time the panel opens; markers and the launcher never wait for it. Everything falls back to the platform sans. The launcher and menu use `system-ui` at the same size and weight because they render before the core. Element names in the highlight chip and selection bar use the platform monospace.

## Layout

The launcher sits 16px from the configured lower corner. The panel runs on that side from the top to 72px above the bottom, 360px wide (full width at 480px and below), with an 18px rounded lower corner. Picking guidance, the composer, reports and threads all live in the panel.

**Launcher menu.** Hovering or focusing the launcher raises two 36px dots from it, stacked in the launcher's column: Reports nearest (68px from the bottom) and Settings above it (112px). They rise with a small spring and a 50ms stagger and sink back when the pointer leaves, after a 400ms grace period so the pointer can cross into them. Each dot shows a short label beside it on hover or focus. Reports opens report browsing (the same as `tuix.open()`); Settings opens the flyout. The launcher itself still starts comment mode on click. On touch screens the dots sit beside the launcher while feedback is open. The bootstrap loader draws the same dots before the SDK loads.

The settings flyout (280px) opens beside the launcher with Pages, Hide closed (on by default: Done, Won't fix and Closed reports stay out of Reports), Markers (Dots / Outlines / Fills), Keep visible when closed and, in local development, Environment, then **Updates on your reports** (five newest in an internal scroll, Mark all as read, the email switch) and a quiet **Open tuix.app** link in muted, underlined 12.5px text. After a handoff, a muted status line under it reads "No new tab? Continue to tuix.app" in the same link style, because a blocked tab cannot be detected; it disappears once followed or shortly before the one-time code expires. It is capped at `calc(100vh - 32px)` and scrolls; on touch screens the flyout sits higher and is capped at `calc(100vh - 88px)`. Show and Involving live at the top of the reports panel, not in the flyout. Clicking Settings loads the core so updates render there, without opening the side panel; the core draws them into a slot the flyout keeps across redraws. Hosts with `launcher: false` have no flyout, so their updates stay at the top of Reports.

Only one surface is open at a time: opening the flyout closes any open reports or thread panel, and opening Reports closes the flyout. A visible composer is hidden instead, with its selection and text kept in memory; the launcher or the Reports dot returns to it. While hidden it counts as closed, as it does for the SDK: page markers stay only with Keep visible when closed, and the summary is not refetched (nothing was sent). Closing the composer (X, Escape or the launcher while it shows) discards the element selection and text; nothing is stored, and a failed send keeps the text in place for a retry with the same idempotency key.

**Summary capsule.** One pill 8px beside the launcher, vertically centred on it, with up to two segments: "To verify n" in aqua text with an aqua count, and "Open n" in peach text with a peach count. A zero segment is hidden; so is the whole capsule when both are zero, while the menu dots are revealed, and while a panel or the flyout is open. Each segment opens Reports on All pages, filtered to To verify or Open and Involving: Me. The capsule is a labelled group ("Reports waiting for you") so screen readers announce the segments together. If a composer is hidden behind Settings, a segment discards it and shows the filtered list.

## Elevation & Depth

Depth separates the widget from the host: the panel has a soft side shadow, hints and flyouts a deep soft shadow, the menu dots and the summary capsule a short drop (`--tx-shadow-dot`). Lights glow: pins, the launcher and the attention dot carry a peach or gold halo; the verification pin has none. Every pin, badge and dot sits in a 2px `pin-ring` so it reads on any host background.

## Components

- **Buttons:** 42px, 12px radius, 14px weight 700. Primary is peach; secondary is transparent with a `line-control` border that turns peach on hover. Disabled at 0.5 opacity.
- **Fields:** labels above in 13px 700; fields on `bg` with a 1.5px `line-control` border and 12px radius.
- **Reports:** Show (Open, To verify, All) and Involving (Me, Everyone) pill filters, then rounded rows on `bg` with the title, kind and status chip. Threads show the report and each reply as rounded message blocks; team replies sit on `raised` with a TEAM chip. A mention in a reply is a soft chip: `glow-soft` behind `peach-text`, weight 600, fully rounded, with the "@" kept so it never relies on color; chips are not links.
- **Mentions in the reply box:** where the thread allows it, a muted hint under the textarea ("Type @ to mention someone.") and, while suggesting, a list under the textarea at full width: up to six 38px rows on `surface` with a hairline border and soft shadow, each a name with a TEAM chip for team members. The active row has the open wash and a peach outline. It is not anchored at the caret, so it works in the 360px panel and on phones; the textarea keeps focus throughout.
- **Thread state:** the status chip, "Fixer: name" (or "No fixer yet") in muted text with the name in ink, and a small pill **Assign to me** on the right. Below it, a gold-dotted "Fix waiting for deploy" chip while a local fix waits for a deploy, then a row of 36px pill buttons for the states the caller may set (Done, Close, Still broken; Start, Ready for review, Won't fix). Won't fix and Still broken first ask for a note; the note field takes focus, and when an action finishes or the note is cancelled, focus moves to the thread state line (it shows the focus ring) instead of falling to the page. Fixer states, Assign to me and Mark fixed need `can_be_fixer`.
- **Verification:** an aqua-washed block with guidance, the developer's note and Done / Still broken, shown to the reporter while a report is in review.
- **Pins:** 28px lights: peach open with a slow breathing glow, gold in progress, aqua ring with a check in review, a dashed outline when the element moved. Outline markers are a 4px frame in the same state color; fill markers cover the element's box with the state color at 50% opacity inside a 2px frame (in review keeps its 6px double aqua frame, a moved element a dashed one). Both are decorative and click-through, so the host element underneath stays usable.
- **Hover card:** resting on a marker (a dot, or the box of an outline or fill) for about 200ms, or focusing a dot, opens a 272px card beside it: surface ground, 1px `line` border, 14px radius, the deep soft shadow. The title "#number title" is 13.5px weight 700 on one line (ellipsis; with no reply and a description it is the number alone, since the description opens with the title), led by an 8px gold dot (the colour of the reply dot) when the caller has unread updates; below it the status chip, then the turn line in 12px weight 600 `muted` text (one line phrased for the viewer: "Waiting for your reply", "The team is on it", "Fix ready for you to check", "Your turn", "Waiting for the reporter", "Waiting for the team", "Waiting for the reporter to check"; nothing when the server sends no turn or the report is finished), and "Element moved" in muted text on an orphan, then the latest reply with the author in bold ("Team" for a team reply), clamped to two lines; with no reply, the start of the description (whole, its first line, the title, on a line of its own, line breaks kept and blank lines folded away, in ink text, four lines at most), or the title and "No replies yet" in muted text when an older server sends no description. It fades in over 0.15s, sits above the panel, stays inside the viewport (cut to fit a short one) and is a button: clicking it opens the report. Escape dismisses it alone (the panel stays), and it does not return until the pointer has left the marker. No card on touch-first devices.
- **Chat window:** clicking a dot or a card opens a dialog 320px wide beside the element (right, else left, below, above; 8px inside the viewport, clear of an open sidebar), at most 480px tall: surface ground, 1px `line` border, a 3px top edge in the marker's colour (peach, gold, aqua), 16px radius, the deep soft shadow, above the panel. The header holds "#number title" at 15px weight 700 over the status chip with the same turn line beside it (the card's style), and a 32px close button; the body scrolls and sits at its end on the newest of five replies, with a quiet **Show earlier** text button above them; replies are the thread's comment cards, tightened to 8px 10px. A reporter's verification block (the same aqua wash as the panel's, without its guidance) shows Done / Still broken. The footer, divided by a soft rule, holds the reply box (64px tall, same mention list) with a right-aligned Reply, and a quiet **Open full thread** link. The focus ring shows on its controls, not on the window; it fades in over 0.15s and has no motion with reduced motion. The mention list inside it is capped at 140px so the replies stay in view. Touch-first devices and narrow viewports get the side panel instead.
- **Highlight:** a peach 2px outline with a soft glow and a peach monospace chip naming the element. Comment mode frames the viewport in peach.
- **Around the launcher:** a peach attention dot when this page has open notes, a gold reply dot when there are updates on your reports (a button with a finger-sized hit area; it opens Settings), and the summary capsule.

## Motion

Panel entry 0.45s cubic-bezier(.2,.8,.2,1); menu dots 0.34s spring; pin breathing 9s; hover card and chat window fade 0.15s; attention dot 6s. Reduced motion removes travel and pulsing, never access.

## Do's and Don'ts

### Do:

- Use `--tx-*` tokens for every color; add new ones to `src/tokens.ts` in both themes.
- Keep status words beside every state color.
- Keep class names stable: tests and the browser regression select them.

### Don't:

- Don't read or reuse host-page colors, fonts or custom properties.
- Don't reintroduce per-project colors or report-type colors on pins.
- Don't load fonts before the panel opens or add them to the loader.
