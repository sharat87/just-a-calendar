const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const highlightedDates = new Map;

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
    console.log(todayIso);
    const tds = el.querySelectorAll('td[data-date="' + todayIso + '"]');
    for (const td of tds)
      td.classList.add('today');
  });
}

{
  // Date marking.
  const calendarEl = document.getElementById('calendar');
  const markedDates = new Set;

  calendarEl.addEventListener('click', (event) => {
    const calendarEl = document.getElementById('calendar');
    if (event.target.matches('td.date')) {
      const tds = calendarEl.querySelectorAll('td[data-date="' + event.target.dataset.date + '"]');
      const date = event.target.dataset.date;
      if (markedDates.has(date)) {
        for (const td of tds)
          td.classList.remove('mark');
        markedDates.delete(date);
      } else {
        for (const td of tds)
          td.classList.add('mark');
        markedDates.add(date);
      }
    }
  });

  document.getElementById('clearMarksBtn').addEventListener('click', (event) => {
    for (const td of calendarEl.querySelectorAll('td.mark'))
      td.classList.remove('mark');
    markedDates.clear();
  });

  Bus.on('fill-calendar', ({year, el}) => {
    for (const date of markedDates) {
      const tds = calendarEl.querySelectorAll('td[data-date="' + date + '"]');
      for (const td of tds)
        td.classList.add('mark');
    }
  });
}

document.body.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea'))
    return;
  switch(event.key) {
    case 'g': onGoToDate(); break;
    case 'n': goToYear('+1'); break;
    case 'p': goToYear('-1'); break;
  }
});

main();

function main() {
  const calendarEl = document.getElementById('calendar');
  const yearInputEl = document.getElementById('yearInput');

  loadHighlightDates();

  yearInputEl.value = 2018;
  yearInputChanged();

  if (localStorage.darkMode) {
    const value = JSON.parse(localStorage.darkMode);
    document.getElementById('darkCheckbox').checked = value ? 'checked' : '';
    onToggleDark();
  }

  setTimeout(setupHighlightsPopup);

  if (localStorage.labs) {
    document.getElementById('highlightsBtn').style = '';
  }
}

function yearInputChanged() {
  fillCalendar(parseInt(document.getElementById('yearInput').value, 10));
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

function fillCalendar(year) {
  const calendarEl = document.getElementById('calendar');
  calendarEl.innerHTML = '';

  for (const [monthI, monthName] of MONTHS.entries()) {
    const table = mkMonthTable();
    table.querySelector('th:empty').innerText = monthName;
    calendarEl.appendChild(table);

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

  Bus.emit('fill-calendar', {year, el: calendarEl});
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
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function nextDate(date) {
  return mkDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1);
}

function goToYear(yearStr) {
  const yearInputEl = document.getElementById('yearInput');
  if (yearStr[0] === '-' || yearStr[0] === '+')
    yearInputEl.value = parseInt(yearInputEl.value, 10) + parseInt(yearStr, 10);
  else
    yearInputEl.value = parseInt(yearStr, 10);
  yearInputChanged();
}

function onToggleDark() {
  const value = document.getElementById('darkCheckbox').checked;
  if (value)
    document.body.classList.add('dark');
  else
    document.body.classList.remove('dark');
  localStorage.darkMode = JSON.stringify(value);
}

function onGoToDate() {
  const dateStr = prompt('Enter date (Any clearly understood format is okay):');
  if (!dateStr)
    return;
  const date = parseDate(dateStr);
  // markedDates.add(isoString(date));
  const yearInputEl = document.getElementById('yearInput');
  yearInputEl.value = date.getFullYear();
  fillCalendar(date.getFullYear());
}

function parseDate(dateStr) {
  const d = new Date(dateStr.replace(/-/g, ' '));
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000);
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
  const popup = document.getElementById('highlights');
  const ta = popup.querySelector('textarea');
  popup.classList.add('show');
  ta.focus();
}

function setupHighlightsPopup() {
  const popup = document.getElementById('highlights');
  const ta = popup.querySelector('textarea');
  let activeHl = popup.querySelector('a.active');
  onActiveChanged(activeHl);

  popup.addEventListener('click', (event) => {
    if (event.target.tagName !== 'A')
      return;
    event.preventDefault();

    if (activeHl)
      activeHl.classList.remove('active');

    activeHl = event.target;
    activeHl.classList.add('active');

    onActiveChanged();
  });

  function onActiveChanged() {
    const rawData = localStorage['highlights:' + activeHl.innerText];
    const data = rawData ? JSON.parse(rawData) : {content: ''};
    ta.value = data.content;
    ta.focus();
  }

  ta.addEventListener('input', (event) => {
    localStorage['highlights:' + activeHl.innerText] = JSON.stringify({
      content: event.target.value,
      lastModified: new Date().toISOString(),
    });
  });

  Bus.on('fill-calendar', ({year, el}) => {
    for (const [date, highlights] of highlightedDates) {
      const tds = el.querySelectorAll('td[data-date="' + date + '"]');
      for (const hl of highlights)
        for (const td of tds)
          td.classList.add('hl-' + hl.toLowerCase());
    }
  });
}

function loadHighlightDates() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('highlights:'))
      continue;
    const name = key.slice('highlights:'.length);
    const content = JSON.parse(localStorage[key]).content;
    for (const line of content.split('\n')) {
      const date = isoString(parseDate(line));
      if (!highlightedDates.has(date))
        highlightedDates.set(date, new Set);
      highlightedDates.get(date).add(name);
    }
  }
  console.log(highlightedDates);
}

function onCalendarContextMenu(event) {
  if (!event.target.matches('td.date') || event.shiftKey)
    return;
  event.preventDefault();

  const calendarEl = document.getElementById('calendar');
  const cmenu = document.getElementById('cmenu');

  const date = new Date(event.target.dataset.date);
  const dateStrings = [
    formatDate(date, '%Y-%m-%d'),
    formatDate(date, '%m/%d/%Y'),
  ];
  cmenu.innerHTML = dateStrings.map((d) => {
    return '<a href=#>Copy ' + d + '</a>';
  }).join('') + '<a href=#>Close</a>';

  const tdRect = event.target.getBoundingClientRect();
  const bodyRect = document.body.getBoundingClientRect();

  cmenu.classList.add('show');
  cmenu.style.top = (tdRect.y - bodyRect.y + tdRect.height) + 'px';
  cmenu.style.left = tdRect.x + 'px';
}

function onCmenuClick(event) {
  if (event.target.tagName !== 'A')
    return;
  event.preventDefault();
  const text = event.target.innerText;
  if (text.startsWith('Copy '))
    copyTextToClipboard(text.replace('Copy ', ''));
  cmenu.classList.remove('show');
}

function copyTextToClipboard(text) {
  // Source: https://stackoverflow.com/a/30810322/151048
  var ta = document.createElement('textarea');

  //
  // *** This styling is an extra step which is likely not required. ***
  //
  // Why is it here? To ensure:
  // 1. the element is able to have focus and selection.
  // 2. if element was to flash render it has minimal visual impact.
  // 3. less flakyness with selection and copying which **might** occur if
  //    the textarea element is not visible.
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
    var successful = document.execCommand('copy');
    if (!successful)
      alert('Sorry, unable to copy.');
  } catch (err) {
    alert('Sorry, unable to copy.');
  }

  document.body.removeChild(ta);
}

// vim: se sw=2 :
