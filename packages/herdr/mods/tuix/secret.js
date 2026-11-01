// Reads the token from the macOS Keychain. The panel never stores it: the item
// is made by the person (keychainCommand), created with no trusted apps, so
// every read asks. The token only ever comes back on stdout; it is never an
// argument, a file, localStorage or shared().
import { window } from "herdr";

const SERVICE = "Tuix for Herdr";

export const onMac = () => window()?.platform === "macos";

export async function readToken(origin, exec) {
  if (!onMac()) return null;
  try {
    const r = await exec("security", ["find-generic-password", "-s", SERVICE, "-a", origin, "-w"]);
    if (r.code !== 0) return null;
    return r.stdout.trim() || null;
  } catch {
    return null;
  }
}

export const keychainCommand = (origin) => `security add-generic-password -s "${SERVICE}" -a ${origin} -T "" -U -w`;
