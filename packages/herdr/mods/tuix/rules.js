// The "Fixes in <repo>" setting: which agent fixes, how far it goes and extra instructions, per repository.
// Shown in place of the list while the view's rulesOpen is set. Each control has its own element and handler.
import { div } from "gpui-kit";
import { v_flex, h_flex, Textarea } from "gpui-base";
import { agentChoices } from "./lib/launch.js";
import { previewPrompt } from "./lib/prompt.js";
import { DEPLOY_MAX, EXTRA_MAX, normalize } from "./lib/rules.js";

const help = (t, text) => div().text_size(11).text_color(t.dim).child(text);
const label = (t, text) => div().text_size(11).text_color(t.dim).child(text);

const UNTIL = [
  ["pr", "The pull request is open", "It fixes, opens the pull request and replies on the issue."],
  ["reviewed", "Reviewed and green", "It also reviews its own change, fixes failing checks and answers review comments. You merge."],
  ["merged", "Merged", "It also merges the pull request when its checks pass, after fixing what its change broke and resolving conflicts with the base branch. It never merges past a failing check or a required review. Reports come from people using your app: unless the repository requires a review, the agent's change is merged without anyone reading it."],
  ["fix_ready", "Fix ready", "It merges, waits for the deploy, then asks the reporter to check. If the deploy fails or it can't tell, it stops and asks you."],
];

// A round 18px choice among several: a filled accent dot when on. `enabled` false shows it dim and does nothing.
function radio(t, id, title, text, { on, enabled = true, pick }) {
  const dot = div().id(id).size(18).mt(1).flex_none().flex().items_center().justify_center().rounded(9).border_1()
    .border_color(on ? t.accent : t.input).bg(t.background).text_size(10).text_color(t.accent)
    .when(enabled, (e) => e.cursor_pointer().on_click((_e, cx) => { cx.stop_propagation(); pick(cx); })).child(on ? "●" : "");
  return h_flex().gap(8).items_start()
    .child(dot)
    .child(v_flex().flex_1().min_w(0).gap(2)
      .child(div().text_color(enabled ? t.foreground : t.dim).child(title))
      .child(text ? help(t, text) : div()));
}

const box = (t, id, state) => div().id(id).px(10).py(6).rounded(8).border_1().border_color(t.border).cursor_text()
  .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Textarea.new(state));

export function rulesView(v, t) {
  const r = v.rules();
  // A change keeps the texts typed so far, then the new choice.
  const typed = () => ({ deploy: v.deployInput.value(), extra: v.extraInput.value() });
  const set = (patch, cx) => v.setRules({ ...typed(), ...patch }, cx);
  const choices = agentChoices(v.known);
  const stored = r.agent && !choices.some((c) => c.id === r.agent.id) ? r.agent : null;
  const shown = normalize({ ...r, ...typed() });
  return v_flex().id("tuix-rules-view").flex_1().min_h(0).p(14).gap(10).overflow_y_scrollbar()
    .child(div().font_semibold().child(`Fixes in ${v.repo.name}`))
    .child(help(t, `For fixes started in ${v.repo.name} from now on. Agents already running keep what they were told.`))
    .when(choices.length > 0 || Boolean(stored), (e) => e.child(v_flex().gap(6)
      .child(label(t, "Agent"))
      .child(radio(t, "tuix-rules-agent-claude", "Claude Code", "", { on: !r.agent, pick: (cx) => set({ agent: null }, cx) }))
      .children(choices.map((c) => radio(t, `tuix-rules-agent-${c.id}`, c.name, "", { on: r.agent?.id === c.id, pick: (cx) => set({ agent: c }, cx) })))
      .when(Boolean(stored), (x) => x.child(radio(t, `tuix-rules-agent-${stored.id}`, stored.name, Array.isArray(v.known) ? "Not installed here." : "Couldn't check that it is installed here.", { on: true, pick: (cx) => set({ agent: stored }, cx) })))
      .child(help(t, "The agent needs the Tuix connector, and gh for pull requests."))))
    .child(v_flex().gap(6)
      .child(label(t, "Agent stays until"))
      .children(UNTIL.map(([value, title, text]) => radio(t, `tuix-rules-until-${value}`, title, text, { on: r.until === value, pick: (cx) => set({ until: value }, cx) }))))
    .when(r.until === "fix_ready", (e) => e.child(v_flex().gap(4)
      .child(help(t, "How to tell that it is deployed (optional)"))
      .child(box(t, "tuix-rules-deploy", v.deployInput))
      .child(help(t, "For example: \"The Deploy workflow on main has finished for the merge commit.\" Left empty, the agent looks for a deploy run of the merge commit itself."))
      .child(help(t, `Up to ${DEPLOY_MAX} characters.`))))
    .child(v_flex().gap(4)
      .child(label(t, "Extra instructions (optional)"))
      .child(box(t, "tuix-rules-extra", v.extraInput))
      .child(help(t, "Added to what every agent started here is told. Conventions for the whole repository belong in CLAUDE.md or AGENTS.md."))
      .child(help(t, `Up to ${EXTRA_MAX} characters.`)))
    .child(div().id("tuix-rules-prompt").text_size(11).text_color(t.accent).cursor_pointer()
      .on_click((_e, cx) => { cx.stop_propagation(); v.promptOpen = !v.promptOpen; cx.notify(); })
      .child(v.promptOpen ? "Hide the full prompt" : "Show the full prompt"))
    // One div per line: multi-line text isn't known to draw here.
    .when(v.promptOpen, (e) => e.child(v_flex().px(10).py(6).rounded(8).border_1().border_color(t.border).text_size(11).text_color(t.dim)
      .children(previewPrompt(shown).replace(/\n+$/, "").split("\n").map((line) => (line ? div().child(line) : div().h(6))))))
    .when(r.until !== "pr", (e) => e.child(help(t, "These agents keep running after the pull request is open and don't count towards the 3 at once.")))
    .child(h_flex().child(v.button("tuix-rules-done", "Done", (_e, cx) => v.closeRules(cx), { primary: true })));
}
