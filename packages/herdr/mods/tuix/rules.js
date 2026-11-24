// The After a fix setting: what agents started from now on do once the fix is pushed (per repository).
// Shown in place of the list while the view's rulesOpen is set. Each control has its own element and handler.
import { div } from "gpui-kit";
import { v_flex, h_flex, Textarea } from "gpui-base";
import { DEPLOY_MAX } from "./lib/rules.js";

const help = (t, text) => div().text_size(11).text_color(t.dim).child(text);

// The 18px checkbox of the issue rows. `on` is the tick; `enabled` false shows it dim and does nothing.
function option(v, t, id, label, text, { on, enabled = true, toggle }) {
  const box = div().id(id).size(18).mt(1).flex_none().flex().items_center().justify_center().rounded(4).border_1()
    .border_color(on ? t.accent : t.input).bg(on ? t.accent : t.background).text_size(10).text_color(t.accent_foreground)
    .when(enabled, (e) => e.cursor_pointer().on_click((_e, cx) => { cx.stop_propagation(); toggle(cx); })).child(on ? "✓" : "");
  return h_flex().gap(8).items_start()
    .child(box)
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_color(enabled ? t.foreground : t.dim).child(label))
      .child(help(t, text)));
}

export function rulesView(v, t) {
  const r = v.rules();
  // A change keeps the deploy text typed so far, then the new choice.
  const set = (patch, cx) => v.setRules({ deploy: v.deployInput.value(), ...patch }, cx);
  return v_flex().id("tuix-rules-view").flex_1().min_h(0).p(14).gap(10).overflow_y_scrollbar()
    .child(div().font_semibold().child("After a fix"))
    .child(help(t, `For fixes started in ${v.repo.name} from now on. Agents already running keep what they were told.`))
    .child(option(v, t, "tuix-rules-merge", "Merge the pull request when its checks pass",
      "The agent watches the checks, fixes what its change broke, resolves conflicts with the base branch and merges. It never merges past a failing check or a required review. Reports come from people using your app: unless the repository requires a review, the agent's change is merged without anyone reading it.",
      { on: r.merge, toggle: (cx) => set({ merge: !r.merge }, cx) }))
    .child(option(v, t, "tuix-rules-review", "Then set Fix ready once the fix is deployed",
      "The agent waits for the deploy, then asks the reporter to check. If the deploy fails or it can't tell, it stops and asks you.",
      { on: r.review, enabled: r.merge, toggle: (cx) => set({ review: !r.review }, cx) }))
    .when(r.review, (e) => e.child(v_flex().gap(4)
      .child(help(t, "How to tell that it is deployed (optional)"))
      .child(div().id("tuix-rules-deploy").px(10).py(6).rounded(8).border_1().border_color(t.border).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Textarea.new(v.deployInput)))
      .child(help(t, "For example: \"The Deploy workflow on main has finished for the merge commit.\" Left empty, the agent looks for a deploy run of the merge commit itself."))
      .child(help(t, `Up to ${DEPLOY_MAX} characters.`))))
    .child(help(t, "These agents keep running after the pull request is open and don't count towards the 3 at once."))
    .child(h_flex().child(v.button("tuix-rules-done", "Done", (_e, cx) => v.closeRules(cx), { primary: true })));
}
