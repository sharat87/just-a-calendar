// Cloudflare Worker script. Static assets are served directly by Cloudflare without invoking this
// script, so this only sees requests that don't match a file in dist/.
//
// GET /holidays[?country=XX] responds with public holidays for the visitor's country, as detected
// by Cloudflare from the request, or for the given ISO 3166-1 alpha-2 country code. The data comes
// from Google Calendar's public holiday calendars, which cover lunar-calendar holidays (Diwali,
// Eid, Lunar New Year etc.) far better than any free holiday API we found. Response shape:
//
//   { "country": "IN", "name": "Holidays in India", "holidays": { "20261108": "Diwali/Deepavali" } }
//
// `name` is null and `holidays` is empty when we don't have a calendar for the country.

// Google's holiday calendar IDs are `en.<name>#holiday@group.v.calendar.google.com`. Older ones use
// names like `indian` and `usa`, newer ones just the lowercase country code. These are the old
// names we know of, anything else is tried with its country code.
const CALENDAR_NAMES = {
	AE: "ae", AT: "austrian", AU: "australian", BR: "brazilian", CA: "canadian", CN: "china",
	CZ: "czech", DE: "german", DK: "danish", ES: "spain", FI: "finnish", FR: "french",
	GB: "uk", GR: "greek", HK: "hong_kong", HU: "hungarian", ID: "indonesian", IE: "irish",
	IN: "indian", IT: "italian", JP: "japanese", KR: "south_korea", MX: "mexican",
	MY: "malaysia", NL: "dutch", NO: "norwegian", NZ: "new_zealand", PH: "philippines",
	PL: "polish", PT: "portuguese", RO: "romanian", RU: "russian", SA: "saudiarabian",
	SE: "swedish", SG: "singapore", TR: "turkish", TW: "taiwan", UA: "ukrainian", US: "usa",
	VN: "vietnamese", ZA: "sa",
}

// Holiday calendars change rarely, so cache the parsed result at the edge for a day, and let
// browsers keep it for as long. The service worker additionally keeps a copy for offline use.
const MAX_AGE = 24 * 60 * 60

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		if (url.pathname !== "/holidays") {
			return new Response("Not found", { status: 404 })
		}

		const country = (url.searchParams.get("country") || request.cf?.country || "").toUpperCase()
		if (!/^[A-Z]{2}$/.test(country)) {
			return jsonResponse({ country: null, name: null, holidays: {} })
		}

		// Cache keyed on the country, not the request URL, so auto-detected and explicit requests
		// for the same country share an entry.
		const cacheKey = new Request(`${url.origin}/holidays?country=${country}`)
		const cached = await caches.default.match(cacheKey)
		if (cached) {
			return cached
		}

		const calendarId = `en.${CALENDAR_NAMES[country] || country.toLowerCase()}#holiday@group.v.calendar.google.com`
		const icsResponse = await fetch(`https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`)

		let response
		if (icsResponse.ok) {
			response = jsonResponse({ country, ...parseHolidays(await icsResponse.text()) })
		} else if (icsResponse.status === 404 || icsResponse.status === 500) {
			// Google responds with a 500, not a 404, for calendars that don't exist.
			response = jsonResponse({ country, name: null, holidays: {} })
		} else {
			return jsonResponse({ error: `Upstream responded with ${icsResponse.status}` }, 502)
		}

		ctx.waitUntil(caches.default.put(cacheKey, response.clone()))
		return response
	},
}

function jsonResponse(data, status = 200) {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"Content-Type": "application/json; charset=utf-8",
			"Cache-Control": status === 200 ? `public, max-age=${MAX_AGE}` : "no-store",
		},
	})
}

// Extracts country-wide public holidays from an ICS file. Google's calendars also have observances
// and regional holidays (DESCRIPTION is "Observance" or "Public holiday in <regions>"), which we
// skip. Dates are keyed in the same YYYYMMDD format the app uses for marks.
function parseHolidays(ics) {
	// Unfold continuation lines first, see RFC 5545 section 3.1.
	const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/)

	let name = null
	const holidays = {}
	let event = null

	for (const line of lines) {
		if (line === "BEGIN:VEVENT") {
			event = {}
		} else if (line === "END:VEVENT") {
			if (event.start && event.summary && /^Public holiday(\\n|$)/.test(event.description || "")) {
				for (const date of datesInRange(event.start, event.end)) {
					holidays[date] = holidays[date] ? `${holidays[date]}, ${event.summary}` : event.summary
				}
			}
			event = null
		} else {
			const colon = line.indexOf(":")
			const key = line.slice(0, colon).split(";")[0]
			const value = line.slice(colon + 1)
			if (event == null) {
				if (key === "X-WR-CALNAME") {
					name = unescapeText(value)
				}
			} else if (key === "DTSTART") {
				event.start = value
			} else if (key === "DTEND") {
				event.end = value
			} else if (key === "SUMMARY") {
				event.summary = unescapeText(value)
			} else if (key === "DESCRIPTION") {
				event.description = value
			}
		}
	}

	return { name, holidays }
}

// All-day events in YYYYMMDD format, with an exclusive end date.
function datesInRange(start, end) {
	const dates = [start]
	if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end || "")) {
		return dates
	}

	const toDate = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6)))
	const endDate = toDate(end)
	for (let d = toDate(start); ; ) {
		d.setUTCDate(d.getUTCDate() + 1)
		if (d >= endDate) break
		dates.push(d.toISOString().slice(0, 10).replace(/-/g, ""))
	}
	return dates
}

function unescapeText(value) {
	return value.replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c))
}
