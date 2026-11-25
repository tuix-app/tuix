// How agents fix an issue in one repository: which agent, how far it goes, extra instructions. Pure; no host imports.
// Stored as a map under `rules` in view-local storage, keyed by the repository's main folder:
// { agent, until, deploy, extra }. The default is Claude Code, until the pull request is open: what agents always did.

export const DEPLOY_MAX = 500;
export const EXTRA_MAX = 1000;
export const UNTIL = ["pr", "reviewed", "merged", "fix_ready"];
const NAME_MAX = 60;

// Control characters and the invisible ones that reorder or hide text (zero width, bidi) become spaces.
const strip = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]+/g, " ").replace(/\s+/g, " ").trim();
// The cut never leaves half of a surrogate pair.
const clean = (s, max) => strip(s).slice(0, max).replace(/[\ud800-\udbff]$/, "").trim();

// An agent id is kept exactly as Herdr gives it (it is looked up by it), so one that cleaning would change is not usable.
export const validAgentId = (id) => typeof id === "string" && id !== "" && clean(id, NAME_MAX) === id;

// Records saved before `until` had two boxes: merge, and review (once "in_review") on top of it.
const legacyUntil = (raw) => (raw.merge === true && (raw.review === true || raw.review === "in_review") ? "fix_ready" : raw.merge === true ? "merged" : "pr");

// null is Claude Code. Another agent is { id, name } as Herdr's knownAgents lists it; an unusable one is Claude Code.
function agentOf(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !validAgentId(raw.id)) return null;
  const id = raw.id;
  if (id.toLowerCase() === "claude") return null;
  return { id, name: (typeof raw.name === "string" && clean(raw.name, NAME_MAX)) || id };
}

// `deploy` (how to tell the fix is deployed) is kept whatever `until` is, so changing the stage and back doesn't lose it;
// only a Fix ready prompt uses it.
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { agent: null, until: "pr", deploy: "", extra: "" };
  const until = UNTIL.includes(raw.until) ? raw.until : legacyUntil(raw);
  return {
    agent: agentOf(raw.agent), until,
    deploy: typeof raw.deploy === "string" ? clean(raw.deploy, DEPLOY_MAX) : "",
    extra: typeof raw.extra === "string" ? clean(raw.extra, EXTRA_MAX) : "",
  };
}

// The rules of one repository out of the stored map. Own keys only: "__proto__" is not a repository.
export function rulesFor(stored, repoMain) {
  const own = stored && typeof stored === "object" && typeof repoMain === "string" && Object.prototype.hasOwnProperty.call(stored, repoMain);
  return normalize(own ? stored[repoMain] : null);
}

// What a started run records as `auto`: how far its agent takes the fix. "review" and "merge" keep the names saved runs have.
export const autoOf = (rules) => ({ fix_ready: "review", merged: "merge", reviewed: "watch" })[rules?.until] ?? null;

export const agentName = (rules) => rules?.agent?.name || "Claude Code";

const UNTIL_TEXT = { pr: "until the pull request is open", reviewed: "until reviewed and green", merged: "until merged", fix_ready: "until Fix ready" };

export const summary = (rules) => `${agentName(rules)} · ${UNTIL_TEXT[rules?.until] ?? UNTIL_TEXT.pr}`;
