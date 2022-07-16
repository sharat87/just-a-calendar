const OLD_DOMAIN = "cal.sharats.me"
const NEW_DOMAIN = "justacalendar.app"

export function needsMigrate(): boolean {
	// If this is the old domain, don't load the app, just migrate.
	if (location.host === OLD_DOMAIN) {
		initiateMigrate()
		return true
	}

	// When in a frame, prepare to accept migrate messages from old-domain, but otherwise let the app load. This is so
	// that embedding this app in other websites is possible, if needed.
	if (window.self !== window.top) {
		// Running in a frame.
		acceptMigrate()
	}

	return false
}

// Here's how this works:
// 1. If there's no data in localStorage (other than backup data from step 6), move to step 7.
// 2. Load up the new domain in a frame.
// 3. When the frame loads, send the migration data to it.
// 4. When the frame receives the migration data, it will save this data to it's localStorage.
// 5. Receive an okay message from the frame.
// 6. Move all data on old domain to a backup namespace.
// 7. Redirect to the new domain.

type MigrateStorage = {
	currentColor: null | string
	ghostMode: null | string
	marksV2: null | string
	weekNumbersEnabled: null | string
	weekStartsOn: null | string
}

function initiateMigrate() {
	const frame = document.createElement("iframe")
	frame.src = `https://${NEW_DOMAIN}/`
	frame.style.display = "none"

	frame.addEventListener("load", () => {
		if (frame.contentWindow == null) {
			console.error("Cannot access contentWindow on the new domain frame.")
			return
		}
		frame.contentWindow.postMessage({
			type: "migrate",
			storage: {
				currentColor: localStorage.getItem("currentColor"),
				ghostMode: localStorage.getItem("ghostMode"),
				marksV2: localStorage.getItem("marksV2"),
				weekNumbersEnabled: localStorage.getItem("weekNumbersEnabled"),
				weekStartsOn: localStorage.getItem("weekStartsOn"),
			},
		}, `https://${NEW_DOMAIN}/`)
	})

	window.addEventListener("message", (event: MessageEvent) => {
		console.log("top received message", event.origin, event.data)
		if (event.origin !== "https://" + NEW_DOMAIN) {
			console.error("Message from unexpected origin", event.origin)
			return
		}

		localStorage.clear()

		document.body.insertAdjacentHTML(
			"beforeend",
			`<p style="text-align: center">Done. Bye bye!</p>`,
		)

		setTimeout(() => {
			window.location.href = `https://${NEW_DOMAIN}/`
		}, 1000)
	})

	document.body.appendChild(frame)
	document.body.insertAdjacentHTML(
		"beforeend",
		`<div style="text-align: center; padding-top: 3em">Migrating to ${NEW_DOMAIN}</a>&hellip; please hold on.</div>`,
	)
}

function acceptMigrate() {
	window.addEventListener("message", (event: MessageEvent) => {
		console.log("frame received message", event.origin, event.data)
		if (event.origin !== "https://" + OLD_DOMAIN) {
			console.error("Message from unexpected origin", event.origin)
			return
		}
		if (event.source == null) {
			console.error("Cannot access source on the old-domain parent.")
			return
		}

		if (event.data.type !== "migrate") {
			console.error("Unexpected message type", event.data)
			return
		}

		const storage: MigrateStorage = event.data.storage

		if (storage.currentColor != null) {
			localStorage.setItem("currentColor", storage.currentColor)
		}

		if (storage.ghostMode != null) {
			localStorage.setItem("ghostMode", storage.ghostMode)
		}

		if (storage.marksV2 != null) {
			mergeMarks(JSON.parse(storage.marksV2))
		}

		if (storage.weekNumbersEnabled != null) {
			localStorage.setItem("weekNumbersEnabled", storage.weekNumbersEnabled)
		}

		if (storage.weekStartsOn != null) {
			localStorage.setItem("weekStartsOn", storage.weekStartsOn)
		}

		event.source.postMessage({ ok: true }, {
			targetOrigin: "https://" + OLD_DOMAIN,
		})
	})
}

function mergeMarks(incomingMarks: [date: string, color: string][]) {
	const marksMap: Record<string, string> = {}

	for (const [date, color] of JSON.parse(localStorage.marksV2 || "[]")) {
		marksMap[date] = color
	}

	for (const [date, color] of incomingMarks) {
		marksMap[date] = color
	}

	const marks: [date: string, color: string][] = []
	for (const [date, color] of Object.entries(marksMap)) {
		marks.push([date, color])
	}

	localStorage.setItem("marksV2", JSON.stringify(marks))
}
