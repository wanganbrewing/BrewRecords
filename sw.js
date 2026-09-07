const CACHE_NAME = 'fermenters-ledger-v112';
const APP_SHELL = ['./', './index.html', './demo.html', './help.html', './manifest.webmanifest', './app-icon.svg', './supabase-config.js', './cloud-sync.js'];
APP_SHELL.push('./ui-polish.css?v=112','./ui-polish.js?v=112');

APP_SHELL.push('./supabase-config.js?v=112', './cloud-sync.js?v=112', './help.html?embedded=1&v=112');
APP_SHELL.push('./inventory-costing.js?v=112','./inventory-valuation-ui.js?v=112');
APP_SHELL.push('./batch-expenses.js?v=112','./batch-expenses-ui.js?v=112');
APP_SHELL.push('./cost-catalog.js?v=112','./cost-catalog-ui.js?v=112');
APP_SHELL.push('./process-measurements.js?v=112','./process-measurements-ui.js?v=112');
APP_SHELL.push('./app-settings.js?v=112');
APP_SHELL.push('./fermentation-tanks.js?v=112');
APP_SHELL.push('./display-controls.js?v=112');
APP_SHELL.push('./beer-style-guide.js?v=112','./brew-targets.js?v=112','./brew-targets-ui.js?v=112','./brew-targets.css?v=112','./xlsx.full.min.js?v=112','./brew-targets-xlsx.js?v=112');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  // バージョン判定にオフライン／古いキャッシュを使わない。
  if(new URL(event.request.url).pathname.endsWith('/version.json')){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return;
  }
  // オンラインでは最新画面を優先し、オフライン時だけ保存済み画面を使う。
  if(event.request.mode === 'navigate' && new URL(event.request.url).origin === self.location.origin){
    event.respondWith(fetch(event.request).then(response => {
      if(!response.ok) throw new Error('Page unavailable');
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)));
      return response;
    }).catch(async () => (await caches.match(event.request)) || caches.match('./index.html')));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : undefined))
  );
});
