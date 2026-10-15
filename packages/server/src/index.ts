import { createHmac } from 'node:crypto';

/** Supply only an authenticated server identity; email must be verified by the host. */
export interface TrustedUser {
  id: string | number | bigint;
  name: string;
  email?: string | null;
}

/** Only id and the optional normalized email are authenticated by the hash. */
export interface SignedIdentity { id: string; name: string; email?: string; hash: string }
export interface SigningOptions { secret: string }

function text(value: unknown, field: string, limit: number): asserts value is string {
  if (typeof value !== 'string' || !value.isWellFormed() || !value.trim() || Buffer.byteLength(value, 'utf8') > limit) {
    throw new TypeError(`Invalid Tuix ${field}`);
  }
}

export function signIdentity(user: null | undefined, options: SigningOptions): null;
export function signIdentity(user: TrustedUser, options: SigningOptions): SignedIdentity;
export function signIdentity(user: TrustedUser | null | undefined, options: SigningOptions): SignedIdentity | null;
/** Tuix v1 signs the exact ID; v2 signs ID + newline + trimmed, lowercased verified email. */
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
  const hash = createHmac('sha256', secret).update(email === undefined ? id : `${id}\n${email}`, 'utf8').digest('hex');
  return { id, name: user.name, ...(email === undefined ? {} : { email }), hash };
}
