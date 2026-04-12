// VOD POS — Minimal Service Worker
// Purpose: Enable PWA install prompt + basic app-shell caching.
// No offline data cache — POS requires live DB access.

const CACHE_NAME = "vod-pos-v1"
const SHELL_ASSETS = ["/app/pos"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener("fetch", (event) => {
  // Network-first for all requests — we need live data.
  // Cache is only used if network is completely unavailable.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
