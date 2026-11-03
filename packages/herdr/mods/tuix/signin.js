// The sign-in view: the Tuix address and Sign in with Tuix, then the code to approve in the browser.
import { div } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";

const AGENTS_NOTE = "Agents that fix issues use their own Tuix connector in Claude Code. It must be allowed to change issues.";
const KEPT_NOTE = "The sign-in is kept in memory only: approve again after Herdr restarts.";

const field = (t, id, state) => div().id(id).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.border).cursor_text()
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(state).h_full().text_size(12).text_color(t.foreground));

// The code is shown large and spaced so it can be compared with the one in the browser.
function waiting(v, t) {
  const d = v.device;
  return v_flex().gap(10)
    .child(div().text_color(t.muted).child(d.openUrl ? "Opening your browser… Approve the code there." : `Open ${d.textUrl ?? d.url} in your browser and enter the code.`))
    .child(div().id("tuix-user-code").p(14).rounded(8).bg(t.raised).border_1().border_color(t.border).flex().justify_center()
      .text_size(28).font_semibold().font_family(v.mono()).child(d.user_code))
    .child(h_flex().gap(8)
      .when(Boolean(d.openUrl), (e) => e.child(v.button("tuix-open-browser", "Open browser", (_e, cx) => v.openBrowser(cx), { primary: true })))
      .child(v.button("tuix-cancel-signin", "Cancel", (_e, cx) => v.cancelSignIn(cx))));
}

export function signinView(v, t) {
  return v_flex().flex_1().min_h(0).p(14).gap(10).overflow_y_scrollbar()
    .when(Boolean(v.notice), (e) => e.child(div().text_color(t.ansi1).child(v.notice)))
    .child(div().text_size(11).text_color(t.dim).child("Tuix address"))
    .child(field(t, "tuix-url", v.urlInput))
    .when(Boolean(v.device), (e) => e.child(waiting(v, t)))
    .when(!v.device, (e) => e.child(h_flex().gap(8)
      .child(v.button("tuix-signin", v.connecting ? "Signing in…" : "Sign in with Tuix", (_e, cx) => v.signInWithTuix(cx), { primary: true, disabled: v.connecting }))
      .when(v.connecting && !v.session, (e) => e.child(v.button("tuix-cancel-signin", "Cancel", (_e, cx) => v.cancelSignIn(cx))))))
    .child(div().text_size(11).text_color(t.dim).child(KEPT_NOTE))
    .child(div().text_size(11).text_color(t.dim).child(AGENTS_NOTE));
}
