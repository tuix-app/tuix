import { createHmac } from 'node:crypto';

/** Supply only an authenticated server identity; email must be verified by the host. */
export interface TrustedUser {
  id: string | number | bigint;
  name: string;
  email?: string | null;
  /** Identify v3: the group (company, workspace) this person belongs to; one id per group. */
  group?: string | null;
  /** Display name of the group; signed too, so a person cannot relabel it. */
  group_name?: string | null;
}

/** The hash authenticates the id, the optional normalized email and, in v3, the group and its name. */
export interface SignedIdentity { id: string; name: string; email?: string; group?: string; group_name?: string; hash: string }
export interface SigningOptions { secret: string }

function text(value: unknown, field: string, limit: number): asserts value is string {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.trim() || Buffer.byteLength(value, 'utf8') > limit) {
    throw new TypeError(`Invalid Tuix ${field}`);
  }
}

export function signIdentity(user: null | undefined, options: SigningOptions): null;
export function signIdentity(user: TrustedUser, options: SigningOptions): SignedIdentity;
export function signIdentity(user: TrustedUser | null | undefined, options: SigningOptions): SignedIdentity | null;
/**
 * Tuix v1 signs the exact ID; v2 signs ID + newline + trimmed, lowercased verified email.
 * With a `group`, v3 signs "v3", ID, email (empty without one), group and group name
 * (empty without one), each separated by a newline.
 */
export function signIdentity(user: TrustedUser | null | undefined, options: SigningOptions): SignedIdentity | null {
  if (user == null) return null;
  if (typeof user !== 'object' || Array.isArray(user)) throw new TypeError('Tuix user must be an authenticated identity');
  if (typeof user.id === 'number' && !Number.isSafeInteger(user.id)) throw new TypeError('Tuix numeric IDs must be safe integers; use a string for larger IDs');
  const id = typeof user.id === 'number' || typeof user.id === 'bigint' ? String(user.id) : user.id;
  text(id, 'id', 200);
  text(user.name, 'name', 200);
  const secret = options?.secret;
  if (typeof secret !== 'string' || !secret.isWellFormed() || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new TypeError('Tuix project secret must be at least 32 UTF-8 bytes');
  }
  let email: string | undefined;
  if (user.email != null) {
    text(user.email, 'email', 254);
    email = user.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new TypeError('Invalid Tuix email');
  }
  const group = user.group ?? undefined;
  const groupName = user.group_name == null || user.group_name === '' ? undefined : user.group_name;
  if (group === undefined) {
    if (groupName !== undefined) throw new TypeError('Tuix group_name needs a group');
    const hash = createHmac('sha256', secret).update(email === undefined ? id : `${id}\n${email}`, 'utf8').digest('hex');
    return { id, name: user.name, ...(email === undefined ? {} : { email }), hash };
  }
  text(group, 'group', 200);
  if (groupName !== undefined) text(groupName, 'group_name', 200);
  // The v3 message is newline-separated: the id may not hold a newline, nor the group fields a control character.
  if (id.includes('\n')) throw new TypeError('Invalid Tuix id');
  for (const [field, value] of [['group', group], ['group_name', groupName]] as const) {
    if (value !== undefined && /\p{Cc}/u.test(value)) throw new TypeError(`Invalid Tuix ${field}`);
  }
  const message = ['v3', id, email ?? '', group, groupName ?? ''].join('\n');
  const hash = createHmac('sha256', secret).update(message, 'utf8').digest('hex');
  return {
    id, name: user.name, ...(email === undefined ? {} : { email }), group,
    ...(groupName === undefined ? {} : { group_name: groupName }), hash,
  };
}
