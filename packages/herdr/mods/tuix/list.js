// The list view: issues of the project, grouped, as plain rows. Each control has its own element and handler.
import { div, svg } from "gpui-kit";
import { terminals } from "herdr";
import { v_flex, h_flex } from "gpui-base";
import { turnLabel } from "./lib/issues.js";
import { rowsOf, runLine } from "./lib/rows.js";

const tag = (t, text, color) => div().px(5).py(1).flex_none().rounded(4).border_1().border_color(t.border).text_size(10).text_color(color ?? t.muted).child(text);

function small(v, t, id, label, action, { accent = false } = {}) {
  return div().id(id).px(8).py(2).flex_none().rounded(6).border_1().border_color(accent ? t.accent : t.border).text_size(11)
    .text_color(accent ? t.accent : t.muted).cursor_pointer().on_click(action).child(label);
}

// The run under a row: status icon, elapsed time, stack, link or branch, and Remove on a stopped or PR-open run (the record only).
function runRow(v, t, issue, run) {
  const l = runLine(run, Date.now(), { focusable: terminals().some((x) => x.address === run.terminal) }), color = l.tone === "alert" ? t.ansi1 : t.dim;
  return h_flex().px(14).pb(6).pl(40).gap(8).items_center().flex_wrap()
    .child(h_flex().id(`run-${issue.id}`).gap(6).items_center().min_w(0)
      .when(l.focus, (e) => e.cursor_pointer().on_click(() => v.focusRun(run)))
      .when(l.icon === "spinner", (e) => e.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
      .when(l.icon === "dot", (e) => e.child(div().size(8).flex_none().rounded(4).bg(t.ansi1)))
      .child(div().text_size(11).text_color(color).child(l.text || "PR open"))
      .when(l.stacked != null, (e) => e.child(div().text_size(11).text_color(t.dim).child(`stacked on #${l.stacked}`))))
    .when(Boolean(l.link), (e) => e.child(small(v, t, `pr-${issue.id}`, "Open PR", (_e, cx) => cx.open_url(l.link), { accent: true })))
    .when(!l.link && run.state === "pr_open", (e) => e.child(div().text_size(11).text_color(t.muted).child(l.branch)))
    .when(l.remove, (e) => e.child(small(v, t, `remove-${issue.id}`, "Remove", (_e, cx) => v.removeRun(issue.id, cx))));
}

function issueRow(v, t, r) {
  const { issue } = r, run = r.section === "fixing" || r.section === "prOpen" ? v.runs.find((x) => x.issueId === issue.id) : null, label = turnLabel(issue, { me: v.meOf(issue), names: v.names }), picked = v.selected.has(issue.id);
  const who = issue.author?.name ?? "the reporter";
  return v_flex().id(`issue-${issue.id}`).hover((s) => s.bg(t.hover))
    .child(h_flex().px(14).py(6).gap(8).items_start()
      // The checkbox is its own control: it toggles the Fix selection and never opens the thread.
      .when(r.checkbox, (e) => e.child(div().id(`check-${issue.id}`).size(18).mt(1).flex_none().flex().items_center().justify_center().rounded(4).border_1()
        .border_color(picked ? t.accent : t.input).bg(picked ? t.accent : t.background).text_size(10).text_color(t.accent_foreground).cursor_pointer()
        .on_click((_e, cx) => { cx.stop_propagation(); v.toggle(issue.id, cx); }).child(picked ? "✓" : "")))
      .child(v_flex().id(`open-${issue.id}`).flex_1().min_w(0).gap(2).cursor_pointer().on_click((_e, cx) => v.openThread(issue, cx))
        .child(h_flex().gap(8).items_center()
          .child(div().flex_none().text_color(t.dim).child(`#${issue.number}`))
          .child(div().flex_1().min_w(0).truncate().child(issue.title ?? ""))
          .when(Boolean(issue.type), (e) => e.child(tag(t, issue.type)))
          .when(Boolean(issue.severity), (e) => e.child(tag(t, issue.severity, issue.severity === "blocking" ? t.ansi1 : null))))
        .when(v.all || Boolean(label), (e) => e.child(h_flex().gap(6).items_center()
          .when(v.all && Boolean(issue.projectName), (x) => x.child(div().flex_none().text_size(11).text_color(t.muted).child(issue.projectName)))
          .when(Boolean(label), (x) => x.child(div().min_w(0).text_size(11).text_color(label === "Your turn" ? t.accent : t.dim).child(label)))))))
    .when(Boolean(run), (e) => e.child(runRow(v, t, issue, run)))
    .when(r.actions.length > 0, (e) => e.child(h_flex().px(14).pb(6).pl(40).gap(8).items_center()
      .when(r.actions[0] === "ready", (x) => x.child(small(v, t, `ready-${issue.id}`, "Ready for review", (_e, cx) => v.askReady(issue.id, cx), { accent: true })))
      // The question is inert text; Cancel comes first so Yes is not where the Ready button was.
      .when(r.actions[0] === "cancel", (x) => x.child(div().text_size(11).text_color(t.muted).child(`Ask ${who} to check?`))
        .child(small(v, t, `ready-cancel-${issue.id}`, "Cancel", (_e, cx) => v.askReady(null, cx)))
        .child(small(v, t, `ready-yes-${issue.id}`, "Yes", (_e, cx) => v.readyForReview(issue.id, cx), { accent: true })))));
}

function row(v, t, r) {
  if (r.kind === "header") {
    return h_flex().px(14).pt(10).pb(4).gap(6).items_center()
      .child(div().text_size(11).font_semibold().text_color(t.muted).child(r.label))
      .child(div().text_size(11).text_color(t.dim).child(String(r.count)));
  }
  if (r.kind === "empty") return div().px(14).py(6).text_color(t.dim).child("Nothing here.");
  return issueRow(v, t, r);
}

export function listView(v, t) {
  const rows = rowsOf(v.groups, { canWrite: v.canWrite, archived: Boolean(!v.all && v.project?.archived), checkable: (i) => v.canFix(i), ready: (i) => v.canReady(i), asking: v.confirming });
  const count = v.selected.size, why = v.fixBlock();
  return v_flex().flex_1().min_h(0)
    .when(!v.issues.length && v.loading, (e) => e.child(div().p(14).text_color(t.dim).child("Loading…")))
    .when(Boolean(v.issues.length) || !v.loading, (e) => e.child(v_flex().id("tuix-issues").flex_1().min_h(0).overflow_y_scrollbar()
      .children(rows.map((r) => row(v, t, r)))))
    .when(count > 0, (e) => e.child(h_flex().flex_none().px(14).py(10).gap(8).items_center().border_t(1).border_color(t.border)
      .child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).child(why ?? ""))
      .child(v.button("tuix-fix", `Fix ${count} selected`, (_e, cx) => v.fix(cx), { primary: true, disabled: Boolean(why) }))));
}
