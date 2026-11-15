import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, RefreshCw, Watch } from 'lucide-react';

const REFRESH_INTERVAL_MS = 5000;

const PHASE_LABELS = {
  iniciando: 'Starting',
  buscando: 'Searching for watch',
  conectando: 'Connecting',
  autenticando: 'Authenticating',
  esperando_pulso: 'Connected · waiting for pulse',
  recibiendo: 'Receiving live data',
  reintentando: 'Reconnecting'
};

function formatNumber(value, maximumFractionDigits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return '—';
  }
  return Number(value).toLocaleString(undefined, { maximumFractionDigits });
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ReadingCard({ label, value, unit, detail }) {
  return (
    <article className="rounded-2xl bg-[#F2F2F7]/70 p-4">
      <p className="text-xs font-semibold text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-tight text-gray-900">
        {value}
        {unit && <span className="ml-1 text-sm font-semibold text-gray-500">{unit}</span>}
      </p>
      {detail && <p className="mt-1 text-[11px] text-gray-500">{detail}</p>}
    </article>
  );
}

export default function SmartWatchPanel({ onHeartRateChange }) {
  const [watchData, setWatchData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const lastPublishedPulse = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/watch');
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || 'Could not load smart-watch data.');
      }
      const pulse = result.estado?.pulso_bpm;
      const liveHeartRate = Number(pulse);
      const pulseTimestamp = result.estado?.pulso_fecha_utc;
      if (
        result.estado?.pulso_reciente &&
        pulseTimestamp &&
        pulse !== null &&
        pulse !== undefined &&
        Number.isFinite(liveHeartRate)
      ) {
        const pulseKey = `${pulseTimestamp}:${liveHeartRate}`;
        if (lastPublishedPulse.current !== pulseKey) {
          lastPublishedPulse.current = pulseKey;
          onHeartRateChange?.({ bpm: liveHeartRate, timestamp: pulseTimestamp });
        }
      }
      setWatchData(result);
      setError('');
      setLastChecked(new Date());
    } catch (requestError) {
      setError(requestError.message || 'Could not reach the smart-watch service.');
    } finally {
      setLoading(false);
    }
  }, [onHeartRateChange]);

  useEffect(() => {
    refresh();
    const intervalId = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [refresh]);

  const state = watchData?.estado;
  const history = watchData?.historial ?? [];
  const latest = history.length ? history[history.length - 1] : {};
  const isLive = Boolean(state?.pulso_reciente);
  const connectionLabel = isLive
    ? 'Live'
    : state?.conectado
    ? 'Connected'
    : 'Disconnected';
  const connectionClass = isLive
    ? 'bg-[#34C759]/15 text-[#248A3D]'
    : state?.conectado
    ? 'bg-[#FF9500]/15 text-[#B25E00]'
    : 'bg-gray-100 text-gray-600';
  const recentReadings = [...history].reverse().slice(0, 10);

  return (
    <section className="mb-8 space-y-5">
      <div className="rounded-[26px] bg-white p-5 shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
          <div className="flex items-start gap-3">
            <span className="rounded-2xl bg-[#007AFF]/10 p-3 text-[#007AFF]">
              <Watch className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-xl font-extrabold tracking-tight text-gray-900">
                Smart Watch Integration
              </h2>
              <p className="mt-1 text-sm text-gray-500">
                Live Mi Band telemetry and recent recorded measurements
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${connectionClass}`}>
              {connectionLabel}
            </span>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label="Refresh smart-watch data"
              className="rounded-full bg-[#F2F2F7] p-2 text-gray-600 transition hover:bg-gray-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
          <span>
            {PHASE_LABELS[state?.fase] || state?.fase || 'Waiting for watch service'}
          </span>
          <span>
            Auto-refresh every 5 seconds
            {lastChecked && ` · Updated ${lastChecked.toLocaleTimeString()}`}
          </span>
        </div>

        {error && (
          <div role="alert" className="mt-4 rounded-2xl bg-[#FF9500]/10 p-4 text-sm text-gray-700">
            <p className="font-bold text-[#B25E00]">Smart-watch service unavailable</p>
            <p className="mt-1">{error}</p>
            <p className="mt-2 text-xs">
              Start the watch service with{' '}
              <code className="rounded bg-white px-1.5 py-0.5">
                python -m uvicorn servidor:app --app-dir watch --host 127.0.0.1 --port 8001
              </code>
              . Make sure the watch is nearby and Bluetooth is enabled.
            </p>
          </div>
        )}

        {state?.error && (
          <p role="status" className="mt-3 rounded-xl bg-[#FF3B30]/10 px-3 py-2 text-xs text-[#D70015]">
            Watch connection: {state.error}
          </p>
        )}
        {state?.error_resumen && (
          <p role="status" className="mt-2 rounded-xl bg-[#FF9500]/10 px-3 py-2 text-xs text-[#B25E00]">
            Activity summary: {state.error_resumen}
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ReadingCard
            label="Heart rate"
            value={isLive ? formatNumber(state.pulso_bpm) : '—'}
            unit={isLive ? 'bpm' : ''}
            detail={isLive ? `Measured ${formatDate(state.pulso_fecha_utc)}` : 'No recent live pulse'}
          />
          <ReadingCard
            label="Steps"
            value={formatNumber(state?.pasos_acumulados)}
            detail="Accumulated today"
          />
          <ReadingCard
            label="Distance"
            value={formatNumber(state?.distancia_estimada_m)}
            unit={state?.distancia_estimada_m == null ? '' : 'm'}
          />
          <ReadingCard
            label="Calories"
            value={formatNumber(state?.calorias_estimadas_acumuladas_kcal)}
            unit={state?.calorias_estimadas_acumuladas_kcal == null ? '' : 'kcal'}
          />
          <ReadingCard
            label="PAI today"
            value={formatNumber(latest.pai_hoy, 1)}
            detail="Personal Activity Intelligence"
          />
          <ReadingCard
            label="Stress"
            value={formatNumber(latest.estres)}
            detail={latest.fecha_utc ? `Measured ${formatDate(latest.fecha_utc)}` : 'No history yet'}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[26px] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Activity className="h-4 w-4 text-[#007AFF]" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Recent watch history</h3>
            <p className="text-xs text-gray-500">
              {watchData?.archivo_historial || 'Waiting for history'} · Latest {recentReadings.length} of {history.length} readings
            </p>
          </div>
        </div>
        {recentReadings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Time (UTC)</th>
                  <th className="px-4 py-3">Heart rate</th>
                  <th className="px-4 py-3">Steps/min</th>
                  <th className="px-4 py-3">Total steps</th>
                  <th className="px-4 py-3">PAI total</th>
                  <th className="px-4 py-3">Stress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentReadings.map((reading, index) => (
                  <tr key={`${reading.fecha_utc}-${index}`} className="text-gray-700">
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(reading.fecha_utc)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pulso_bpm, 0)} bpm</td>
                    <td className="px-4 py-3">{formatNumber(reading.pasos_minuto)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pasos_acumulados)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pai_total, 1)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.estres)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center text-sm text-gray-500">
            {loading ? 'Loading watch history…' : 'No watch history is available yet.'}
          </div>
        )}
        {watchData?.error_archivo && (
          <p role="status" className="border-t border-gray-100 px-5 py-3 text-xs text-[#B25E00]">
            Could not read history file: {watchData.error_archivo}
          </p>
        )}
      </div>
    </section>
  );
}
