import m from "mithril"

const Model = {
	isTicking: false,
	hoursHandAngle: 0,
	minutesHandAngle: 0,
	secondsHandAngle: 0,
}

function tick() {
	if (Model.isTicking) {
		requestAnimationFrame(tick)
	}

	const now = new Date()

	const seconds = now.getSeconds() + now.getMilliseconds() / 1000
	const minutes = now.getMinutes() + seconds / 60
	const hours = now.getHours() + minutes / 60

	Model.hoursHandAngle = hours * 30
	Model.minutesHandAngle = minutes * 6
	Model.secondsHandAngle = seconds * 6

	m.redraw()
}

export default class ClockPageView implements m.ClassComponent {
	oninit() {
		Model.isTicking = true
		tick()
	}

	onremove() {
		Model.isTicking = false
	}

	view(): m.Children {
		return [
			m(ClockView),
			m(SmallCalendarView),
		]
	}
}

class ClockView implements m.ClassComponent {
	view(): m.Children {
		const hourMarks = []
		for (let i = 0; i < 12; i++) {
			hourMarks.push(m("line", {
				x1: 50,
				y1: 3,
				x2: 50,
				y2: 5.5,
				stroke: "currentColor",
				"stroke-width": .8,
				transform: `rotate(${i * 30})`,
				"transform-origin": "center center",
			}))
		}

		const minuteMarks = []
		for (let i = 0; i < 60; i++) {
			minuteMarks.push(m("line", {
				x1: 50,
				y1: 3,
				x2: 50,
				y2: 4.5,
				stroke: "currentColor",
				"stroke-width": .4,
				transform: `rotate(${i * 6})`,
				"transform-origin": "center center",
			}))
		}

		return [
			m("svg", {
				version: "1.1",
				width: "300",
				height: "300",
				viewBox: "0 0 100 100",
				xmlns: "http://www.w3.org/2000/svg",
			}, [
				m("circle", {
					cx: "50",
					cy: "50",
					r: "47",
					fill: "none",
					stroke: "currentColor",
					"stroke-width": 1,
				}),
				...hourMarks,
				...minuteMarks,
				// Hours hand.
				m("line", {
					x1: 50,
					y1: 50,
					x2: 50,
					y2: 25,
					stroke: "currentColor",
					"stroke-width": 1,
					transform: `rotate(${Model.hoursHandAngle})`,
					"transform-origin": "center center",
				}),
				// Minutes hand.
				m("line", {
					x1: 50,
					y1: 50,
					x2: 50,
					y2: 14,
					stroke: "currentColor",
					"stroke-width": .7,
					transform: `rotate(${Model.minutesHandAngle})`,
					"transform-origin": "center center",
				}),
				// Seconds hand.
				m("line", {
					x1: 50,
					y1: 55,
					x2: 50,
					y2: 10,
					stroke: "currentColor",
					"stroke-width": .3,
					transform: `rotate(${Model.secondsHandAngle})`,
					"transform-origin": "center center",
				}),
				// Central dot
				m("circle", {
					cx: 50,
					cy: 50,
					r: 1,
					fill: "currentColor",
					stroke: "none",
				}),
			]),
		]
	}
}

class SmallCalendarView implements m.ClassComponent {
	view(): m.Children {
		const weekRows = []
		const date = new Date()

		const currentMonth = date.getMonth()
		const currentDate = date.getDate()

		date.setDate(1)  // Go to the start of the month.
		date.setDate(1 - date.getDay())  // Go the most recent past Sunday, or no change if already on a Sunday.

		while (true) {
			const row = []
			while (true) {
				row.push(m("td", {
					class: [
						date.getMonth() === currentMonth ? "" : "dull",
						date.getMonth() === currentMonth && date.getDate() === currentDate ? "active" : "",
					].join("") || undefined,
				}, date.getDate()))
				date.setDate(date.getDate() + 1)
				if (date.getDay() === 0) {
					break
				}
			}
			weekRows.push(m("tr", row))
			if (date.getMonth() !== currentMonth) {
				break
			}
		}

		return m(".small-calendar", [
			m("h2", [
				["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][currentMonth],
				" ",
				new Date().getFullYear(),
			]),
			m("table.month", [
				m("thead", m("tr", ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(s => m("th", s)))),
					m("tbody", weekRows),
			]),
		])
	}
}
