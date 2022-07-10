// This import unambiguously indicates this script as a service-worker to Parcel.
import "@parcel/service-worker"

// Offline support.
const CACHE_NAME = "just-a-calendar-cache"
addEventListener("install", (event) => {
	event.waitUntil((async () => {
		const cache = await caches.open(CACHE_NAME)
		await cache.addAll(["/", "/index.html"])
	})())
})

// A fetch handler is required for PWA to be detected.
// We also use it to respond with cached copies of resources, if available, for offline support.
addEventListener("fetch", (event) => {
	event.respondWith((async () => {
		try {
			const response = await fetch(event.request)
			const cache = await caches.open(CACHE_NAME)
			cache.put(event.request, response.clone())
				.catch((reason) => console.error("Error caching response", reason))
			return response
		} catch (error) {
			const cacheResponse = await caches.match(event.request)
			if (cacheResponse) {
				return cacheResponse
			}
			throw error
		}
	})())
})

// Clear old/unused caches, if any.
addEventListener("activate", (event) => {
	event.waitUntil(caches.keys().then((keyList) => {
		return Promise.all(keyList.map((key) => {
			if (key === CACHE_NAME) { return }
			return caches.delete(key)
		}))
	}))
})
