import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'output/releases/js');
const packages = JSON.parse(readFileSync(join(output, 'manifest.json'), 'utf8')).artifacts;
const directory = mkdtempSync(join(output, '.next-smoke-'));
const next = join(root, 'node_modules/next/dist/bin/next');
const secret = 'nextjs-local-test-secret-'.repeat(3);
const identities = [], unexpected = [];
let server, browser;
const api = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  const json = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  if (path === '/v1/identify') {
    let body = ''; for await (const chunk of request) body += chunk;
    const identity = JSON.parse(body);
    assert.equal(identity.hash, createHmac('sha256', secret).update(`${identity.id}\n${identity.email}`).digest('hex'));
    identities.push(identity.id);
    return json({ token: `fixture-${identity.id}` });
  }
  if (path === '/v1/config') return json({ enabled: true, telemetry: false, capture: { screenshot: false, console: false, network: false } });
  if (path === '/v1/me/summary') return json({ to_verify: 0, assigned_active: 0 });
  if (path === '/v1/issues') return json({ issues: [], next_before: null });
  if (path === '/v1/notifications') return json({ notifications: [] });
  if (path === '/v1/preferences') return json({ email_available: true, notify_email: false });
  unexpected.push(path); response.writeHead(404); response.end();
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const environment = { ...process.env, NEXT_TELEMETRY_DISABLED: '1', TUIX_PROJECT_KEY: 'next-fixture',
  TUIX_SECRET_KEY: secret, TUIX_API_URL: `http://127.0.0.1:${api.address().port}`, TUIX_ENVIRONMENT: 'uat' };

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [next, ...args], { cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; child.stdout.on('data', chunk => log += chunk); child.stderr.on('data', chunk => log += chunk);
    child.once('error', reject);
    child.once('close', code => resolve({ code, log }));
  });
}
function files(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(join(path, item.name)) : [join(path, item.name)]);
}
try {
  for (const name of ['app', 'lib', 'package.json', 'tsconfig.json', 'next.config.mjs']) {
    cpSync(join(root, 'examples/nextjs', name), join(directory, name), { recursive: true });
  }
  for (const artifact of packages) {
    const destination = join(directory, 'node_modules', artifact.name);
    mkdirSync(destination, { recursive: true });
    execFileSync('tar', ['-xzf', join(output, artifact.file), '--strip-components=1', '-C', destination]);
  }
  // These fictional session fixtures exist only in the disposable copy. The
  // checked-in example continues to deny identity until connected to real auth.
  writeFileSync(join(directory, 'lib/auth.ts'), `import 'server-only';
    import { cookies } from 'next/headers';
    export async function getCurrentUser() {
      const id = (await cookies()).get('fixture-user')?.value ?? 'alice';
      return ['alice', 'bob'].includes(id) ? { id, name: id, email: id + '@example.test', emailVerified: true } : null;
    }`);
  writeFileSync(join(directory, 'app/actions.ts'), `'use server';
    import { cookies } from 'next/headers'; import { redirect } from 'next/navigation';
    export async function switchUser(data: FormData) {
      const user = String(data.get('user'));
      if (!['alice', 'bob', 'signed-out'].includes(user)) throw Error('Invalid fixture user');
      (await cookies()).set('fixture-user', user, { httpOnly: true, sameSite: 'strict', path: '/' });
      redirect('/');
    }`);
  const pagePath = join(directory, 'app/page.tsx');
  writeFileSync(pagePath, "import { switchUser } from './actions';\n" + readFileSync(pagePath, 'utf8').replace('<h1>',
    '<form action={switchUser}><button id="bob" name="user" value="bob">Bob</button><button id="logout" name="user" value="signed-out">Sign out</button></form><h1>'));
  console.log('Building the Next.js fixture with packed Tuix packages…');
  const built = await run(['build', '--webpack']);
  assert.equal(built.code, 0, built.log);
  for (const path of files(join(directory, '.next/static'))) {
    const content = readFileSync(path, 'utf8');
    assert(!content.includes(secret), 'Server secret leaked into a client asset');
    if (path.endsWith('.js')) assert(!content.includes('node:crypto'), 'Signing implementation reached a client chunk');
  }

  server = spawn(process.execPath, [next, 'start', '--hostname', '127.0.0.1', '--port', '0'], {
    cwd: directory, env: environment, stdio: ['ignore', 'pipe', 'pipe']
  });
  let log = '', startError;
  server.stdout.on('data', chunk => log += chunk); server.stderr.on('data', chunk => log += chunk);
  server.on('error', error => { startError = error; });
  const eventually = async predicate => {
    for (let attempt = 0; attempt < 200; attempt++) {
      if (startError || server.exitCode !== null) throw Error(log || String(startError));
      if (await predicate()) return;
      await setTimeout(100);
    }
    throw Error('Timed out waiting for Next.js fixture: ' + log);
  };
  await eventually(() => /http:\/\/127.0.0.1:\d+/.test(log));
  const origin = log.match(/http:\/\/127.0.0.1:\d+/)[0];
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [], leaks = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.url().includes(secret) || request.postData()?.includes(secret)) leaks.push(request.url()); });
  await page.routeWebSocket('**/widget/socket/**', socket => socket.close());
  await page.addInitScript(() => {
    const attach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const shadow = attach.call(this, options);
      if (this.localName === 'tuix-widget') window.__tuixRoot = shadow;
      return shadow;
    };
  });
  const response = await page.goto(origin);
  assert(!(await response.text()).includes(secret), 'Secret leaked into HTML or initial RSC payload');
  await page.waitForFunction(() => !!document.querySelector('tuix-widget'));
  await page.evaluate(() => { window.documentSentinel = true; });
  const activate = async id => {
    await page.waitForFunction(() => !!window.__tuixRoot?.querySelector('#tuix-launcher'));
    await page.evaluate(() => window.__tuixRoot.querySelector('#tuix-launcher').click());
    await eventually(() => identities.at(-1) === id);
    await page.evaluate(() => window.__tuixRoot.querySelector('#tuix-launcher').click());
  };
  await activate('alice');
  await page.evaluate(() => { window.previousWidget = document.querySelector('tuix-widget'); });
  // The Server Action's body is read while it passes through: once the page has moved on,
  // Chromium may already have dropped it ("No data found for resource").
  let actionBody;
  await page.route(origin + '/', async route => {
    if (route.request().method() !== 'POST') return route.fallback();
    const response = await route.fetch();
    actionBody = await response.text();
    await route.fulfill({ response });
  });
  await page.click('#bob');
  await eventually(() => actionBody !== undefined);
  await page.unroute(origin + '/');
  assert(actionBody, 'The Server Action answered with an empty body');
  assert(!actionBody.includes(secret), 'Secret leaked into a Server Action response');
  await page.waitForFunction(() => document.querySelector('tuix-widget') && document.querySelector('tuix-widget') !== window.previousWidget);
  await activate('bob');
  assert.equal(await page.evaluate(() => window.documentSentinel), true, 'Server Action navigation should retain the client document');
  await page.click('#logout');
  await page.waitForFunction(() => !document.querySelector('tuix-widget'));
  const count = identities.length;
  await page.reload();
  await page.waitForLoadState('networkidle');
  assert.equal(await page.locator('tuix-widget').count(), 0);
  assert.equal(identities.length, count);
  assert.deepEqual(errors, []);
  assert.deepEqual(leaks, []);
  assert.deepEqual(unexpected, []);
  await browser.close(); browser = undefined;
  server.kill('SIGTERM'); await new Promise(resolve => server.once('close', resolve)); server = undefined;

  // A client import must be rejected by Next, not merely documented as forbidden.
  writeFileSync(join(directory, 'app/leak.tsx'), `'use client';
    import { signIdentity } from '@tuix/server/next';
    export default function Leak() { return <p>{typeof signIdentity}</p>; }`);
  writeFileSync(pagePath, "import Leak from './leak';\n" + readFileSync(pagePath, 'utf8').replace('<main>', '<main><Leak />'));
  const rejected = await run(['build', '--webpack']);
  assert.notEqual(rejected.code, 0, 'Next.js accepted a signer import in a Client Component');
  assert.match(rejected.log, /server-only|Server Component/);
  console.log('Next.js smoke passed: packed dependencies, real widget, signed identity switch, logout, SSR/client secret isolation and rejected client signer import. Authentication and Tuix API were local fixtures.');
} finally {
  await browser?.close();
  server?.kill('SIGTERM');
  await new Promise(resolve => api.close(resolve));
  rmSync(directory, { recursive: true, force: true });
}
