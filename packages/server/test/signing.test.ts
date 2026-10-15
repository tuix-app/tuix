import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { signIdentity, type TrustedUser } from '../src/index.js';

const vectors = JSON.parse(readFileSync(new URL('../../test-fixtures/identity-signing.json', import.meta.url), 'utf8'));
const secret = vectors.secret;

describe('Tuix identity protocol', () => {
  for (const vector of vectors.cases) {
    it(vector.label, () => expect(signIdentity(vector.user, { secret })).toEqual(vector.signed));
  }

  it('keeps the source identity unchanged and strips unrelated fields', () => {
    const user = Object.freeze({ id: 42, name: 'Ada', email: ' ADA@example.com ', admin: true, secret });
    const signed = signIdentity(user, { secret });
    expect(user.email).toBe(' ADA@example.com ');
    expect(Object.keys(signed).sort()).toEqual(['email', 'hash', 'id', 'name']);
    expect(JSON.stringify(signed)).not.toContain(secret);
  });

  it('supports bigint IDs without numeric precision loss and anonymous users without configuration', () => {
    expect(signIdentity({ id: 9007199254740993n, name: 'Ada' }, { secret })?.id).toBe('9007199254740993');
    expect(signIdentity(null, { secret: '' })).toBeNull();
    expect(signIdentity(undefined, { secret: '' })).toBeNull();
  });

  it('rejects malformed or ambiguous identities', () => {
    for (const user of [[], '42', { id: 1.5, name: 'Ada' }, { id: Number.MAX_SAFE_INTEGER + 1, name: 'Ada' },
      { id: NaN, name: 'Ada' }, { id: {}, name: 'Ada' }, { id: '', name: 'Ada' }, { id: '\ud800', name: 'Ada' },
      { id: 'é'.repeat(101), name: 'Ada' }, { id: 42, name: ' ' }, { id: 42, name: 'Ada', email: '' },
      { id: 42, name: 'Ada', email: 'bad\n@example.com' }, { id: 42, name: 'Ada', email: 'not-an-address' }]) {
      expect(() => signIdentity(user as TrustedUser, { secret })).toThrow(TypeError);
    }
  });

  it('rejects missing, malformed and short secrets without exposing them', () => {
    for (const candidate of ['', 'private-too-short', '\ud800'.repeat(32), undefined]) {
      expect(() => signIdentity({ id: 42, name: 'Ada' }, { secret: candidate as string })).toThrow('at least 32 UTF-8 bytes');
    }
  });
});
