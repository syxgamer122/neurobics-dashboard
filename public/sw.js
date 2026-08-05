/* Mindgem service worker — Giai đoạn 5 (PWA)
 *
 * Nguyên tắc an toàn:
 *  - CHỈ cache tài nguyên tĩnh của chính trang (same-origin GET).
 *  - KHÔNG bao giờ cache lời gọi Supabase / Edge Function: dữ liệu người dùng
 *    và token không được phép nằm lại trong Cache Storage.
 *  - HTML dùng network-first để bản deploy mới không bị kẹt ở bản cũ.
 */

// __APP_VERSION__ duoc thay bang `<version>-<van tay noi dung dist/assets>` luc
// build, xem plugin swVersionStamp() trong vite.config.ts. Neu chuoi nay bien
// mat thi BUILD SE DO (truoc day chi canh bao roi bo qua).
//
// VERSION quyet dinh viec DON cache cu trong su kien "activate": moi ban deploy
// doi VERSION -> cache cu bi xoa -> khong con canh nguoi dung ket lai o ban JS
// cu sau khi deploy.
//
// Trong dev server chuoi nay giu nguyen, khong sao: main.tsx chi dang ky service
// worker khi import.meta.env.PROD.
const VERSION = "mindgem-__APP_VERSION__";
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

// Client co the goi postMessage({ type: "SKIP_WAITING" }) de ep ban moi activate
// ngay, tranh ket o bundle cu sau deploy.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
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

/**
 * File trong /assets/ do Vite sinh ra: TEN DA CHUA HASH NOI DUNG, va Vercel tra
 * ve kem header `immutable`. Mot URL nhu vay khong bao gio doi noi dung, nen
 * cache-first vua an toan tuyet doi vua nhanh nhat.
 *
 * Day cung la ly do code splitting an toan voi service worker: moi chunk game
 * co ten rieng kem hash, deploy moi sinh ten moi, khong the lan voi ban cu.
 */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/assets/");
}

/**
 * Cac file tinh KHONG co hash trong ten: manifest, icon, favicon...
 *
 * TRUOC DAY chung bi cache-first chung mot ro voi /assets/. Hau qua: doi icon
 * hay sua manifest thi nguoi dung cu giu ban cu cho den khi VERSION doi.
 * GIO dung network-first — co mang thi lay ban moi, mat mang moi dung ban luu.
 */
function isUnversionedStatic(url) {
  return /\.(?:css|js|woff2?|ttf|otf|png|jpe?g|svg|webp|ico|json|webmanifest)$/i.test(
    url.pathname,
  );
}

function cachePut(key, response) {
  if (!response.ok || response.type !== "basic") return;
  const copy = response.clone();
  caches
    .open(STATIC_CACHE)
    .then((cache) => cache.put(key, copy))
    .catch(() => undefined);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Khác origin (Supabase, CDN font…) → để trình duyệt tự xử lý, không cache.
  if (url.origin !== self.location.origin) return;

  // Có query string → thường là chủ ý phá cache, đừng lưu lại.
  if (url.search) return;

  // Điều hướng trang: ưu tiên mạng, rớt mạng thì dùng bản đã lưu.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut("/index.html", response);
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then(
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

  // /assets/ten-<hash>.js → cache-first.
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          cachePut(request, response);
          return response;
        });
      }),
    );
    return;
  }

  // manifest / icon / file tĩnh không có hash → network-first.
  if (isUnversionedStatic(url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          cachePut(request, response);
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? Response.error())),
    );
  }
});
