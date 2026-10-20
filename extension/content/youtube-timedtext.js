// Runs in the page's own world at document_start (manifest `world: "MAIN"`), the only place that sees the player's
// network. It wraps XMLHttpRequest and fetch to catch the caption timeline YouTube fetches (`/api/timedtext`, json3),
// so SpotSlate's isolated-world script can translate the lines a little ahead of the playhead instead of only when
// each one appears. It reads only the public caption response and passes it on by postMessage; no page data, no keys,
// and nothing is changed in the player's own requests.
(() => {
  const TAG = 'spotslate-timedtext';
  const READY = 'spotslate-timedtext-ready';
  // The last few captured bodies, replayed when the isolated world says it is listening: the player can fetch the
  // timeline before content/youtube.js has added its message listener, and a postMessage then would be lost.
  const buffer = [];

  function post(body) {
    try {
      window.postMessage({ spotslate: TAG, body }, window.location.origin);
    } catch {
      // a cross-origin or detached window: nothing to do
    }
  }

  function offer(url, body) {
    if (typeof url !== 'string' || url.indexOf('/api/timedtext') === -1) return;
    if (!body || /[?&]tlang=/.test(url)) return; // YouTube's own auto-translation: SpotSlate translates the original
    const text = String(body);
    buffer.push(text);
    if (buffer.length > 8) buffer.shift();
    post(text);
  }

  // When content/youtube.js starts listening it pings; replay what was captured before it was ready.
  window.addEventListener('message', (event) => {
    if (event.source === window && event.data && event.data.spotslate === READY) {
      for (const body of buffer) post(body);
    }
  });

  const urls = new WeakMap(); // XHR instance -> the URL it opened, read back when it loads
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    urls.set(this, url);
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    this.addEventListener('load', () => {
      try {
        if (this.responseType === '' || this.responseType === 'text') offer(urls.get(this), this.responseText);
      } catch {
        // a response type we cannot read as text: ignore
      }
    });
    return send.apply(this, arguments);
  };

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
      const result = nativeFetch.apply(this, arguments);
      if (typeof url === 'string' && url.indexOf('/api/timedtext') !== -1) {
        Promise.resolve(result)
          .then((response) => response.clone().text().then((body) => offer(url, body)))
          .catch(() => {});
      }
      return result;
    };
  }
})();
