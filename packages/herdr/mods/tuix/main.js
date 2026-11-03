import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, TextareaState } from "gpui-base";
import { spaces, panes, focused, exec, knownAgents, machines, theme, settings, setShared, props, openOverlay, closeOverlay, run } from "herdr";
import { McpError, collect, createClient, validUrl } from "./lib/mcp.js";
import { CLIENT_NAME, discover, pollOnce, registerClient, revoke, startDevice } from "./lib/oauth.js";
import { browserUrl, onStartError, pollStep } from "./lib/poll.js";
import { createSession, signinMessage, withRefresh } from "./lib/session.js";
import { groupIssues, matchProject, relocation } from "./lib/issues.js";
import { ALL, fixProjectFor, labelOf, mapLimit, mergeRead, queueReload, targetsFor, yourTurnAll } from "./lib/all.js";
import { defaultBase, repoOf } from "./lib/git.js";
import { claudeMissing } from "./lib/launch.js";
import { signinView } from "./signin.js";
import { listView } from "./list.js";
import { shotBox, threadView } from "./thread.js";
import { cacheShot, pruneShots } from "./shots.js";
import { retirePrOpen } from "./lib/runs.js";
import { fitSize } from "./lib/thread.js";
import { dropRun, pumpRuns, queueFixes, trackRuns, trackSoon } from "./launch.js";

const DEFAULT_URL = "https://tuix.app";
const STATUSES = ["open", "in_progress", "in_review"];
const IN_FLIGHT = 4; // projects read at once in All projects (the MCP allows 120 requests a minute per connection)
const PANEL_LABEL = CLIENT_NAME; // comments this panel posts carry the registered client name as `via`
const RETRY_REFRESH_MS = 30000;
const LOAD_STALE_MS = 90000; // a read this old is treated as hung
const FIRST_INCLUDE = ["page", "element", "browser", "console", "screenshots"]; // not network or workflow
const PAGE_INCLUDE = ["page"]; // later comment pages need no context
const SHOT_DIALOG = { width: 760, height: 520 };
const READ_ONLY = "This connection can read only. Reply and Fix are not available.";

// Where the space is: the focused pane's folder, else the space's folder (as the changes mod does).
// `up`: whether its machine is connected, so the repo is looked up again when it comes back.
function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const up = !on || machines().find((m) => m.name === on)?.layout === "ready";
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, up };
}

// Only the URL, the public client id per address, the project choices and the runs are stored. Never a token.
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage may be unavailable */ } };

export default class Tuix extends View {
  init(_props, cx) {
    // A screenshot opened large is this same mod in a dialog, given the image to show.
    const shown = props();
    if (shown?.shot) { this.state = "shot"; this.shown = shown; return; }
    this.state = "signin"; // signin | project | list | thread
    this.notice = null; this.connecting = false; this.loading = false; this.loadGen = 0; this.loadingSince = 0; this.locating = false;
    this.url = null; this.session = null; this.client = null; this.canWrite = false; this.device = null; this.authGen = 0; this.panelLabel = PANEL_LABEL;
    this.projects = []; this.project = null; this.all = false; this.fixProject = null; this.loadedBy = {}; this.peopleBy = {}; this.meBy = {}; this.repo = null; this.hasOrigin = false; this.machine = null; this.noClaude = false; this.locKey = null;
    this.issues = []; this.people = []; this.names = {}; this.me = null; this.runs = read("runs", []); this.pumping = false; this.tracking = false; this.trackSig = ""; this.selected = new Set();
    this.groups = groupIssues([], []); this.cut = false; this.cutNames = []; this.again = false; // again: a load asked for while one runs ("all" or a Set of project ids)
    this.selKey = null;
    this.th = null; this.confirming = null; this.drafts = {}; this.paneW = 0;
    this.reply = TextareaState.new({ placeholder: "Reply…" });
    this.reply.set_auto_grow(2, 8);

    const auth = read("auth", null);
    this.urlInput = InputState.new({ placeholder: DEFAULT_URL, value: auth?.url ?? DEFAULT_URL });
    this.urlInput.on("submit", (_e, cx) => this.signInWithTuix(cx));
    // A saved address only fills the field: the browser opens when the person clicks Sign in with Tuix.
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

  // A failure from the client. Unknown errors (offline, bad body) wait for the next refresh; nothing loops.
  fail(e) {
    if (e instanceof McpError && e.code === "unauthorized") {
      // Unauthorized reaches here only after the one refresh-and-retry failed: the session is over.
      this.saveDraft();
      this.dropSession();
      this.client = null; this.state = "signin"; this.locKey = null; this.locating = false;
      this.th = null; this.confirming = null;
      this.issues = []; this.groups = groupIssues([], []); this.selected.clear();
      setShared("tuix.count", 0);
      this.notice = "Your Tuix session ended. Sign in again.";
    } else if (e instanceof McpError && e.code === "rate_limited") {
      this.notice = "Tuix is busy. Trying again in a minute.";
    } else if (e instanceof McpError) {
      this.notice = `Tuix returned an error (${e.code}). Trying again in a minute.`;
    } else {
      this.notice = "Can't reach Tuix. Trying again in a minute.";
    }
  }

  // Forgets the tokens held in memory and, when the server offers it, revokes the refresh token (best effort).
  dropSession() {
    const session = this.session;
    this.session = null;
    if (!session) return;
    // forget() ends the session now and resolves to the latest refresh token (after a refresh in flight), to revoke.
    session.forget().then((refreshToken) => refreshToken && revoke(session.meta, session.clientId, refreshToken, fetch)).catch(() => {});
  }

  // Back to sign-in to change the address or the account. Drops only what is in memory (the session, which is
  // revoked when the server allows it); the runs (and their agents) stay. The address stays in the field.
  signOut(cx) {
    this.saveDraft();
    this.authGen++; this.dropSession();
    this.loadGen++; this.loading = false; this.again = false; // loads in flight must not write onto the sign-in view
    this.client = null; this.canWrite = false; this.device = null; this.connecting = false;
    this.state = "signin"; this.locKey = null; this.locating = false;
    this.th = null; this.confirming = null; this.project = null; this.all = false; this.fixProject = null; this.loadedBy = {}; this.projects = [];
    this.issues = []; this.groups = groupIssues([], []); this.selected.clear();
    this.notice = null;
    if (this.url) this.urlInput.set_value(this.url);
    setShared("tuix.count", 0);
    cx.notify();
  }

  // Sign in with Tuix: find the server's sign-in endpoints, get a code, open the browser to approve it, then poll.
  signInWithTuix(cx) {
    if (this.connecting || this.device) return;
    const url = this.urlInput.value().trim();
    if (!validUrl(url)) { this.notice = "Enter the address of your Tuix, like https://tuix.app."; cx.notify(); return; }
    const origin = new URL(url).origin, gen = ++this.authGen;
    this.dropSession(); this.client = null;
    this.connecting = true; this.notice = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const meta = await discover(origin, fetch);
        const { clientId, code } = await this.startFlow(meta, origin);
        if (this.authGen !== gen) return;
        const device = { ...code, meta, clientId, url, expiresAt: Date.now() + code.expires_in * 1000, failures: 0, openUrl: browserUrl(code, url), textUrl: browserUrl({ verification_uri: code.verification_uri }, url) };
        this.device = device; this.connecting = false;
        if (device.openUrl) cx.open_url(device.openUrl); // once; Open browser opens it again
        cx.timer.after(device.interval * 1000, (cx) => this.poll(device, cx));
      } catch (e) {
        if (this.authGen === gen) this.signinFail(e);
      } finally {
        cx.notify();
      }
    });
  }

  // The client id is public and kept per address. One the server no longer knows is replaced once.
  async startFlow(meta, origin) {
    let stored = read("clients", {})[origin];
    for (;;) {
      const fresh = !stored;
      const clientId = stored ?? await registerClient(meta, fetch);
      if (fresh) write("clients", { ...read("clients", {}), [origin]: clientId });
      try {
        return { clientId, code: await startDevice(meta, clientId, fetch) };
      } catch (e) {
        if (onStartError(!fresh, e) === "fail") throw e;
        stored = null;
      }
    }
  }

  async poll(device, cx) {
    if (this.device !== device) return; // cancelled or replaced
    let outcome;
    try {
      outcome = { result: await pollOnce(device.meta, device.clientId, device.device_code, fetch) };
    } catch (e) {
      outcome = { error: e };
    }
    if (this.device !== device) return;
    const step = pollStep(device, outcome, Date.now());
    if (step.type === "wait") cx.timer.after(step.seconds * 1000, (cx) => this.poll(device, cx));
    else if (step.type === "fail") this.signinFail(step.error);
    else {
      const session = createSession({ meta: device.meta, clientId: device.clientId, tokens: step.tokens, fetch });
      this.device = null; this.authGen++;
      await this.connectWith(device.url, session, cx);
      return;
    }
    cx.notify();
  }

  signinFail(e) {
    this.authGen++; this.device = null; this.connecting = false;
    this.notice = signinMessage(e);
  }

  cancelSignIn(cx) {
    this.authGen++; this.device = null; this.connecting = false; this.notice = null; cx.notify();
  }

  openBrowser(cx) { if (this.device?.openUrl) cx.open_url(this.device.openUrl); }

  // Signed in: connect to the MCP with the session and read the projects.
  async connectWith(url, session, cx) {
    this.connecting = true; this.url = url; this.session = session; cx.notify();
    try {
      const client = withRefresh(createClient({ url, token: () => session.access(), fetch }), session);
      await client.connect();
      const tools = await client.tools();
      const projects = await collect(client, "list_projects", "projects");
      if (this.session !== session) return; // signed out meanwhile
      this.client = client; this.canWrite = tools.includes("reply_to_issue");
      this.projects = projects; this.notice = null; this.locKey = null; this.state = "project";
      write("auth", { url });
      this.scheduleRefresh(session, cx);
    } catch (e) {
      if (this.session === session) this.fail(e);
    } finally {
      this.connecting = false; cx.notify();
    }
  }

  // Refreshes the access token about five minutes before it expires; a transient failure tries again shortly.
  scheduleRefresh(session, cx, ms = session.msUntilRefresh()) {
    if (ms === null) return;
    cx.timer.after(ms, async (cx) => {
      if (this.session !== session) return;
      try {
        await session.refreshNow();
        this.scheduleRefresh(session, cx);
      } catch (e) {
        if (this.session !== session) return;
        if (e instanceof McpError && e.code === "unauthorized") { this.fail(e); cx.notify(); } else this.scheduleRefresh(session, cx, RETRY_REFRESH_MS);
      }
    });
  }

  // The folder changed (or we just signed in): find the project for it.
  relocate(loc, key, cx) {
    // Nothing is cleared yet: a subfolder, a cd or a new space of the same repo must not close the open view.
    this.locKey = key; this.locating = true;
    cx.spawn(async (cx) => {
      const here = (c, a, o) => exec(c, a, { ...o, on: loc.on });
      const repo = loc.cwd ? await repoOf(loc.cwd, here) : null;
      const origin = repo ? await defaultBase(repo, here).then(() => true, () => false) : false;
      const noClaude = repo && origin ? claudeMissing(await Promise.resolve().then(() => knownAgents({ on: loc.on })).catch(() => null)) : false;
      if (this.locKey !== key || !this.client) return;
      this.locating = false;
      const stored = repo ? read("projects", {})[repo.main] : null;
      const matched = repo ? fixProjectFor(repo.name, this.projects, read("fixPick", {})[repo.main]) : null;
      const all = stored === ALL && this.projects.length > 1;
      const project = all ? null : this.projects.find((p) => p.id === stored) ?? (repo ? matchProject(repo.name, this.projects).project : null);
      // The Fix selection survives a folder change inside the same repo and project.
      const selKey = `${repo?.main ?? ""}|${all ? ALL : project?.id ?? ""}`;
      const keep = relocation({ state: this.state, key: this.selKey }, { key: selKey, hasProject: Boolean(project) || all }) === "keep";
      this.repo = repo; this.hasOrigin = origin; this.machine = loc.on ?? null; this.noClaude = noClaude;
      if (!keep) {
        if (this.state === "list" || this.state === "thread") this.saveDraft();
        this.th = null; this.confirming = null; this.project = null; this.all = false; this.loadedBy = {}; this.issues = []; this.groups = groupIssues([], []);
        this.selected.clear();
      }
      this.selKey = selKey;
      this.fixProject = matched;
      if (project || all) {
        this.project = project; this.all = all; if (!keep) this.state = "list";
        // A subfolder or cd in All projects changes nothing that was read: the 60 s refresh keeps it current.
        if (!(keep && all)) { await this.load(cx); await this.settle(cx); }
      } else { this.state = "project"; setShared("tuix.count", 0); }
      cx.notify();
    });
    // No cx.notify() here: this runs from render; the task notifies when it is done.
  }

  // `project` is a project, or ALL for the All projects view (remembered per repo like a project).
  pick(project, cx) {
    const all = project === ALL;
    if (this.repo) {
      write("projects", { ...read("projects", {}), [this.repo.main]: all ? ALL : project.id });
      if (!all) write("fixPick", { ...read("fixPick", {}), [this.repo.main]: project.id }); // kept when All projects is chosen later
    }
    this.project = all ? null : project; this.all = all; this.loadedBy = {};
    this.fixProject = this.repo ? fixProjectFor(this.repo.name, this.projects, read("fixPick", {})[this.repo.main]) : null;
    this.state = "list"; this.issues = []; this.groups = groupIssues([], []);
    this.selKey = `${this.repo?.main ?? ""}|${all ? ALL : project.id}`; this.selected.clear();
    cx.spawn(async (cx) => { await this.load(cx); await this.settle(cx); });
    cx.notify();
  }

  saveRuns() { write("runs", this.runs); }

  regroup() { this.groups = groupIssues(this.issues, this.runs); }

  // After the issues are read: apply what the agents did (and read closing comments), then start what fits.
  async settle(cx) { await this.trackRuns(cx, true); await this.pumpRuns(cx); }

  trackRuns(cx, read) { return trackRuns(this, cx, read); }

  pumpRuns(cx) { return pumpRuns(this, cx); }

  // One project's issues (all three statuses) and, with a connection that can change issues, its people.
  async readProject(client, project) {
    const issues = []; let cut = false;
    for (const status of STATUSES) { // list_issues takes one status at a time
      const page = await collect(client, "list_issues", "issues", { project_id: project.id, status });
      issues.push(...page); cut = cut || Boolean(page.truncated);
    }
    const people = this.canWrite ? await collect(client, "list_people", "people", { project_id: project.id }) : [];
    return { project, issues, people, cut };
  }

  // Reads the project, or in All projects every project (at most IN_FLIGHT at a time). `only` (a Set of project ids)
  // reads just those again and keeps the others as last read, so an action costs one project's requests.
  async load(cx, only = null) {
    const client = this.client, project = this.project, all = this.all, projects = this.projects;
    if (!client || (!project && !all)) return;
    if (this.loadBusy()) { this.again = queueReload(this.again || undefined, only); return; } // the latest request runs once this one ends
    const gen = ++this.loadGen; // a load that outlives LOAD_STALE_MS is abandoned: its result is ignored
    this.loading = true; this.loadingSince = Date.now(); this.again = false; cx.notify();
    try {
      const cached = all ? this.loadedBy : {}, scope = all ? projects : [project];
      // In All projects one project failing leaves the others shown; its name is in the note. Unauthorized ends the session.
      const readOne = (p) => this.readProject(client, p).catch((error) => {
        if (!all || (error instanceof McpError && error.code === "unauthorized")) throw error;
        return { project: p, error };
      });
      const read = await mapLimit(all ? targetsFor({ projects, cached, only }) : [project], IN_FLIGHT, readOne);
      if (!read.length) return; // nothing to read (unknown project ids): the view stays as it is
      if (read.every((r) => r.error)) throw read[0].error;
      if (this.client !== client || this.project !== project || this.all !== all || this.loadGen !== gen) return;
      const merged = mergeRead({ projects: scope, cached, read, only: all ? only : null }), issues = merged.issues;
      let runs = this.runs;
      for (const id of merged.retire) runs = retirePrOpen(runs, id, read.find((r) => r.project.id === id).issues); // complete reads only
      if (runs !== this.runs) { this.runs = runs; this.saveRuns(); }
      this.loadedBy = merged.loadedBy; this.issues = issues; this.cut = merged.cut.length > 0; this.cutNames = merged.cut;
      this.peopleBy = merged.peopleBy; this.meBy = merged.meBy; this.names = merged.names;
      this.people = all ? [] : merged.peopleBy[project.id]; this.me = all ? null : merged.meBy[project.id];
      this.groups = groupIssues(issues, this.runs);
      const open = new Set(this.groups.open.map((i) => i.id));
      this.selected = new Set([...this.selected].filter((id) => open.has(id)));
      this.notice = merged.failed.length ? `Couldn't read ${merged.failed.join(", ")}. Trying again in a minute.` : null;
      setShared("tuix.count", yourTurnAll(issues, merged.meBy));
      pruneShots(new Set([...issues.map((i) => i.id), ...(this.th ? [this.th.id] : [])])).catch(() => {});
    } catch (e) {
      if (this.loadGen === gen) this.fail(e);
    } finally {
      if (this.loadGen !== gen) return; // abandoned; the newer load owns the flags
      this.loading = false;
      const again = this.again; this.again = false;
      if (again) cx.spawn(async (cx) => { await this.load(cx, again === "all" ? null : again); });
      cx.notify();
    }
  }

  // The `only` argument of load for one project (null: read everything).
  onlyOf(projectId) { return projectId ? new Set([projectId]) : null; }

  loadBusy() { return this.loading && Date.now() - this.loadingSince < LOAD_STALE_MS; }

  refresh(cx) {
    if (this.loadBusy() || this.connecting) return;
    if (this.state === "signin") {
      // A session we hold but couldn't use yet (offline, busy): one try per tick.
      const session = this.session;
      if (session && !session.ended && !this.client && this.url) cx.spawn(async (cx) => { await this.connectWith(this.url, session, cx); });
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
    const only = this.onlyOf(this.th?.issue.projectId);
    this.th = null; this.confirming = null; this.state = "list"; cx.notify();
    cx.spawn(async (cx) => { await this.load(cx, only); });
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
      th.issue = first.issue ? { ...first.issue, projectId: th.issue.projectId, projectName: th.issue.projectName } : th.issue; th.comments = comments; th.cursor = cursor; th.context = first.context ?? null;
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
        await this.load(cx, this.onlyOf(th.issue.projectId));
      } catch (e) {
        th.sending = false;
        if (e instanceof McpError && e.code === "unauthorized") { if (this.client === client) this.fail(e); }
        else th.replyError = e instanceof McpError ? (e.message && e.message !== e.code ? e.message : `Tuix returned an error (${e.code}).`) : "Can't reach Tuix. Your reply is still here.";
      } finally {
        th.sending = false; cx.notify();
      }
    });
  }

  // The project an issue belongs to (in a single project: that project).
  projectOf(issue) { return this.projects.find((p) => p.id === issue?.projectId) ?? this.project; }

  archivedIssue(issue) { return Boolean(this.projectOf(issue)?.archived); }

  // Who the person is, and who can be handed an issue, in the issue's own project.
  meOf(issue) { return this.all ? this.meBy[issue?.projectId] ?? null : this.me; }

  peopleOf(issue) { return this.all ? this.peopleBy[issue?.projectId] ?? [] : this.people; }

  // Fix runs in this repository, so in All projects only for issues of the project matched to it.
  inFixProject(issue) { return !this.all || (Boolean(this.fixProject) && issue?.projectId === this.fixProject.id); }

  canReady(issue) { return this.canWrite && !this.archivedIssue(issue) && issue?.status === "in_progress"; }

  askReady(id, cx) { this.confirming = id; cx.notify(); }

  // The only place the panel sets in_review, and only after the person's "Yes".
  readyForReview(id, cx) {
    const client = this.client;
    if (!client || this.confirming !== id) return;
    const only = this.onlyOf(this.issues.find((i) => i.id === id)?.projectId ?? this.th?.issue.projectId);
    this.confirming = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await client.call("set_issue_status", { id, status: "in_review" });
        this.notice = null;
        if (this.th?.id === id) await this.loadThread(cx);
        await this.load(cx, only);
      } catch (e) {
        if (e instanceof McpError && e.code !== "unauthorized" && e.code !== "rate_limited") {
          this.notice = e.message && e.message !== e.code ? e.message : `Tuix returned an error (${e.code}).`;
        } else if (this.client === client) this.fail(e);
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
    const issue = this.groups.open.find((i) => i.id === id);
    if (!this.canWrite || !issue || !this.canFix(issue)) return;
    if (this.selected.has(id)) this.selected.delete(id); else this.selected.add(id);
    cx.notify();
  }

  fixBlock() {
    if (!this.canWrite) return "Fix needs a connection that can change issues.";
    if (this.machine && machines().find((m) => m.name === this.machine)?.layout !== "ready") return `${this.machine} isn't connected.`;
    if (!this.all && this.project?.archived) return "Archived: read only.";
    if (!this.repo || !this.hasOrigin) return "Fix needs a git repository with an origin remote.";
    if (this.noClaude) return this.machine ? `Fix needs Claude Code on ${this.machine}.` : "Fix needs Claude Code on this computer.";
    return null;
  }

  canFix(issue) { return this.inFixProject(issue) && !this.archivedIssue(issue) && this.groups.open.some((i) => i.id === issue.id); }

  // Queues the selected issues, or one issue (the thread's Fix button); runs start up to the limit.
  fix(cx, issue) {
    if (this.fixBlock()) return;
    const picked = issue ? [issue] : this.groups.open.filter((i) => this.selected.has(i.id));
    if (picked.length) queueFixes(this, picked, cx);
  }

  removeRun(issueId, cx) { dropRun(this, issueId, cx); }

  focusRun(run_) { if (run_.terminal) run("agent.focus", { terminal: run_.terminal }); }

  projectView(t) {
    const choices = this.projects;
    const everything = choices.length > 1 && !this.locating;
    return v_flex().flex_1().min_h(0).overflow_y_scrollbar().p(8).gap(2)
      .child(div().px(8).py(6).text_color(t.muted).child(this.locating ? "Finding the project…"
        : !choices.length ? "This connection can't see any projects."
        : this.repo && !this.project && !this.all ? `No project is named “${this.repo.name}”. Pick one:` : "Pick a project:"))
      .when(everything, (e) => e.child(h_flex().id("pick-all").h(30).px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .when(this.all, (x) => x.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.pick(ALL, cx))
        .child(div().min_w(0).truncate().font_semibold().child("All projects"))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(`${choices.length} projects`))))
      .children(this.locating ? [] : choices.map((p) => h_flex().id(`pick-${p.id}`).h(30).px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .when(this.project?.id === p.id, (e) => e.bg(t.selected)).hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.pick(p, cx))
        .child(div().min_w(0).truncate().child(labelOf(p, choices)))
        .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(labelOf(p, choices) === p.name ? p.workspace ?? "" : ""))
        .when(p.archived, (e) => e.child(div().text_size(11).text_color(t.dim).child("Archived")))));
  }

  render(cx) {
    if (this.state === "shot") return this.shotDialog(theme());
    if (this.client) {
      const loc = location(), key = JSON.stringify(loc);
      if (key !== this.locKey) this.relocate(loc, key, cx);
      if (this.state === "list" || this.state === "thread") trackSoon(this, cx); // schedules; never notifies here
    }
    const t = theme();
    const note = (text, color) => div().px(14).py(4).text_size(11).text_color(color ?? t.dim).child(text);
    const thread = this.state === "thread" && this.th;
    const title = this.state === "list" && (this.project || this.all)
      ? h_flex().id("tuix-project").gap(6).items_center().cursor_pointer().on_click((_e, cx) => { this.state = "project"; cx.notify(); })
        .child(div().font_semibold().truncate().child(this.all ? "All projects" : labelOf(this.project, this.projects))).child(div().text_color(t.dim).child("▾"))
        .when(Boolean(this.project?.archived), (e) => e.child(div().text_size(11).text_color(t.dim).child("Archived: read only")))
      : div().font_semibold().child(this.state === "project" ? "Choose a project" : "Tuix");
    return v_flex().id("tuix").on_size_change((s, cx) => { if (Math.abs(s.width - this.paneW) > 1) { this.paneW = s.width; cx.notify(); } }).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .when(!thread, (e) => e.child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(title).child(div().flex_1())
        .when(this.state === "project" && (Boolean(this.project) || this.all), (e) => e.child(this.button("tuix-cancel", "Cancel", (_e, cx) => { this.state = "list"; cx.notify(); })))
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("Loading…")))
        .when(Boolean(this.client) && (this.state === "project" || this.state === "list"), (e) => e.child(this.button("tuix-signout", "Sign out", (_e, cx) => this.signOut(cx))))))
      .when(Boolean(this.client) && !this.canWrite, (e) => e.child(note(READ_ONLY)))
      .when(this.state === "list" && this.all && this.canWrite, (e) => e.child(note("Fix works in the matched project's repository.")))
      .when(this.state === "list" && this.cut, (e) => e.child(note(this.all ? `List cut off in ${this.cutNames.join(", ")}.` : `List cut off — showing the first ${this.issues.length}.`, t.blocked)))
      .when(this.state !== "signin" && Boolean(this.notice), (e) => e.child(note(this.notice, t.ansi1)))
      .child(this.state === "signin" ? signinView(this, t) : this.state === "project" ? this.projectView(t)
        : thread ? threadView(this, t) : listView(this, t));
  }
}
