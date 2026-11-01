// Screenshot cache: PNGs in mods/tuix/.cache/ (hidden, so writing them does not reload the mod).
// image() paths are relative to the app folder; curl needs the absolute one.
import { appHome } from "herdr";
import * as fs from "fs/promises";

const DIR = "mods/tuix/.cache";
const SAFE = /^[A-Za-z0-9_-]+$/;
const nameOf = (issueId, shotId) => `${issueId}-${shotId}.png`;
const entryName = (e) => (typeof e === "string" ? e : e?.name);

const exists = (path) => (typeof fs.exists === "function" ? fs.exists(path) : fs.access(path).then(() => true, () => false));

// Downloads shot.url (a short-lived signed URL from get_issue) and answers the path for image().
// It is written to a .part file and moved into place, so a half-finished download is never shown.
// An image already cached is reused: a screenshot never changes. Rejects when the download fails.
export async function cacheShot(issueId, shot, exec) {
  if (!SAFE.test(String(issueId)) || !SAFE.test(String(shot?.id))) throw new Error("bad screenshot id");
  const rel = `${DIR}/${nameOf(issueId, shot.id)}`, abs = `${appHome()}/${rel}`, part = `${abs}.part`;
  if (await exists(abs)) return rel;
  if (!/^https?:\/\//i.test(String(shot.url ?? ""))) throw new Error("no screenshot url");
  await fs.mkdir(`${appHome()}/${DIR}`, { recursive: true });
  try {
    const r = await exec("curl", ["-sSf", "--max-time", "20", "-o", part, shot.url]);
    if (r.code !== 0) throw new Error("download failed");
    const moved = await exec("mv", [part, abs]);
    if (moved.code !== 0) throw new Error("could not save the screenshot");
  } catch (e) {
    await fs.unlink(part).catch(() => {});
    throw e;
  }
  return rel;
}

// Deletes the cached screenshots of issues that are not in the current list.
export async function pruneShots(keepIssueIds) {
  const keep = [...keepIssueIds].map((id) => `${id}-`);
  let found = [];
  try { found = (await fs.readdir(`${appHome()}/${DIR}`)).map(entryName).filter(Boolean); } catch { return; }
  for (const name of found) {
    if (!(name.endsWith(".png") || name.endsWith(".part")) || keep.some((prefix) => name.startsWith(prefix))) continue;
    await fs.unlink(`${appHome()}/${DIR}/${name}`).catch(() => {});
  }
}
