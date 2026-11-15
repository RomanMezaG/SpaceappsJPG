import { useState } from 'react';
import { useHealthData } from './HealthDataContext';
import { Activity, Download, RefreshCw, Watch } from 'lucide-react';
import { useWatchSession } from './SessionGate';



const PHASE_LABELS = {
  esperando_perfil: 'Waiting for profile',
  preparando: 'Preparing session',
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
  return Number(value).toLocaleString('en-US', { maximumFractionDigits });
}

function formatDate(value, incluirSegundos = false) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: incluirSegundos ? 'medium' : 'short' });
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

export default function SmartWatchPanel() {
  const { sessionId, expireSession } = useWatchSession();
  const {
    watchData, watchError: error, watchLoading: loading, lastChecked,
    refreshWatch: refresh, inputs, sources, activityRecent,
  } = useHealthData();
  const [exportando, setExportando] = useState(false);
  const [errorExportacion, setErrorExportacion] = useState('');
  const state = watchData?.estado;
  const history = watchData?.historial ?? [];
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

  async function descargarCsv() {
    setExportando(true);
    setErrorExportacion('');
    try {
      const respuesta = await fetch('/api/watch/history.csv', {
        headers: { 'X-Watch-Session': sessionId },
      });
      if (!respuesta.ok) {
        if (respuesta.status === 409) expireSession();
        const detalle = await respuesta.json();
        throw new Error(typeof detalle.detail === 'string' ? detalle.detail : 'Could not download the CSV.');
      }
      const url = URL.createObjectURL(await respuesta.blob());
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = 'historial_sesion.csv';
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (fallo) {
      setErrorExportacion(fallo.message || 'Could not download the CSV.');
    } finally {
      setExportando(false);
    }
  }

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
            Shared live feed · refresh every 2 seconds
            {lastChecked && ` · Updated ${lastChecked.toLocaleTimeString('en-US')}`}
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
        {state?.error_activacion_archivo && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            Could not save the indicator: {state.error_activacion_archivo}
          </p>
        )}
        {state?.pai_prototipo_error && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            Activity points history: {state.pai_prototipo_error}
          </p>
        )}
        {state?.pai_historico_error && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            Activity import: {state.pai_historico_error}
          </p>
        )}
        {state?.error_historial_sesion && (
          <p role="status" className="mt-2 text-xs text-amber-700">
            Session history: {state.error_historial_sesion}
          </p>
        )}

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <ReadingCard
            label="Heart rate"
            value={formatNumber(inputs.heart_rate_bpm, 1)}
            unit={inputs.heart_rate_bpm == null ? '' : 'bpm'}
            detail={sources.heart_rate_bpm
              ? `${sources.heart_rate_bpm.kind} · ${formatDate(sources.heart_rate_bpm.timestamp)}`
              : 'No supplied heart rate'}
          />
          <ReadingCard
            label="Steps"
            value={formatNumber(activityRecent ? state?.pasos_acumulados : null)}
            detail={activityRecent ? 'Accumulated today · Watch' : 'Waiting for a recent activity summary'}
          />
          <ReadingCard
            label="Distance"
            value={formatNumber(activityRecent ? state?.distancia_perfil_m : null, 1)}
            unit={!activityRecent || state?.distancia_perfil_m == null ? '' : 'm'}
            detail="Calculated from steps and profile"
          />
          <ReadingCard
            label="Walking calories"
            value={formatNumber(activityRecent ? state?.calorias_perfil_kcal : null, 1)}
            unit={!activityRecent || state?.calorias_perfil_kcal == null ? '' : 'kcal'}
            detail="Today's activity calculated from your profile"
          />
          <ReadingCard
            label="PAI"
            value={formatNumber(state?.pai_indice_7dias)}
            unit={state?.pai_indice_7dias == null ? '' : '/ 100'}
            detail={state?.pai_indice_7dias == null
              ? 'Waiting for activity points history'
              : `Last 7 days · Today: ${formatNumber(state.pai_indice_hoy)}/100${
                  !isLive ? ' · No recent heart rate'
                  : state.pai_prototipo_estado === 'esperando_referencia'
                  ? ' · Calibrating'
                  : state.pai_prototipo_estado === 'sumando'
                  ? ' · Accumulating activity'
                  : ' · Paused'
                }`}
          />
          <ReadingCard
            label="Stress"
            value={
              inputs.stress_level_1_10 != null
                ? formatNumber(inputs.stress_level_1_10, 1)
                : state?.activacion_estado === 'calibrando'
                ? 'Calibrating…'
                : 'Waiting for data'
            }
            unit={inputs.stress_level_1_10 != null ? '/ 10' : ''}
            detail={
              inputs.stress_level_1_10 != null
                ? `${sources.stress_level_1_10?.kind} · ${formatDate(sources.stress_level_1_10?.timestamp)}`
                : state?.activacion_detalle || 'Waiting for the watch connection'
            }
          />
        </div>
        <details className="mt-3 text-xs text-gray-500">
          <summary className="cursor-pointer">How activity points are calculated</summary>
          <p className="mt-2 leading-relaxed">
            A project-specific score based on duration, heart rate relative to baseline,
            and recent steps. It includes available CSV records and live activity
            without counting the same time twice. The total covers today and the
            previous six days. It does not reproduce Xiaomi's PAI algorithm or its
            scoring targets. The 1–100 scale uses a project reference of 100 points:
            1 represents zero accumulated points and 100 is the display limit,
            not a health percentage.
          </p>
        </details>
      </div>

      <div className="overflow-hidden rounded-[26px] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
        <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-5 py-4">
          <Activity className="h-4 w-4 text-[#007AFF]" />
          <div>
            <h3 className="text-sm font-bold text-gray-900">Integrated history</h3>
            <p className="text-xs text-gray-500">
              {watchData?.archivo_historial || 'Waiting for history'} · Latest {recentReadings.length} of {history.length} received readings
            </p>
          </div>
          <button
            type="button"
            onClick={descargarCsv}
            disabled={exportando || !history.length}
            className="ml-auto inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            {exportando ? 'Downloading…' : 'Download CSV'}
          </button>
        </div>
        {errorExportacion && <p role="alert" className="px-5 py-3 text-xs text-amber-800">{errorExportacion}</p>}
        {recentReadings.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead className="bg-gray-50 text-[10px] font-bold uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-5 py-3">Local date and time</th>
                  <th className="px-4 py-3">Heart rate · BPM</th>
                  <th className="px-4 py-3">Steps/min · calculated</th>
                  <th className="px-4 py-3">Total steps</th>
                  <th className="px-4 py-3">Distance · m</th>
                  <th className="px-4 py-3">Walking · kcal</th>
                  <th className="px-4 py-3">PAI · /100</th>
                  <th className="px-4 py-3">Stress · /10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentReadings.map((reading, index) => (
                  <tr key={`${reading.fecha_utc}-${index}`} className="text-gray-700">
                    <td className="whitespace-nowrap px-5 py-3">{formatDate(reading.fecha_utc, true)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pulso_bpm)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pasos_minuto, 1)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pasos_acumulados)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.distancia_calculada_m, 1)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.calorias_caminata_kcal, 1)}</td>
                    <td className="px-4 py-3">{formatNumber(reading.pai_7dias_1_100)}</td>
                    <td className="px-4 py-3">
                      {reading.estres_1_10 == null && reading.estado_calculo === 'calibrando'
                        ? 'Calibrating'
                        : formatNumber(reading.estres_1_10, 1)}
                    </td>
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
