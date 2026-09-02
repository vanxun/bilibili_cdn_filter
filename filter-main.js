(() => {
  'use strict';
  if (window.__bilibiliCdnFilterV4) return;
  window.__bilibiliCdnFilterV4 = true;

  const BAD_HOSTS = ['mcdn.bilivideo.cn', 'edge.mountaintoys.cn', 'szbdyd.com'];
  const BASE_KEYS = ['baseUrl', 'base_url'];
  const BACKUP_KEYS = ['backupUrl', 'backup_url'];

  function hostname(value) {
    if (typeof value !== 'string') return '';
    try { return new URL(value, location.href).hostname.toLowerCase(); }
    catch { return ''; }
  }

  function matches(host, domain) {
    return host === domain || host.endsWith(`.${domain}`);
  }

  const isBad = value => BAD_HOSTS.some(domain => matches(hostname(value), domain));
  const isGood = value => matches(hostname(value), 'bilivideo.com');

  function isPlayApi(value) {
    try {
      const url = new URL(value, location.href);
      return matches(url.hostname.toLowerCase(), 'bilibili.com')
        && url.pathname.toLowerCase().includes('playurl');
    } catch {
      return false;
    }
  }

  function report(type, url, replacement = '') {
    window.postMessage({
      source: 'bilibili-cdn-filter-v4', type, url, replacement, time: Date.now()
    }, '*');
  }

  function clean(values) {
    const result = [];
    const seen = new Set();
    let changed = false;
    for (const value of values || []) {
      if (typeof value !== 'string') continue;
      if (isBad(value)) { report('removed', value); changed = true; continue; }
      if (seen.has(value)) { changed = true; continue; }
      seen.add(value);
      result.push(value);
    }
    const sorted = [...result].sort((a, b) => Number(isGood(b)) - Number(isGood(a)));
    if (!changed) changed = sorted.some((value, index) => value !== result[index]);
    return { values: sorted, changed };
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return false;
    let changed = false;

    for (const key of BACKUP_KEYS) {
      if (!Array.isArray(node[key])) continue;
      const cleaned = clean(node[key]);
      if (cleaned.changed) {
        node[key] = cleaned.values;
        changed = true;
      }
    }

    for (const key of BASE_KEYS) {
      if (!isBad(node[key])) continue;
      let replacement = '';
      for (const backupKey of BACKUP_KEYS) {
        const candidates = node[backupKey];
        if (!Array.isArray(candidates) || !candidates.length) continue;
        replacement = candidates.find(isGood) || candidates[0];
        if (replacement) break;
      }
      if (!replacement) { report('bad-base-no-backup', node[key]); continue; }
      report('promoted', node[key], replacement);
      node[key] = replacement;
      changed = true;
    }

    for (const value of Object.values(node)) {
      if (value && typeof value === 'object') changed = walk(value) || changed;
    }
    return changed;
  }

  function filterPayload(payload) {
    if (payload && typeof payload === 'object') {
      return { changed: walk(payload), value: payload };
    }
    if (typeof payload !== 'string') return { changed: false, value: payload };
    try {
      const data = JSON.parse(payload);
      const changed = walk(data);
      return { changed, value: changed ? JSON.stringify(data) : payload };
    } catch {
      return { changed: false, value: payload };
    }
  }

  let playInfo = window.__playinfo__;
  if (playInfo !== undefined) playInfo = filterPayload(playInfo).value;
  try {
    Object.defineProperty(window, '__playinfo__', {
      configurable: true,
      enumerable: true,
      get: () => playInfo,
      set: value => { playInfo = filterPayload(value).value; }
    });
  } catch {}

  const NativeXHR = window.XMLHttpRequest;
  if (NativeXHR) {
    window.XMLHttpRequest = class extends NativeXHR {
      constructor() {
        super();
        this.addEventListener('readystatechange', () => {
          if (this.readyState !== 4 || !isPlayApi(this.__bilibiliCdnFilterUrl)) return;
          try {
            const source = this.responseType === 'json' ? this.response : this.responseText;
            const filtered = filterPayload(source);
            if (!filtered.changed) return;
            const value = this.responseType === 'json' ? filtered.value : String(filtered.value);
            Object.defineProperty(this, 'response', { configurable: true, value });
            if (this.responseType !== 'json') {
              Object.defineProperty(this, 'responseText', { configurable: true, value });
            }
          } catch {}
        });
      }

      open(method, url, ...rest) {
        this.__bilibiliCdnFilterUrl = String(url || '');
        return super.open(method, url, ...rest);
      }
    };
  }

  const nativeFetch = window.fetch;
  if (!nativeFetch) return;

  window.fetch = function (...args) {
    const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (!isPlayApi(requestUrl)) return nativeFetch.apply(this, args);

    return nativeFetch.apply(this, args).then(async response => {
      try {
        const filtered = filterPayload(await response.clone().json());
        if (!filtered.changed) return response;
        return new Response(JSON.stringify(filtered.value), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch {
        return response;
      }
    });
  };

  report('filter-loaded', location.href);
})();
