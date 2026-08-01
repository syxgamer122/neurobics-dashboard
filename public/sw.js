/* Neurobics service worker — Giai đoạn 5 (PWA)
 *
 * Nguyên tắc an toàn:
 *  - CHỈ cache tài nguyên tĩnh của chính trang (same-origin GET).
 *  - KHÔNG bao giờ cache lời gọi Supabase / Edge Function: dữ liệu người dùng
 *    và token không được phép nằm lại trong Cache Storage.
 *  - HTML dùng network-first để bản deploy mới không bị kẹt ở bản cũ.
 */

const VERSION = "neurobics-v1";
const STATIC_CACHE = `${VERSION}-static`;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isStaticAsset(url) {
  return /\.(?:js|css|woff2?|ttf|otf|png|jpe?g|svg|webp|ico|json)$/i.test(
    url.pathname,
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Khác origin (Supabase, CDN font…) → để trình duyệt tự xử lý, không cache.
  if (url.origin !== self.location.origin) return;

  // Điều hướng trang: ưu tiên mạng, rớt mạng thì dùng bản đã lưu.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches
            .open(STATIC_CACHE)
            .then((cache) => cache.put("/index.html", copy))
            .catch(() => undefined);
          return response;
        })
        .catch(() =>
          caches
            .match("/index.html")
            .then(
              (cached) =>
                cached ??
                new Response("Offline", {
                  status: 503,
                  headers: { "Content-Type": "text/plain" },
                }),
            ),
        ),
    );
    return;
  }

  // Tài nguyên tĩnh có vân tay trong tên file → cache-first cho nhanh.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches
              .open(STATIC_CACHE)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined);
          }
          return response;
        });
      }),
    );
  }
});
