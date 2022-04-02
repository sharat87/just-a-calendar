import m from "mithril"

const MONTHS = "January February March April May June July August September October November December".split(" ")
const WEEKDAYS = "Sunday Monday Tuesday Wednesday Thursday Friday Saturday".split(" ")

const MARK_COLORS = ["coral", "deeppink", "green", "purple"]

window.addEventListener("load", main)

function main() {
	const root = document.createElement("div")
	root.id = "root"
	document.body.insertAdjacentElement("afterbegin", root)
	m.mount(root, RootView)
}

class Model {
	currentYear: number
	markedDates: Record<string, string>
	dragState: null | DragBaseState
	additionalCalendarCount: number
	contextMenu: null | { date: Date, top: number, left: number }
	isHelpVisible: boolean
	optionsViewPos: null | {
		top: number
		right: number
	}

	constructor() {
		this.currentYear = 0
		this.markedDates = {}
		this.dragState = null
		this.loadMarks()
		this.additionalCalendarCount = 0
		this.contextMenu = null
		this.isHelpVisible = false
		this.optionsViewPos = null

		const now = new Date()
		this.goToYear(now.getFullYear())
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
		this.currentYear = date.getFullYear()
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
		const body = localStorage.getItem("marksV2")
		if (body == null) {
			return
		}
		const data = JSON.parse(body)
		for (const [date, color] of data) {
			this.markedDates[date.replace(/\D/g, "")] = color
		}
	}

	saveMarks() {
		localStorage.setItem("marksV2", JSON.stringify(Object.entries(this.markedDates)))
	}

	prepareAndPrint() {
		const styleEl = document.createElement("style")
		document.body.appendChild(styleEl)
		setTimeout(styleEl.remove.bind(styleEl), 1000)
		setTimeout(window.print, 10)
	}
}

abstract class DragBaseState {
	isUnmarking: boolean
	pos: {
		x: number
		y: number
	}

	constructor() {
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
		const [lowerDate, higherDate] = this.start.valueOf() < this.end.valueOf() ? [this.start, this.end] : [this.end, this.start]
		const d = new Date(lowerDate)

		const dateSet: Set<string> = new Set()
		while (!isSameDate(d, higherDate)) {
			dateSet.add(dateToBasicIso(d))
			d.setDate(d.getDate() + 1)
		}

		dateSet.add(dateToBasicIso(higherDate))
		return dateSet
	}
}

class DragWeekState extends DragBaseState {
	start: Date
	startType: "date" | "week"
	end: Date
	endType: "date" | "week"

	constructor(start: Date, end: Date) {
		super()
		this.start = start
		this.end = end
		this.startType = this.endType = "week"
	}

	computeDateSet(): Set<string> {
		if (this.start == null || this.end == null) {
			return new Set()
		}

		let lowerDate: Date
		let higherDate: Date

		if (this.start.valueOf() < this.end.valueOf()) {
			lowerDate = this.start
			higherDate = this.endType === "week" ? dateAddDays(this.end, 6): this.end
		} else {
			lowerDate = this.end
			higherDate = dateAddDays(this.start, 6)
		}

		const d = new Date(lowerDate)

		const dateSet: Set<string> = new Set()
		while (!isSameDate(d, higherDate)) {
			dateSet.add(dateToBasicIso(d))
			d.setDate(d.getDate() + 1)
		}

		dateSet.add(dateToBasicIso(higherDate))
		return dateSet
	}
}

class RootView {
	model: Model

	constructor() {
		this.model = new Model()
		this.onMouseDown = this.onMouseDown.bind(this)
		this.onContextMenu = this.onContextMenu.bind(this)
		this.hotkeyHandler = this.hotkeyHandler.bind(this)
	}

	oncreate() {
		document.body.addEventListener("keydown", this.hotkeyHandler)
	}

	onremove() {
		document.body.removeEventListener("keydown", this.hotkeyHandler)
	}

	view() {
		return m(
			"div",
			{
				class: this.model.ghostDatesEnabled ? "ghosts" : undefined,
				onmousedown: this.onMouseDown,
				onmousemove: (event: MouseEvent) => {
					const el = event.target as HTMLElement
					// Bind this dynamically, only if dragging is in progress.
					if (this.model.dragState == null) {
						return
					}
					if (this.model.dragState instanceof DragDateState) {
						if (el.dataset.date != null) {
							const d = parseDate(el.dataset.date)
							if (d != null) {
								this.model.dragState.end = d
							}
						}
					} else if (this.model.dragState instanceof DragWeekState) {
						if (el.dataset.weekStart != null) {
							const d = parseDate(el.dataset.weekStart)
							if (d != null) {
								this.model.dragState.end = d
							}
							this.model.dragState.endType = "week"
						} else if (el.dataset.date != null) {
							const d = parseDate(el.dataset.date)
							if (d != null) {
								this.model.dragState.end = d
							}
							this.model.dragState.endType = "date"
						}
					}
					this.model.dragState.pos = {
						x: event.clientX,
						y: event.clientY,
					}
				},
				onmouseup: (event: MouseEvent) => {
					// Bind this dynamically, only if dragging is in progress.
					if (this.model.dragState == null) {
						return
					}
					const el = event.target as HTMLElement
					for (const d of this.model.dragState.computeDateSet()) {
						if (this.model.dragState.isUnmarking) {
							this.model.unsetMark(d)
						} else {
							this.model.setMark(d)
						}
					}
					this.model.dragState = null
					event.preventDefault()
				},
				oncontextmenu: this.onContextMenu,
			},
			[
				m(TitleView, { currentYear: this.model.currentYear }),
				m(TopToolbarView, { model: this.model }),
				m(CalendarView, {
					year: this.model.currentYear,
					model: this.model,
				}),
				m(AdditionalCalendarsView, {
					model: this.model,
				}),
				m(FooterView),
				m(ContextMenuView, { model: this.model }),
				m(DragDatePeriodView, { model: this.model }),
				this.model.optionsViewPos != null && m(OptionsPopupView, { model: this.model }),
				this.model.isHelpVisible && m(HelpPopupView),
			],
		)
	}

	private onMouseDown(event: MouseEvent) {
		if (event.buttons !== 1) {
			return
		}

		const el = event.target as HTMLElement
		let d

		if (el.dataset.date && (d = parseDate(el.dataset.date)) != null) {
			d.setHours(0)
			d.setMinutes(0)
			d.setSeconds(0)
			this.model.dragState = new DragDateState(d, d)
			this.model.dragState.isUnmarking = this.model.markedDates[dateToBasicIso(d)] === this.model.currentColor,
			this.model.dragState.pos = {
				x: event.clientX,
				y: event.clientY,
			}
			event.preventDefault()
		}

		if (el.dataset.weekStart && (d = parseDate(el.dataset.weekStart)) != null) {
			d.setHours(0)
			d.setMinutes(0)
			d.setSeconds(0)
			this.model.dragState = new DragWeekState(d, d)
			this.model.dragState.isUnmarking = this.model.markedDates[dateToBasicIso(d)] === this.model.currentColor
			this.model.dragState.pos = {
				x: event.clientX,
				y: event.clientY,
			}
			event.preventDefault()
		}
	}

	private onContextMenu(event: MouseEvent) {
		if (this.model.dragState != null) {
			// If a drag is in-progress, cancel it.
			this.model.dragState = null
			event.preventDefault()
			return
		}
		const el = event.target as HTMLElement
		if (el.dataset.date == null || event.shiftKey) {
			return
		}
		event.preventDefault()
		const d = parseDate(el.dataset.date)
		if (d == null) {
			return
		}

		if (isSameDate(this.model.contextMenu?.date ?? null, d)) {
			this.model.contextMenu = null
		} else {
			const tdRect = el.getBoundingClientRect()
			this.model.contextMenu = {
				date: d,
				top: tdRect.bottom + window.scrollY,
				left: tdRect.left + window.scrollX,
			}
		}
	}

	private hotkeyHandler(event: KeyboardEvent) {
		if ((event.target as HTMLElement).matches("input:not([type='checkbox']), textarea") && event.key !== "Escape") {
			return
		}

		if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key === "p") {
			// Print hotkey.
			event.preventDefault()
			this.model.prepareAndPrint()
			return
		}

		if (event.ctrlKey || event.metaKey || event.altKey) {
			return
		}

		switch(event.key) {
			case "?":
				this.model.isHelpVisible = !this.model.isHelpVisible
				break
			case "t":
				this.model.goToDate(new Date())
				break
			case "g":
				this.model.promptGoToDate()
				break
			case "n":
				this.model.goToYear("+1")
				break
			case "p":
				this.model.goToYear("-1")
				break
			case "N":
				this.model.goToYear("+5")
				break
			case "P":
				this.model.goToYear("-5")
				break
			case "Escape":
				this.model.isHelpVisible = false
				this.model.optionsViewPos = this.model.contextMenu = this.model.dragState = null
				break
		}

		m.redraw()
	}

}

class TitleView {
	view() {
		return [
			m("h1", { class: "screen" }, "Just a Calendar."),
			m("p.center", { class: "screen" }, [m.trust(dateToHumanReadable(new Date())), "."]),
			m("h1", { class: "print" }, m.trust(`Just a Calendar &mdash; by calendar.sharats.me`)),
		]
	}
}

class TopToolbarView implements m.ClassComponent<{ model: Model }> {
	view(vnode: m.Vnode<{ model: Model }>) {
		const model = vnode.attrs.model
		return m("p.controls.screen", [
			m("button", {
				onclick() {
					model.goToYear("-5")
				},
			}, m.trust("&minus;5")),
			m("button", {
				onclick() {
					model.goToYear("-1")
				},
			}, m.trust("&minus;1")),
			m("input", {
				id: "yearInput",
				type: "number",
				value: model.currentYear,
				onchange(event: InputEvent) {
					model.currentYear = (event.target as HTMLInputElement).valueAsNumber
				},
			}),
			m("button", {
				onclick() {
					model.goToYear("+1")
				},
			}, "+1"),
			m("button", {
				onclick() {
					model.goToYear("+5")
				},
			}, "+5"),
			m("button", {
				onclick() {
					model.goToDate(new Date())
				},
			}, [m("u", "T"), "oday"]),
			m("button", {
				onclick() {
					model.promptGoToDate()
				},
			}, [m("u", "G"), "o to date"]),
			m("button", {
				style: {
					display: "flex",
					alignItems: "center",
				},
				onclick(event: MouseEvent) {
					if (model.optionsViewPos == null) {
						const { x, width, y, height } = (event.target as HTMLElement).getBoundingClientRect()
						model.optionsViewPos = { top: y + height, right: window.innerWidth - x - width }
					} else {
						model.optionsViewPos = null
					}
				},
			}, m(BurgerIcon)),
		])
	}
}

class BurgerIcon implements m.ClassComponent {
	view() {
		return m(
			"svg",
			{
				version: "1.1",
				width: "1em",
				height: "1em",
				viewBox: "0 0 10 10",
				xmlns: "http://www.w3.org/2000/svg",
				stroke: "currentColor",
				"stroke-width": 1,
			},
			[
				m("line", { x1: 1, y1: 2, x2: 9, y2: 2 }),
				m("line", { x1: 1, y1: 5, x2: 9, y2: 5 }),
				m("line", { x1: 1, y1: 8, x2: 9, y2: 8 }),
			],
		)
	}
}

class CalendarView implements m.ClassComponent<{ year: number, model: Model }> {
	view(vnode: m.Vnode<{ year: number, model: Model }>) {
		const { year, model } = vnode.attrs
		const monthTables = []

		for (let i = 0; i < 12; ++i) {
			monthTables.push(m(MonthTableView, { year, month: i, model }))
		}

		return [
			m("h2", ["Year ", year]),
			m(".calendar", monthTables),
		]
	}
}

class AdditionalCalendarsView implements m.ClassComponent<{ model: Model }> {
	view(vnode: m.Vnode<{ model: Model }>) {
		const { currentYear, additionalCalendarCount } = vnode.attrs.model
		const calendarViews = []

		for (let i = 0; i < additionalCalendarCount; ++i) {
			calendarViews.push(m("hr"), m(CalendarView, { year: currentYear + i + 1, model: vnode.attrs.model }))
		}

		return [
			calendarViews,
			m("p.controls.screen", m("button", {
				onclick() {
					++vnode.attrs.model.additionalCalendarCount
				},
			}, `Show ${currentYear + additionalCalendarCount + 1} Calendar here`)),
		]
	}
}

class MonthTableView implements m.ClassComponent<{ year: number, model: Model, month: number }> {
	view(vnode: m.Vnode<{ year: number, model: Model, month: number }>) {
		const { markedDates, currentColor, contextMenu } = vnode.attrs.model
		const { year, model, month } = vnode.attrs
		const weekendDays = [0, 6]

		const weekdayNamesInOrder = [
			...WEEKDAYS.slice(WEEKDAYS.indexOf(model.weekStartsOn)),
			...WEEKDAYS.slice(0, WEEKDAYS.indexOf(model.weekStartsOn)),
		]

		const weekdayNumbersInOrder = weekdayNamesInOrder.map((name: string) => WEEKDAYS.indexOf(name))

		const weekRows = []
		const today = new Date()

		const date = new Date(year, month, 1)
		date.setDate(1 + weekdayNumbersInOrder[0] - (date.getDay() || 7))  // Go the most recent past start-of-week.
		const dragDates: Set<string> = model.dragState == null ? new Set() : model.dragState.computeDateSet()

		for (let rowNum = 0; rowNum < 6; ++rowNum) {
			const row = []
			if (model.weekNumbersEnabled) {
				const weekNum = computeWeekNumber(date)
				row.push(m(
					"th.week-num",
					{
						"data-week-start": dateToBasicIso(date),
						class: date.getMonth() === month ? undefined : "diff-month",
					},
					weekNum,
				))
			}
			for (let colNum = 0; colNum < 7; ++colNum) {
				const dateStr: string = dateToBasicIso(date)
				row.push(m("td.date", {
					"data-date": dateStr,
					class: [
						date.getMonth() === month ? "" : "diff-month",
						isWeekend(date) ? "weekend" : "",
						isSameDate(date, today) ? "today" : "",
						(model.dragState instanceof DragDateState || model.dragState instanceof DragWeekState) && isSameDate(date, model.dragState?.start) ? "drag-start" : "",
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
	}
}

class FooterView implements m.ClassComponent {
	view() {
		return m("footer.screen", [
			m("p", [
				"Made out of pure need and frustration. Also, ",
				m("span", { style: { color: "red" } }, m.trust("&hearts;")),
				". Hit ",
				m("kbd", "?"),
				" for help.",
			]),
			m("p", [
				m.trust("&copy; 2018-2022 &mdash; "),
				m("a", { href: "https://sharats.me", target: "_blank" }, "Shrikant Sharat Kandula"),
				". Source code on ",
				m("a", { href: "https://github.com/sharat87/just-a-calendar", target: "_blank" }, "GitHub"),
				".",
			]),
		])
	}
}

class ContextMenuView implements m.ClassComponent<{ model: Model }> {
	view(vnode: m.Vnode<{ model: Model }>) {
		const { model } = vnode.attrs

		if (model.contextMenu == null) {
			return null
		}

		const date = model.contextMenu.date
		const dateStrings = [
			formatDate(date, "%Y-%m-%d"),
			formatDate(date, "%m/%d/%Y"),
			date.toLocaleDateString(),
		]

		return m(
			".cmenu.popup.show",
			{
				style: {
					top: model.contextMenu.top + "px",
					left: model.contextMenu.left + "px",
				},
			},
			dateStrings.map((ds: string) => m("a", {
				href: "#",
				onclick(event: MouseEvent) {
					event.preventDefault()
					copyText(ds)
				},
			}, "Copy " + ds)),
			m("a", {
				href: "#",
				onclick(event: MouseEvent) {
					event.preventDefault()
					model.contextMenu = null
				}
			}, "Close")
		)
	}
}

class DragDatePeriodView implements m.ClassComponent<{ model: Model }> {
	view(vnode: m.Vnode<{ model: Model }>): m.Children {
		const { model } = vnode.attrs

		if (model.dragState == null) {
			return null
		}

		const dayCount = model.dragState.computeDateSet().size
		if (dayCount < 2) {
			return null
		}

		const offset =
			(model.dragState instanceof DragDateState || model.dragState instanceof DragWeekState)
				&& model.dragState.start.valueOf() > model.dragState.end.valueOf()
			? -50 : 20

		return m(
			".drag-date-period",
			{
				style: {
					top: (model.dragState.pos.y + offset) + "px",
					left: model.dragState.pos.x + "px",
				},
			},
			[dayCount, " day", dayCount > 1 && "s"],
		)
	}
}

class HelpPopupView implements m.ClassComponent {
	view() {
		return m(".help-dialog.dialog", [
			m("h1", "Hotkeys"),
			m("table", [
				m("thead", m("tr", [
					m("th", "Keys"),
					m("th", "Action"),
				])),
				m("tbody", [
					m("tr", [
						m("td", m("code", "?")),
						m("td", "Toggle this help popup"),
					]),
					m("tr", [
						m("td", m("code", "g")),
						m("td", "Go to a given date"),
					]),
					m("tr", [
						m("td", m("code", "n")),
						m("td", "Go to the next year"),
					]),
					m("tr", [
						m("td", m("code", "N")),
						m("td", "Go 5 years forward"),
					]),
					m("tr", [
						m("td", m("code", "p")),
						m("td", "Go to the previous year"),
					]),
					m("tr", [
						m("td", m("code", "P")),
						m("td", "Go 5 years back"),
					]),
				]),
			]),
		])
	}
}

class OptionsPopupView implements m.ClassComponent<{ model: Model }> {
	view(vnode: m.Vnode<{ model: Model }>) {
		const { model } = vnode.attrs
		return m(".dialog", [
			m("h1", "Options"),
			m("p.color-selector", [
				m("span", "Mark color: "),
				MARK_COLORS.map((color) => m("label", [
					m("input", {
						type: "radio",
						value: color,
						checked: model.currentColor === color,
						onchange(event: Event) {
							model.currentColor = (event.target as HTMLInputElement).value
						},
					}),
					m("span.color", { style: { background:  color} }),
				])),
			]),
			m("p", m("label", [
				m("span", "Week starts on "),
				m("select", {
					value: model.weekStartsOn,
					onchange(event: Event) {
						model.weekStartsOn = (event.target as HTMLSelectElement).value === "Monday" ? "Monday" : "Sunday"
					},
				}, [
					m("option", { value: "Sunday" }, "Sunday"),
					m("option", { value: "Monday" }, "Monday"),
				]),
			])),
			m("p", m("label", [
				m("input", {
					type: "checkbox",
					checked: model.weekNumbersEnabled,
					onchange(event: Event) {
						model.weekNumbersEnabled = (event.target as HTMLInputElement).checked
					},
				}),
				m("span", "Show week numbers"),
			])),
			m("p", m("label", [
				m("input", {
					type: "checkbox",
					checked: model.ghostDatesEnabled,
					onchange(event: Event) {
						model.ghostDatesEnabled = (event.target as HTMLInputElement).checked
					},
				}),
				m("span", "Show surrounding dates"),
			])),
			m("button", {
				onclick() {
					if (confirm(`Are you sure? This will delete your ${Object.keys(model.markedDates).length} marks.`)) {
						model.clearMarks()
					}
				},
			}, "Delete all marks, across all years"),
			m("button", {
				class: "close-btn",
				onclick() {
					model.optionsViewPos = null
				},
			}, m.trust("&times;")),
		])
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

	if (n != 11 && n != 12 && n != 13 && lastDigit < 4) {
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

	return isNaN(d.getTime()) ? null : new Date(d.getTime() - d.getTimezoneOffset() * 60000)
}

function formatDate(date: Date, format: string): string {
	if (format === "ISO") {
		format = "%Y-%m-%d"
	}

	return format.replace(/%(.)/g, (match: string, code: string): string => {
		switch(code) {
			case "a":
				return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"][date.getDay()]
			case "A":
				return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][date.getDay()]
			case "w":
				return date.getDay().toString()
			case "d":
				return pad(date.getUTCDate(), 2)
			case "m":
				return pad(date.getUTCMonth() + 1, 2)
			case "Y":
				return pad(date.getUTCFullYear(), 4)
		}
		return match
	})
}

function computeWeekNumber(date: Date): number {
	// Ref: <https://en.wikipedia.org/wiki/ISO_week_date>.
	const firstJan = new Date(date)
	firstJan.setDate(1)
	firstJan.setMonth(0)

	if (date.getMonth() === 11 /* December */ && date.getDate() > 28 /* Too few days of this year in this week */) {
		// Here, we use the week number of the upcoming first Jan.
		return computeWeekNumber(new Date(firstJan.getFullYear() + 1, 0, 1))
	}

	const dayCount = (date.valueOf() - firstJan.valueOf()) / (24 * 60 * 60 * 1000)
	return (![0, 5, 6].includes(firstJan.getDay()) ? 1 : 0) + Math.ceil(dayCount / 7)
}

function computePeriod(start: Date, end: Date): { days: number } {
	start = resetTimeInDate(start)
	end = resetTimeInDate(end)
	const periodMillis = Math.abs(start.valueOf() - end.valueOf())
	const days = 1 + Math.ceil(periodMillis / (24 * 60 * 60 * 1000))
	return {
		days,
	}
}

function isDateBetween(date: Date, left: null | Date, right: null | Date): boolean {
	if (left == null || right == null) {
		return false
	}
	if (left.valueOf() > right.valueOf()) {
		[left, right] = [right, left]
	}
	left = resetTimeInDate(left)
	right = resetTimeInDate(right)
	date = resetTimeInDate(date)
	return date.valueOf() >= left.valueOf() && date.valueOf() <= right.valueOf()
}

function resetTimeInDate(date: Date): Date {
	date = new Date(date)
	date.setHours(12)
	date.setMinutes(0)
	date.setSeconds(0)
	return date
}

function* iterateDates(start: null | Date, end: null | Date) {
	if (start == null || end == null) {
		return
	}
	if (start.valueOf() > end.valueOf()) {
		[start, end] = [end, start]
	}
	const d = new Date(start)
	while (!isSameDate(d, end)) {
		yield d
		d.setDate(d.getDate() + 1)
	}
	yield end
}

function dateAddDays(d: Date, delta: number): Date {
	const d2 = new Date(d)
	d2.setDate(d2.getDate() + delta)
	return d2
}

function copyText(text: string): void {
	const el = document.createElement("textarea")
	el.style.position = "fixed"
	el.style.opacity = el.style.top = el.style.left = "0"
	el.style.pointerEvents = "none"
	document.body.append(el)
	el.value = text
	el.select()
	document.execCommand("copy")
	el.remove()
}

function flash(selector: string): void {
	const el = document.querySelector(selector)
	if (el == null) {
		return
	}
	el.scrollIntoView({ block: "center" })
}
