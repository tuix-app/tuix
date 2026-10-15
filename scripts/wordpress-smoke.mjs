// Real WordPress + MariaDB (Docker) with the Tuix plugin, a fake Tuix API that serves the
// built widget and checks HMAC identities, and Playwright signing in as different roles.
import { spawnSync } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { chromium } from 'playwright';

const WP_PORT = 8089, DB_PORT = 3307, API_PORT = 4390;
// Keep in step with "Tested up to" in apps/wordpress/tuix-feedback/readme.txt and scripts/wordpress-plugin-check.sh.
const wordpressImage = process.env.WORDPRESS_IMAGE || 'wordpress:7.1-php8.3-apache';
// Host networking: 127.0.0.1 avoids ::1-first resolution of localhost inside containers.
const site = `http://localhost:${WP_PORT}`, api = `http://127.0.0.1:${API_PORT}`;
const project = 'pk_live_wordpressSmokeProject', secret = 'wordpress-smoke-signing-key-0123456789';
// Tuix identify: v1 signs the ID; with an email, v2 signs the ID, a newline and the
// trimmed, lowercased email.
const sign = (id, email) => createHmac('sha256', secret).update(email ? `${id}\n${email.trim().toLowerCase()}` : id).digest('hex');
const plugin = resolve('apps/wordpress/tuix-feedback'), dist = resolve('packages/widget/dist');
const evidence = 'output/playwright/wordpress';
const names = { db: 'tuix-wp-smoke-db', wp: 'tuix-wp-smoke' };
mkdirSync(evidence, { recursive: true });
const check = (condition, message) => { if (!condition) throw new Error(message); };
const run = (args, options = {}) => {
  const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 180_000, ...options });
  if (result.status !== 0 && !options.allowFail) throw new Error(`docker ${args.slice(0, 3).join(' ')} failed:\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
};
const wpArgs = args => ['run', '--rm', '--network', 'host', '--user', '33:33', '-v', 'tuix-wp-smoke-html:/var/www/html',
  '-v', `${plugin}:/var/www/html/wp-content/plugins/tuix-feedback:ro`,
  '-e', `WORDPRESS_DB_HOST=127.0.0.1:${DB_PORT}`, '-e', 'WORDPRESS_DB_USER=wp', '-e', 'WORDPRESS_DB_PASSWORD=wp', '-e', 'WORDPRESS_DB_NAME=wp',
  'wordpress:cli-php8.3', 'wp', ...args];
const wp = (...args) => run(wpArgs(args));
// An option's value, or null when the site has no such option.
const option = (name, ...args) => {
  const result = spawnSync('docker', wpArgs(['option', 'get', name, ...args]), { encoding: 'utf8', timeout: 180_000 });
  return result.status === 0 ? result.stdout.trim() : null;
};
const autoloaded = (name, ...args) => !/\b(off|no)\b/.test(wp('option', 'list', `--search=${name}`, '--fields=autoload', '--format=csv', ...args));
const cleanup = () => {
  run(['rm', '-f', names.db, names.wp], { allowFail: true });
  run(['volume', 'rm', '-f', 'tuix-wp-smoke-html'], { allowFail: true });
};

check(existsSync(join(dist, 'tuix.js')), 'Build the widget first: npm run build -w @tuix/widget');
const directory = '0.1.2/' + 'a'.repeat(64);
const loader = readFileSync(join(dist, 'tuix.js'));
const integrity = 'sha384-' + createHash('sha384').update(loader).digest('base64');
const identities = [];
const api_server = createServer((request, response) => {
  const url = new URL(request.url, api);
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
  if (url.pathname === '/widget/channels/stable.json') {
    response.writeHead(200, { ...cors, 'content-type': 'application/json' });
    return response.end(JSON.stringify({ protocol: 1, version: '0.1.2', directory, loader: { url: `/widget/${directory}/tuix.js`, integrity } }));
  }
  if (url.pathname.startsWith(`/widget/${directory}/`)) {
    const file = join(dist, url.pathname.slice(`/widget/${directory}/`.length));
    if (!file.startsWith(dist) || !existsSync(file)) { response.writeHead(404, cors); return response.end(); }
    const types = { '.js': 'text/javascript', '.woff2': 'font/woff2', '.css': 'text/css', '.json': 'application/json' };
    response.writeHead(200, { ...cors, 'content-type': types[extname(file)] ?? 'application/octet-stream' });
    return response.end(readFileSync(file));
  }
  if (url.pathname === '/v1/identify' && request.method === 'POST') {
    let body = '';
    request.on('data', chunk => body += chunk);
    return request.on('end', () => {
      const identity = JSON.parse(body);
      identities.push({ identity, origin: request.headers.origin, project: request.headers['x-tuix-project'], environment: request.headers['x-tuix-environment'] });
      const expected = sign(identity.id, identity.email);
      const status = request.headers['x-tuix-project'] !== project || request.headers.origin !== site ? 403 : identity.hash !== expected ? 401 : 200;
      response.writeHead(status, { ...cors, 'content-type': 'application/json' });
      response.end(JSON.stringify(status === 200 ? { token: 'smoke' } : { error: 'nope' }));
    });
  }
  response.writeHead(404, cors); response.end();
});
await new Promise(ready => api_server.listen(API_PORT, '127.0.0.1', ready));

let stage = 'setup', browser;
try {
  cleanup();
  // Pull outside the start timeouts; cold runners download the images first.
  for (const image of ['mariadb:11', wordpressImage, 'wordpress:cli-php8.3']) run(['pull', '-q', image], { timeout: 600_000 });
  run(['run', '-d', '--name', names.db, '--network', 'host', '-e', 'MARIADB_ROOT_PASSWORD=root', '-e', 'MARIADB_DATABASE=wp',
    '-e', 'MARIADB_USER=wp', '-e', 'MARIADB_PASSWORD=wp', 'mariadb:11', `--port=${DB_PORT}`, '--bind-address=127.0.0.1']);
  run(['run', '-d', '--name', names.wp, '--network', 'host', '-v', 'tuix-wp-smoke-html:/var/www/html',
    '-v', `${plugin}:/var/www/html/wp-content/plugins/tuix-feedback:ro`,
    '-e', `WORDPRESS_DB_HOST=127.0.0.1:${DB_PORT}`, '-e', 'WORDPRESS_DB_USER=wp', '-e', 'WORDPRESS_DB_PASSWORD=wp', '-e', 'WORDPRESS_DB_NAME=wp',
    '--entrypoint', 'bash', wordpressImage, '-c',
    `sed -i 's/^Listen 80$/Listen ${WP_PORT}/' /etc/apache2/ports.conf && sed -i 's/:80>/:${WP_PORT}>/' /etc/apache2/sites-enabled/000-default.conf && exec docker-entrypoint.sh apache2-foreground`]);
  stage = 'install WordPress';
  for (let attempt = 0; ; attempt++) {
    try { if ((await fetch(site + '/wp-admin/install.php')).status < 500) break; } catch {}
    if (attempt > 120) throw new Error('WordPress did not start');
    await new Promise(r => setTimeout(r, 1000));
  }
  for (let attempt = 0; ; attempt++) {
    const result = spawnSync('docker', ['exec', names.db, 'mariadb-admin', `--port=${DB_PORT}`, '-h127.0.0.1', '-uwp', '-pwp', 'ping'], { encoding: 'utf8' });
    if (result.status === 0) break;
    if (attempt > 60) throw new Error('MariaDB did not start');
    await new Promise(r => setTimeout(r, 1000));
  }
  wp('core', 'install', `--url=${site}`, '--title=Tuix smoke', '--admin_user=admin', '--admin_password=admin-pass', '--admin_email=admin@example.test', '--skip-email');
  wp('plugin', 'activate', 'tuix-feedback');
  const editorId = wp('user', 'create', 'editor', 'editor@example.test', '--role=editor', '--user_pass=editor-pass', '--display_name=Eddie Editor', '--porcelain');
  wp('user', 'create', 'reader', 'reader@example.test', '--role=subscriber', '--user_pass=reader-pass', '--porcelain');

  browser = await chromium.launch();
  const login = async (user, pass) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(site + '/wp-login.php');
    await page.fill('#user_login', user); await page.fill('#user_pass', pass);
    await Promise.all([page.waitForNavigation(), page.click('#wp-submit')]);
    return page;
  };

  stage = 'unconfigured plugin stays off and asks for setup';
  const admin = await login('admin', 'admin-pass');
  await admin.goto(site + '/wp-admin/plugins.php');
  check(await admin.locator('.notice-warning', { hasText: 'not connected yet' }).count() === 1, 'Missing setup notice');
  await admin.goto(site + '/');
  check(await admin.locator('#tuix-init').count() === 0, 'Unconfigured plugin printed the widget');

  stage = 'settings validation';
  await admin.goto(site + '/wp-admin/options-general.php?page=tuix');
  await admin.fill('#tuix-api-url', 'http://evil.example');
  await admin.fill('#tuix-project-key', 'not-a-key');
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-settings #submit')]);
  // Each problem is reported exactly once, even on the first save.
  check(await admin.locator('.notice-error, .error', { hasText: 'HTTPS origin' }).count() === 1, 'Address error missing or repeated');
  check(await admin.locator('.notice-error, .error', { hasText: 'starts with pk_' }).count() === 1, 'Key error missing or repeated');
  check(await admin.inputValue('#tuix-environment') === 'local', 'A localhost site should default to the local environment');

  stage = 'configure through the settings screen';
  await admin.fill('#tuix-api-url', api);
  await admin.fill('#tuix-project-key', project);
  await admin.fill('#tuix-secret', 'wrong-signing-key-000000000000');
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-settings #submit')]);
  check(await admin.inputValue('#tuix-secret') === '', 'Signing key echoed back into the form');
  check(!(await admin.content()).includes('wrong-signing-key'), 'Signing key rendered in admin HTML');

  stage = 'connection check reports a wrong key, then succeeds';
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-check #submit')]);
  check((await admin.textContent('#tuix-check-result')).includes('rejected the signature'), 'Wrong key not reported: ' + await admin.textContent('#tuix-check-result'));
  await admin.fill('#tuix-secret', secret);
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-settings #submit')]);
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-check #submit')]);
  check((await admin.textContent('#tuix-check-result')).includes('Connected. Widget 0.1.2'), 'Connection check failed: ' + await admin.textContent('#tuix-check-result'));
  const checked = identities.at(-1);
  check(checked.origin === site && checked.project === project && checked.environment === 'local', 'Check used the wrong origin, project or environment');
  await admin.screenshot({ path: `${evidence}/settings.png`, fullPage: true });

  stage = 'editor gets a signed widget that loads with SRI';
  const editor = await login('editor', 'editor-pass');
  await editor.goto(site + '/');
  const html = await editor.content();
  check(!html.includes(secret), 'Signing key leaked into the page');
  const init = await editor.textContent('#tuix-init');
  const identify = JSON.parse(init.match(/tuix\("identify",(\{.*?\})\);/)[1]);
  check(identify.id === editorId && identify.name === 'Eddie Editor' && identify.email === 'editor@example.test', 'Wrong identity: ' + JSON.stringify(identify));
  // The email is sent, so the hash signs the ID and the normalised email (identify v2).
  check(identify.hash === sign(editorId, 'editor@example.test'), 'Identity hash is not the v2 HMAC of the user ID and email');
  check(identify.hash !== createHmac('sha256', secret).update(editorId).digest('hex'), 'Identity hash signs only the user ID');
  check(await editor.getAttribute('#tuix-loader', 'integrity') === integrity, 'Loader is not pinned with SRI');
  await editor.waitForFunction(() => document.querySelector('tuix-widget') !== null, null, { timeout: 15_000 });
  check(await editor.evaluate(() => window.tuix?.loaded === true), 'Widget loader did not run');
  await editor.screenshot({ path: `${evidence}/editor-front.png` });

  stage = 'long multibyte names stay within the 200-byte limit and still sign';
  const long = 'Żółć'.repeat(60);
  wp('user', 'update', editorId, `--display_name=${long}`);
  await editor.goto(site + '/');
  const longIdentity = JSON.parse((await editor.textContent('#tuix-init')).match(/tuix\("identify",(\{.*?\})\);/)[1]);
  check(Buffer.byteLength(longIdentity.name) <= 200 && longIdentity.name.startsWith('Żółć') && !longIdentity.name.includes('\ufffd'), 'Name not cut safely: ' + Buffer.byteLength(longIdentity.name));
  check(longIdentity.hash === sign(editorId, 'editor@example.test'), 'Long name changed the signature');

  stage = 'visitors and other roles get nothing';
  const reader = await login('reader', 'reader-pass');
  await reader.goto(site + '/');
  check(await reader.locator('#tuix-init, #tuix-loader').count() === 0, 'Subscriber got the widget');
  const anonymous = await (await browser.newContext()).newPage();
  await anonymous.goto(site + '/');
  check(await anonymous.locator('#tuix-init, #tuix-loader').count() === 0, 'Visitor got the widget');

  stage = 'only people who work in wp-admin can ever comment';
  await admin.goto(site + '/wp-admin/options-general.php?page=tuix');
  const offered = await admin.$$eval('#tuix-roles input', inputs => inputs.map(input => input.value));
  check(offered.includes('administrator') && offered.includes('editor') && offered.includes('contributor'), 'wp-admin roles missing: ' + offered);
  check(!offered.includes('subscriber'), 'Subscriber offered as a commenting role');
  // Even a stored subscriber role and a filter forcing access cannot reach front-end accounts.
  const stored = JSON.parse(wp('option', 'get', 'tuix_feedback_settings', '--format=json'));
  wp('option', 'update', 'tuix_feedback_settings', JSON.stringify({ ...stored, roles: [...stored.roles, 'subscriber'] }), '--format=json');
  run(['exec', '--user', '33:33', names.wp, 'sh', '-c', `mkdir -p /var/www/html/wp-content/mu-plugins && printf '%s' "<?php add_filter( 'tuix_should_load', '__return_true' );" > /var/www/html/wp-content/mu-plugins/tuix-force.php`]);
  await reader.goto(site + '/');
  check(await reader.locator('#tuix-init, #tuix-loader').count() === 0, 'A subscriber got the widget through settings or a filter');
  await editor.goto(site + '/');
  check(await editor.locator('#tuix-init').count() === 1, 'Editor lost the widget');
  run(['exec', names.wp, 'rm', '-f', '/var/www/html/wp-content/mu-plugins/tuix-force.php']);
  wp('option', 'update', 'tuix_feedback_settings', JSON.stringify(stored), '--format=json');

  stage = 'admin screens are opt-in';
  await editor.goto(site + '/wp-admin/');
  check(await editor.locator('#tuix-init').count() === 0, 'Widget shown in wp-admin without opting in');
  await admin.goto(site + '/wp-admin/options-general.php?page=tuix');
  await admin.check('#tuix-admin');
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-settings #submit')]);
  await editor.goto(site + '/wp-admin/');
  check(await editor.locator('#tuix-init').count() === 1, 'Widget missing in wp-admin after opting in');

  stage = 'values pinned in wp-config.php survive a settings save';
  wp('config', 'set', 'TUIX_PROJECT_KEY', project, '--type=constant');
  wp('config', 'set', 'TUIX_API_URL', api, '--type=constant');
  await new Promise(r => setTimeout(r, 3000)); // opcache revalidates wp-config.php every 2 s
  await admin.goto(site + '/wp-admin/options-general.php?page=tuix');
  check(await admin.isDisabled('#tuix-project-key') && await admin.isDisabled('#tuix-api-url'), 'Pinned fields are editable');
  await Promise.all([admin.waitForNavigation(), admin.click('#tuix-settings #submit')]);
  check(await admin.locator('.notice-error, .error').count() === 0, 'Saving with pinned values reported errors');
  wp('config', 'delete', 'TUIX_PROJECT_KEY', '--type=constant');
  wp('config', 'delete', 'TUIX_API_URL', '--type=constant');
  await new Promise(r => setTimeout(r, 3000));
  check(JSON.parse(wp('option', 'get', 'tuix_feedback_settings', '--format=json')).project_key === project, 'Pinning wiped the stored project key');
  check(wp('option', 'list', '--search=tuix_feedback_secret_key', '--fields=autoload', '--format=csv').includes('off') || wp('option', 'list', '--search=tuix_feedback_secret_key', '--fields=autoload', '--format=csv').includes('no'), 'Signing key is autoloaded on every request');

  stage = 'a Tuix outage keeps the last good runtime';
  api_server.closeAllConnections?.();
  wp('transient', 'delete', '--all');
  const outage = createServer((request, response) => { response.writeHead(503); response.end(); });
  await new Promise(done => api_server.close(() => outage.listen(API_PORT, '127.0.0.1', done)));
  await editor.goto(site + '/');
  check(await editor.getAttribute('#tuix-loader', 'integrity') === integrity, 'Outage dropped the widget instead of using the last good runtime');
  outage.close();

  stage = 'an unreachable Tuix delays at most one page';
  const hanging = createServer(() => {}); // accepts, never answers
  await new Promise(done => hanging.listen(API_PORT + 1, '127.0.0.1', done));
  const settings = JSON.parse(wp('option', 'get', 'tuix_feedback_settings', '--format=json'));
  wp('option', 'update', 'tuix_feedback_settings', JSON.stringify({ ...settings, api_url: `http://127.0.0.1:${API_PORT + 1}` }), '--format=json');
  const timed = async () => { const started = Date.now(); await editor.goto(site + '/'); return Date.now() - started; };
  const first = await timed(), second = await timed();
  check(first >= 4000, 'Expected the first lookup to wait for the timeout, took ' + first + 'ms');
  check(second < 2500, 'An unreachable Tuix slowed a later page: ' + second + 'ms');
  check(await editor.locator('#tuix-loader').count() === 0, 'Printed a loader without a runtime');
  hanging.close();
  wp('option', 'update', 'tuix_feedback_settings', JSON.stringify(settings), '--format=json');

  stage = 'the earlier Tuix plugin: Tuix Feedback waits, then copies its settings once';
  // A stand-in for the plugin first shipped as Tuix (tuix/tuix.php): its constant, its class
  // names, and an uninstall.php that deletes its own options.
  const legacy = mkdtempSync(join(evidence, 'legacy-'));
  writeFileSync(join(legacy, 'tuix.php'), `<?php
/**
 * Plugin Name: Tuix
 * Version: 0.1.1
 */
defined( 'ABSPATH' ) || exit;
define( 'TUIX_PLUGIN_VERSION', '0.1.1' );
final class Tuix_Config {}
final class Tuix_Runtime {}
final class Tuix_Widget {}
final class Tuix_Admin {}
add_action( 'wp_footer', static function () { echo '<script id="tuix-legacy"></script>'; } );
`);
  writeFileSync(join(legacy, 'uninstall.php'), `<?php
defined( 'WP_UNINSTALL_PLUGIN' ) || exit;
delete_option( 'tuix_settings' );
delete_option( 'tuix_secret_key' );
delete_option( 'tuix_runtime_last' );
`);
  run(['cp', legacy, `${names.wp}:/var/www/html/wp-content/plugins/tuix`]);
  run(['exec', names.wp, 'chown', '-R', '33:33', '/var/www/html/wp-content/plugins/tuix']);
  rmSync(legacy, { recursive: true, force: true });
  wp('plugin', 'activate', 'tuix');
  // The site as the earlier plugin left it: its options, none of Tuix Feedback's.
  const configured = JSON.parse(wp('option', 'get', 'tuix_feedback_settings', '--format=json'));
  const runtime = wp('option', 'get', 'tuix_feedback_runtime_last', '--format=json');
  for (const name of ['tuix_feedback_settings', 'tuix_feedback_secret_key', 'tuix_feedback_runtime_last']) wp('option', 'delete', name, '--skip-plugins');
  wp('option', 'add', 'tuix_settings', JSON.stringify(configured), '--format=json', '--skip-plugins');
  wp('option', 'add', 'tuix_secret_key', secret, '--autoload=no', '--skip-plugins');
  wp('option', 'add', 'tuix_runtime_last', runtime, '--format=json', '--autoload=no', '--skip-plugins');
  await editor.goto(site + '/');
  check(await editor.locator('#tuix-legacy').count() === 1, 'The earlier plugin should keep running until it is deactivated');
  check(await editor.locator('#tuix-init').count() === 0, 'Both plugins printed a widget');
  check(option('tuix_feedback_settings') === null, 'Tuix Feedback copied settings while the earlier plugin was active');
  await admin.goto(site + '/wp-admin/plugins.php');
  check(await admin.locator('.notice-warning', { hasText: 'Tuix Feedback replaces the plugin Tuix' }).count() === 1, 'Missing notice to remove the earlier plugin');
  wp('plugin', 'deactivate', 'tuix', '--skip-plugins');
  // The first request with the earlier plugin off copies its settings.
  await editor.goto(site + '/');
  check(await editor.locator('#tuix-init').count() === 1 && await editor.locator('#tuix-legacy').count() === 0, 'Tuix Feedback did not take over');
  check(option('tuix_feedback_secret_key') === secret, 'The signing key was not copied');
  check(!autoloaded('tuix_feedback_secret_key'), 'The copied signing key is autoloaded');
  check(JSON.parse(option('tuix_feedback_settings', '--format=json')).project_key === project, 'The settings were not copied');
  // The path Plugins → Delete takes: delete_plugins() runs the plugin's uninstall.php first.
  const deleted = wp('eval', 'require_once ABSPATH . "wp-admin/includes/plugin.php"; require_once ABSPATH . "wp-admin/includes/file.php"; echo true === delete_plugins( array( "tuix/tuix.php" ) ) ? "deleted" : "failed";');
  check(deleted.endsWith('deleted'), 'Deleting the earlier plugin failed: ' + deleted);
  check(option('tuix_secret_key') === null && option('tuix_settings') === null, 'The earlier plugin did not remove its own options');
  check(option('tuix_feedback_secret_key') === secret, 'Deleting the earlier plugin touched Tuix Feedback');
  await editor.goto(site + '/');
  check(await editor.locator('#tuix-init').count() === 1, 'Tuix Feedback lost the widget when the earlier plugin went');

  stage = 'on a network, each site copies its own earlier settings';
  wp('core', 'multisite-convert', '--title=Tuix network');
  wp('site', 'create', '--slug=second', '--title=Second', '--email=admin@example.test');
  const secondSite = `--url=${site}/second/`;
  const secondSecret = 'second-site-signing-key-0123456789';
  wp('option', 'add', 'tuix_settings', JSON.stringify({ ...configured, project_key: 'pk_live_secondSiteProject' }), '--format=json', secondSite, '--skip-plugins');
  wp('option', 'add', 'tuix_secret_key', secondSecret, '--autoload=no', secondSite, '--skip-plugins');
  wp('plugin', 'activate', 'tuix-feedback', secondSite);
  wp('eval', 'echo get_bloginfo( "url" );', secondSite);
  check(option('tuix_feedback_secret_key', secondSite) === secondSecret, 'The second site did not copy its own signing key');
  check(!autoloaded('tuix_feedback_secret_key', secondSite), 'The second site copied its signing key autoloaded');
  check(JSON.parse(option('tuix_feedback_settings', '--format=json', secondSite)).project_key === 'pk_live_secondSiteProject', 'The second site did not copy its own settings');
  check(option('tuix_feedback_secret_key') === secret, 'The second site changed the first site');

  stage = 'uninstall removes only Tuix Feedback settings, on every site';
  // The earlier plugin's options belong to it: Tuix Feedback's uninstall leaves them.
  wp('option', 'add', 'tuix_secret_key', 'earlier-plugin-key-0123456789', '--autoload=no', '--skip-plugins');
  wp('plugin', 'deactivate', 'tuix-feedback', secondSite);
  wp('plugin', 'deactivate', 'tuix-feedback');
  wp('plugin', 'uninstall', 'tuix-feedback', '--skip-delete');
  for (const url of [[], [secondSite]]) {
    check(option('tuix_feedback_secret_key', ...url) === null && option('tuix_feedback_settings', ...url) === null, 'Uninstall left Tuix Feedback settings ' + (url[0] ?? 'on the first site'));
  }
  check(option('tuix_secret_key') === 'earlier-plugin-key-0123456789', "Uninstall removed the earlier plugin's signing key");
  check(option('tuix_secret_key', secondSite) === secondSecret, "Uninstall removed the earlier plugin's signing key on the second site");
  console.log('WordPress plugin smoke passed. Evidence: ' + evidence + '/');
} catch (error) {
  console.error(`WordPress smoke failed at "${stage}": ${error.message}`);
  try { console.error(run(['logs', '--tail', '40', names.wp], { allowFail: true })); } catch {}
  process.exitCode = 1;
} finally {
  await browser?.close();
  api_server.close();
  cleanup();
}
