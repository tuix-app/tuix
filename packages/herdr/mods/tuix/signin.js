// The sign-in view: Tuix address, then the Keychain command (macOS) or a masked token field.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input, TextView } from "gpui-base";
import { validUrl } from "./lib/mcp.js";
import { keychainCommand, onMac } from "./secret.js";

// Order matters: the command and the token share the clipboard, so the token is copied only once the
// command is waiting for it.
const MAC_STEPS = [
  "1. Copy this command and run it in a terminal.",
  "2. When it asks for a password, copy your token from Tuix (Project settings → AI) and paste it there. Copy the token only now: copying the command again would replace it.",
  "3. Click Connect. When macOS asks whether the panel may read it, click Allow — never Always Allow, which would let any Herdr mod read it."
];
const OTHER_STEPS = "Kept in memory only: paste it again after Herdr restarts.";

const AGENTS_NOTE = "Agents that fix issues use their own Tuix connector in Claude Code. It must be allowed to change issues.";

const field = (t, id, state) => div().id(id).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.border).cursor_text()
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(state).h_full().text_size(12).text_color(t.foreground));

export function signinView(v, t) {
  const url = v.urlInput.value().trim(), mac = onMac();
  const command = validUrl(url) ? keychainCommand(new URL(url).origin) : keychainCommand("<your Tuix address>");
  return v_flex().flex_1().min_h(0).p(14).gap(10).overflow_y_scrollbar()
    .when(Boolean(v.notice), (e) => e.child(div().text_color(t.ansi1).child(v.notice)))
    .child(div().text_size(11).text_color(t.dim).child("Tuix address"))
    .child(field(t, "tuix-url", v.urlInput))
    .when(mac, (e) => e
      .child(div().text_color(t.muted).child(MAC_STEPS[0]))
      .child(div().p(8).rounded(8).bg(t.raised).border_1().border_color(t.border).text_size(11).font_family(v.mono())
        .child(TextView.markdown("tuix-keychain", "```\n" + command + "\n```").selectable()))
      .child(h_flex().gap(8)
        .child(v.button("tuix-copy", v.copied ? "Copied" : "Copy", (_e, cx) => v.copy(command, cx))))
      .child(div().text_color(t.muted).child(MAC_STEPS[1]))
      .child(div().text_color(t.muted).child(MAC_STEPS[2])))
    .when(!mac, (e) => e
      .child(div().text_size(11).text_color(t.dim).child("Token"))
      .child(field(t, "tuix-token", v.tokenInput))
      .child(div().text_color(t.muted).child(OTHER_STEPS)))
    .child(div().text_size(11).text_color(t.dim).child(AGENTS_NOTE))
    .child(h_flex().child(v.button("tuix-connect", v.connecting ? "Connecting…" : "Connect", (_e, cx) => v.connect(cx), { primary: true, disabled: v.connecting })));
}
