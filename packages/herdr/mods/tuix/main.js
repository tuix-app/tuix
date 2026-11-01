import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, TextareaState } from "gpui-base";
import { spaces, panes, focused, exec, theme, settings, setShared, props, openOverlay, closeOverlay, run } from "herdr";
import { McpError, collect, createClient, validUrl } from "./lib/mcp.js";
import { groupIssues, matchProject, relocation, yourTurnCount } from "./lib/issues.js";
import { defaultBase, repoOf } from "./lib/git.js";
import { onMac, readToken } from "./secret.js";
import { signinView } from "./signin.js";
import { listView } from "./list.js";
import { shotBox, threadView } from "./thread.js";
import { cacheShot, pruneShots } from "./shots.js";
import { retirePrOpen } from "./lib/runs.js";
import { fitSize } from "./lib/thread.js";
import { dropRun, pumpRuns, queueFixes, trackRuns, trackSoon } from "./launch.js";

const DEFAULT_URL = "https://tuix.app";
const STATUSES = ["open", "in_progress", "in_review"];
const WARN_DAYS = 7;
const LOAD_STALE_MS = 90000; // a read this old is treated as hung
const KEYCHAIN_MISSING = "Couldn't read the token from the Keychain. Run the command below, then click Connect.";
const FIRST_INCLUDE = ["page", "element", "browser", "console", "screenshots"]; // not network or workflow
const PAGE_INCLUDE = ["page"]; // later comment pages need no context
const SHOT_DIALOG = { width: 760, height: 520 };
const READ_ONLY = "This token can read only. Reply and Fix need a token with “Let it change status and assignee, and reply”.";

// Where the space is: the focused pane's folder, else the space's folder (as the changes mod does).
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}

// Only the URL, the project choices and the runs are stored. Never the token.
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } };

export default class Tuix extends View {
  init(_props, cx) {
    // A screenshot opened large is this same mod in a dialog, given the image to show.
    const shown = props();
    if (shown?.shot) { this.state = "shot"; this.shown = shown; return; }
    this.state = "signin"; // signin | project | list | thread
    this.notice = null; this.copied = false; this.connecting = false; this.loading = false; this.loadGen = 0; this.loadingSince = 0; this.locating = false;
    this.url = null; this.token = null; this.client = null; this.credential = null; this.canWrite = false;
    this.projects = []; this.project = null; this.repo = null; this.hasOrigin = false; this.remote = false; this.locKey = null;
    this.issues = []; this.people = []; this.names = {}; this.me = null; this.runs = read("runs", []); this.pumping = false; this.tracking = false; this.trackSig = ""; this.selected = new Set();
    this.groups = groupIssues([], []); this.cut = false; this.again = false; this.tokenOrigin = null; this.selKey = null;
    this.th = null; this.confirming = null; this.drafts = {}; this.paneW = 0;
    this.reply = TextareaState.new({ placeholder: "Reply…" });
    this.reply.set_auto_grow(2, 8);

    const auth = read("auth", null);
    this.urlInput = InputState.new({ placeholder: DEFAULT_URL, value: auth?.url ?? DEFAULT_URL });
    this.tokenInput = InputState.new({ placeholder: "Token" });
    this.tokenInput.set_masked(true);
    this.urlInput.on("change", (_e, cx) => { this.copied = false; cx.notify(); });
    this.urlInput.on("submit", (_e, cx) => this.connect(cx));
    this.tokenInput.on("submit", (_e, cx) => this.connect(cx));

    // On macOS the Keychain asks once per start; a Deny leaves the sign-in up until Connect.
    if (auth?.url && validUrl(auth.url) && onMac()) {
      cx.spawn(async (cx) => {
        this.connecting = true; cx.notify();
        const token = await readToken(new URL(auth.url).origin, exec);
        if (!token) { this.connecting = false; this.notice = KEYCHAIN_MISSING; cx.notify(); return; }
        await this.signIn(auth.url, token, cx);
      });
    }
    // The timer is the only polling; agent status comes live from agents().
    cx.timer.every(60000, (cx) => this.refresh(cx));
  }

  mono() { return settings().font_family ?? "JetBrains Mono"; }

  button(id, label, action, { primary = false, disabled = false } = {}) {
    const t = theme(), on = !disabled;
    return div().id(id).h(30).px(14).flex().items_center().flex_none().rounded(8).text_size(12).border_1().border_color(t.border)
      .bg(primary && on ? t.solid : t.raised).text_color(primary && on ? t.solid_foreground : on ? t.foreground : t.dim)
      .when(on, (e) => e.cursor_pointer().on_click(action)).child(label);
  }

  copy(text, cx) { cx.write_to_clipboard(text); this.copied = true; cx.notify(); }

  // A failure from the client. Unknown errors (offline, bad body) wait for the next refresh; nothing loops.
  fail(e) {
    if (e instanceof McpError && e.code === "unauthorized") {
      this.saveDraft();
      this.token = null; this.client = null; this.credential = null; this.state = "signin"; this.locKey = null; this.locating = false;
      this.th = null; this.confirming = null;
      this.issues = []; this.groups = groupIssues([], []); this.selected.clear();
      setShared("tuix.count", 0);
      this.notice = onMac() ? "Tuix refused the token. Replace it with the command below." : "Tuix refused the token. Paste a new one.";
    } else if (e instanceof McpError && e.code === "rate_limited") {
      this.notice = "Tuix is busy. Trying again in a minute.";
    } else if (e instanceof McpError) {
      this.notice = `Tuix returned an error (${e.code}). Trying again in a minute.`;
    } else {
      this.notice = "Can't reach Tuix. Trying again in a minute.";
    }
  }

  // Back to sign-in to change the address or token. Drops only what is in memory: the Keychain item and
  // the runs (and their agents) stay. The address stays in the field.
  signOut(cx) {
    this.saveDraft();
    this.token = null; this.tokenOrigin = null; this.client = null; this.credential = null; this.canWrite = false;
    this.state = "signin"; this.locKey = null; this.locating = false;
    this.th = null; this.confirming = null; this.project = null; this.projects = [];
    this.issues = []; this.groups = groupIssues([], []); this.selected.clear();
    this.notice = null; this.copied = false;
    if (this.url) this.urlInput.set_value(this.url);
    setShared("tuix.count", 0);
    cx.notify();
  }

  connect(cx) {
    if (this.connecting) return;
    const url = this.urlInput.value().trim();
    if (!validUrl(url)) { this.notice = "Enter the address of your Tuix, like https://tuix.app."; cx.notify(); return; }
    this.connecting = true; this.notice = null; cx.notify();
    cx.spawn(async (cx) => {
      let token;
      if (onMac()) token = await readToken(new URL(url).origin, exec);
      else {
        // A token held from an earlier attempt is reused only for the address it was entered for.
        const held = this.tokenOrigin === new URL(url).origin ? this.token : null;
        token = this.tokenInput.value().trim() || held; this.tokenInput.set_value("");
      }
      if (!token) {
        this.connecting = false; this.notice = onMac() ? KEYCHAIN_MISSING : "Paste a token first."; cx.notify(); return;
      }
      await this.signIn(url, token, cx);
    });
  }

  async signIn(url, token, cx) {
    this.connecting = true; this.url = url; this.token = token; this.tokenOrigin = new URL(url).origin; cx.notify();
    try {
      const client = createClient({ url, token, fetch });
      const credential = await client.connect();
      const tools = await client.tools();
      const projects = await collect(client, "list_projects", "projects");
      this.client = client; this.credential = credential; this.canWrite = tools.includes("reply_to_issue");
      this.projects = projects; this.notice = null; this.locKey = null; this.state = "project";
      write("auth", { url });
    } catch (e) {
      this.fail(e);
    } finally {
      this.connecting = false; cx.notify();
    }
  }

  // The folder changed (or we just signed in): find the project for it.
  relocate(loc, key, cx) {
    // Nothing is cleared yet: a subfolder, a cd or a new space of the same repo must not close the open view.
    this.locKey = key; this.locating = true;
    cx.spawn(async (cx) => {
      const here = (c, a, o) => exec(c, a, { ...o, on: loc.on });
      const repo = loc.cwd ? await repoOf(loc.cwd, here) : null;
      const origin = repo && !loc.on ? await defaultBase(repo, here).then(() => true, () => false) : false;
      if (this.locKey !== key || !this.client) return;
      this.locating = false;
      const stored = repo ? read("projects", {})[repo.main] : null;
      const project = this.projects.find((p) => p.id === stored) ?? (repo ? matchProject(repo.name, this.projects).project : null);
      // The Fix selection survives a folder change inside the same repo and project.
      const selKey = `${repo?.main ?? ""}|${project?.id ?? ""}`;
      const keep = relocation({ state: this.state, key: this.selKey }, { key: selKey, hasProject: Boolean(project) }) === "keep";
      this.repo = repo; this.hasOrigin = origin; this.remote = Boolean(loc.on);
      if (!keep) {
        if (this.state === "list" || this.state === "thread") this.saveDraft();
        this.th = null; this.confirming = null; this.project = null; this.issues = []; this.groups = groupIssues([], []);
        this.selected.clear();
      }
      this.selKey = selKey;
      if (project) {
        this.project = project; if (!keep) this.state = "list";
        await this.load(cx); await this.settle(cx);
      } else { this.state = "project"; setShared("tuix.count", 0); }
      cx.notify();
    });
    // No cx.notify() here: this runs from render; the task notifies when it is done.
  }

  pick(project, cx) {
    if (this.repo) write("projects", { ...read("projects", {}), [this.repo.main]: project.id });
    this.project = project; this.state = "list"; this.issues = []; this.groups = groupIssues([], []);
    this.selKey = `${this.repo?.main ?? ""}|${project.id}`; this.selected.clear();
    cx.spawn(async (cx) => { await this.load(cx); await this.settle(cx); });
    cx.notify();
  }

  saveRuns() { write("runs", this.runs); }

  regroup() { this.groups = groupIssues(this.issues, this.runs); }

  // After the issues are read: apply what the agents did (and read closing comments), then start what fits.
  async settle(cx) { await this.trackRuns(cx, true); await this.pumpRuns(cx); }

  trackRuns(cx, read) { return trackRuns(this, cx, read); }

  pumpRuns(cx) { return pumpRuns(this, cx); }

  async load(cx) {
    const client = this.client, project = this.project;
    if (!client || !project) return;
    if (this.loadBusy()) { this.again = true; return; } // the latest request runs once this one ends
    const gen = ++this.loadGen; // a load that outlives LOAD_STALE_MS is abandoned: its result is ignored
    this.loading = true; this.loadingSince = Date.now(); this.again = false; cx.notify();
    try {
      const issues = []; let cut = false;
      for (const status of STATUSES) { // list_issues takes one status at a time
        const page = await collect(client, "list_issues", "issues", { project_id: project.id, status });
        issues.push(...page); cut = cut || Boolean(page.truncated);
      }
      const people = this.canWrite ? await collect(client, "list_people", "people", { project_id: project.id }) : [];
      if (this.client !== client || this.project !== project || this.loadGen !== gen) return;
      const runs = retirePrOpen(this.runs, project.id, issues, { cut });
      if (runs !== this.runs) { this.runs = runs; this.saveRuns(); }
      this.issues = issues; this.people = people; this.cut = cut;
      this.names = Object.fromEntries(people.map((p) => [p.id, p.name]));
      this.me = people.find((p) => p.me)?.id ?? null;
      this.groups = groupIssues(issues, this.runs);
      const open = new Set(this.groups.open.map((i) => i.id));
      this.selected = new Set([...this.selected].filter((id) => open.has(id)));
      this.notice = null;
      setShared("tuix.count", yourTurnCount(issues, this.me));
      pruneShots(new Set([...issues.map((i) => i.id), ...(this.th ? [this.th.id] : [])])).catch(() => {});
    } catch (e) {
      if (this.loadGen === gen) this.fail(e);
    } finally {
      if (this.loadGen !== gen) return; // abandoned; the newer load owns the flags
      this.loading = false;
      if (this.again) { this.again = false; cx.spawn(async (cx) => { await this.load(cx); }); }
      cx.notify();
    }
  }

  loadBusy() { return this.loading && Date.now() - this.loadingSince < LOAD_STALE_MS; }

  refresh(cx) {
    if (this.loadBusy() || this.connecting) return;
    if (this.state === "signin") {
      // A token we hold but couldn't use yet (offline, busy): one try per tick.
      if (this.token && !this.client && this.url) cx.spawn(async (cx) => { await this.signIn(this.url, this.token, cx); });
    } else if (this.state === "list" || this.state === "thread") {
      cx.spawn(async (cx) => { await this.load(cx); await this.settle(cx); });
      // An open thread is read again (comments and turn); the draft and the scroll are untouched.
      const th = this.th;
      if (this.state === "thread" && th && !th.loading && !th.sending) cx.spawn(async (cx) => { await this.loadThread(cx); });
    }
  }

  saveDraft() {
    if (!this.th) return;
    const text = this.reply.value();
    if (text.trim()) this.drafts[this.th.id] = text; else delete this.drafts[this.th.id];
  }

  openThread(issue, cx) {
    this.th = { id: issue.id, issue, comments: [], cursor: null, context: null, loading: true, gen: 0, loaded: false, failed: false, shots: {}, sel: 0, open: new Set(), passOpen: false, replyError: null, sending: false };
    this.confirming = null; this.reply.set_value(this.drafts[issue.id] ?? "");
    this.state = "thread"; cx.notify();
    cx.spawn(async (cx) => { await this.loadThread(cx); });
  }

  closeThread(cx) {
    this.saveDraft();
    this.th = null; this.confirming = null; this.state = "list"; cx.notify();
    cx.spawn(async (cx) => { await this.load(cx); });
  }

  // The issue, all its comments (cursor by cursor) and, with full scope, its context. Then the screenshots.
  async loadThread(cx) {
    const th = this.th, client = this.client;
    if (!th || !client) return;
    const gen = ++th.gen; // only the newest load applies its result
    th.loading = true; cx.notify();
    try {
      const first = await client.call("get_issue", { id: th.id, include: FIRST_INCLUDE });
      const comments = [...(first.comments ?? [])];
      let cursor = first.next_comments_cursor ?? null;
      for (let page = 1; cursor && page < 20; page++) {
        const next = await client.call("get_issue", { id: th.id, cursor, include: PAGE_INCLUDE });
        comments.push(...(next.comments ?? []));
        cursor = next.next_comments_cursor ?? null;
      }
      if (this.th !== th || th.gen !== gen) return;
      th.issue = first.issue ?? th.issue; th.comments = comments; th.cursor = cursor; th.context = first.context ?? null;
      th.loaded = true; th.failed = false; this.notice = null;
    } catch (e) {
      if (this.th === th && th.gen === gen) { if (!th.loaded) th.failed = true; this.fail(e); }
    } finally {
      if (th.gen === gen) th.loading = false;
      cx.notify();
    }
    if (this.th === th && th.gen === gen && th.loaded) await this.loadShots(th, cx);
  }

  retryThread(cx) {
    if (!this.th || this.th.loading) return;
    this.th.failed = false; cx.spawn(async (cx) => { await this.loadThread(cx); });
  }

  // Downloads each screenshot once. A failed download (the 5-minute URL ran out) re-reads the issue once and retries.
  async loadShots(th, cx) {
    let fresh = null;
    for (const shot of th.context?.screenshots ?? []) {
      if (this.th !== th) return;
      if (th.shots[shot.id]?.path) continue;
      try {
        th.shots[shot.id] = { path: await cacheShot(th.id, shot, exec) };
      } catch {
        try {
          fresh ??= (await this.client.call("get_issue", { id: th.id, include: ["screenshots"] })).context?.screenshots ?? [];
          th.shots[shot.id] = { path: await cacheShot(th.id, fresh.find((s) => s.id === shot.id) ?? shot, exec) };
        } catch {
          th.shots[shot.id] = { failed: true };
        }
      }
      cx.notify();
    }
  }

  openShot(shot, path) {
    const { width, height } = fitSize(shot.width, shot.height, SHOT_DIALOG.width, SHOT_DIALOG.height);
    const element = shot.kind === "review" ? null : this.th?.context?.element ?? null;
    openOverlay({ mod: "tuix", kind: "dialog", width: width + 26, height: height + 26, props: { shot: path, w: width, h: height, element } });
  }

  sendReply(passTo, cx) {
    const th = this.th, client = this.client, body = this.reply.value().trim();
    if (!th || !client || th.sending || !body) return;
    if (body.length > 2000) { th.replyError = "A reply can be up to 2000 characters."; cx.notify(); return; }
    th.sending = true; th.replyError = null; th.passOpen = false; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await client.call("reply_to_issue", { id: th.id, body, ...(passTo ? { pass_to: passTo } : {}) });
        delete this.drafts[th.id];
        if (this.th === th) this.reply.set_value("");
        th.sending = false;
        if (this.th === th) await this.loadThread(cx);
        await this.load(cx);
      } catch (e) {
        th.sending = false;
        if (e instanceof McpError && e.code === "unauthorized") this.fail(e);
        else th.replyError = e instanceof McpError ? (e.message && e.message !== e.code ? e.message : `Tuix returned an error (${e.code}).`) : "Can't reach Tuix. Your reply is still here.";
      } finally {
        th.sending = false; cx.notify();
      }
    });
  }

  canReady(issue) { return this.canWrite && !this.project?.archived && issue?.status === "in_progress"; }

  askReady(id, cx) { this.confirming = id; cx.notify(); }

  // The only place the panel sets in_review, and only after the person's "Yes".
  readyForReview(id, cx) {
    const client = this.client;
    if (!client || this.confirming !== id) return;
    this.confirming = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await client.call("set_issue_status", { id, status: "in_review" });
        this.notice = null;
        if (this.th?.id === id) await this.loadThread(cx);
        await this.load(cx);
      } catch (e) {
        if (e instanceof McpError && e.code !== "unauthorized" && e.code !== "rate_limited") {
          this.notice = e.message && e.message !== e.code ? e.message : `Tuix returned an error (${e.code}).`;
        } else this.fail(e);
      } finally {
        cx.notify();
      }
    });
  }

  shotDialog(t) {
    const { shot, w, h, element, overlay } = this.shown;
    return div().id("tuix-shot").size_full().p(12).bg(t.background).cursor_pointer().on_click(() => closeOverlay(overlay))
      .child(shotBox(t, shot, w, h, element));
  }

  toggle(id, cx) {
    if (!this.canWrite || this.project?.archived) return;
    if (!this.groups.open.some((i) => i.id === id)) return;
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    cx.notify();
  }

  fixBlock() {
    if (!this.canWrite) return "Fix needs a token that can change issues.";
    if (this.remote) return "Fixes run on this computer only for now.";
    if (this.project?.archived) return "Archived: read only.";
    if (!this.repo || !this.hasOrigin) return "Fix needs a git repository with an origin remote.";
    return null;
  }

  canFix(issue) { return this.groups.open.some((i) => i.id === issue.id); }

  // Queues the selected issues, or one issue (the thread's Fix button); runs start up to the limit.
  fix(cx, issue) {
    if (this.fixBlock()) return;
    const picked = issue ? [issue] : this.groups.open.filter((i) => this.selected.has(i.id));
    if (picked.length) queueFixes(this, picked, cx);
  }

  removeRun(issueId, cx) { dropRun(this, issueId, cx); }

  focusRun(run_) { if (run_.terminal) run("agent.focus", { terminal: run_.terminal }); }

  daysLeft() {
    const at = Date.parse(this.credential?.expires_at ?? "");
    return Number.isNaN(at) ? null : Math.ceil((at - Date.now()) / 86400000);
  }

  projectView(t) {
    const choices = this.projects;
    return v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(2)
      .child(div().px(8).py(6).text_color(t.muted).child(this.locating ? "Finding the project…"
        : !choices.length ? "This token can't see any projects."
        : this.repo && !this.project ? `No project is named “${this.repo.name}”. Pick one:` : "Pick a project:"))
      .children(this.locating ? [] : choices.map((p) => h_flex().id(`pick-${p.id}`).h(30).px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .when(this.project?.id === p.id, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.pick(p, cx))
        .child(div().min_w(0).truncate().child(p.name))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(p.workspace ?? ""))
        .when(p.archived, (e) => e.child(div().text_size(11).text_color(t.dim).child("Archived")))));
  }

  render(cx) {
    if (this.state === "shot") return this.shotDialog(theme());
    if (this.client) {
      const loc = location(), key = JSON.stringify(loc);
      if (key !== this.locKey) this.relocate(loc, key, cx);
      if (this.state === "list" || this.state === "thread") trackSoon(this, cx); // schedules; never notifies here
    }
    const t = theme(), days = this.daysLeft();
    const note = (text, color) => div().px(14).py(4).text_size(11).text_color(color ?? t.dim).child(text);
    const thread = this.state === "thread" && this.th;
    const title = this.state === "list" && this.project
      ? h_flex().id("tuix-project").gap(6).items_center().cursor_pointer().on_click((_e, cx) => { this.state = "project"; cx.notify(); })
        .child(div().font_semibold().truncate().child(this.project.name)).child(div().text_color(t.dim).child("▾"))
        .when(this.project.archived, (e) => e.child(div().text_size(11).text_color(t.dim).child("Archived: read only")))
      : div().font_semibold().child(this.state === "project" ? "Choose a project" : "Tuix");
    return v_flex().id("tuix").on_size_change((s, cx) => { if (Math.abs(s.width - this.paneW) > 1) { this.paneW = s.width; cx.notify(); } }).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .when(!thread, (e) => e.child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(title).child(div().flex_1())
        .when(this.state === "project" && Boolean(this.project), (e) => e.child(this.button("tuix-cancel", "Cancel", (_e, cx) => { this.state = "list"; cx.notify(); })))
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("Loading…")))
        .when(Boolean(this.client) && (this.state === "project" || this.state === "list"), (e) => e.child(this.button("tuix-signout", "Sign out", (_e, cx) => this.signOut(cx))))))
      .when(this.client && days !== null && days <= WARN_DAYS, (e) => e.child(note(days <= 0 ? "Token expires today" : `Token expires in ${days} ${days === 1 ? "day" : "days"}`, t.blocked)))
      .when(Boolean(this.client) && !this.canWrite, (e) => e.child(note(READ_ONLY)))
      .when(this.state === "list" && this.cut, (e) => e.child(note(`List cut off — showing the first ${this.issues.length}.`, t.blocked)))
      .when(this.state !== "signin" && Boolean(this.notice), (e) => e.child(note(this.notice, t.ansi1)))
      .child(this.state === "signin" ? signinView(this, t) : this.state === "project" ? this.projectView(t)
        : thread ? threadView(this, t) : listView(this, t));
  }
}
