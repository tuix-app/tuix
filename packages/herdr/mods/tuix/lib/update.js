// Updating the panel from the public repository. Pure orchestration over an injected
// exec(cmd, args, { cwd }) -> Promise<{ code, stdout, stderr }>; no host imports.
//
// The public repository's copy carries mods/tuix/version.json, written by the export: a hash of
// every file under packages/herdr/mods, so it changes only when the panel does. A copy without it
// (installed from source) never offers an update.
//
// An update downloads the repository's tarball into a hidden folder of Herdr's home, has
// `herdr-app check` pass both mods there, and only then swaps each mod folder (tuix-tabs first,
// tuix last, since replacing tuix reloads this mod). A failed swap puts the old folders back.

export const REPO = "tuix-app/tuix";
export const VERSION_URL = `https://raw.githubusercontent.com/${REPO}/main/packages/herdr/mods/tuix/version.json`;
export const TARBALL_URL = `https://codeload.github.com/${REPO}/tar.gz/refs/heads/main`;
const TARBALL_MODS = "tuix-main/packages/herdr/mods"; // GitHub names the top folder <repo>-<branch>
export const MODS = ["tuix-tabs", "tuix"]; // swap order: this mod last
export const CHECK_EVERY = 24 * 60 * 60 * 1000;
export const STAGING = ".tuix-update"; // under Herdr's home, outside mods/: writing there reloads nothing

// sh -c SWAP swap <mods> <new> <old> <mod>...: for each mod, moves mods/<mod> to old/ and new/<mod> into
// mods/. On any failure it puts every mod back as it was and exits 1. Paths come in as arguments, never
// inside the script.
export const SWAP = [
  'm=$1; n=$2; o=$3; shift 3; done=""',
  'for x in "$@"; do',
  '  if mv "$m/$x" "$o/$x"; then',
  '    if mv "$n/$x" "$m/$x"; then done="$x $done"; continue; fi',
  '    mv "$o/$x" "$m/$x"',
  '  fi',
  '  for d in $done; do mv "$m/$d" "$n/$d"; mv "$o/$d" "$m/$d"; done',
  '  exit 1',
  'done',
].join("\n");

// The hash in a version.json's text, or null.
export function hashOf(text) {
  try {
    const hash = JSON.parse(String(text ?? ""))?.hash;
    return typeof hash === "string" && /^[0-9a-f]{64}$/.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

// Is a check due? `installed` null (no version.json) never checks.
export const checkDue = ({ installed, checkedAt, now }) => Boolean(installed) && !(now - (checkedAt ?? 0) < CHECK_EVERY);

// An update is there when the public hash is known and differs from the installed one.
export const updateAvailable = ({ installed, latest }) => Boolean(installed) && Boolean(latest) && latest !== installed;

const run = async (exec, cmd, args, opts = {}) => {
  try {
    const r = await exec(cmd, args, opts);
    return { code: r.code, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
  } catch (e) {
    return { code: -1, stdout: "", stderr: String(e?.message ?? e) };
  }
};

// The public version's hash, or null when it can't be read (offline, GitHub down, no stamp).
export async function latestHash(exec) {
  const r = await run(exec, "curl", ["-sSfL", "--max-time", "15", VERSION_URL]);
  return r.code === 0 ? hashOf(r.stdout) : null;
}

// Removes what an earlier update left behind (the old folders and the download).
export async function cleanUp(exec, appHome) {
  await run(exec, "rm", ["-rf", `${appHome}/${STAGING}`]);
}

// Downloads, checks and installs the public version. Resolves with its hash; rejects with a
// reason to show, leaving the installed panel as it was. Once the last swap is done Herdr
// reloads this mod, so the caller may never see this resolve.
export async function applyUpdate({ exec, appHome }) {
  const dir = `${appHome}/${STAGING}`, mods = `${appHome}/mods`;
  const must = async (cmd, args, reason) => {
    const r = await run(exec, cmd, args);
    if (r.code !== 0) throw new Error(reason);
    return r;
  };
  await must("rm", ["-rf", dir], "Couldn't clear the update folder.");
  await must("mkdir", ["-p", `${dir}/new`, `${dir}/old`], "Couldn't create the update folder.");
  await must("curl", ["-sSfL", "--max-time", "120", "-o", `${dir}/src.tgz`, TARBALL_URL], "Couldn't download the update.");
  await must("tar", ["-xzf", `${dir}/src.tgz`, "-C", `${dir}/new`, "--strip-components=4", TARBALL_MODS], "Couldn't unpack the update.");
  const hash = hashOf((await run(exec, "cat", [`${dir}/new/tuix/version.json`])).stdout);
  if (!hash) throw new Error("The download has no version.");
  for (const m of MODS) await must("herdr-app", ["check", `${dir}/new/${m}`], "The new version didn't pass Herdr's check.");
  // The screenshot cache is kept (hidden, so moving it reloads nothing). Best effort.
  await run(exec, "mv", [`${mods}/tuix/.cache`, `${dir}/new/tuix/.cache`]);
  // One process swaps every mod and undoes all of it on a failure: moving this mod's folder can make
  // Herdr reload the mod at once, so the swap must not depend on this code running on after it.
  const r = await run(exec, "sh", ["-c", SWAP, "swap", mods, `${dir}/new`, `${dir}/old`, ...MODS]);
  if (r.code !== 0) {
    await run(exec, "mv", [`${dir}/new/tuix/.cache`, `${mods}/tuix/.cache`]);
    throw new Error("Couldn't replace the panel's files.");
  }
  return hash;
}
