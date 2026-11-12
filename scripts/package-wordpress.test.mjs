import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const script = new URL('./package-wordpress.py', import.meta.url).pathname;
const header = await readFile(new URL('../apps/wordpress/tuix-feedback/tuix-feedback.php', import.meta.url), 'utf8');

test('package-wordpress writes release.json for the plugin updater next to the zip', async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'tuix-wordpress-'));
  try {
    const run = spawnSync('python3', ['-I', script, path.join(out, 'tuix-feedback.zip')], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const version = header.match(/^ \* Version:\s+(\S+)$/m)[1];
    assert.equal((await readFile(path.join(out, 'version'), 'utf8')).trim(), version);
    const release = JSON.parse(await readFile(path.join(out, 'release.json'), 'utf8'));
    assert.equal(release.version, version);
    assert.match(release.requires, /^\d+\.\d+(\.\d+)?$/);
    assert.match(release.tested, /^\d+\.\d+(\.\d+)?$/);
    assert.match(release.requires_php, /^\d+\.\d+$/);
    assert.ok(release.changelog.length > 0, 'the current version has changelog lines in readme.txt');
    assert.ok(release.changelog.every(line => typeof line === 'string' && !line.startsWith('*')));
    assert.match(header, /^ \* Update URI:\s+https:\/\/tuix\.app\/downloads\/tuix-feedback\.json$/m);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
