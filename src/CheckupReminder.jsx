import React, { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarPlus, Clock3 } from 'lucide-react';
import { advanceCheckup, calendarReminder, nextCheckup, nextElapsedCheckup } from './checkupTime.mjs';

const STORAGE_KEY = 'astrohealth.daily-checkup.v1';
const NO_CLOCK = 'none';
const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zoneList = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['America/Tijuana', 'America/Mexico_City', 'America/New_York', 'Europe/London', 'Asia/Tokyo'];
const zones = [...new Set([deviceZone, ...zoneList])].filter(zone => zone && zone !== 'UTC');
const zoneOptions = zones.map(zone => <option key={zone} value={zone}>{zone.replace(/_/g, ' ')}</option>);

function ClockReference({ value, onChange, optional }) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-xs font-semibold text-gray-600">
      {optional ? 'Clock reference' : 'First checkup time zone'}
      <select value={value} onChange={event => onChange(event.target.value)}
        className="max-w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-normal text-gray-800">
        {optional && <option value={NO_CLOCK}>None · countdown only</option>}
        <option value="UTC">UTC · Universal time</option>
        {zoneOptions}
      </select>
    </label>
  );
}

function readSchedule() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Number.isSafeInteger(saved.due) && saved.due > 0 &&
        Number.isFinite(new Date(saved.due).getTime()) && typeof saved.uid === 'string' &&
        /^[a-z\d@.-]{1,100}$/i.test(saved.uid)) {
      // Schedules created before mission timers were entered and shown in UTC.
      const reference = saved.reference === NO_CLOCK || zones.includes(saved.reference)
        ? saved.reference : 'UTC';
      return { ...saved, mode: saved.mode === 'elapsed' ? 'elapsed' : 'clock', reference };
    }
  } catch {
    // Storage may be unavailable or contain an older value.
  }
  return null;
}

function remaining(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60]
    .map(part => String(part).padStart(2, '0')).join(':');
}

export default function CheckupReminder() {
  const [schedule, setSchedule] = useState(readSchedule);
  const [now, setNow] = useState(Date.now);
  const [editing, setEditing] = useState(false);
  const [mode, setMode] = useState('elapsed');
  const [zone, setZone] = useState('UTC');
  const [time, setTime] = useState('09:00');
  const [note, setNote] = useState('');
  const [storageError, setStorageError] = useState(false);
  const due = schedule !== null && now >= schedule.due;
  const reference = schedule?.reference ?? NO_CLOCK;
  const shownDate = useMemo(() => {
    if (!schedule || reference === NO_CLOCK) return '';
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: reference, day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(schedule.due) + ' · ' + reference.replace(/_/g, ' ');
  }, [schedule?.due, reference]);

  useEffect(() => {
    function sync(event) {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      setSchedule(readSchedule());
      setEditing(false);
      setNote('');
      setNow(Date.now());
    }
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  useEffect(() => {
    if (!schedule) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('pageshow', tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('pageshow', tick);
    };
  }, [schedule]);

  function save(updated, timestamp) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
    setSchedule(updated);
    setNow(timestamp);
    setEditing(false);
    setNote('');
  }

  function startSchedule(event) {
    event.preventDefault();
    if (mode === 'clock' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return;
    const timestamp = Date.now();
    if (schedule && schedule.due <= timestamp) {
      setEditing(false);
      setNow(timestamp);
      return;
    }
    const uid = schedule?.uid ?? (timestamp + '-' + Math.random().toString(36).slice(2) + '@astrohealth');
    const deadline = mode === 'elapsed' ? nextElapsedCheckup(timestamp) : nextCheckup(time, timestamp, zone);
    save({ due: deadline, uid, mode, reference: mode === 'elapsed' ? NO_CLOCK : zone }, timestamp);
  }

  function editSchedule() {
    const selectedZone = reference === NO_CLOCK ? 'UTC' : reference;
    setZone(selectedZone);
    setMode(schedule.mode);
    setTime(new Intl.DateTimeFormat('en-GB', {
      timeZone: selectedZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(schedule.due));
    setEditing(true);
    setNote('');
  }

  function complete() {
    const timestamp = Date.now();
    if (timestamp < schedule.due) return;
    save({ ...schedule, due: advanceCheckup(schedule.due, timestamp) }, timestamp);
    setNote('Checkup marked complete.');
  }

  function exportCalendar() {
    const timestamp = Date.now();
    const content = calendarReminder(advanceCheckup(schedule.due, timestamp), schedule.uid, timestamp);
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'daily-medical-checkup.ics';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote('Open the .ics file in your calendar and enable its alert. Update the calendar event if you change the time here.');
  }

  const showForm = !schedule || (editing && !due);
  return (
    <section aria-labelledby="daily-checkup-title" className={`mb-5 rounded-[22px] p-5 shadow-sm ring-1 sm:px-6 ${due ? 'bg-amber-50 ring-amber-300' : 'bg-white ring-black/5'}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl p-2.5 ${due ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 text-blue-700'}`}>
            {due ? <BellRing size={20} aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}
          </div>
          <div>
            <h2 id="daily-checkup-title" className="text-base font-bold">Daily medical checkup</h2>
            <p className="text-sm text-gray-600">{shownDate
              ? (due ? 'Scheduled for ' : 'Next checkup · ') + shownDate
              : 'One checkup every 24 hours of mission time.'}</p>
          </div>
        </div>
        {due ? <div className="flex flex-wrap items-center gap-3">
          <strong role="alert" className="text-sm text-amber-900">Checkup due</strong>
          <button onClick={complete} className="rounded-full bg-amber-900 px-4 py-2 text-sm font-semibold text-white">Mark complete</button>
        </div> : schedule && !editing && <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600">Time left</span>
          <span role="timer" className="font-mono text-xl font-semibold tabular-nums">{remaining(schedule.due - now)}</span>
          <button className="rounded-full px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={editSchedule}>Edit schedule</button>
        </div>}
        {showForm && <form onSubmit={startSchedule} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium">First checkup
            <select value={mode} onChange={event => setMode(event.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm">
              <option value="elapsed">In 24 hours</option>
              <option value="clock">At a clock time</option>
            </select>
          </label>
          {mode === 'clock' && <>
            <ClockReference value={zone} onChange={setZone} optional={false} />
            <label className="flex items-center gap-2 text-sm font-medium">Time
              <input type="time" required value={time} onChange={event => setTime(event.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm" />
            </label>
          </>}
          <button type="submit" className="rounded-full bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            {mode === 'clock' ? 'Save time' : schedule ? 'Restart 24-hour timer' : 'Start 24-hour timer'}
          </button>
          {schedule && <button type="button" onClick={() => setEditing(false)} className="px-2 py-1 text-sm">Cancel</button>}
        </form>}
      </div>
      {schedule && !showForm && <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3">
        <ClockReference value={reference} onChange={newZone => save({ ...schedule, reference: newZone }, Date.now())} optional />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button onClick={exportCalendar} className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 hover:underline">
          <CalendarPlus size={15} aria-hidden="true" /> Add to calendar
        </button>
        <span className="text-xs text-gray-600">For reminders when the dashboard is closed.</span>
        </div>
      </div>}
      <p role="status" className={note ? 'mt-2 text-xs text-gray-700' : 'sr-only'}>{note}</p>
      {storageError && <p role="alert" className="mt-2 text-xs text-amber-800">This browser could not save the schedule. It will last for this session only.</p>}
    </section>
  );
}
