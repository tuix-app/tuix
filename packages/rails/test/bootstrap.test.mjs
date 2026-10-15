import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../assets/bootstrap.js', import.meta.url), 'utf8');
const integrity = 'sha384-' + 'A'.repeat(64);
const path = `/widget/0.2.3/${'a'.repeat(64)}/tuix.js`;
const manifest = { protocol: 1, version: '0.2.3', loader: { url: path, integrity } };
const payload = id => JSON.stringify({ delivery: 'hosted', user: { id, name: id, hash: 'a'.repeat(64) },
  options: { project: 'test', api: 'https://tuix.example.test', nonce: 'test-nonce' } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function fixture(t, fetcher) {
  const dom = new JSDOM('<head></head><body><div id="tuix-rails"></div></body>', {
    url: 'https://host.example.test', runScripts: 'outside-only'
  });
  const { window } = dom;
  const calls = [], requests = [], observers = [];
  const Observer = window.MutationObserver;
  window.MutationObserver = class extends Observer {
    constructor(callback) { super(callback); observers.push(this); }
  };
  window.fetch = async (...args) => {
    requests.push(args);
    return fetcher ? fetcher(...args) : { ok: true, json: async () => manifest };
  };
  window.tuix = (...args) => {
    calls.push(args);
    if (args[0] === 'identify') window.document.body.append(window.document.createElement('tuix-widget'));
    if (args[0] === 'destroy') window.document.querySelector('tuix-widget')?.remove();
  };
  t.after(() => { observers.forEach(observer => observer.disconnect()); window.close(); });
  const element = window.document.getElementById('tuix-rails');
  return { window, calls, requests, element, run: () => window.eval(source),
    event: name => window.document.dispatchEvent(new window.Event(name)),
    loaded: async () => {
      await flush();
      window.document.querySelector('script').dispatchEvent(new window.Event('load'));
      await flush();
    } };
}

test('anonymous pages stay idle; signed identities reuse one SRI loader and logout clears the widget', async t => {
  const f = fixture(t);
  f.run();
  await flush();
  assert.equal(f.requests.length, 0);
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  await f.loaded();
  const script = f.window.document.querySelector('script');
  assert.equal(script.src, 'https://tuix.example.test' + path);
  assert.equal(script.integrity, integrity);
  assert.equal(script.nonce, 'test-nonce');
  assert.equal(f.requests[0][1].credentials, 'omit');
  f.element.setAttribute('data-tuix-rails', payload('bob'));
  await flush();
  assert.equal(f.calls.at(-1)[1].id, 'bob');
  assert.equal(f.requests.length, 1);
  f.element.remove();
  await flush();
  assert.equal(f.calls.at(-1)[0], 'destroy');
  assert.equal(f.window.document.querySelector('tuix-widget'), null);
  f.run();
  assert.equal(f.window.document.querySelectorAll('script').length, 1);
});

test('Turbo cache strips identity and widget, previews stay idle, fresh renders identify again', async t => {
  const f = fixture(t);
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await f.loaded();
  f.event('turbo:before-cache');
  await flush();
  assert.equal(f.element.hasAttribute('data-tuix-rails'), false);
  assert.equal(f.window.document.querySelector('tuix-widget'), null);
  f.window.document.documentElement.setAttribute('data-turbo-preview', '');
  f.element.setAttribute('data-tuix-rails', payload('old'));
  const count = f.calls.length;
  f.event('turbo:render');
  await flush();
  assert.equal(f.calls.length, count);
  f.event('turbo:before-render');
  f.window.document.documentElement.removeAttribute('data-turbo-preview');
  f.element.setAttribute('data-tuix-rails', payload('bob'));
  f.event('turbo:load');
  await flush();
  assert.equal(f.calls.at(-1)[1].id, 'bob');
});

test('logout while manifest is pending aborts and prevents stale initialization', async t => {
  let resolve;
  const f = fixture(t, () => new Promise(done => { resolve = done; }));
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await flush();
  f.element.remove();
  await flush();
  assert.equal(f.requests[0][1].signal.aborted, true);
  resolve({ ok: true, json: async () => manifest });
  await flush();
  assert.equal(f.window.document.querySelector('script'), null);
  assert.equal(f.calls.some(call => call[0] === 'identify'), false);
});

test('untrusted manifest cannot select a script; navigation retries after failure', async t => {
  let valid = false;
  const f = fixture(t, async () => ({ ok: true, json: async () => valid ? manifest :
    { ...manifest, loader: { url: 'https://attacker.example/evil.js', integrity } } }));
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await flush();
  assert.equal(f.window.document.querySelector('script'), null);
  assert.equal(f.requests.length, 1);
  valid = true;
  f.event('turbo:load');
  await f.loaded();
  assert.equal(f.calls.at(-1)[1].id, 'alice');
});

test('late loader completion after logout cannot initialize; a later login can reuse it', async t => {
  const f = fixture(t);
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await flush();
  f.element.removeAttribute('data-tuix-rails');
  await flush();
  await f.loaded();
  assert.equal(f.calls.some(call => call[0] === 'identify'), false);
  f.element.setAttribute('data-tuix-rails', payload('bob'));
  await flush();
  assert.equal(f.calls.at(-1)[1].id, 'bob');
});

test('manifest protocol, version, directory and integrity must agree before loading code', async t => {
  for (const invalid of [
    { ...manifest, protocol: 2 },
    { ...manifest, version: '9.9.9' },
    { ...manifest, directory: 'untrusted' },
    { ...manifest, loader: { url: path, integrity: 'sha384-invalid' } },
  ]) {
    const f = fixture(t, async () => ({ ok: true, json: async () => invalid }));
    f.element.setAttribute('data-tuix-rails', payload('alice'));
    f.run();
    await flush();
    assert.equal(f.window.document.querySelector('script'), null);
    assert.equal(f.calls.some(call => call[0] === 'identify'), false);
  }
});

test('a document cannot silently reuse a runtime from a different API origin', async t => {
  const f = fixture(t);
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await f.loaded();
  const next = JSON.parse(payload('bob'));
  next.options.api = 'https://another.example.test';
  f.element.setAttribute('data-tuix-rails', JSON.stringify(next));
  await flush();
  assert.equal(f.calls.at(-1)[0], 'destroy');
  assert.equal(f.calls.some(call => call[0] === 'identify' && call[1].id === 'bob'), false);
  assert.equal(f.requests.length, 1);
});

test('script failure stays quiet until navigation and can then recover', async t => {
  const f = fixture(t);
  f.element.setAttribute('data-tuix-rails', payload('alice'));
  f.run();
  await flush();
  f.window.document.querySelector('script').dispatchEvent(new f.window.Event('error'));
  await flush();
  assert.equal(f.window.document.querySelector('script'), null);
  assert.equal(f.calls.some(call => call[0] === 'identify'), false);
  f.event('turbo:load');
  await f.loaded();
  assert.equal(f.calls.at(-1)[1].id, 'alice');
});
