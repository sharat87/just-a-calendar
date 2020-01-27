const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
	'September', 'October', 'November', 'December'];

const Bus = {
	listeners: new Map,
	on(event, fn) {
		if (!this.listeners.has(event))
			this.listeners.set(event, []);
		this.listeners.get(event).push(fn);
	},
	emit(event, data) {
		if (this.listeners.has(event))
			for (const fn of this.listeners.get(event))
				fn(data);
	},
};

{
	// Today highlighter.
	Bus.on('fill-calendar', ({year, el}) => {
		const now = new Date;
		if (now.getUTCFullYear() !== year)
			return;
		const todayIso = isoString(now);
		const tds = el.querySelectorAll('td[data-date="' + todayIso + '"]');
		for (const td of tds)
			td.classList.add('today');
	});
}

{
	// Date marking.
	const mainEl = document.getElementById('main');
	const markedDates = new Map;

	mainEl.addEventListener('click', (event) => {
		if (!event.target.matches('td.date'))
			return;
		const tds = mainEl.querySelectorAll('td[data-date="' + event.target.dataset.date + '"]');
		const date = event.target.dataset.date;
		if (markedDates.has(date)) {
			for (const td of tds)
				td.classList.remove('mark', 'mark-' + markedDates.get(date));
			markedDates.delete(date);  // returns true/false
		} else {
			for (const td of tds)
				td.classList.add('mark', 'mark-' + ColorSelector.activeColor);
			markedDates.set(date, ColorSelector.activeColor);
		}
		saveMarks();
	});

	Bus.on('fill-calendar', ({year, el}) => {
		loadMarks();
		for (const [date, color] of markedDates) {
			const tds = mainEl.querySelectorAll('td[data-date="' + date + '"]');
			for (const td of tds)
				td.classList.add('mark', 'mark-' + color);
		}
	});

	Bus.on('clear-marks', () => {
		for (const td of mainEl.querySelectorAll('td.mark'))
			td.classList.remove('mark', 'mark-' + markedDates.get(td.dataset.date));
		markedDates.clear();
		saveMarks();
	});

	function saveMarks() {
		localStorage.marksV2 = JSON.stringify(Array.from(markedDates.entries()));
	}

	function loadMarks() {
		markedDates.clear();
		if (localStorage.marks) {
			for (const date of JSON.parse(localStorage.marks))
				markedDates.set(date, 'coral');
			localStorage.removeItem('marks');
			saveMarks();

		} else if (localStorage.marksV2) {
			for (const [date, color] of JSON.parse(localStorage.marksV2))
				markedDates.set(date, color);

		}
	}
}

const ColorSelector = (function () {
	const selector = document.getElementById('color-selector');
	let activeEl = selector.querySelector('.active');

	const cssLines = ['<style>'];
	for (const el of selector.querySelectorAll('[data-color]')) {
		cssLines.push(`.mark-${el.dataset.color} {background-color: ${el.dataset.color}}`);
	}
	document.body.insertAdjacentHTML('beforeEnd', cssLines.join('\n') + '</style>');

	selector.addEventListener('click', (event) => {
		if (!event.target.matches('.color'))
			return;

			if (activeEl)
				activeEl.classList.remove('active');

			activeEl = event.target;
			activeEl.classList.add('active');
	});

	return {
		get activeColor() {
			return activeEl.dataset.color;
		}
	};
}());

document.body.addEventListener('keydown', (event) => {
	if (event.target.matches('input, textarea') && event.key !== 'Escape')
		return;
	const key = (event.ctrlKey ? 'c-' : '') + event.key;
	switch(key) {
		case '?': toggleHelp(); break;
		case 'g': onGoToDate(); break;
		case 'n': goToYear('+1'); break;
		case 'p': goToYear('-1'); break;
		case 'N': goToYear('+10'); break;
		case 'P': goToYear('-10'); break;
		case 'C': clearAllMarks(); break;
		case 'Escape':
			document.getElementById('highlights').classList.remove('show');
			hideContextMenu();
			break;
	}
});

main();

function main() {
	document.getElementById('showNextYearBtn').addEventListener('click', onShowNextYearBtn);
	Bus.on('fill-calendar', ({year, el}) => {
		document.getElementById('showNextYearBtn').innerText = 'Show ' + (year + 1) + ' here';
	});

	goToYear(new Date().getFullYear());

	if (localStorage.darkMode) {
		const value = JSON.parse(localStorage.darkMode);
		document.getElementById('darkCheckbox').checked = value ? 'checked' : '';
	}
	onToggleDark();

	if (localStorage.ghostMode) {
		const value = JSON.parse(localStorage.ghostMode);
		document.getElementById('ghostCheckbox').checked = value ? 'checked' : '';
	}
	onToggleGhost();
}

function mkMonthTable() {
	if (typeof mkMonthTable.tpl === 'undefined') {
		const tpl = mkMonthTable.tpl = document.createElement('table');
		tpl.classList.add('month');
		tpl.innerHTML = `
			<thead>
				<tr><th colspan=7></th></tr>
				<tr>
					<th><code>Su</code></th>
					<th><code>Mo</code></th>
					<th><code>Tu</code></th>
					<th><code>We</code></th>
					<th><code>Th</code></th>
					<th><code>Fr</code></th>
					<th><code>Sa</code></th>
				</tr>
			</thead>
			<tbody></tbody>`;
	}
	return mkMonthTable.tpl.cloneNode(true);
}

function fillCalendar(root, year) {
	root.innerHTML = '';

	for (const [monthI, monthName] of MONTHS.entries()) {
		const table = mkMonthTable();
		table.querySelector('th:empty').innerHTML = `${monthName} <span class=year>${year}</span>`;
		root.appendChild(table);

		const first = mkDate(year, monthI, 1);
		const leftTop = mkDate(year, monthI, 1 - (first.getDay() || 7));

		let date = leftTop;
		for (let row = 0; row < 6; ++row) {
			const tr = document.createElement('tr');
			table.tBodies[0].appendChild(tr);
			for (let col = 0; col < 7; ++col) {
				const td = document.createElement('td');
				td.innerText = date.getDate();
				td.classList.add('date');
				if (date.getMonth() !== monthI)
					td.classList.add('diff-month');
				if (date.getDay() === 0 || date.getDay() === 6)
					td.classList.add('weekend');
				td.dataset.date = isoString(date);
				tr.appendChild(td);
				date = nextDate(date);
			}
		}
	}

	if (root.id === 'mainCalendar') {
		document.getElementById('yearTitle').innerText = year;
		for (const el of document.querySelectorAll('.calendar')) {
			if (el !== root)
				el.remove();
		}
	}

	Bus.emit('fill-calendar', {year, el: root});
}

function onShowNextYearBtn(event) {
	const nextYear = parseInt(event.target.innerText.match(/\d+/), 10);
	const parent = event.target.closest('.controls');
	parent.insertAdjacentHTML('beforeBegin', '<div class=calendar></div>');
	fillCalendar(parent.previousElementSibling, nextYear);
}

function mkDate(year, monthIndex, day) {
	return new Date(Date.UTC(year, monthIndex, day));
}

function pad(str) {
	str = str.toString();
	while (str.length < 2)
		str = '0' + str;
	return str;
}

function isoString(date) {
	return date ? `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` : '';
}

function nextDate(date) {
	return mkDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function goToYear(year) {
	const yearInputEl = document.getElementById('yearInput');
	if (typeof(year) === 'string' && (year[0] === '-' || year[0] === '+'))
		year = parseInt(yearInputEl.value, 10) + parseInt(year, 10);
	else
		year = parseInt(year, 10);
	yearInputEl.value = year;
	fillCalendar(document.getElementById('mainCalendar'), year);
}

function onToggleDark() {
	const value = document.getElementById('darkCheckbox').checked;
	if (value)
		document.body.classList.add('dark');
	else
		document.body.classList.remove('dark');
	localStorage.darkMode = JSON.stringify(value);
}

function onToggleGhost() {
	const value = document.getElementById('ghostCheckbox').checked;
	if (value)
		document.body.classList.add('ghosts');
	else
		document.body.classList.remove('ghosts');
	localStorage.ghostMode = JSON.stringify(value);
}

function onGoToDate() {
	const dateStr = prompt('Enter date (Any clearly understood format is okay):');
	if (!dateStr)
		return;
	const date = parseDate(dateStr);
	if (date)
		goToYear(date.getFullYear());
}

function parseDate(dateStr) {
	dateStr = dateStr.toLowerCase();
	let d;
	if (dateStr === 'today' | dateStr === 'now')
		d = new Date;
	else
		d = new Date(dateStr.replace(/-/g, ' '));
	return isNaN(d.getTime()) ? null : new Date(d.getTime() - d.getTimezoneOffset() * 60000);
}

function formatDate(date, format) {
	if (format === 'ISO')
		format = '%Y-%m-%d';
	return format.replace(/%(.)/g, (match, code) => {
		switch(code) {
			case 'a':
				return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'][date.getDay()];
			case 'A':
				return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'][date.getDay()];
			case 'w':
				return date.getDay();
			case 'd':
				return pad(date.getUTCDate(), 2, '0');
			case 'm':
				return pad(date.getUTCMonth() + 1, 2, '0');
			case 'Y':
				return pad(date.getUTCFullYear(), 4, '0');
		}
	});
}

function highlightSetsPopup() {
	Bus.emit('highlight-sets-popup');
}

function onCalendarContextMenu(event) {
	if (!event.target.matches('td.date') || event.shiftKey)
		return;
	event.preventDefault();

	const cmenu = document.getElementById('cmenu');

	const date = new Date(event.target.dataset.date);
	const dateStrings = [
		formatDate(date, '%Y-%m-%d'),
		formatDate(date, '%m/%d/%Y'),
	];
	cmenu.innerHTML = dateStrings.map((d) => {
		return '<a href=#>Copy ' + d + '</a>';
	}).join('') + '<a href=#>Close [ESC]</a>';

	const tdRect = event.target.getBoundingClientRect();
	const bodyRect = document.body.getBoundingClientRect();

	cmenu.classList.add('show');
	cmenu.style.top = (tdRect.y - bodyRect.y + tdRect.height) + 'px';
	cmenu.style.left = tdRect.x + 'px';

	event.target.classList.add('has-cmenu');
}

function onCmenuClick(event) {
	if (event.target.tagName !== 'A')
		return;
	event.preventDefault();
	const text = event.target.innerText;
	if (text.startsWith('Copy '))
		copyTextToClipboard(text.replace('Copy ', ''));
	hideContextMenu();
}

function hideContextMenu() {
	cmenu.classList.remove('show');
	for (const el of document.querySelectorAll('.has-cmenu'))
		el.classList.remove('has-cmenu');
}

function copyTextToClipboard(text) {
	// Source: https://stackoverflow.com/a/30810322/151048
	const ta = document.createElement('textarea');

	//
	// *** This styling is an extra step which is likely not required. ***
	//
	// Why is it here? To ensure:
	// 1. the element is able to have focus and selection.
	// 2. if element was to flash render it has minimal visual impact.
	// 3. less flakyness with selection and copying which **might** occur if
	//		the textarea element is not visible.
	//
	// The likelihood is the element won't even render, not even a flash,
	// so some of these are just precautions. However in IE the element
	// is visible whilst the popup box asking the user for permission for
	// the web page to copy to the clipboard.
	//

	// Place in top-left corner of screen regardless of scroll position.
	ta.style.position = 'fixed';
	ta.style.top = ta.style.left = 0;

	// Ensure it has a small width and height. Setting to 1px / 1em
	// doesn't work as this gives a negative w/h on some browsers.
	ta.style.width = ta.style.height = '2em';

	// We don't need padding, reducing the size if it does flash render.
	ta.style.padding = 0;

	// Clean up any borders.
	ta.style.border = ta.style.outline = ta.style.boxShadow = 'none';

	// Avoid flash of white box if rendered for any reason.
	ta.style.background = 'transparent';

	ta.value = text;

	document.body.appendChild(ta);
	ta.focus();
	ta.select();

	try {
		if (!document.execCommand('copy'))
			alert('Sorry, unable to copy.');
	} catch (err) {
		console.error('Error copying.', err);
		alert('Sorry, unable to copy.');
	}

	ta.remove();
}

function clearAllMarks() {
	Bus.emit('clear-marks');
}

function toggleHelp() {
	const helpEl = document.getElementById('help-dialog');
	helpEl.classList.toggle('open');
}

// vim: se sw=2 :
