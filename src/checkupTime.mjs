const DAY = 24 * 60 * 60 * 1000;

export function nextElapsedCheckup(nowMs) {
  return nowMs + DAY;
}

export function nextCheckup(timeHHMM, nowMs, timeZone = 'UTC') {
  if (timeZone !== 'UTC') {
    const clock = new Intl.DateTimeFormat('en-GB', {
      timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    });
    // Search real instants so a repeated or missing local hour is handled correctly.
    const minute = 60000;
    const first = (Math.floor(nowMs / minute) + 1) * minute;
    for (let instant = first; instant <= first + 3 * DAY; instant += minute) {
      if (clock.format(instant) === timeHHMM) return instant;
    }
    throw new RangeError('No matching clock time found.');
  }
  const [hours, minutes] = timeHHMM.split(':').map(Number);
  const target = new Date(nowMs);
  target.setUTCHours(hours, minutes, 0, 0);
  return target.getTime() > nowMs ? target.getTime() : target.getTime() + DAY;
}

export function advanceCheckup(dueMs, nowMs) {
  if (dueMs > nowMs) return dueMs;
  return dueMs + (Math.floor((nowMs - dueMs) / DAY) + 1) * DAY;
}

function calendarDate(timestamp) {
  return new Date(timestamp).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function calendarReminder(dueMs, uid, nowMs) {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ridge Support System//Medical Checkup//EN',
    'BEGIN:VEVENT', 'UID:' + uid, 'DTSTAMP:' + calendarDate(nowMs),
    'DTSTART:' + calendarDate(dueMs), 'RRULE:FREQ=DAILY',
    'SUMMARY:Ridge Support System medical checkup', 'BEGIN:VALARM', 'ACTION:DISPLAY',
    'DESCRIPTION:Your medical checkup is due.', 'TRIGGER:PT0S',
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR', ''
  ].join('\r\n');
}
