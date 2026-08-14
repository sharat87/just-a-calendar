import m from "mithril"

const LANG = "en"

const MONTHS: string[] = []
for (let i = 0, f = new Intl.DateTimeFormat(LANG, { month: "long" }).format; i < 12; ++i) {
	MONTHS.push(f(new Date(2000, i)))
}

const WEEKDAYS: string[] = []
for (let i = 0, f = new Intl.DateTimeFormat(LANG, { weekday: "long" }).format; i < 7; ++i) {
	WEEKDAYS.push(f(new Date(2000, 0, i + 2)))
}

const MARK_COLORS = ["coral", "deeppink", "green", "purple"]

window.addEventListener("load", main)

function main() {
	m.mount(document.body, CalendarPageView)

	// Register a service-worker to support PWA installations.
	if (navigator.serviceWorker) {
		navigator.serviceWorker.register(
			new URL("./sw.js", import.meta.url),
			{ type: "module" },
		).catch(err => {
			console.error("Error registering service worker", err)
		})
	}

	// Online/offline detection.
	window.addEventListener("online", m.redraw)
	window.addEventListener("offline", m.redraw)
}

class Model {
	currentYear: number
	markedDates: Record<string, string>
	markStorage: "localStorage" | "queryParams"
	dragState: null | DragBaseState
	additionalCalendarCount: number
	contextMenu: null | { date: Date, top: number, left: number }
	isHelpVisible: boolean
	colorChangedByHotkeyAt: number

	constructor() {
		// Ensure every field has a default value, before _any_ method is called.
		this.currentYear = 0
		this.markedDates = {}
		this.markStorage = "localStorage"
		this.dragState = null
		this.additionalCalendarCount = 0
		this.contextMenu = null
		this.isHelpVisible = false
		this.colorChangedByHotkeyAt = 0

		const now = new Date()
		this.goToYear(now.getFullYear())

		const url = new URL(location.toString())
		const urlDs = url.searchParams.get("d")
		if (urlDs != null) {
			this.markStorage = "queryParams"
		}
		this.loadMarks()
	}

	goToYear(target: number | string) {
		const prevCurrentYear = this.currentYear

		if (typeof target === "string") {
			this.currentYear += parseInt(target, 10)
		} else {
			this.currentYear = target
		}

		if (this.currentYear !== prevCurrentYear) {
			// When current year has changed, clear the additional calendars.
			this.additionalCalendarCount = 0
		}
	}

	promptGoToDate() {
		const dateStr = prompt("Enter date (Any clearly understood format is okay):")
		if (dateStr) {
			const date = parseDate(dateStr)
			if (date) {
				this.goToDate(date)
				m.redraw()  // I think this is needed because of the `prompt` call.
			}
		}
	}

	goToDate(date: Date): void {
		this.goToYear(date.getFullYear())
		setTimeout(() => flash(`[data-date="${dateToBasicIso(date)}"]:not(.diff-month)`), 100)
	}

	get ghostDatesEnabled(): boolean {
		return localStorage.getItem("ghostMode") === "1"
	}

	set ghostDatesEnabled(value: boolean) {
		localStorage.setItem("ghostMode", value ? "1" : "0")
	}

	get weekStartsOn(): "Monday" | "Sunday" {
		const value = localStorage.getItem("weekStartsOn")
		if (value === "Monday" || value === "Sunday") {
			return value
		}
		return "Monday"
	}

	set weekStartsOn(value: "Monday" | "Sunday") {
		localStorage.setItem("weekStartsOn", value)
	}

	get currentColor(): string {
		return localStorage.getItem("currentColor") ?? MARK_COLORS[0]
	}

	set currentColor(value: string) {
		localStorage.setItem("currentColor", value)
	}

	get weekNumbersEnabled(): boolean {
		return localStorage.getItem("weekNumbersEnabled") === "1"
	}

	set weekNumbersEnabled(value: boolean) {
		localStorage.setItem("weekNumbersEnabled", value ? "1" : "0")
	}

	toggleMark(dateStr: string) {
		if (this.markedDates[dateStr]) {
			this.unsetMark(dateStr)
		} else {
			this.setMark(dateStr)
		}
	}

	unsetMark(dateStr: string) {
		delete this.markedDates[dateStr]
		this.saveMarks()
	}

	setMark(dateStr: string) {
		this.markedDates[dateStr] = this.currentColor
		this.saveMarks()
	}

	clearMarks() {
		this.markedDates = {}
		this.saveMarks()
	}

	loadMarks() {
		this.markedDates = {}

		if (this.markStorage === "localStorage") {
			this.markedDates = this.loadLocalStorageMarks()

		} else if (this.markStorage === "queryParams") {
			const urlDs = new URL(location.toString()).searchParams.get("d")
			if (urlDs == null) {
				// URL had ?d= at some point but it's gone now — fall back to localStorage.
				this.markStorage = "localStorage"
				this.markedDates = this.loadLocalStorageMarks()
				return
			}

			// Example: ?d=ccoral,20220110,20221223,cdeeppink,20200101
			const parts: string[] = urlDs.split(",")

			let currentColor = MARK_COLORS[0]
			const errors: string[] = []

			for (const part of parts) {
				const instruction = part.charAt(0)
				if (instruction === "c") {
					currentColor = part.substring(1)
				} else if (part.match(/^\d{8}$/)) {
					this.markedDates[part] = currentColor
				} else if (part !== "") {
					errors.push(part)
				}
			}

			if (errors.length > 0) {
				showOSD(`Could not parse ${errors.length} date${errors.length > 1 ? "s" : ""} from URL: ${errors.join(", ")}`)
			}

		}
	}

	saveMarks() {
		if (this.markStorage === "localStorage") {
			localStorage.setItem("marksV2", JSON.stringify(Object.entries(this.markedDates)))

		} else if (this.markStorage === "queryParams") {
			history.replaceState(null, "", this.generateLinkWithMarks())

		}
	}

	getLocalStorageMarkCount(): number {
		return Object.keys(this.loadLocalStorageMarks()).length
	}

	loadLocalStorageMarks(): Record<string, string> {
		const markedDates: Record<string, string> = {}

		const body = localStorage.getItem("marksV2")
		if (body == null) {
			return {}
		}

		const data = JSON.parse(body)
		for (const [date, color] of data) {
			markedDates[date.replace(/\D/g, "")] = color
		}

		return markedDates
	}

	generateLinkWithMarks(): string {
		const datesByColor: Record<string, string[]> = {}
		for (const [dateStr, markColor] of Object.entries(this.markedDates)) {
			(datesByColor[markColor] ?? (datesByColor[markColor] = [])).push(dateStr)
		}

		const colors: string[] = Object.keys(datesByColor)
		colors.sort()

		const parts: string[] = []
		for (const color of colors) {
			parts.push("c" + color)
			for (const dateStr of datesByColor[color].sort()) {
				parts.push(dateStr)
			}
		}

		const url = new URL(location.toString())
		url.search = "?d=" + parts.join(",")
		return url.toString()

	}

	exportMarksToText() {
		const lines: string[] = []

		for (const dateStr of Object.keys(this.markedDates)) {
			lines.push(dateStr.replace(/^(\d\d\d\d)(\d\d)(\d\d)$/, "$1-$2-$3"))
		}

		return lines.join("\n")
	}
}

abstract class DragBaseState {
	isUnmarking: boolean
	pos: {
		x: number
		y: number
	}

	protected constructor() {
		this.isUnmarking = false
		this.pos = { x: 0, y: 0 }
	}

	abstract computeDateSet(): Set<string>
}

class DragDateState extends DragBaseState {
	start: Date
	end: Date

	constructor(start: Date, end: Date) {
		super()
		this.start = start
		this.end = end
	}

	computeDateSet(): Set<string> {
		if (this.start == null || this.end == null) {
			return new Set()
		}

		const [lowerDate, higherDate] = normalizedValueOf(this.start) < normalizedValueOf(this.end)
			? [this.start, this.end] : [this.end, this.start]

		return computeDateSet(lowerDate, higherDate)
	}
}

class DragWeekState extends DragBaseState {
	start: Date
	end: Date
	endType: "date" | "week"

	constructor(start: Date, end: Date) {
		super()
		this.start = start
		this.end = end
		this.endType = "week"
	}

	computeDateSet(): Set<string> {
		if (this.start == null || this.end == null) {
			return new Set()
		}

		let lowerDate: Date
		let higherDate: Date

		if (normalizedValueOf(this.start) < normalizedValueOf(this.end)) {
			lowerDate = this.start
			higherDate = this.endType === "week" ? dateAddDays(this.end, 6): this.end
		} else {
			lowerDate = this.end
			higherDate = dateAddDays(this.start, 6)
		}

		return computeDateSet(lowerDate, higherDate)
	}
}

function computeDateSet(lowerDate: Date, higherDate: Date) {
	const d = new Date(lowerDate)

	const dateSet: Set<string> = new Set()
	while (!isSameDate(d, higherDate)) {
		dateSet.add(dateToBasicIso(d))
		d.setDate(d.getDate() + 1)
	}

	dateSet.add(dateToBasicIso(higherDate))
	return dateSet
}

// ---- SVG icon helpers ----

const SVG_ATTRS = {
	version: "1.1",
	width: "1em",
	height: "1em",
	viewBox: "0 0 10 10",
	xmlns: "http://www.w3.org/2000/svg",
	"stroke-linecap": "round",
} as const

function infoIcon(): m.Children {
	return m("svg.i", { ...SVG_ATTRS, stroke: "currentColor", fill: "none" }, [
		m("circle", { cx: 5, cy: 5, r: 4 }),
		m("line", { x1: 5, y1: 3, x2: 5, y2: 5 }),
		m("line", { x1: 5, y1: 6.5, x2: 5, y2: 7 }),
	])
}

function clearIcon(selected: boolean): m.Children {
	return m("svg.i", { ...SVG_ATTRS, stroke: "currentColor", "stroke-width": 1 }, [
		m("line", { x1: 3, y1: 3, x2: 7, y2: 7 }),
		m("line", { x1: 3, y1: 7, x2: 7, y2: 3 }),
		selected && m("circle", { cx: 5, cy: 5, r: 4, fill: "none" }),
	])
}

function colorIcon(color: string, selected: boolean): m.Children {
	return m("svg.i", SVG_ATTRS, [
		m("circle", { cx: 5, cy: 5, r: 3, fill: color }),
		selected && m("circle", { cx: 5, cy: 5, r: 4, fill: "none", "stroke-width": 1, stroke: "currentColor" }),
	])
}

// ---- Components ----
//
// Components below take their inputs as attrs, i.e. `m(SomeView, { model })`, and must stay as
// stable module-level values. Building one per render instead, as in `m(SomeView(model))`, hands
// Mithril a new component type every redraw, so it tears down and recreates the whole page's DOM.
// Since the root's `onmousedown` triggers a redraw, that removed the element under the cursor
// between mousedown and mouseup — and the browser then never fired a `click` at all.

const CalendarPageView: m.Component = (() => {
	const model = new Model()
	let touchStartedAt: null | { time: number; scrollX: number; scrollY: number } = null

	const storageInfoView = (() => {
		let isExpanded = false
		return {
			view: (): m.Children => {
				if (model.markStorage !== "queryParams") {
					return
				}

				let localStorageUrl = ""
				let localStorageMarkCount = 0
				if (isExpanded) {
					const url = new URL(location.toString())
					url.search = ""
					localStorageUrl = url.toString()
					localStorageMarkCount = model.getLocalStorageMarkCount()
				}

				return m(".storage-info" + (isExpanded ? ".open" : ""), [
					m("a.summary", {
						href: "",
						onclick: (event: MouseEvent) => {
							event.preventDefault()
							isExpanded = !isExpanded
						},
					}, [
						m("span", m.trust(isExpanded ? "&dtrif;" : "&rtrif;")),
						infoIcon(),
						m("span", "Marks stored in URL"),
					]),
					isExpanded && [
						m("p", "All marked dates are stored in the URL, which can be copied to share/save elsewhere."),
						m("p", [
							"Instead of the URL, marks can be saved to your local storage. ",
							localStorageMarkCount > 0
								? `You already have ${localStorageMarkCount} date${localStorageMarkCount > 1 ? "s" : ""} marked there.`
								: "You don't have any dates marked in your local storage yet though.",
							" ",
							m("a", { href: localStorageUrl }, "Click here to switch to local storage"),
							".",
						]),
					],
				])
			},
		}
	})()

	function onMouseDown(event: MouseEvent) {
		if (event.buttons !== 1) return

		const el = event.target as HTMLElement
		let d

		if (el.dataset.date && (d = parseDate(el.dataset.date)) != null) {
			model.dragState = new DragDateState(d, d)
			model.dragState.isUnmarking = model.markedDates[dateToBasicIso(d)] === model.currentColor
			model.dragState.pos = { x: event.clientX, y: event.clientY }
			event.preventDefault()
		}

		if (el.dataset.weekStart && (d = parseDate(el.dataset.weekStart)) != null) {
			model.dragState = new DragWeekState(d, d)
			model.dragState.isUnmarking = model.markedDates[dateToBasicIso(d)] === model.currentColor
			model.dragState.pos = { x: event.clientX, y: event.clientY }
			event.preventDefault()
		}
	}

	function onMouseMove(event: MouseEvent) {
		if (model.dragState == null) return

		const el = event.target as HTMLElement
		if (model.dragState instanceof DragDateState) {
			if (el.dataset.date != null) {
				const d = parseDate(el.dataset.date)
				if (d != null) model.dragState.end = d
			}
		} else if (model.dragState instanceof DragWeekState) {
			if (el.dataset.weekStart != null) {
				const d = parseDate(el.dataset.weekStart)
				if (d != null) model.dragState.end = d
				model.dragState.endType = "week"
			} else if (el.dataset.date != null) {
				const d = parseDate(el.dataset.date)
				if (d != null) model.dragState.end = d
				model.dragState.endType = "date"
			}
		}

		model.dragState.pos = { x: event.clientX, y: event.clientY }
	}

	function onMouseUp(event: MouseEvent) {
		if (model.dragState == null) return
		for (const d of model.dragState.computeDateSet()) {
			if (model.dragState.isUnmarking) {
				model.unsetMark(d)
			} else {
				model.setMark(d)
			}
		}
		model.dragState = null
		event.preventDefault()
	}

	function onContextMenu(event: MouseEvent) {
		if (model.dragState != null) {
			model.dragState = null
			event.preventDefault()
			return
		}
		const el = event.target as HTMLElement
		if (el.dataset.date == null || event.shiftKey) return
		event.preventDefault()
		const d = parseDate(el.dataset.date)
		if (d == null) return

		if (isSameDate(model.contextMenu?.date ?? null, d)) {
			model.contextMenu = null
		} else {
			const tdRect = el.getBoundingClientRect()
			model.contextMenu = { date: d, top: tdRect.bottom + window.scrollY, left: tdRect.left + window.scrollX }
		}
	}

	function hotkeyHandler(event: KeyboardEvent) {
		if ((event.target as HTMLElement).matches("input:not([type='checkbox']), textarea") && event.key !== "Escape") return
		if (event.ctrlKey || event.metaKey || event.altKey) return

		switch (event.key) {
			case "?": model.isHelpVisible = !model.isHelpVisible; break
			case "t": model.goToDate(new Date()); break
			case "g": model.promptGoToDate(); break
			case "n": model.goToYear("+1"); break
			case "p": model.goToYear("-1"); break
			case "N": model.goToYear("+5"); break
			case "P": model.goToYear("-5"); break
			case "1": case "2": case "3": case "4":
				model.currentColor = MARK_COLORS[parseInt(event.key, 10) - 1]
				model.colorChangedByHotkeyAt = Date.now()
				setTimeout(m.redraw, 3000)
				break
			case "Escape":
				model.isHelpVisible = false
				model.contextMenu = model.dragState = null
				break
		}

		m.redraw()
	}

	return {
		oncreate: () => { document.body.addEventListener("keydown", hotkeyHandler) },
		onremove: () => { document.body.removeEventListener("keydown", hotkeyHandler) },
		view: (): m.Children => {
			return m("div", {
				class: model.ghostDatesEnabled ? "ghosts" : undefined,
				style: {
					margin: "0 auto",
					maxWidth: "1100px",
				},
				onmousedown: onMouseDown,
				...(model.dragState == null ? {} : { onmousemove: onMouseMove, onmouseup: onMouseUp }),
				oncontextmenu: onContextMenu,
				ontouchstart: (event: TouchEvent) => {
					if ((event.target as HTMLElement).dataset.date != null) {
						touchStartedAt = { time: Date.now(), scrollX: window.scrollX, scrollY: window.scrollY }
					}
				},
				ontouchend: (event: TouchEvent) => {
					const dateStr = (event.target as HTMLElement).dataset.date
					if (dateStr != null
						&& touchStartedAt != null
						&& Date.now() - touchStartedAt.time < 200
						&& Math.abs(window.scrollX - touchStartedAt.scrollX) < 3
						&& Math.abs(window.scrollY - touchStartedAt.scrollY) < 3
					) {
						model.toggleMark(dateStr)
					}
				},
			}, [
				m(TitleView),
				m(TopToolbarView, { model }),
				m(CalendarView, { year: model.currentYear, model }),
				m(AdditionalCalendarsView, { model }),
				m(FooterView),
				m(ContextMenuView, { model }),
				model.dragState != null && m(DragDatePeriodView, { dragState: model.dragState }),
				model.isHelpVisible && m(HelpDialogView),
				m(storageInfoView),
				Date.now() - model.colorChangedByHotkeyAt < 3000 && m(ColorChangeOSDView, { model }),
			])
		},
	}
})()

const TitleView = {
	view: (): m.Children => [
		m("h1", "Just a Calendar."),
		m("p.center", ["🎉 ", m.trust(dateToHumanReadable(new Date())), "."]),
	],
}

const TopToolbarView: m.ClosureComponent<{ model: Model }> = () => {
	return {
		view: ({ attrs: { model } }) => m("p.controls.toolbar", [
			m("button", { onclick() { model.goToYear("-1") } }, m.trust("&minus;1")),
			m("input.year-input", {
				id: "year-input",
				type: "number",
				value: model.currentYear,
				onchange(event: InputEvent) {
					model.goToYear((event.target as HTMLInputElement).valueAsNumber)
				},
			}),
			m("button", { onclick() { model.goToYear("+1") } }, "+1"),
			m("button", { onclick() { model.goToDate(new Date()) } }, [m("u", "T"), "oday"]),
			m("button", { onclick() { model.promptGoToDate() } }, [m("u", "G"), "o to date"]),
			m("span.toolbar-sep"),
			m(MarkColorInput, {
				value: model.currentColor,
				onNewValue: (value: string) => { model.currentColor = value },
				includeClear: false,
				hideLabel: true,
			}),
			m("select", {
				class: "toolbar-select",
				value: model.weekStartsOn,
				onchange(event: Event) {
					model.weekStartsOn = (event.target as HTMLSelectElement).value === "Monday" ? "Monday" : "Sunday"
				},
			}, [
				m("option", { value: "Sunday" }, "Starts Sun"),
				m("option", { value: "Monday" }, "Starts Mon"),
			]),
			m("label.toolbar-opt", [
				m("input", {
					type: "checkbox",
					checked: model.weekNumbersEnabled,
					onchange(event: Event) {
						model.weekNumbersEnabled = (event.target as HTMLInputElement).checked
					},
				}),
				" Week numbers",
			]),
			m("label.toolbar-opt", [
				m("input", {
					type: "checkbox",
					checked: model.ghostDatesEnabled,
					onchange(event: Event) {
						model.ghostDatesEnabled = (event.target as HTMLInputElement).checked
					},
				}),
				" Surrounding dates",
			]),
		]),
	}
}

const CalendarView: m.ClosureComponent<{ year: number, model: Model }> = () => {
	return {
		view: ({ attrs: { year, model } }): m.Children => {
			const children = []
			for (let i = 0; i < 12; ++i) {
				children.push(m(MonthTableView, { year, month: i, model }))
			}
			return [m("h2", ["Year ", year]), m(".calendar", children)]
		},
	}
}

const AdditionalCalendarsView: m.ClosureComponent<{ model: Model }> = () => {
	return {
		view: ({ attrs: { model } }): m.Children => {
			const { currentYear, additionalCalendarCount } = model
			const calendarViews = []
			for (let i = 0; i < additionalCalendarCount; ++i) {
				calendarViews.push(m("hr"), m(CalendarView, { year: currentYear + i + 1, model }))
			}
			return [
				calendarViews,
				m("p.controls", m("button", {
					onclick() { ++model.additionalCalendarCount },
				}, `Show ${currentYear + additionalCalendarCount + 1} Calendar here`)),
			]
		},
	}
}

// Renders a single month.
const MonthTableView: m.ClosureComponent<{ year: number, month: number, model: Model }> = () => {
	return {
		view: ({ attrs: { year, month, model } }): m.Children => {
			const { markedDates, contextMenu } = model

			const weekdayNamesInOrder = [
				...WEEKDAYS.slice(WEEKDAYS.indexOf(model.weekStartsOn)),
				...WEEKDAYS.slice(0, WEEKDAYS.indexOf(model.weekStartsOn)),
			]
			const weekdayNumbersInOrder = weekdayNamesInOrder.map((name: string) => WEEKDAYS.indexOf(name))

			const weekRows = []
			const today = new Date()

			// Which column of a displayed row holds its Thursday, which is the day that decides
			// the row's ISO week number. Depends on whether weeks are shown Monday- or Sunday-first.
			const thursdayOffset = (WEEKDAYS.indexOf("Thursday") - weekdayNumbersInOrder[0] + 7) % 7

			const date = new Date(year, month, 1)
			date.setDate(1 + weekdayNumbersInOrder[0] - (date.getDay() || 7))
			const dragDates: Set<string> = model.dragState == null ? new Set() : model.dragState.computeDateSet()

			for (let rowNum = 0; rowNum < 6; ++rowNum) {
				const row = []
				if (model.weekNumbersEnabled) {
					row.push(m("th.week-num", {
						"data-week-start": dateToBasicIso(date),
						class: date.getMonth() === month ? undefined : "diff-month",
					}, computeWeekNumber(dateAddDays(date, thursdayOffset))))
				}
				for (let colNum = 0; colNum < 7; ++colNum) {
					const dateStr = dateToBasicIso(date)
					row.push(m("td.date", {
						"data-date": dateStr,
						class: [
							date.getMonth() === month ? "" : "diff-month",
							isWeekend(date) ? "weekend" : "",
							isSameDate(date, today) ? "today" : "",
							(model.dragState instanceof DragDateState || model.dragState instanceof DragWeekState)
								&& isSameDate(date, model.dragState.start)
								&& dragDates.size > 1
								? "drag-start" : "",
							dragDates.has(dateStr)
								? (model.dragState?.isUnmarking ? "" : `mark mark-${model.currentColor}`)
								: (markedDates[dateStr] ? `mark mark-${markedDates[dateStr]}` : ""),
							isSameDate(date, contextMenu?.date ?? null) ? "has-cmenu" : "",
						].join(" ").trim() || undefined,
					}, date.getDate()))
					date.setDate(date.getDate() + 1)
				}
				weekRows.push(m("tr", row))
			}

			return m("table.month", [
				m("thead", [
					m("tr", m("th", { colspan: model.weekNumbersEnabled ? 8 : 7 }, `${MONTHS[month]} ${year}`)),
					m("tr", [
						model.weekNumbersEnabled && m("th", m("code", "W#")),
						weekdayNamesInOrder.map((day) => m("th", m("code", day.slice(0, 2)))),
					]),
				]),
				m("tbody", weekRows),
			])
		},
	}
}

const FooterView = {
	view: () => m("footer", [
		m("p", [
			"Hit ",
			m("kbd", "?"),
			" for help. ",
			!navigator.onLine && "Working offline. ",
			m("a", { href: "https://www.buymeacoffee.com/sharat87" }, "Support Just A Calendar ❤️"),
			".",
		]),
		m("p", [
			m.trust("&copy; 2018&ndash;2026 &mdash; "),
			m("a", { href: "https://sharats.me", target: "_blank" }, "Shri"),
			". Source on ",
			m("a", { href: "https://github.com/sharat87/just-a-calendar", target: "_blank" }, "GitHub"),
			".",
		]),
	]),
}

const ContextMenuView: m.ClosureComponent<{ model: Model }> = () => {
	return {
		view: ({ attrs: { model } }): m.Children => {
			if (model.contextMenu == null) return null

			const date = model.contextMenu.date
			const dateStrings = [
				formatDate(date, "%Y-%m-%d"),
				formatDate(date, "%m/%d/%Y"),
				formatDate(date, "%d-%M-%Y"),
			]
			const localFormat = date.toLocaleDateString()
			if (!dateStrings.includes(localFormat)) {
				dateStrings.push(localFormat)
			}

			return m(".cmenu.popup.show", {
				style: {
					top: model.contextMenu.top + "px",
					left: model.contextMenu.left + "px",
				},
			},
				m(MarkColorInput, {
					value: model.markedDates[dateToBasicIso(date)] ?? "",
					onNewValue: (value: string) => {
						if (value === "") {
							delete model.markedDates[dateToBasicIso(date)]
						} else {
							model.markedDates[dateToBasicIso(date)] = value
						}
						model.saveMarks()
						model.contextMenu = null
					},
					includeClear: true,
				}),
				dateStrings.map((ds: string) => m("a", {
					href: "#",
					onclick(event: MouseEvent) {
						event.preventDefault()
						copyText(ds).then(() => showOSD(`Copied "${ds}" to clipboard`))
						model.contextMenu = null
					},
				}, "Copy " + ds)),
				m("a", {
					href: "#",
					onclick(event: MouseEvent) {
						event.preventDefault()
						model.contextMenu = null
					},
				}, "Close"),
			)
		},
	}
}

const DragDatePeriodView: m.ClosureComponent<{ dragState: DragBaseState }> = () => {
	return {
		view: ({ attrs: { dragState } }): m.Children => {
			const dayCount = dragState.computeDateSet().size
			if (dayCount < 2) return null

			const { weeks } = computeMessagesForDayCount(dayCount)
			const isBackwards =
				(dragState instanceof DragDateState || dragState instanceof DragWeekState)
				&& dragState.start.valueOf() > dragState.end.valueOf()

			return m("ul.drag-date-period", {
				class: isBackwards ? "up" : undefined,
				style: { top: dragState.pos.y + "px", left: dragState.pos.x + "px" },
			}, [
				m("li", [dayCount, " day", dayCount > 1 && "s"]),
				weeks != null && m("li", [weeks, " week", weeks !== "1" && "s"]),
			])
		},
	}
}

const HelpDialogView = {
	view: () => m(".help-dialog.dialog", [
		m("h1", "Hotkeys"),
		m("table", [
			m("thead", m("tr", [m("th", "Keys"), m("th", "Action")])),
			m("tbody", [
				m("tr", [m("td", m("code", "?")), m("td", "Toggle this help popup")]),
				m("tr", [m("td", m("code", "g")), m("td", "Go to a given date")]),
				m("tr", [m("td", m("code", "n")), m("td", "Go to the next year")]),
				m("tr", [m("td", m("code", "N")), m("td", "Go 5 years forward")]),
				m("tr", [m("td", m("code", "p")), m("td", "Go to the previous year")]),
				m("tr", [m("td", m("code", "P")), m("td", "Go 5 years back")]),
				m("tr", [m("td", m("code", "1-4")), m("td", "Switch mark colors")]),
			]),
		]),
	]),
}

let markColorInputCount = 0

type MarkColorInputAttrs = {
	value: string
	onNewValue: (value: string) => void
	includeClear: boolean
	hideLabel?: boolean
}

const MarkColorInput: m.ClosureComponent<MarkColorInputAttrs> = () => {
	const name = `mark-color-${++markColorInputCount}`

	return {
		view: ({ attrs: { value, onNewValue, includeClear, hideLabel } }) => m("span.color-selector", [
			!hideLabel && m("span", "Mark color: "),
			includeClear && m("label", { title: "Clear" }, [
				m("input", {
					type: "radio",
					name,
					value: "",
					checked: value === "",
					onchange() { onNewValue("") },
				}),
				clearIcon(value === ""),
			]),
			MARK_COLORS.map((color) => m("label", [
				m("input", {
					type: "radio",
					name,
					value: color,
					checked: value === color,
					onchange() { onNewValue(color) },
				}),
				colorIcon(color, value === color),
			])),
		]),
	}
}

const ColorChangeOSDView: m.ClosureComponent<{ model: Model }> = () => {
	return {
		view: ({ attrs: { model } }): m.Children => m(".color-change-osd", [
			m(MarkColorInput, {
				value: model.currentColor,
				onNewValue: (value: string) => { model.currentColor = value },
				includeClear: false,
			}),
		]),
	}
}

function isWeekend(date: Date): boolean {
	const day = date.getDay()
	return day === 0 || day === 6
}

function isSameDate(d1: null | Date, d2: null | Date): boolean {
	return d1 != null
		&& d2 != null
		&& d1.getDate() === d2.getDate()
		&& d1.getMonth() === d2.getMonth()
		&& d1.getFullYear() === d2.getFullYear()
}

function dateToBasicIso(date: null | Date): string {
	return date == null ? "" : `${date.getFullYear()}${pad(1 + date.getMonth(), 2)}${pad(date.getDate(), 2)}`
}

function dateToHumanReadable(date: null | Date): string {
	return date == null ? "" : `${WEEKDAYS[date.getDay()]}, ${date.getDate()}<sup>${ordinalSuffix(date.getDate())}</sup> of ${MONTHS[date.getMonth()]}, ${date.getFullYear()}`
}

function ordinalSuffix(n: number): string {
	// This only works for numbers under 100, which is all we need.
	const lastDigit = n % 10

	if (n != 11 && n != 12 && n != 13 && lastDigit > 0 && lastDigit < 4) {
		return ["st", "nd", "rd"][lastDigit - 1]
	}

	return "th"
}

function pad(n: number | string, len: number): string {
	let str = n.toString()
	while (str.length < len) {
		str = "0" + str
	}
	return str
}

function parseDate(dateStr: string): null | Date {
	dateStr = dateStr.toLowerCase()

	let d
	if (dateStr === "today" || dateStr === "now") {
		d = new Date()
	} else if (dateStr.match(/^\d{8}$/)) {
		d = new Date(
			parseInt(dateStr.slice(0, 4), 10),
			parseInt(dateStr.slice(4, 6), 10) - 1,
			parseInt(dateStr.slice(6), 10),
		)
	} else {
		d = new Date(dateStr.replace(/-/g, ' '))
	}

	return isNaN(d.getTime()) ? null : d
}

function formatDate(date: Date, format: string): string {
	return format.replace(/%(.)/g, (match: string, code: string): string => {
		switch (code) {
			case "d":
				return pad(date.getDate(), 2)
			case "m":
				return pad(date.getMonth() + 1, 2)
			case "M":
				return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]
			case "Y":
				return pad(date.getFullYear(), 4)
		}
		return match
	})
}

function computeWeekNumber(date: Date): number {
	// Ref: <https://en.wikipedia.org/wiki/ISO_week_date>. Weeks run Monday–Sunday, and week 1 is
	// whichever one holds the year's first Thursday. So a week belongs to the year its *Thursday*
	// falls in, and that Thursday alone decides both the number and the year it counts against —
	// which is how a year ends up with a 53rd week, and how the days either side of New Year land
	// in a week belonging to the neighbouring year.
	//
	// Counting from the Thursday (rather than from Jan 1st) is what keeps this right: weeks are
	// only whole multiples of 7 days apart from each other, not from Jan 1st.
	const thursday = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
	thursday.setUTCDate(thursday.getUTCDate() + 4 - (thursday.getUTCDay() || 7))

	// In UTC throughout, so a DST transition can't make a whole number of days come out as 6.96.
	const firstJan = Date.UTC(thursday.getUTCFullYear(), 0, 1)
	const dayOfYear = (thursday.valueOf() - firstJan) / (24 * 60 * 60 * 1000)

	return Math.ceil((dayOfYear + 1) / 7)
}

function computeMessagesForDayCount(days: number): { weeks: null | string } {
	let weeks = null
	if (days >= 7) {
		const fullWeeks = Math.floor(days / 7)
		const remainingDays = days % 7
		if (remainingDays === 3 || remainingDays === 4) {
			weeks = fullWeeks + "½"
		} else if (remainingDays > 4) {
			weeks = "<" + (fullWeeks + 1)
		} else if (remainingDays === 0) {
			weeks = fullWeeks.toString()
		} else {
			weeks = ">" + fullWeeks
		}
	}

	return {
		weeks,
	}
}

function normalizedValueOf(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).valueOf()
}

function dateAddDays(d: Date, delta: number): Date {
	const d2 = new Date(d)
	d2.setDate(d2.getDate() + delta)
	return d2
}

function copyText(text: string): Promise<void> {
	return navigator.clipboard.writeText(text)
		.catch((reason) => alert("Error copying text: " + reason))
}

function showOSD(content: string) {
	const osd = document.createElement("div")
	osd.className = "osd"
	osd.innerText = content
	document.body.append(osd)
	setTimeout(() => osd.remove(), 3000)
}

export function downloadText(text: string, filename = "dates.txt"): void {
	const el = document.createElement("a")
	el.style.display = "none"
	el.setAttribute("download", filename)
	el.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text))
	document.body.append(el)
	el.click()
	el.remove()
}

function flash(selector: string): void {
	const el = document.querySelector(selector)
	if (el == null) {
		return
	}
	el.scrollIntoView({ block: "center" })
	el.addEventListener("animationend", clear)
	el.classList.add("flash")
	function clear() {
		el?.classList.remove("flash")
		el?.removeEventListener("animationend", clear)
	}
}
