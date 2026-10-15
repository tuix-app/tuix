import { describe, expect, it } from 'vitest';
import { linkedIssue } from '../src/deeplink';

describe('email deep links', () => {
  it('accepts an issue id without treating unrelated or malformed query values as activation', () => {
    const id = 'f3f59e83-0750-47aa-9c04-c7fb02060900';
    expect(linkedIssue('?host=kept&tuix=' + id)).toBe(id);
    expect(linkedIssue('?host=kept')).toBeNull();
    expect(linkedIssue('?tuix=https://example.test')).toBeNull();
    expect(linkedIssue('?tuix=' + id + '/comments')).toBeNull();
  });
});
