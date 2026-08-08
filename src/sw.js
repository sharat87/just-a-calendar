// Offline support.
const CACHE_VERSION = "v5"
const CACHE_NAME = `just-a-calendar-${CACHE_VERSION}`

const PRE_CACHE_URLS = [
	"/",
	"/index.html",
	"/styles.css",
	"/manifest.json",
	"/app.js",
	// Self-hosted, so unlike the old Google Fonts link these can actually be pre-cached — the
	// fetch handler below deliberately ignores cross-origin requests.
	"/fonts/nunito-latin-400.woff2",
	"/fonts/nunito-latin-700.woff2",
	"/icons/favicon.ico",
	"/icons/favicon-16.png",
	"/icons/favicon-32.png",
	"/icons/favicon-180.png",
	"/icons/favicon-192.png",
	"/icons/favicon-512.png",
]

addEventListener("install", (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => {
			return Promise.allSettled(
				PRE_CACHE_URLS.map((url) => cache.add(url))
			)
		})
	)
})

addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keyList) => {
			return Promise.all(
				keyList.map((key) => {
					if (key === CACHE_NAME) return
					return caches.delete(key)
				})
			)
		}).then(() => {
			// Take control of all clients immediately so the new SW applies without a reload.
			return clients.claim()
		})
	)
})

addEventListener("fetch", (event) => {
	// Only handle GET requests for our own origin.
	const url = new URL(event.request.url)
	if (event.request.method !== "GET" || url.origin !== location.origin) {
		return
	}

	event.respondWith(
		caches.match(event.request).then((cachedResponse) => {
			if (cachedResponse) {
				// Return cached immediately, then update cache in background.
				fetch(event.request).then((networkResponse) => {
					if (networkResponse.ok) {
						caches.open(CACHE_NAME).then((cache) => {
							cache.put(event.request, networkResponse)
						})
					}
				}).catch(() => {})
				return cachedResponse
			}

			return fetch(event.request).then((networkResponse) => {
				if (networkResponse.ok) {
					const cloned = networkResponse.clone()
					caches.open(CACHE_NAME).then((cache) => {
						cache.put(event.request, cloned)
					})
				}
				return networkResponse
			}).catch(() => {
				// Offline and not in cache — return a simple fallback for navigation requests.
				if (event.request.mode === "navigate") {
					return caches.match("/index.html")
				}
				return new Response("Offline", { status: 503 })
			})
		})
	)
})
