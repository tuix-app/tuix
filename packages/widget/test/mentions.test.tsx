// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { Api } from '../src/api';
import { CommentText, mentionAt, mentionIds, mentioned, searchPeople } from '../src/mentions';
afterEach(() => vi.unstubAllGlobals());

it('starts a suggestion at an "@" the matching rule allows, for at most 30 characters on one line', () => {
  expect(mentionAt('Hi @Da', 6)).toEqual({ at: 3, query: 'Da' });
  expect(mentionAt('@', 1)).toEqual({ at: 0, query: '' });
  expect(mentionAt('(@Anna Smith', 12)).toEqual({ at: 1, query: 'Anna Smith' });
  expect(mentionAt('@Da and more', 3)).toEqual({ at: 0, query: 'Da' });
  expect(mentionAt('@' + 'x'.repeat(30), 31)).toEqual({ at: 0, query: 'x'.repeat(30) });
  for (const [text, caret] of [['@' + 'x'.repeat(31), 32], ['@Da\n', 4], ['@Da\r', 4], ['anna@ex', 7], ['a.@b', 4], ['_@b', 3], ['@@b', 3], ['no mention', 10], ['@Da', 0]] as const) {
    expect(mentionAt(text, caret), text).toBeNull();
  }
});

it('reads the code point before "@" as the server does, so an astral letter blocks it and an emoji does not', () => {
  for (const letter of ['\u{1D400}', '\u{10400}', '\u{20000}']) {
    expect(mentionAt(letter + '@a', 4), letter).toBeNull();
    expect([...mentioned(letter + '@Anna', ['Anna'])], letter).toEqual([]);
  }
  expect(mentionAt('\u{1F600}@a', 4)).toEqual({ at: 2, query: 'a' });
  expect([...mentioned('\u{1F600}@Anna', ['Anna'])]).toEqual(['Anna']);
  // 30 astral characters are 30 characters of query, not 60.
  const thirty = '\u{1D400}'.repeat(30);
  expect(mentionAt('@' + thirty, 61)).toEqual({ at: 0, query: thirty });
  expect(mentionAt('@' + thirty + 'a', 63)).toBeNull();
});

// The server's fixture table for `Tuix.Mentions.segments/2`, as the labels each body mentions.
const labels = ['Ann', 'Anna', 'Zoë Reviewer', 'dev.ops'];
it.each([
  ['@Anna, could you check?', ['Anna']],
  ['@Ann and @Anna', ['Ann', 'Anna']],
  ['@Annabel and @Anna2 and @Anna_x', []],
  ['anna@example.com, x@Anna, a.@Anna, _@Anna, @@Anna', []],
  ['(@Anna) [@Ann]: @Anna-', ['Anna', 'Ann']],
  ['Hi\n@Anna\r\n@Zoë Reviewer!', ['Anna', 'Zoë Reviewer']],
  ['@Anna @Anna', ['Anna']],
  ['@anna is not @Anna', ['Anna']],
  ['@dev.ops, please', ['dev.ops']],
  ['@Zoë', []],
  ['', []],
])('finds the mentions in %j as the server does', (body, expected) => {
  expect([...mentioned(body, labels)]).toEqual(expected);
});

it('sends each picked person once, and only while their whole "@Label" is in the reply', () => {
  const picks = [{ id: 'member:anna', label: 'Anna' }, { id: 'member:smith', label: 'Anna Smith' }, { id: 'end_user:bo', label: 'Bo' }, { id: 'member:anna', label: 'Anna' }];
  expect(mentionIds('@Anna Smith and @Bo', picks)).toEqual(['member:smith', 'end_user:bo']);
  expect(mentionIds('@Anna, @Anna and @Bob', picks)).toEqual(['member:anna']);
  expect(mentionIds('Anna and Bo', picks)).toEqual([]);
});

it('asks for people under the widget API with the query encoded', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ token: 'token' }) })
    .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ people: [{ id: 'member:m', name: 'Anna Smith', team: true }] }) });
  vi.stubGlobal('fetch', fetch);
  const api = new Api({ project: 'pk_test', api: 'https://api.example.test', environment: 'uat' }, { id: 'u', name: 'User' });
  expect(await searchPeople(api, 'a/b', 'Anna S&x')).toEqual({ people: [{ id: 'member:m', name: 'Anna Smith', team: true }] });
  expect(fetch.mock.calls[1][0]).toBe('https://api.example.test/v1/issues/a%2Fb/people?q=Anna%20S%26x');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'GET', credentials: 'omit', headers: { authorization: 'Bearer token', 'x-tuix-widget': '2' } });
  api.destroy();
});

it('renders segments as text and chips, ignores malformed pieces, and falls back to the body', () => {
  const host = document.createElement('div');
  render(<p><CommentText comment={{ body: 'unused', segments: [{ text: 'Hi ' }, { mention: '<b>Bo</b>' }, { mention: 7 } as never, { text: '!' }] }}/></p>, host);
  expect(host.innerHTML).toBe('<p>Hi <span class="mention">@&lt;b&gt;Bo&lt;/b&gt;</span>!</p>');
  render(<p><CommentText comment={{ body: 'Plain <i>text</i>', segments: 'nope' as never }}/></p>, host);
  expect(host.innerHTML).toBe('<p>Plain &lt;i&gt;text&lt;/i&gt;</p>');
  render(null, host);
});
