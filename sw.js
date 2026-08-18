const CACHE = 'fc-quiz-v11';

// 不會變動的資源 → cache-first
const IMMUTABLE = ['./vendor/pdf.min.mjs', './vendor/pdf.worker.min.mjs', './icon.svg', './manifest.webmanifest'];
// 會改版的文件 → network-first（離線時才回快取）
const DOCS = ['./', './index.html', './styles.css?v=11', './app.js?v=11', './learning-core.js?v=8', './config.js'];
const DATA = ['./questions.json'];

const abs = p => new URL(p, self.registration.scope).pathname;
const IMMUTABLE_SET = new Set(IMMUTABLE.map(abs));
const DOCS_SET = new Set(DOCS.map(abs));
const DATA_SET = new Set(DATA.map(abs));

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll([...IMMUTABLE, ...DOCS, ...DATA])).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isDoc = e.request.mode === 'navigate' || DOCS_SET.has(url.pathname);

  // 文件：先連網路拿最新版，成功就順手更新快取；離線才用快取。
  if (isDoc) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match(abs('./index.html')) : undefined)))
    );
    return;
  }

  // 題庫文字可離線使用，但仍以網路最新版優先；附圖與 PDF 不進 Cache。
  if (DATA_SET.has(url.pathname)) {
    e.respondWith(fetch(e.request).then(res => {
      if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      return res;
    }).catch(() => caches.match(e.request)));
    return;
  }

  // 固定資源：快取優先。
  if (IMMUTABLE_SET.has(url.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request)));
    return;
  }

  // 其他一律不碰。PDF 只存 IndexedDB —— 若讓 SW 也快取一份，
  // 68 MB 的書會佔掉 136 MB（2026-08-17 實測過這個 bug）。
});
