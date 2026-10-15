import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const script = readFileSync(new URL('../assets/bootstrap.js', import.meta.url), 'utf8');
const integrity = 'sha384-' + 'A'.repeat(64);
const digest = 'a'.repeat(64);
const manifest = { protocol: 1, version: '0.1.2', directory: `0.1.2/${digest}`, loader: { url: `/widget/0.1.2/${digest}/tuix.js`, integrity } };
const payload = (id, delivery = 'bundled') => JSON.stringify({ delivery, user: { id, name: id, hash: 'a'.repeat(64) }, options: { project: 'dummy', api: 'https://tuix.example.test', nonce: 'dummy-nonce' }, loader: { url: `/tuix-assets/${digest}/tuix.js`, integrity } });
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
async function loaded(dom) {
  await flush();
  dom.window.document.querySelector('script').dispatchEvent(new dom.window.Event('load'));
  await flush();
}
function fixture() {
  const dom = new JSDOM('<head></head><body><div id="tuix-phoenix"></div></body>', { url: 'https://host.example.test', runScripts: 'outside-only' });
  const observers = [];
  const Observer = dom.window.MutationObserver;
  dom.window.MutationObserver = class extends Observer {
    constructor(callback) { super(callback); observers.push(this); }
  };
  const close = dom.window.close.bind(dom.window);
  dom.window.close = () => { for (const observer of observers) observer.disconnect(); close(); };
  const element = dom.window.document.getElementById('tuix-phoenix');
  const calls = [];
  dom.window.tuix = (...args) => {
    calls.push(args);
    // Actual widget lifecycle changes DOM and triggers our global observer.
    if (args[0] === 'identify') dom.window.document.body.append(dom.window.document.createElement('tuix-widget'));
    if (args[0] === 'destroy') dom.window.document.querySelector('tuix-widget')?.remove();
  };
  return { dom, element, calls, run: () => dom.window.eval(script) };
}

test('login, LiveView identity patch, logout and removal destroy stale identity with one loader', async () => {
  const { dom, element, calls, run } = fixture();
  try {
    run();
    assert.equal(dom.window.__tuixPhoenix, undefined);
    assert.deepEqual(calls, []);
    element.setAttribute('data-tuix-phoenix', payload('alice'));
    await loaded(dom);
    assert.deepEqual(calls.map(c => c[0]), ['destroy', 'init', 'identify']);
    assert.equal(calls.at(-1)[1].id, 'alice');
    const loader = dom.window.document.querySelector('script');
    assert.equal(loader.nonce, 'dummy-nonce');
    assert.equal(loader.integrity, integrity);
    element.setAttribute('data-tuix-phoenix', payload('bob'));
    await flush();
    assert.equal(calls.at(-1)[1].id, 'bob');
    assert.equal(dom.window.document.querySelectorAll('script').length, 1);
    element.removeAttribute('data-tuix-phoenix');
    await flush();
    assert.equal(calls.at(-1)[0], 'destroy');
    const length = calls.length;
    element.remove();
    await flush();
    assert.equal(calls.length, length);
    run();
    assert.equal(calls.length, length);
  } finally { await flush(); dom.window.close(); }
});

test('failed asset loads do not loop; a later navigation permits retry', async () => {
  const { dom, element, calls, run } = fixture();
  try {
    element.setAttribute('data-tuix-phoenix', payload('alice'));
    run();
    await flush();
    dom.window.document.querySelector('script').dispatchEvent(new dom.window.Event('error'));
    await flush();
    assert.equal(dom.window.document.querySelectorAll('script').length, 0);
    assert.equal(calls.at(-1)[0], 'destroy');
    dom.window.dispatchEvent(new dom.window.Event('phx:page-loading-stop'));
    await flush();
    assert.equal(dom.window.document.querySelectorAll('script').length, 1);
  } finally { await flush(); dom.window.close(); }
});

test('pagehide clears identity and pageshow restores the current identity', async () => {
  const { dom, element, calls, run } = fixture();
  try {
    element.setAttribute('data-tuix-phoenix', payload('alice'));
    run();
    await loaded(dom);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    await flush();
    assert.equal(calls.at(-1)[0], 'destroy');
    assert.equal(dom.window.document.querySelector('tuix-widget'), null);
    dom.window.dispatchEvent(new dom.window.Event('pageshow'));
    await flush();
    assert.equal(calls.at(-1)[0], 'identify');
  } finally { await flush(); dom.window.close(); }
});

test('malformed identity and external loader configuration remain inactive', async () => {
  for (const encoded of ['{', 'null', '{}', payload('alice').replace('/tuix-assets/', 'https://other.test/tuix-assets/')]) {
    const { dom, element, calls, run } = fixture();
    try {
      element.setAttribute('data-tuix-phoenix', encoded);
      run();
      assert.deepEqual(calls, []);
      assert.equal(dom.window.document.querySelectorAll('script').length, 0);
    } finally { await flush(); dom.window.close(); }
  }
});

test('hosted dispatch is credential-free CORS, SRI and nonce protected; selected manifest survives identity and navigation', async () => {
  const { dom, element, calls, run } = fixture();
  const requests = [];
  dom.window.fetch = async (...args) => { requests.push(args); return { ok: true, json: async () => manifest }; };
  try {
    run();
    await flush();
    assert.equal(requests.length, 0);
    element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
    await loaded(dom);
    assert.equal(requests.length, 1);
    assert.equal(requests[0][0], 'https://tuix.example.test/widget/channels/stable.json');
    assert.equal(requests[0][1].mode, 'cors');
    assert.equal(requests[0][1].credentials, 'omit');
    assert.equal(requests[0][1].redirect, 'error');
    const loader = dom.window.document.querySelector('script');
    assert.equal(loader.src, 'https://tuix.example.test' + manifest.loader.url);
    assert.equal(loader.integrity, integrity);
    assert.equal(loader.crossOrigin, 'anonymous');
    assert.equal(loader.nonce, 'dummy-nonce');
    assert.equal(calls.at(-1)[1].id, 'alice');
    element.setAttribute('data-tuix-phoenix', payload('bob', 'hosted'));
    await flush();
    dom.window.dispatchEvent(new dom.window.Event('phx:page-loading-stop'));
    await flush();
    assert.equal(calls.at(-1)[1].id, 'bob');
    assert.equal(requests.length, 1);
    assert.equal(dom.window.document.querySelectorAll('script').length, 1);
    assert.equal(dom.window.localStorage.length, 0);
  } finally { dom.window.close(); }
});

test('hosted rejects missing SRI, malformed manifests and arbitrary or same-origin path escapes', async () => {
  const invalid = [
    null, {}, { ...manifest, protocol: 2 }, { ...manifest, version: '9.0.0' },
    { ...manifest, directory: 'other' },
    ...['https://evil.test/a.js', '//evil.test/a.js', '/tuix-assets/x/tuix.js', '/widget/../tuix.js',
      manifest.loader.url + '?x=1', manifest.loader.url + '#x',
      'https://tuix.example.test' + manifest.loader.url].map(url => ({ ...manifest, loader: { url, integrity } })),
    ...[undefined, '', 'sha256-abc', 'sha384-abc', integrity + ' '].map(integrity => ({ ...manifest, loader: { ...manifest.loader, integrity } }))
  ];
  for (const response of invalid) {
    const { dom, element, calls, run } = fixture();
    dom.window.fetch = async () => ({ ok: true, json: async () => response });
    try {
      element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
      run();
      await flush();
      assert.equal(dom.window.document.querySelectorAll('script').length, 0);
      assert.equal(calls.some(c => c[0] === 'init'), false);
    } finally { dom.window.close(); }
  }
});

test('unsafe API origins, anonymous and unsigned identities never fetch', async () => {
  for (const change of [
    p => { p.user = null; }, p => { delete p.user.hash; },
    ...['http://remote.test', 'https://user:pass@tuix.test', 'https://tuix.test/path', 'https://tuix.test?x=1', 'https://tuix.test#x'].map(api => p => { p.options.api = api; })
  ]) {
    const { dom, element, calls, run } = fixture();
    let fetched = false;
    dom.window.fetch = async () => { fetched = true; throw Error('unexpected'); };
    try {
      const p = JSON.parse(payload('alice', 'hosted')); change(p);
      element.setAttribute('data-tuix-phoenix', JSON.stringify(p));
      run(); await flush();
      assert.equal(fetched, false);
      assert.equal(calls.some(c => c[0] === 'init'), false);
    } finally { dom.window.close(); }
  }
});

test('logout invalidates in-flight manifest even if transport ignores abort', async () => {
  const { dom, element, calls, run } = fixture();
  let complete, signal;
  dom.window.fetch = (_, options) => { signal = options.signal; return new Promise(resolve => { complete = resolve; }); };
  try {
    element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
    run(); await flush();
    element.removeAttribute('data-tuix-phoenix'); await flush();
    assert.equal(signal.aborted, true);
    complete({ ok: true, json: async () => manifest }); await flush();
    assert.equal(dom.window.document.querySelectorAll('script').length, 0);
    assert.equal(calls.some(c => c[0] === 'init'), false);
  } finally { dom.window.close(); }
});

test('identity change during loader flight initializes only latest user; logout during loader does not initialize', async () => {
  for (const next of ['bob', null]) {
    const { dom, element, calls, run } = fixture();
    dom.window.fetch = async () => ({ ok: true, json: async () => manifest });
    try {
      element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
      run(); await flush();
      if (next) element.setAttribute('data-tuix-phoenix', payload(next, 'hosted'));
      else element.removeAttribute('data-tuix-phoenix');
      await loaded(dom);
      assert.deepEqual(calls.filter(c => c[0] === 'identify').map(c => c[1].id), next ? ['bob'] : []);
    } finally { dom.window.close(); }
  }
});

test('manifest failures wait for navigation before retry; loader retry keeps selected runtime', async () => {
  const { dom, element, calls, run } = fixture();
  let requests = 0;
  dom.window.fetch = async () => { requests++; return { ok: requests > 1, json: async () => manifest }; };
  try {
    element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
    run(); await flush();
    element.append(dom.window.document.createElement('span')); await flush();
    assert.equal(requests, 1);
    dom.window.dispatchEvent(new dom.window.Event('phx:page-loading-stop')); await flush();
    dom.window.document.querySelector('script').dispatchEvent(new dom.window.Event('error')); await flush();
    assert.equal(calls.some(c => c[0] === 'init'), false);
    dom.window.dispatchEvent(new dom.window.Event('phx:page-loading-stop'));
    await loaded(dom);
    assert.equal(requests, 2);
    assert.equal(calls.at(-1)[1].id, 'alice');
  } finally { dom.window.close(); }
});

test('bounded manifest and loader timeouts leave host usable and permit navigation retry', async () => {
  for (const stage of ['manifest', 'loader']) {
    const { dom, element, calls, run } = fixture();
    const timers = new Map();
    const originalTimeout = dom.window.setTimeout.bind(dom.window);
    dom.window.setTimeout = (fn, ms) => {
      if (ms === 8000 || ms === 15000) { timers.set(ms, fn); return ms; }
      return originalTimeout(fn, ms);
    };
    dom.window.clearTimeout = id => { timers.delete(id); };
    let requests = 0;
    dom.window.fetch = (_, { signal }) => {
      requests++;
      if (stage === 'manifest' && requests === 1) {
        return new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('aborted'))));
      }
      return Promise.resolve({ ok: true, json: async () => manifest });
    };
    try {
      element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
      run(); await flush();
      timers.get(stage === 'manifest' ? 8000 : 15000)();
      await flush();
      assert.equal(calls.some(c => c[0] === 'init'), false);
      assert.equal(dom.window.document.querySelectorAll('script').length, 0);
      assert.ok(dom.window.document.getElementById('tuix-phoenix'));
      dom.window.dispatchEvent(new dom.window.Event('phx:page-loading-stop'));
      await loaded(dom);
      assert.equal(calls.at(-1)[1].id, 'alice');
    } finally { dom.window.close(); }
  }
});

test('a selected runtime cannot switch API origins or delivery mode mid-page', async () => {
  for (const change of [p => { p.options.api = 'https://different.test'; }, p => { p.delivery = 'bundled'; }]) {
    const { dom, element, calls, run } = fixture();
    let requests = 0;
    dom.window.fetch = async () => { requests++; return { ok: true, json: async () => manifest }; };
    try {
      element.setAttribute('data-tuix-phoenix', payload('alice', 'hosted'));
      run(); await loaded(dom);
      const p = JSON.parse(payload('bob', 'hosted')); change(p);
      element.setAttribute('data-tuix-phoenix', JSON.stringify(p)); await flush();
      assert.equal(requests, 1);
      assert.deepEqual(calls.filter(c => c[0] === 'identify').map(c => c[1].id), ['alice']);
      assert.equal(dom.window.document.querySelectorAll('script').length, 1);
    } finally { dom.window.close(); }
  }
});
