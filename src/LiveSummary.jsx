import { FEATURE_KEYS, hasValue, useHealthData } from './HealthDataContext';
import SharedPrediction from './SharedPrediction';
import HeartRateTrend from './HeartRateTrend';
import { useState } from 'react';
import { SummaryHealthStatus, MetricGuidanceDialog, RecommendationsDialog, useGuidance, Badge } from './HealthGuidance.jsx';


function display(value, decimals = 1) {
  return hasValue(value) ? value.toLocaleString('en-US', { maximumFractionDigits: decimals }) : '—';
}

export function SharedStatus() {
  const { watchData, watchError, suppliedCount, missing, prediction, predicting, sources } = useHealthData();
  const defaultCount = Object.values(sources).filter((source) => source?.kind === 'Default').length;
  const live = Boolean(watchData?.estado?.pulso_reciente);
  return <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-white px-6 py-5">
    <div>
      <p className="text-sm font-semibold text-slate-900">{live ? 'Live monitoring' : 'Waiting for live readings'}</p>
      <p className="mt-1 text-xs text-slate-500">{suppliedCount}/27 model inputs configured · {defaultCount} defaults · {missing.length} missing · shared across all views</p>
      {watchError && <p className="mt-2 text-xs text-amber-800">{watchError}</p>}
    </div>
    <p className="text-xs text-slate-500">{predicting ? 'Model updating…' : prediction ? 'Model result synchronized' : 'No current model result'}</p>
  </section>;
}

export default function LiveSummary() {
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [showActions, setShowActions] = useState(false);
  const [view, setView] = useState('overview');
  const { inputs, sources, watchData, activityRecent, watchError } = useHealthData();
  const { metrics, evea } = useGuidance();
  const state = watchData?.estado;
  const fields = [
    ['heart_rate_bpm', 'Heart rate', 'bpm'],
    ['systolic_bp_mmhg', 'Systolic pressure', 'mmHg'],
    ['diastolic_bp_mmhg', 'Diastolic pressure', 'mmHg'],
    ['blood_glucose_mg_dl', 'Blood glucose', 'mg/dL'],
    ['oxygen_saturation_pct', 'Oxygen saturation', '%'],
    ['body_temperature_c', 'Temperature', '°C'],
    ['sleep_duration_hours', 'Sleep', 'hours'],
    ['stress_level_1_10', 'Stress', '/10'],
  ];
  const other = [
    ['Steps', activityRecent ? state?.pasos_acumulados : null, 'steps', 'Today'],
    ['Distance', activityRecent ? state?.distancia_perfil_m : null, 'm', 'Calculated · today'],
    ['Walking calories', activityRecent ? state?.calorias_perfil_kcal : null, 'kcal', 'Calculated · today'],
    ['PAI', state?.pai_indice_7dias, '/100', 'Last 7 days'],
  ];
  return <div className="health-summary">
    <div className="summary-heading">
      <div><h2 className="text-xl font-semibold tracking-tight text-slate-900">Health summary</h2><p className="mt-1 text-xs text-slate-500">{state?.pulso_reciente ? '● Live watch data' : 'Waiting for live watch data'} · synchronized across views</p></div>
      <nav aria-label="Summary sections" className="flex rounded-full bg-slate-200/70 p-1">
        {[['overview', 'Overview'], ['trend', 'Heart rate trend'], ['details', 'Model details']].map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} onClick={() => setView(id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}>{label}</button>)}
      </nav>
    </div>
    {watchError && <p role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{watchError}</p>}
    {view === 'overview' && <div className="summary-overview">
      <SummaryHealthStatus onReview={() => setShowActions(true)} />
      <div className="summary-parameters">
        {fields.map(([key, label, unit]) => {
          const metric = metrics.find((item) => item.key === key);
          const level = metric?.severity || 'unrated';
          const flagged = level === 'warning' || level === 'critical';
          return <article key={key} className={`summary-parameter summary-parameter--${level}`}>
            <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">{label}</p>{metric && <Badge status={level} />}</div>
            <p className="summary-number">{display(inputs[key])}{hasValue(inputs[key]) && <span>{unit}</span>}</p>
            <div className="flex items-center justify-between gap-2 text-[11px]"><span className="text-slate-500">{sources[key]?.kind || 'Not provided'}{flagged && ` · ${metric.direction}`}</span>
              {metric && <button type="button" aria-label={`${label}: view status and recommendations`} onClick={() => setSelectedMetric(key)} className={`font-semibold hover:underline ${flagged ? 'text-current' : 'text-blue-600'}`}>{flagged ? 'Review →' : 'Details →'}</button>}
            </div>
          </article>;
        })}
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-600">Mood check-in · EVEA</h3><button type="button" onClick={() => setShowActions(true)} className="text-xs font-semibold text-blue-600 hover:underline">Support & actions →</button></div>
        <div className="summary-mood-grid">{evea.items.map((item) => <button type="button" key={item.key} onClick={() => setShowActions(true)} aria-label={`${item.title}, ${item.value ?? 'no reading'} out of 10${item.flagged ? ', warning' : ''}. View support actions.`} className={`summary-mood ${item.flagged ? 'summary-parameter--warning' : ''}`}>
          <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">{item.title}</span>{item.flagged && <Badge status="warning" />}</div>
          <p className="mt-1 text-xl font-semibold">{Number.isFinite(item.value) ? item.value.toFixed(1) : '—'}<span className="ml-1 text-xs font-normal text-slate-500">/10</span>{item.flagged && <span className="ml-2 text-[11px] font-medium">{item.key === 'alegria' ? 'Low' : 'Elevated'}</span>}</p>
        </button>)}</div>
      </div>
      <div className="summary-activity">{other.map(([label, value, unit, source]) => <div key={label} className="px-3 py-2"><p className="text-[11px] text-slate-500">{label}</p><p className="mt-0.5 text-base font-semibold text-slate-800">{display(value)}<span className="ml-1 text-[11px] font-normal text-slate-500">{hasValue(value) ? unit : ''}</span></p><p className="text-[10px] text-slate-500">{hasValue(value) ? source : 'No recent data'}</p></div>)}</div>
    </div>}
    {view === 'trend' && <HeartRateTrend />}
    {view === 'details' && <div className="space-y-4">
      <SharedPrediction showRecommendations={false} />
      <details className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium">All shared model inputs</summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{FEATURE_KEYS.map((key) => <div key={key} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{key.replaceAll('_', ' ')}</p><p className="mt-1 font-semibold">{display(inputs[key], 4)}</p><p className="mt-1 text-[10px] text-slate-400">{sources[key]?.kind || 'Not provided'}</p></div>)}</div>
      </details>
    </div>}
    <RecommendationsDialog open={showActions} onClose={() => setShowActions(false)} />
    <MetricGuidanceDialog metricKey={selectedMetric} onClose={() => setSelectedMetric(null)} />
  </div>;
}