// The All projects view: issues of several projects in one list. Pure functions; no host imports.
import { isYourTurn, matchProject } from "./issues.js";

export const ALL = "*"; // what is remembered per repo when All projects was chosen

// A project's name; "name · workspace" when another project has the same name.
export function labelOf(project, projects) {
  const same = projects.filter((p) => String(p.name ?? "").toLowerCase() === String(project.name ?? "").toLowerCase());
  return same.length > 1 && project.workspace ? `${project.name} · ${project.workspace}` : String(project.name ?? "");
}

// The project Fix runs in for a repo: the one named like it, else the person's last single pick for it.
export function fixProjectFor(repoName, projects, pickId) {
  if (repoName == null) return null;
  return matchProject(repoName, projects).project ?? projects.find((p) => p.id === pickId) ?? null;
}

// Each issue knows its project (the server's lists are per project).
export const tagIssues = (issues, project, label = project.name ?? "") => issues.map((i) => ({ ...i, projectId: project.id, projectName: label }));

// Project name order (case-insensitive), then the order the server gave. Stable.
export function byProject(issues) {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => String(a.issue.projectName).toLowerCase().localeCompare(String(b.issue.projectName).toLowerCase()) || a.index - b.index)
    .map((x) => x.issue);
}

// `loaded`: [{ project, issues, people }]; `projects` all of them (for labels). The shapes the single project view keeps.
export function mergeLoaded(loaded, projects = loaded.map((l) => l.project)) {
  const people = loaded.map((l) => l.people ?? []);
  return {
    issues: byProject(loaded.flatMap((l) => tagIssues(l.issues, l.project, labelOf(l.project, projects)))),
    peopleBy: Object.fromEntries(loaded.map((l, i) => [l.project.id, people[i]])),
    meBy: Object.fromEntries(loaded.map((l, i) => [l.project.id, people[i].find((p) => p.me)?.id ?? null])),
    names: Object.fromEntries(people.flat().map((p) => [p.id, p.name])),
  };
}

// Your turn across the issues shown: each issue against the person's id in its own project.
export const yourTurnAll = (issues, meBy) => issues.filter((issue) => isYourTurn(issue, meBy[issue.projectId])).length;

// Is this a partial read? Only when `only` is given and every project was read before.
export const isPartial = ({ projects, cached, only }) => Boolean(only) && projects.every((p) => cached[p.id]);

// Which projects to read: those in `only` (a Set of ids; unknown ids are ignored) when partial, else all.
export const targetsFor = ({ projects, cached, only }) => (isPartial({ projects, cached, only }) ? projects.filter((p) => only.has(p.id)) : projects);

// Folds what was just read into the last read. `read`: [{ project, issues, people, cut } | { project, error }].
// Projects not read keep their last result; a failed one keeps its last result too and is named in `failed`.
// `retire`: ids of the projects read completely (no error, not cut): only for those can finished PR-open runs be dropped.
export function mergeRead({ projects, cached, read, only }) {
  const loadedBy = isPartial({ projects, cached, only }) ? { ...cached } : {};
  const failed = [], retire = [];
  for (const r of read) {
    if (r.error) {
      failed.push(labelOf(r.project, projects));
      if (cached[r.project.id]) loadedBy[r.project.id] = cached[r.project.id];
    } else {
      loadedBy[r.project.id] = r;
      if (!r.cut) retire.push(r.project.id);
    }
  }
  const loaded = projects.map((p) => loadedBy[p.id]).filter(Boolean);
  return { loadedBy, loaded, failed, retire, cut: loaded.filter((l) => l.cut).map((l) => labelOf(l.project, projects)), ...mergeLoaded(loaded, projects) };
}

// A load asked for while one runs: "all" (everything), or the union of the projects asked for. `only` null means all.
export function queueReload(pending, only) {
  if (!only || pending === "all") return "all";
  return new Set([...(pending ?? []), ...only]);
}

// The projects whose runs changed (null, meaning read everything, if any run has no project recorded).
export function reloadFor(runs) {
  const ids = new Set(runs.map((r) => r.projectId ?? null));
  return ids.has(null) || !ids.size ? null : ids;
}

// Runs `fn` over `items` with at most `limit` in flight. Results keep the order of `items`.
// After a failure nothing new starts, and the first error is thrown once the ones in flight end.
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0, failed = false, error;
  const worker = async () => {
    while (!failed && next < items.length) {
      const i = next++;
      try { out[i] = await fn(items[i], i); } catch (e) { if (!failed) { failed = true; error = e; } }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failed) throw error;
  return out;
}
