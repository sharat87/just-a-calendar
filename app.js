const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

const markedDates = new Set;

main();

function main() {
  const calendarEl = document.getElementById('calendar');
  const yearInputEl = document.getElementById('yearInput');

  yearInputEl.value = 2018;
  yearInputChanged();
  yearInputEl.addEventListener('change', yearInputChanged);
}

function yearInputChanged() {
  fillCalendar(
    document.getElementById('calendar'),
    document.getElementById('yearInput').value,
  );
}

function onCalendarClick(event) {
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
}

function mkMonthTable() {
  if (typeof mkMonthTable.tpl === 'undefined') {
    const tpl = mkMonthTable.tpl = document.createElement('table');
    tpl.classList.add('month');
    tpl.innerHTML = `
      <thead>
        <tr><th colspan=7></th></tr>
        <tr>
          <th>Su</th>
          <th>Mo</th>
          <th>Tu</th>
          <th>We</th>
          <th>Th</th>
          <th>Fr</th>
          <th>Sa</th>
        </tr>
      </thead>
      <tbody></tbody>`;
  }
  return mkMonthTable.tpl.cloneNode(true);
}

function fillCalendar(calendarEl, year) {
  calendarEl.innerHTML = '';

  for (const [monthI, monthName] of MONTHS.entries()) {
    const table = mkMonthTable();
    table.querySelector('th:empty').innerText = monthName;
    calendarEl.appendChild(table);

    const first = mkDate(year, monthI, 1);
    const leftTop = mkDate(year, monthI, 1 - first.getDay());

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
        if (markedDates.has(td.dataset.date))
          td.classList.add('mark');
        tr.appendChild(td);
        date = nextDate(date);
      }
    }
  }

  const now = new Date;
  const todayIso = `${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  calendarEl.querySelectorAll(`td[data-date="${todayIso}"]`).forEach(td => td.classList.add('today'));

  const highlightedDates = new Map();
  /*{
    const hlTable = document.getElementById('highlighted-dates').nextElementSibling;
    for (const row of hlTable.querySelectorAll('tbody tr')) {
      const [dateStr, detail, bubblesStr] = Array.prototype.map.call(row.children, (e) => e.innerText);
      const date = new Date(new Date(new Date(dateStr).setHours(0)).setMinutes(0)),
          bubbles = bubblesStr.trim().split(/\s+/);
      highlightedDates.set(date.toISOString().substr(0, 10), {detail, bubbles});
    }
  }*/

}

function clearAllMarks() {
  const calendarEl = document.getElementById('calendar');
  for (const td of calendarEl.querySelectorAll('td.mark'))
    td.classList.remove('mark');
  markedDates.clear();
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

// vim: se sw=2 :
