/* A page selects one runtime. Only the signed identity follows LiveView patches. */
(() => {
  const root = document.documentElement;
  if (root.hasAttribute('data-tuix-phoenix-bound')) return;
  root.setAttribute('data-tuix-phoenix-bound', '');
  const sri = /^sha384-[A-Za-z0-9+/]{64}$/;
  const immutable = /^\/widget\/(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)\/[a-f0-9]{64}\/tuix\.js$/;
  let previous, failed, selected, loading, controller;
  let generation = 0;
  let suspended = false;

  function clear() {
    generation++;
    controller?.abort();
    controller = undefined;
    if (previous !== undefined && typeof window.tuix === 'function') window.tuix('destroy');
    previous = undefined;
  }

  function apiOrigin(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash ||
        !['', '/'].includes(url.pathname) ||
        !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
      throw Error('Invalid Tuix API origin');
    }
    return url.origin;
  }

  function runtime(manifest, origin) {
    const match = typeof manifest?.loader?.url === 'string' && manifest.loader.url.match(immutable);
    if (manifest?.protocol !== 1 || !match || manifest.version !== match[1] ||
        !sri.test(manifest.loader.integrity) ||
        (manifest.directory !== undefined && manifest.directory !== manifest.loader.url.slice(8, -8))) {
      throw Error('Invalid Tuix runtime manifest');
    }
    return { url: origin + manifest.loader.url, integrity: manifest.loader.integrity };
  }

  async function select(payload, token) {
    const origin = apiOrigin(payload.options.api);
    if (selected) {
      if (selected.origin !== origin || selected.delivery !== payload.delivery) throw Error('Runtime already selected');
      return selected;
    }
    let entry;
    if (payload.delivery === 'bundled') {
      const url = new URL(payload.loader?.url, location.origin);
      if (url.origin !== location.origin || !/^\/tuix-assets\/[a-f0-9]{64}\/tuix\.js$/.test(url.pathname) ||
          url.search || url.hash || !sri.test(payload.loader?.integrity)) throw Error('Invalid bundled loader');
      entry = { url: url.href, integrity: payload.loader.integrity };
    } else if (payload.delivery === 'hosted') {
      const abort = new AbortController();
      controller = abort;
      const timeout = setTimeout(() => abort.abort(), 8000);
      try {
        const response = await fetch(origin + '/widget/channels/stable.json', {
          mode: 'cors', credentials: 'omit', redirect: 'error', signal: abort.signal
        });
        if (!response.ok) throw Error('Runtime unavailable');
        entry = runtime(await response.json(), origin);
      } finally {
        clearTimeout(timeout);
        if (controller === abort) controller = undefined;
      }
    } else {
      throw Error('Invalid delivery mode');
    }
    if (token !== generation) throw Error('Identity changed');
    selected = { ...entry, origin, delivery: payload.delivery };
    return selected;
  }

  function load(entry, nonce) {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = entry.url;
      script.integrity = entry.integrity;
      script.crossOrigin = 'anonymous';
      if (nonce) script.nonce = nonce;
      const timeout = setTimeout(() => finish(false), 15000);
      function finish(ok) {
        clearTimeout(timeout);
        script.onload = script.onerror = null;
        if (ok) resolve();
        else { script.remove(); loading = undefined; reject(Error('Runtime failed')); }
      }
      script.onload = () => finish(true);
      script.onerror = () => finish(false);
      document.head.append(script);
    });
    return loading;
  }

  async function synchronize() {
    if (suspended) return;
    const encoded = document.getElementById('tuix-phoenix')?.getAttribute('data-tuix-phoenix');
    if (!encoded) { if (previous !== undefined) clear(); return; }
    if (encoded === previous || encoded === failed) return;
    clear();
    let payload;
    try {
      payload = JSON.parse(encoded);
      if (!payload?.user?.id || !payload.user.name || !/^[a-f0-9]{64}$/.test(payload.user.hash) ||
          !payload.options?.project) return;
    } catch { return; }
    previous = encoded;
    const token = generation;
    try {
      const entry = await select(payload, token);
      if (token !== generation) return;
      await load(entry, payload.options.nonce);
      if (token !== generation || suspended) return;
      if (typeof window.tuix !== 'function') throw Error('Runtime missing');
      window.tuix('destroy');
      window.tuix('init', payload.options);
      window.tuix('identify', payload.user);
    } catch {
      if (token !== generation) return;
      failed = encoded;
      clear();
    }
  }

  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; synchronize(); });
  }
  new MutationObserver(schedule).observe(root, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-tuix-phoenix']
  });
  function navigate() { failed = undefined; schedule(); }
  window.addEventListener('phx:page-loading-stop', navigate);
  window.addEventListener('pagehide', () => { suspended = true; clear(); });
  window.addEventListener('pageshow', () => { suspended = false; navigate(); });
  synchronize();
})();
