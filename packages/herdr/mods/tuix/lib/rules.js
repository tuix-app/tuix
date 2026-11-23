// What agents are told to do after a fix, per repository. Pure; no host imports.
// Stored as a map under `rules` in view-local storage, keyed by the repository's main folder:
// { merge, review, deploy }. Everything off is today's behaviour.

export const DEPLOY_MAX = 500;

const clean = (s) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, DEPLOY_MAX).trim();

// `review` needs `merge`. `deploy` (how to tell the fix is deployed) is kept while `review` is off, so
// unticking and ticking again doesn't lose it; only the prompt of a `review` run uses it.
export function normalize(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { merge: false, review: false, deploy: "" };
  const merge = raw.merge === true, review = merge && raw.review === true;
  return { merge, review, deploy: typeof raw.deploy === "string" ? clean(raw.deploy) : "" };
}

// The rules of one repository out of the stored map. Own keys only: "__proto__" is not a repository.
export function rulesFor(stored, repoMain) {
  const own = stored && typeof stored === "object" && typeof repoMain === "string" && Object.prototype.hasOwnProperty.call(stored, repoMain);
  return normalize(own ? stored[repoMain] : null);
}

// What a started run records as `auto`: how far its agent takes the fix.
export const autoOf = (rules) => (rules?.review ? "review" : rules?.merge ? "merge" : null);

export function summary(rules) {
  const auto = autoOf(rules);
  return auto === "review" ? "After a fix: merge, then In review once deployed" : auto === "merge" ? "After a fix: merge when checks pass" : "After a fix: nothing more";
}
