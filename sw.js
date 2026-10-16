// عامل الخدمة للنسخة المنشورة (يُولَّد من app/tools/pwa/sw.js بـ publish.mjs؛ لا تحرّر النسخة المنشورة).
// يحفظ البرنامج فيفتح بلا إنترنت، ويجلب النسخة الجديدة في الخلفية. البصمة تتغير مع كل نشر فيتبدّل العامل.
'use strict';

const BUILD = '2026-10-16T12:19:55.627Z';
// المخازن مشتركة بين كل تطبيقات usama-kh75.github.io: بادئة خاصة بهذا البرنامج، فلا يمس هياكل غيره
const APP = 'boc-monthly-report';
const SHELL = APP + '-shell-' + BUILD;
const FILES = ['./manifest.json', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

// الصفحة شرط: يجب أن تكون من البناء نفسه (أثناء النشر قد يصل sw.js الجديد مع الصفحة القديمة)، وإلا فشل التثبيت
// وبقي العامل القديم وهيكله، ويعيد المتصفح المحاولة لاحقاً. والملحقات كلٌّ على حدة: فشل أيقونة لا يُسقط الكل
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const page = await fetch('./index.html', { cache: 'reload' });
    if (!page.ok) throw new Error('page unavailable');
    if (!(await page.clone().text()).includes('"البناء":"' + BUILD + '"')) throw new Error('page is not build ' + BUILD);
    const c = await caches.open(SHELL);
    await c.put('./index.html', page.clone());
    await c.put('./', page);
    await Promise.all(FILES.map(async (f) => {
      let res = null;
      try { res = await fetch(f, { cache: 'reload' }); } catch { /* يُؤخذ من الهيكل السابق */ }
      if (!res || !res.ok) res = await caches.match(f);
      if (res) await c.put(f, res);
    }));
    await self.skipWaiting();
  })());
});

// الصفحة تسأل العامل عن بصمته لتعرف إن كانت هناك نسخة أحدث منها
self.addEventListener('message', (e) => {
  if (e.data === 'build' && e.ports && e.ports[0]) e.ports[0].postMessage(BUILD);
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith(APP + '-shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

// من المخزن فوراً، والجديد يُجلب في الخلفية؛ والصفحة تُعلن النسخة الأحدث حين يتبدّل العامل
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!url.href.startsWith(self.registration.scope) || url.pathname.endsWith('/sw.js')) return;
  if (req.cache === 'no-store' || req.cache === 'reload') return;
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' }) ||
      (req.mode === 'navigate' ? await caches.match('./index.html') : undefined);
    const fresh = fetch(req).then(async (res) => {
      // الصفحة لا تُحفظ هنا: تُحفظ عند التثبيت فقط بعد التحقق من بصمتها، وإلا حلّت محلها صفحة من بناء آخر
      // يقدّمها GitHub أثناء النشر فتُفتح بعدها حتى بلا إنترنت (مراجعة Codex)
      const page = req.mode === 'navigate' || /\/(index\.html)?$/.test(url.pathname);
      if (res.ok && !page) await (await caches.open(SHELL)).put(req, res.clone());
      return res;
    });
    if (cached) {
      e.waitUntil(fresh.catch(() => {}));
      return cached;
    }
    return fresh.catch(async () => (req.mode === 'navigate' && await caches.match('./index.html')) || Response.error());
  })());
});
