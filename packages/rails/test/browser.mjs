import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { setTimeout } from 'node:timers/promises';
import { chromium } from 'playwright';

const dist = new URL('../../widget/dist/', import.meta.url);
const built = JSON.parse(readFileSync(new URL('manifest.json', dist)));
const directory = `${built.version}/${createHash('sha256').update(readFileSync(new URL('tuix.js', dist))).digest('hex')}`;
const secret = 'rails-browser-secret-'.repeat(3);
const identities = [], requests = [], violations = [], errors = [], unexpected = [];
let badIntegrity = false;

// Real HTTP and real built widget; only the remote Tuix API is a deterministic fixture.
const api = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  requests.push(path);
  response.setHeader('access-control-allow-origin', '*');
  response.setHeader('access-control-allow-headers', '*');
  response.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
  const json = value => { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(value)); };
  if (request.method === 'OPTIONS') { response.writeHead(204); return response.end(); }
  if (path === '/widget/channels/stable.json') {
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    return json({ protocol: 1, version: built.version, directory, loader: {
      url: `/widget/${directory}/tuix.js`, integrity: badIntegrity ? 'sha384-' + 'A'.repeat(64) : built.integrity
    } });
  }
  if (path.startsWith(`/widget/${directory}/`)) {
    const name = path.slice(`/widget/${directory}/`.length);
    if (/^[\w.-]+\.(js|woff2)$/.test(name)) {
      response.setHeader('content-type', name.endsWith('.woff2') ? 'font/woff2' : 'text/javascript');
      return response.end(readFileSync(new URL(name, dist)));
    }
  }
  if (path === '/v1/identify') {
    let body = '';
    for await (const chunk of request) body += chunk;
    const identity = JSON.parse(body);
    const expected = createHmac('sha256', secret).update(`${identity.id}\n${identity.email}`).digest('hex');
    assert.equal(identity.hash, expected, 'Rails signature must match the backend identity protocol');
    identities.push(identity.id);
    return json({ token: `test-${identity.id}` });
  }
  if (path === '/v1/config') return json({ enabled: true, telemetry: false,
    capture: { screenshot: false, console: false, network: false } });
  if (path === '/v1/me/summary') return json({ to_verify: 0, assigned_active: 0 });
  if (path === '/v1/issues') return json({ issues: [], next_before: null });
  if (path === '/v1/notifications') return json({ notifications: [] });
  if (path === '/v1/preferences') return json({ email_available: false, notify_email: false });
  unexpected.push(path);
  response.writeHead(404); response.end();
});
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
const server = spawn(process.env.BUNDLE_BIN ?? 'bundle', ['exec', 'ruby', 'test/browser_host.rb'], {
  cwd: new URL('../', import.meta.url), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, RAILS_ENV: 'test', TUIX_API_URL: apiOrigin,
    TUIX_PROJECT_KEY: 'rails-fixture', TUIX_SECRET_KEY: secret, TUIX_ENVIRONMENT: 'uat' }
});
let output = '', serverError;
server.stdout.on('data', chunk => output += chunk);
server.stderr.on('data', chunk => output += chunk);
server.on('error', error => { serverError = error; });
const eventually = async predicate => {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (serverError || server.exitCode !== null) throw new Error(output || String(serverError));
    if (await predicate()) return;
    await setTimeout(100);
  }
  throw new Error('Timed out waiting for Rails browser fixture: ' + output);
};
let browser;
try {
  await eventually(() => /TUIX_RAILS_HOST=(http:\/\/127.0.0.1:\d+)/.test(output));
  const origin = output.match(/TUIX_RAILS_HOST=(http:\/\/127.0.0.1:\d+)/)[1];
  browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  await page.routeWebSocket('**/widget/socket/**', socket => socket.close());
  await page.addInitScript(() => {
    window.violations = [];
    document.addEventListener('securitypolicyviolation', event => window.violations.push(event.violatedDirective));
  });
  await page.goto(origin + '/signed-out');
  await page.waitForFunction(() => !!window.Turbo);
  await page.waitForTimeout(100);
  assert.equal(requests.length, 0, 'Anonymous Rails pages must not load the runtime');
  await page.evaluate(() => { window.documentSentinel = 'same-document'; });

  const identified = async id => {
    await page.waitForFunction(id => {
      const value = document.getElementById('tuix-rails')?.dataset.tuixRails;
      return value && JSON.parse(value).user.id === id && !!document.querySelector('tuix-widget');
    }, id);
    await page.evaluate(() => window.tuix('open'));
    await eventually(() => identities.at(-1) === id);
    assert.equal(await page.locator('tuix-widget').count(), 1);
    assert.equal(await page.evaluate(() => window.documentSentinel), 'same-document', 'Turbo must keep the document');
  };
  await page.click('#alice');
  await identified('alice');
  const loader = page.locator(`script[src="${apiOrigin}/widget/${directory}/tuix.js"]`);
  assert.equal(await loader.getAttribute('integrity'), built.integrity);
  assert.equal(await loader.evaluate(script => script.nonce), 'rails-browser-fixture');

  await page.click('#frame-bob');
  await identified('bob');
  await page.evaluate(async origin => {
    const html = await (await fetch(origin + '/alice')).text();
    const identity = new DOMParser().parseFromString(html, 'text/html').getElementById('tuix-rails');
    window.Turbo.renderStreamMessage(`<turbo-stream action="replace" target="tuix-rails"><template>${identity.outerHTML}</template></turbo-stream>`);
  }, origin);
  await identified('alice');
  await page.click('#bob');
  await identified('bob');
  assert.equal(requests.filter(path => path === '/widget/channels/stable.json').length, 1);

  await page.click('#logout');
  await page.waitForURL(origin + '/signed-out');
  await page.waitForFunction(() => !document.querySelector('tuix-widget'));
  assert.equal(await page.locator('#tuix-rails').getAttribute('data-tuix-rails'), null);
  await page.goBack();
  await identified('bob');
  violations.push(...await page.evaluate(() => window.violations));
  assert.deepEqual(violations, [], 'Integration must work under the fixture CSP');
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);

  // A fresh document cannot execute a runtime whose bytes fail SRI verification.
  badIntegrity = true;
  const rejected = await browser.newPage();
  const badScript = rejected.waitForResponse(`${apiOrigin}/widget/${directory}/tuix.js`);
  await rejected.goto(origin + '/alice');
  await badScript;
  await rejected.waitForFunction(() => !!window.Turbo);
  await rejected.waitForFunction(() => !document.querySelector('script[src*="/widget/"]'));
  assert.equal(await rejected.locator('tuix-widget').count(), 0);
  assert.equal(await rejected.evaluate(() => typeof window.tuix), 'undefined');
  await rejected.click('#logout');
  await rejected.waitForURL(origin + '/signed-out');
  console.log('Rails browser smoke passed: actual Turbo Drive/frame/stream navigation, signed widget identity, logout, back navigation, CSP and SRI rejection. Tuix API responses were local fixtures.');
} finally {
  await browser?.close();
  server.kill('SIGTERM');
  await new Promise(resolve => api.close(resolve));
}
