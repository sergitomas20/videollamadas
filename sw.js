const CACHE = "luma-v9";
const PARTS = ["./v6.1.txt", "./v6.2.txt", "./v6.3.txt", "./v6.4.txt", "./v7-preview.js", "./v8-camera-switch.js"];
const STYLE_PARTS = ["./v6.css", "./v7-preview.css"];

async function networkText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

async function combinedJavaScript(url) {
  const [base, ...parts] = await Promise.all([
    networkText(url),
    ...PARTS.map(path => networkText(new URL(path, self.location.href)))
  ]);
  return new Response(base + "\n" + parts.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

async function combinedStyles(url) {
  const [base, ...parts] = await Promise.all([
    networkText(url),
    ...STYLE_PARTS.map(path => networkText(new URL(path, self.location.href)))
  ]);
  return new Response(base + "\n" + parts.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([
      "./",
      "./index.html",
      "./manifest.webmanifest",
      "./icon.svg",
      ...PARTS,
      ...STYLE_PARTS
    ]);
    try {
      const appURL = new URL("./app.js", self.location.href);
      const cssURL = new URL("./styles.css", self.location.href);
      await cache.put(appURL, await combinedJavaScript(appURL));
      await cache.put(cssURL, await combinedStyles(cssURL));
    } catch (error) {
      console.warn("LUMA V9: no se pudo precalcular el paquete combinado", error);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function cacheCombined(request, response) {
  if (response?.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
    const cleanURL = new URL(request.url);
    cleanURL.search = "";
    await cache.put(cleanURL, response.clone());
  }
  return response;
}

async function fallbackCombined(request, cleanPath) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request)) || (await cache.match(new URL(cleanPath, self.location.href))) || fetch(request);
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.endsWith("/app.js")) {
    event.respondWith(
      combinedJavaScript(request)
        .then(response => cacheCombined(request, response))
        .catch(() => fallbackCombined(request, "./app.js"))
    );
    return;
  }

  if (url.pathname.endsWith("/styles.css")) {
    event.respondWith(
      combinedStyles(request)
        .then(response => cacheCombined(request, response))
        .catch(() => fallbackCombined(request, "./styles.css"))
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
