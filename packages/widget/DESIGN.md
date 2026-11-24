---
name: "tuix widget"
description: "Pinned notes: notes are small lights left on someone else's page."
colors:
  bg: "#f3f0fb"
  surface: "#fff"
  raised: "#f6f3fc"
  line: "#d6cfea"
  line-soft: "#e5dff2"
  line-control: "#8b83ab"
  pick: "#fde6dc"
  ink: "#231d3d"
  muted: "#5d5680"
  peach: "#f0906a"
  on-peach: "#2b1812"
  pin-ring: "#fff"
  focus: "#8a3d1f"
  error: "#a3322a"
  dark-bg: "#1c1830"
  dark-surface: "#262041"
  dark-raised: "#30294f"
  dark-ink: "#efeaff"
  dark-muted: "#b2a9d6"
  dark-peach: "#ffb38f"
  dark-focus: "#ffd3bf"
typography:
  title:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.015em"
  body:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: "22px"
  label:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  metadata:
    fontFamily: "Tuix Karla, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: "20px"
  element:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 500
rounded:
  control: "12px"
  card: "14px"
  panel-corner: "18px"
  pill: "999px"
  circle: "50%"
components:
  launcher:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-control}"
    rounded: "{rounded.circle}"
    width: "44px"
    height: "44px"
  launcher-raised:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.on-peach}"
  menu-dot:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-control}"
    rounded: "{rounded.circle}"
    width: "36px"
    height: "36px"
  dot-your-turn:
    backgroundColor: "{colors.peach}"
    borderColor: "{colors.pin-ring}"
    rounded: "{rounded.circle}"
    width: "14px"
    height: "14px"
  dot-open:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.muted}"
    rounded: "{rounded.circle}"
    width: "14px"
    height: "14px"
  button-primary:
    backgroundColor: "{colors.peach}"
    textColor: "{colors.on-peach}"
    rounded: "{rounded.control}"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    borderColor: "{colors.line-control}"
    rounded: "{rounded.control}"
    height: "44px"
  panel:
    backgroundColor: "{colors.surface}"
    borderColor: "{colors.line-soft}"
    width: "360px"
---

# Design System: tuix widget

## Overview

**Creative North Star: "Pinned notes", said quietly**

The widget is a guest on someone else's page, so it speaks softly. Conversations are one person's turn at a time (the conversations design record): a small filled peach dot marks a conversation that is *your turn*, a muted outline marks every other open one, and words, never colours, say the rest. There is one accent (peach: your turn, and the one primary button), one hairline, no filled status chips and no uppercase meta lines.

**Key Characteristics:**

- One family, Karla (the variable font, so weight 450 is real), loaded only when the panel first opens. Message and body text is full `ink`; `muted` is for timestamps and meta only. Nothing is smaller than 13px, sizes and line boxes are whole pixels, and text is never dimmed with `opacity`.
- Light and dark themes that follow the visitor's own setting, never the host page. Text is at least 4.5:1 in both.
- One primary button per view: Send, or Works for a reporter with a fix to check, or Reopen on a closed conversation.
- Visible focus rings, English and Polish copy, inspectable attachments.

## Colors

All colors are `--tx-*` custom properties from `src/tokens.ts`, declared on the shadow root's top-level children so host-page variables never leak in. Light values are in the frontmatter; `dark-` values apply under `prefers-color-scheme: dark`.

- **Grounds:** `surface` for the panel, window, card and flyout; `bg` behind code and attachments; `raised` for the hover state of a row and the notice; `pick` (a solid tint) for a selected suggestion or pressed segment.
- **Ink:** `ink` for all reading text, `muted` for times and meta. `line-soft` is the one hairline around the chat and between messages; `line-control` (at least 3:1) outlines fields, secondary buttons and the resting launcher.
- **Peach:** the viewer's turn (the dot, the turn line's dot, the launcher's waiting count), the primary button, and the comment-mode selection frame (the one transient exception, so it shows on any page). Text on peach is `on-peach`.
- **Gone:** gold, aqua, lavender status fills, `peach-text`. Links and text buttons are ink and underlined; the email switch is ink when on.
- **Compatibility:** `theme.accent` in `init` and stored project accents are accepted and ignored.

## Typography

The core registers self-hosted Karla (Latin and Latin Extended, variable 200–800) as `Tuix Karla` through the FontFace API the first time the panel opens; markers and the launcher never wait for it and fall back to the platform sans. Body is 450 15px/22px; secondary text 13–14px/20px; titles 15px (window) and 20px (panel) at 600. Letter-spacing is only negative on the 20px title. `-webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility` is set once, in the shared token rule on the widget's roots.

## Layout

The launcher sits 16px from the configured lower corner. The panel runs on that side from the top to 72px above the bottom, 360px wide (full width at 480px and below), with an 18px rounded lower corner.

**Launcher.** It rests as a solid `surface` circle with a 1px `line-control` hairline and ink wordmark (3:1 against light and dark pages, no opacity), and comes up peach on hover, focus, while a panel is open, and while something waits for the viewer. Hovering or focusing it raises two 36px menu dots (Reports, Settings). The **waiting count** is one pill beside the launcher: "Your turn" and a peach count, the conversations waiting for the viewer (their turn, fixes to check included). It opens Reports on Your turn. Servers that send `waiting` set it; older ones send `to_verify` and `assigned_active`, which are added.

**Reports.** Pages and Show (Your turn, Open, All), both segmented, at the top. A row is a hairline-separated line: a peach dot when it is your turn, the urgent mark, `#n`, the title, and a quiet word (Fix ready, Fixed, Closed) on the right; under it one line of the newest message. Settings keep Page markers, Developer options (local only) and Notifications.

**Conversation.** Title, then one turn line (dot when it is your turn): "Your turn", "Waiting for Anna", "Waiting for the team" (what a reporter always reads), "Unclaimed" (team viewers only), "Closed" or "Closed · Fixed". The report is the first message; replies and small one-sentence lines (took it, passed it, urgent, fix ready, works, still broken, closed, reopened) follow in time order, separated by a hairline; a reply that sent the turn carries "→ Anna". Under it, quiet actions from the server's `actions` (Fix ready, Take it, Close; Mark fixed locally), the urgent toggle (not on a closed conversation), and the reply form: **Send to** and one **Send** in a signed team session, plain **Send** for the reporter. A closed conversation shows "This conversation is closed. Reopen it to reply." and **Reopen** (optionally with a note). A reporter's fix to check shows Works (primary) and Still broken (note required).

## Elevation & Depth

Only things that float have a shadow, and it is soft: the panel, the chat window, the hover card, the flyout and the verify card. Pins, the launcher, menu dots, the capsule and attention dots are flat.

## Components

- **Buttons:** 44px (36px in the compact chat window), 12px radius, 14px weight 600. Primary is peach with `on-peach`; secondary is transparent with a 1px `line-control` border. Disabled is muted text, not opacity.
- **Fields:** labels above in 13px 600; fields on `surface` with a 1px `line-control` border, 12px radius, focus drawn as a ring outside the box so nothing shifts. The Urgent checkbox is a 20px box with the same border.
- **Dots:** a 28px hit area (WCAG 2.5.8 asks 24px) with a flat 14px dot: filled peach inside a 2px ring for your turn, a `surface`-filled outline in `muted` for open, a 10px outline for closed (shown under All only). Hover and focus add the focus ring around the dot; a moved element makes it dashed. Outline and fill markers follow the same states.
- **Hover card:** 272px, 1px `line-soft` hairline, 12px radius, soft shadow: "#n title", the turn line (and the urgent mark), one line of the newest message.
- **Chat window:** 320px beside the element, hairline border, soft shadow, 16px radius: title, turn line, the conversation, then the quiet actions and the reply form. "Open full thread" is a text button.
- **Verify card:** a small card beside the launcher asking "Fix ready. Does it work now?" with **Check it** (primary) and Later.
- **Updates and settings:** plain blocks separated by hairlines; kinds are muted words.

## Motion

Nothing moves at rest and there are no keyframe animations: menu dots fade over 0.2s with 8px of travel, and colour transitions run 0.16–0.2s. Transforms are only used during those transitions and end at `none`, so text is never blurred by a transform at rest. Reduced motion removes the transitions.

## Do's and Don'ts

### Do:

- Use `--tx-*` tokens for every colour; add new ones to `src/tokens.ts` in both themes.
- Say state in words next to the dot; keep one primary button per view.
- Keep class names stable: tests and the browser regression select them.

### Don't:

- Don't read or reuse host-page colours, fonts or custom properties.
- Don't add filled chips, uppercase meta lines, opacity-dimmed text, drop shadows on flat controls, or a second accent.
- Don't load fonts before the panel opens or add them to the loader.
