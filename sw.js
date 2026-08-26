const CACHE = "luma-v6";
const PARTS = ["./v6.1.txt", "./v6.2.txt", "./v6.3.txt", "./v6.4.txt"];
const V6_CSS = "./v6.css";

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(["./", "./index.html", "./app.js", "./styles.css", V6_CSS, ...PARTS]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function buildJavaScript(request) {
  const [base, ...parts] = await Promise.all([
    networkText(request),
    ...PARTS.map(path => networkText(new URL(path, self.location.href)))
  ]);
  return new Response(base + parts.join(""), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function buildStyles(request) {
  const [base, patch] = await Promise.all([
    networkText(request),
    networkText(new URL(V6_CSS, self.location.href))
  ]);
  return new Response(base + "\n" + patch, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      buildJavaScript(request).catch(() => caches.match(request).then(hit => hit || fetch(request)))
    );
    return;
  }

  if (url.pathname.endsWith("/styles.css")) {
    event.respondWith(
      buildStyles(request).catch(() => caches.match(request).then(hit => hit || fetch(request)))
    );
    return;
  }

  event.respondWith(
    fetch(request, { cache: "no-store" })
      .then(response => {
        if (response?.ok) caches.open(CACHE).then(cache => cache.put(request, response.clone()));
        return response;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match("./index.html")))
  );
});
