// The thread view: screenshots, context chips, comments, reply box. Report content is shown as plain text only.
import { div, image } from "gpui-kit";
import { v_flex, h_flex, Textarea } from "gpui-base";
import { turnLabel } from "./lib/issues.js";
import { CONFIRM } from "./lib/rows.js";
import { chipsOf, fitSize, isAgent, linksOf, outline, pageLine, passChoices, relTime } from "./lib/thread.js";

const SHOT_MAX_H = 240, THUMB = { w: 44, h: 30 };

const tag = (t, text, color) => div().px(5).py(1).flex_none().rounded(4).border_1().border_color(t.border).text_size(10).text_color(color ?? t.muted).child(text);

// A screenshot at a given size, with the reported element outlined (original screenshots only).
export function shotBox(t, path, width, height, box) {
  const o = box ? outline(box) : null;
  return div().relative().w(width).h(height).flex_none().rounded(6).overflow_hidden().border_1().border_color(t.border)
    .child(image(path).w(width).h(height))
    .when(Boolean(o), (e) => e.child(div().absolute().left(Math.round(o.left * width)).top(Math.round(o.top * height))
      .w(Math.max(4, Math.round(o.width * width))).h(Math.max(4, Math.round(o.height * height))).border_2().border_color(t.ansi1).rounded(3)));
}

function shots(v, t, th) {
  const list = th.context?.screenshots ?? [];
  if (!list.length) return null;
  const sel = Math.min(th.sel, list.length - 1), shot = list[sel], state = th.shots[shot.id];
  const maxW = Math.max(120, (v.paneW || 320) - 28);
  const { width, height } = fitSize(shot.width, shot.height, maxW, SHOT_MAX_H);
  const element = shot.kind === "review" ? null : th.context?.element;
  return v_flex().gap(6)
    .child(state?.path
      ? div().id("thread-shot").cursor_pointer().on_click(() => v.openShot(shot, state.path)).child(shotBox(t, state.path, width, height, element))
      : div().h(60).flex().items_center().justify_center().rounded(6).border_1().border_color(t.border).text_size(11).text_color(t.dim)
        .child(state?.failed ? "Screenshot unavailable" : "Loading screenshot…"))
    .child(h_flex().gap(6).items_center()
      .children(list.length > 1 ? list.map((s, i) => {
        const p = th.shots[s.id]?.path;
        return div().id(`thumb-${i}`).w(THUMB.w).h(THUMB.h).flex_none().rounded(4).overflow_hidden().border_1()
          .border_color(i === sel ? t.accent : t.border).cursor_pointer().on_click((_e, cx) => { th.sel = i; cx.notify(); })
          .child(p ? image(p).w(THUMB.w).h(THUMB.h) : div().size_full().bg(t.raised));
      }) : [])
      .child(div().text_size(11).text_color(t.dim).child(
        `${list.length > 1 ? `${sel + 1} of ${list.length} screenshots` : "1 screenshot"}${state?.path ? " · click to enlarge" : ""}${shot.kind === "review" ? " · review" : ""}`)));
}

function chips(v, t, th) {
  const list = chipsOf(th.context);
  if (!list.length) return null;
  return v_flex().gap(6)
    .child(h_flex().gap(6).flex_wrap().children(list.map((c) =>
      div().id(`chip-${c.key}`).px(6).py(1).rounded(4).border_1().border_color(th.open.has(c.key) ? t.accent : t.border).text_size(10).text_color(t.muted)
        .cursor_pointer().on_click((_e, cx) => { if (th.open.has(c.key)) th.open.delete(c.key); else th.open.add(c.key); cx.notify(); }).child(c.label))))
    .children(list.filter((c) => th.open.has(c.key)).map((c) =>
      v_flex().gap(1).px(8).py(6).rounded(6).bg(t.raised).text_size(11).text_color(t.muted).children(c.lines.map((l) => div().child(l)))));
}

function comment(v, t, c) {
  const agent = isAgent(c, v.panelLabel), team = Boolean(c.author?.team);
  const who = [c.author?.name ?? "Someone", agent ? `via ${c.via}` : team ? "team" : "reporter", relTime(c.inserted_at)].filter(Boolean);
  return v_flex().gap(2).when(agent, (e) => e.border_l(2).border_color(t.done).pl(8))
    .child(h_flex().gap(4).text_size(11).text_color(t.dim).child(div().font_semibold().text_color(t.foreground).child(who[0])).child(div().child(`· ${who.slice(1).join(" · ")}`)))
    .child(div().px(8).py(6).rounded(6).bg(team || agent ? t.selected : t.raised).child(String(c.body ?? "")))
    .children(agent ? linksOf(c.body).map((l, i) =>
      div().id(`link-${c.id}-${i}`).self_start().px(6).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.accent)
        .cursor_pointer().on_click((_e, cx) => cx.open_url(l.url)).child(`Open link · ${l.host}`)) : []);
}

function readyRow(v, t, issue) {
  if (!v.canReady(issue)) return null;
  const who = issue.author?.name ?? "the reporter";
  // The question is inert text on its own line above the buttons, so no control sits where Ready was.
  const controls = { cancel: () => v.button("ready-cancel", "Cancel", (_e, cx) => v.askReady(null, cx)),
    yes: () => v.button("ready-yes", "Yes", (_e, cx) => v.readyForReview(issue.id, cx), { primary: true }) };
  return v.confirming === issue.id
    ? v_flex().gap(6).child(div().text_size(12).child(`Ask ${who} to check?`)).child(h_flex().gap(8).children(CONFIRM.map((c) => controls[c]())))
    : h_flex().child(v.button("ready", "Ready for review", (_e, cx) => v.askReady(issue.id, cx)));
}

function fixRow(v, t, issue) {
  if (!v.canFix(issue)) return null; // shown disabled, with the reason, when Fix is blocked
  const why = v.fixBlock();
  return h_flex().gap(8).items_center()
    .child(v.button("thread-fix", "Fix", (_e, cx) => v.fix(cx, issue), { primary: true, disabled: Boolean(why) }))
    .when(Boolean(why), (e) => e.child(div().flex_1().min_w(0).text_size(11).text_color(t.dim).child(why)));
}

function replyBox(v, t, th) {
  const issue = th.issue, choices = passChoices(issue, v.peopleOf(issue), v.meOf(issue)), busy = th.sending;
  return v_flex().flex_none().border_t(1).border_color(t.border).px(12).py(8).gap(6)
    .child(Textarea.new(v.reply))
    .when(Boolean(th.replyError), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(th.replyError)))
    .when(th.passOpen, (e) => e.child(v_flex().rounded(6).border_1().border_color(t.border).bg(t.popover).children(choices.map((c, i) =>
      div().id(`pass-${i}`).px(8).h(28).flex().items_center().cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => v.sendReply(c.to, cx)).child(c.label))))
    )
    .child(h_flex().gap(6).justify_end()
      .child(v.button("reply", busy ? "Sending…" : "Reply", (_e, cx) => v.sendReply(null, cx), { disabled: busy }))
      .child(v.button("reply-pass", "Reply & pass ▾", (_e, cx) => { th.passOpen = !th.passOpen; cx.notify(); }, { primary: true, disabled: busy })));
}

export function threadView(v, t) {
  const th = v.th;
  if (!th) return div();
  const issue = th.issue, label = turnLabel(issue, { me: v.meOf(issue), names: v.names });
  const page = pageLine(th.context), more = th.cursor;
  const archived = v.archivedIssue(issue), canReply = v.canWrite && !archived;
  return v_flex().flex_1().min_h(0)
    .child(h_flex().h(36).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().id("thread-back").cursor_pointer().text_color(t.muted).px(4).on_click((_e, cx) => v.closeThread(cx)).child("←"))
      .child(div().flex_none().font_semibold().child(`#${issue.number}`))
      .when(Boolean(issue.severity), (e) => e.child(tag(t, issue.severity, issue.severity === "blocking" ? t.ansi1 : null)))
      .when(Boolean(issue.type), (e) => e.child(tag(t, issue.type)))
      .child(div().flex_1())
      .when(th.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("Loading…"))))
    .child(v_flex().id("tuix-thread-scroll").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).gap(10)
      .child(div().font_semibold().child(issue.title ?? ""))
      .child(h_flex().gap(8).items_center().flex_wrap()
        .when(Boolean(label), (e) => e.child(div().px(6).py(1).rounded(10).bg(t.raised).text_size(11).text_color(label === "Your turn" ? t.accent : t.muted).child(label)))
        .child(div().text_size(11).text_color(t.dim).truncate().child([String(issue.status ?? "").replace("_", " "), page].filter(Boolean).join(" · "))))
      .when(th.failed, (e) => e.child(h_flex().gap(8).items_center()
        .child(div().text_size(11).text_color(t.ansi1).child("Couldn't load this issue"))
        .child(v.button("thread-retry", "Retry", (_e, cx) => v.retryThread(cx)))))
      .child(readyRow(v, t, issue) ?? div())
      .child(fixRow(v, t, issue) ?? div())
      .child(shots(v, t, th) ?? div())
      .child(chips(v, t, th) ?? div())
      .children(th.comments.map((c) => comment(v, t, c)))
      .when(!th.comments.length && th.loaded, (e) => e.child(div().text_size(11).text_color(t.dim).child("No comments yet.")))
      .when(Boolean(more), (e) => e.child(div().text_size(11).text_color(t.dim).child("Newer comments are not shown here. Open the issue in Tuix.")))
      .when(!canReply, (e) => e.child(div().text_size(11).text_color(t.dim).child(archived ? "Archived: read only." : "Replying needs a connection that can change issues."))))
    .when(canReply, (e) => e.child(replyBox(v, t, th)));
}
