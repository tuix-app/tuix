import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
// esbuild is the widget's build dependency. Load it from there: the root's copy is only another
// package's optional peer, which npm 11 does not install.
const { build } = createRequire(join(root, 'packages/widget/package.json'))('esbuild');
const output = join(root, 'output/releases/js');
mkdirSync(output, { recursive: true });
const stage = mkdtempSync(join(output, '.prepare-'));
try {
  const artifacts = [];
  const consumer = join(stage, 'consumer');
  mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  // What each package may contain besides package.json, README.md and LICENSE.
  const content = { widget: /^(THIRD_PARTY_NOTICES\.md|dist\/.*)$/, server: /^dist\/.*$/, react: /^dist\/.*$/, mcp: /^src\/[\w-]+\.mjs$/ };
  for (const name of Object.keys(content)) {
    const [packed] = JSON.parse(execFileSync('npm', ['pack', `-w`, `@tuix/${name}`, '--ignore-scripts', '--json', '--pack-destination', stage], {
      cwd: root, encoding: 'utf8', env: { ...process.env, NPM_CONFIG_CACHE: join(stage, 'npm-cache') }
    }));
    assert(packed.files.every(file => /^(package\.json|README\.md|LICENSE)$/.test(file.path) || content[name].test(file.path)), `Unexpected content in @tuix/${name}`);
    const directory = join(consumer, 'node_modules/@tuix', name);
    mkdirSync(directory, { recursive: true });
    execFileSync('tar', ['-xzf', join(stage, packed.filename), '--strip-components=1', '-C', directory]);
    artifacts.push({ name: packed.name, version: packed.version, file: packed.filename,
      sha256: createHash('sha256').update(readFileSync(join(stage, packed.filename))).digest('hex') });
  }
  assert(/^['"]use client['"];/.test(readFileSync(join(consumer, 'node_modules/@tuix/react/dist/index.js'), 'utf8')));
  execFileSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import { Tuix } from '@tuix/react';
    import { signIdentity } from '@tuix/server';
    const user = signIdentity({id: 42, name: 'Ada'}, {secret: 'fixture-secret-'.repeat(4)});
    assert.equal(user.id, '42');
    assert.match(user.hash, /^[a-f0-9]{64}$/);
    assert.equal(renderToString(createElement(Tuix, {config: {project: 'test'}, user})), '');
  `], { cwd: consumer, stdio: 'inherit' });
  // npx @tuix/mcp runs the package's one bin: a Node script that, without its two
  // environment variables, refuses to start with a generic message.
  const mcp = JSON.parse(readFileSync(join(consumer, 'node_modules/@tuix/mcp/package.json'), 'utf8'));
  assert.deepEqual(Object.keys(mcp.bin), ['tuix-mcp']);
  const bin = join(consumer, 'node_modules/@tuix/mcp', mcp.bin['tuix-mcp']);
  // Its dependencies, linked from where npm installed them for the workspace.
  const workspace = createRequire(join(root, 'packages/mcp/package.json'));
  for (const dependency of Object.keys(mcp.dependencies)) {
    const target = join(consumer, 'node_modules', dependency);
    mkdirSync(dirname(target), { recursive: true });
    symlinkSync(dirname(workspace.resolve(`${dependency}/package.json`)), target, 'dir');
  }
  assert(readFileSync(bin, 'utf8').startsWith('#!/usr/bin/env node\n'), 'The MCP bin needs a Node shebang');
  const started = spawnSync(process.execPath, [bin], { cwd: consumer, encoding: 'utf8',
    env: { PATH: process.env.PATH, TUIX_API_URL: '', TUIX_MCP_TOKEN: '' } });
  assert.equal(started.status, 1);
  assert.match(started.stderr, /Tuix MCP could not start/);
  await assert.rejects(build({ absWorkingDir: consumer, stdin: {
    contents: "import { signIdentity } from '@tuix/server'; console.log(signIdentity);", resolveDir: consumer
  }, bundle: true, platform: 'browser', write: false, logLevel: 'silent' }), /Could not resolve "@tuix\/server"/);
  for (const artifact of artifacts) renameSync(join(stage, artifact.file), join(output, artifact.file));
  writeFileSync(join(output, 'manifest.json'), JSON.stringify({ published: false,
    checked: ['packed Node signing', 'packed React SSR', 'use client preservation', 'Node-only browser resolution', 'packed MCP command'], artifacts }, null, 2) + '\n');
  console.log(`Verified local npm tarballs: ${output}`);
} finally { rmSync(stage, { recursive: true, force: true }); }
