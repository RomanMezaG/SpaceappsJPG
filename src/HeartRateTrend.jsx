import { useEffect, useState } from 'react';
import { useWatchSession } from './SessionGate';

const timeLabel = (value) => new Date(value).toLocaleString('en-US', {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
});

export default function HeartRateTrend() {
  const { sessionId, expireSession } = useWatchSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let closed = false;
    let timer;
    let controller;
    async function refresh() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 12000);
      try {
        const response = await fetch('/api/watch/heart-rate-trend', {
          headers: { 'X-Watch-Session': sessionId },
          cache: 'no-store', signal: controller.signal,
        });
        const result = await response.json();
        if (closed) return;
        if (response.status === 409) {
          expireSession();
          return;
        }
        if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not load heart-rate history.');
        if (!Array.isArray(result.points)) throw new Error('Heart-rate history is unavailable.');
        setData(result);
        setError('');
      } catch (failure) {
        if (!closed) setError(failure.name === 'AbortError' ? 'Heart-rate history timed out.' : failure.message);
      } finally {
        clearTimeout(timeout);
        if (!closed) {
          setLoading(false);
          timer = setTimeout(refresh, 30000);
        }
      }
    }
    refresh();
    return () => { closed = true; clearTimeout(timer); controller?.abort(); };
  }, [sessionId, expireSession]);

  const points = data?.points || [];
  const recorded = points.filter((point) => Number.isFinite(point.bpm));
  const values = recorded.map((point) => point.bpm);
  const low = values.length ? Math.max(0, Math.floor((Math.min(...values) - 5) / 10) * 10) : 0;
  const high = values.length ? Math.ceil((Math.max(...values) + 5) / 10) * 10 : 100;
  const left = 50, right = 872, top = 22, bottom = 240;
  const x = (index) => left + index / Math.max(1, points.length - 1) * (right - left);
  const y = (bpm) => bottom - (bpm - low) / Math.max(10, high - low) * (bottom - top);
  let connected = false;
  const path = points.map((point, index) => {
    if (!Number.isFinite(point.bpm)) { connected = false; return ''; }
    const segment = `${connected ? 'L' : 'M'}${x(index)},${y(point.bpm)}`;
    connected = true;
    return segment;
  }).join(' ');
  const active = selected === null ? recorded.at(-1) : points[selected];

  return <section aria-label="Seven-day heart-rate trend" className="rounded-3xl border border-slate-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-slate-900">Heart rate trend</h3>
        <p className="mt-1 text-xs text-slate-500">Last 7 days, including today · hourly averages · saved watch readings</p>
      </div>
      {recorded.length > 0 && <div className="text-right">
        <p className="text-2xl font-semibold tracking-tight text-slate-900">{data.average_bpm}<span className="ml-1 text-xs font-normal text-slate-400">bpm average</span></p>
        <p className="mt-1 text-xs text-slate-500">{data.days_recorded}/7 days recorded · {data.readings.toLocaleString('en-US')} readings</p>
      </div>}
    </div>
    {error && <p role="status" className="mt-4 text-xs text-amber-800">{error}{data ? ' Showing the last loaded history.' : ''}</p>}
    {loading && !data ? <p className="py-16 text-center text-sm text-slate-400">Loading heart-rate history…</p>
      : !recorded.length ? <p className="py-16 text-center text-sm text-slate-400">No saved heart-rate readings in the past seven days.</p>
        : <>
          <div className="mt-5 flex min-h-10 flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500" aria-live="polite">
            <p>{active && <><span className="font-semibold text-slate-900">{active.bpm} bpm</span> · {timeLabel(active.timestamp)} · {active.minutes_recorded} recorded min</>}</p>
            <span>Local time · gaps mean no recorded data</span>
          </div>
          <svg viewBox="0 0 900 285" className="w-full overflow-visible" role="group" aria-label="Hourly mean heart rate in beats per minute. Focus a point for its value.">
            {Array.from({ length: 5 }, (_, index) => {
              const value = low + index * (high - low) / 4;
              return <g key={index}>
                <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e2e8f0" strokeDasharray="3 5" />
                <text x={left - 10} y={y(value) + 4} textAnchor="end" fill="#64748b" fontSize="12">{Math.round(value)}</text>
              </g>;
            })}
            <text x={left - 10} y="10" textAnchor="end" fill="#94a3b8" fontSize="10">bpm</text>
            <path d={path} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            {points.map((point, index) => Number.isFinite(point.bpm) && <circle
              key={point.timestamp} cx={x(index)} cy={y(point.bpm)} r={active === point ? 5 : 3}
              fill={active === point ? '#1d4ed8' : '#60a5fa'} stroke="white" strokeWidth="1.5"
              tabIndex={0} onFocus={() => setSelected(index)} onMouseEnter={() => setSelected(index)}
              aria-label={`${timeLabel(point.timestamp)}: ${point.bpm} bpm hourly average, ${point.minutes_recorded} recorded minutes`}
            ><title>{timeLabel(point.timestamp)} · {point.bpm} bpm</title></circle>)}
            {Array.from({ length: 7 }, (_, tick) => {
              const index = Math.round(tick * (points.length - 1) / 6);
              return <text key={tick} x={x(index)} y={bottom + 28} textAnchor={tick === 0 ? 'start' : tick === 6 ? 'end' : 'middle'} fill="#64748b" fontSize="12">
                {new Date(points[index].timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </text>;
            })}
          </svg>
          <p className="text-xs leading-5 text-slate-400">Updated {timeLabel(data.end_utc)} · refreshes every 30 seconds</p>
          <details className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <summary className="cursor-pointer">Trend data & method</summary>
            <p className="mt-3 leading-5">Source: {data.source}. Readings are averaged per recorded minute, then per hour, so densely sampled live sessions do not dominate the trend. The weekly average uses recorded minutes only. Empty periods are not filled. Historical records belong to the configured watch.</p>
            <div className="mt-3 max-h-60 overflow-auto">
              <table className="w-full text-left">
                <caption className="sr-only">Recorded hourly heart-rate averages</caption>
                <thead><tr><th scope="col" className="py-2">Hour (local)</th><th scope="col">Average bpm</th><th scope="col">Recorded minutes</th></tr></thead>
                <tbody>{recorded.map((point) => <tr key={point.timestamp} className="border-t border-slate-100"><td className="py-2">{timeLabel(point.timestamp)}</td><td>{point.bpm}</td><td>{point.minutes_recorded}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>}
  </section>;
}
