import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = new URL('./validate-release.mjs', import.meta.url);
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const versions = {
  widget: JSON.parse(await read('packages/widget/package.json')).version,
  react: JSON.parse(await read('packages/react/package.json')).version,
  server: JSON.parse(await read('packages/server/package.json')).version,
  mcp: JSON.parse(await read('packages/mcp/package.json')).version,
  phoenix: (await read('packages/phoenix/mix.exs')).match(/version: "([^"]+)"/)[1],
  rails: (await read('packages/rails/lib/tuix_rails/version.rb')).match(/VERSION = "([^"]+)"/)[1],
  wordpress: (await read('apps/wordpress/tuix-feedback/tuix-feedback.php')).match(/ \* Version:\s+(\S+)/)[1],
};
const placeholder = /^Contributors:.*PLACEHOLDER/m.test(await read('apps/wordpress/tuix-feedback/readme.txt'));

async function check(name, overrides = {}, privateRepo = true) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tuix-release-'));
  try {
    const event = path.join(dir, 'event.json');
    await writeFile(event, JSON.stringify({ repository: { private: privateRepo } }));
    const actors = path.join(dir, 'release-actors');
    await writeFile(actors, '# Who may publish\nOwner-Login\n\nsecond-login # a comment\n');
    return spawnSync(process.execPath, [script.pathname], { encoding: 'utf8', env: {
      RELEASE_PACKAGE: name, RELEASE_VERSION: versions[name], GITHUB_REF: 'refs/heads/main',
      GITHUB_REPOSITORY: 'tuix-app/tuix', GITHUB_EVENT_PATH: event, PUBLISH: 'false',
      RELEASE_ACTORS_FILE: actors, RELEASE_ACTOR: 'owner-login', RELEASE_TRIGGERING_ACTOR: 'second-login', ...overrides,
    } });
  } finally { await rm(dir, { recursive: true }); }
}

for (const name of Object.keys(versions)) {
  test(`${name}: a private repository can prepare a release but not publish it`, async () => {
    assert.equal((await check(name)).status, 0);
    const rejected = await check(name, { PUBLISH: 'true' });
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /public source repository/);
  });

  test(`${name}: publishing needs the matching version, main and the repository the metadata names`, async () => {
    if (name !== 'wordpress' || !placeholder) assert.equal((await check(name, { PUBLISH: 'true' }, false)).status, 0);
    for (const override of [
      { RELEASE_VERSION: '999.999.999' }, { RELEASE_VERSION: '' }, { GITHUB_REF: 'refs/heads/feature' },
      { GITHUB_REPOSITORY: 'other/tuix' }, { PUBLISH: 'yes' }, { RELEASE_PACKAGE: 'shopify' },
    ]) assert.notEqual((await check(name, override, false)).status, 0, JSON.stringify(override));
  });
}

test('a preparation run in the private repository names the public one', async () => {
  const prepared = await check('widget', { GITHUB_REPOSITORY: 'private/source', RELEASE_REPOSITORY: 'tuix-app/tuix' });
  assert.equal(prepared.status, 0);
  const published = await check('widget', { GITHUB_REPOSITORY: 'private/source', RELEASE_REPOSITORY: 'tuix-app/tuix', PUBLISH: 'true' }, false);
  assert.notEqual(published.status, 0);
  assert.match(published.stderr, /only from the public source repository/);
});

test('only the logins in .github/release-actors may publish', async () => {
  assert.equal((await check('widget', { PUBLISH: 'true' }, false)).status, 0);
  for (const override of [{ RELEASE_ACTOR: 'someone-else' }, { RELEASE_TRIGGERING_ACTOR: 'someone-else' },
    { RELEASE_ACTOR: '' }, { RELEASE_ACTORS_FILE: '/nonexistent/release-actors' }]) {
    const rejected = await check('widget', { PUBLISH: 'true', ...override }, false);
    assert.notEqual(rejected.status, 0, JSON.stringify(override));
    assert.match(rejected.stderr, /may not publish/);
  }
  // A preparation run publishes nothing, so it needs no release actor.
  assert.equal((await check('widget', { RELEASE_ACTOR: 'someone-else' })).status, 0);
});

test('the release actors file of the public repository names its owner', async () => {
  const text = await read('public-repo/.github/release-actors').catch(() => read('.github/release-actors'));
  assert.ok(text.split('\n').some(line => line.trim() && !line.startsWith('#')), 'no login in release-actors');
});

test('the WordPress plugin is not published with the Contributors placeholder', { skip: !placeholder }, async () => {
  const rejected = await check('wordpress', { PUBLISH: 'true' }, false);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Contributors placeholder/);
});
