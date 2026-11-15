import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useHealthData } from './HealthDataContext';
import { assessGuidance, LEVEL_RANK } from './guidanceRules.js';
import { useEveaAssessment } from './useEveaAssessment.js';
import { getEveaSupport } from './eveaSupport.js';

const colors = { normal: '#15803d', warning: '#b45309', critical: '#dc2626', unknown: '#64748b' };
export function useGuidance() {
  const { inputs, sources, prediction } = useHealthData();
  const { evaluation, saved } = useEveaAssessment();
  const physical = assessGuidance(inputs, sources, prediction);
  const evea = { ...getEveaSupport(evaluation), saved };
  return { ...physical, evea, status: LEVEL_RANK[evea.status] > LEVEL_RANK[physical.status] ? evea.status : physical.status };
}
export function Badge({ status }) {
  return <span className={`health-badge health-badge--${status}`}>{status === 'warning' || status === 'critical' ? '⚠ ' : ''}{status === 'unknown' ? 'Pending' : status}</span>;
}
function Checklist({ actions }) {
  const [done, setDone] = useState({});
  return <ul className="mt-3 space-y-3">{actions.map((action) => <li key={action}>
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-6 text-slate-600">
      <input type="checkbox" className="mt-1.5" checked={Boolean(done[action])}
        onChange={(event) => setDone((previous) => ({ ...previous, [action]: event.target.checked }))} />
      <span>{action}</span>
    </label>
  </li>)}</ul>;
}
function GuidanceNotes() {
  return <details className="mt-4 text-xs leading-5 text-slate-500">
    <summary className="cursor-pointer">How status and recommendations work</summary>
    <p className="mt-2">Parameter flags use configured project bands, not diagnostic limits. Meal timing, symptoms and individual mission limits require medical interpretation. Default inputs are configuration values. XGBoost provides an overall classification; these parameter checks do not explain which inputs caused its result.</p>
    <p className="mt-2">Measurement and mission context: <a className="underline" href="https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home" target="_blank" rel="noreferrer">AHA blood pressure</a> · <a className="underline" href="https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia" target="_blank" rel="noreferrer">NIDDK glucose</a> · <a className="underline" href="https://www.nasa.gov/hrp/hazards/" target="_blank" rel="noreferrer">NASA spaceflight hazards</a>.</p>
  </details>;
}

export function RecommendedActions() {
  const { alerts, modelStatus, evea } = useGuidance();
  const { predicting, predictionError } = useHealthData();
  return <div className="mt-5 border-t border-slate-100 pt-5">
    <h3 className="text-sm font-semibold text-slate-900">Recommended actions</h3>
    {alerts.map((metric) => <details key={`${metric.key}:${metric.direction}:${metric.severity}:${metric.source}`} open className="mt-3 rounded-2xl border border-slate-100 p-4">
      <summary className="cursor-pointer text-sm font-semibold" style={{ color: colors[metric.severity] }}>
        {metric.title} · {metric.value} {metric.unit} · {metric.direction} <Badge status={metric.severity} />
      </summary>
      <p className="mt-2 text-xs text-slate-500">Source: {metric.source}</p>
      <Checklist actions={metric.actions} />
    </details>)}
    {LEVEL_RANK[modelStatus] > 0 && <div className="mt-3 rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold" style={{ color: colors[modelStatus] }}>XGBoost · {modelStatus.toUpperCase()}</p>
      <p className="mt-1 text-xs text-slate-500">Review the overall model alert alongside the parameter checks.</p>
      <Checklist key={modelStatus} actions={[
        'Verify the supplied measurements, units and timestamps; review default or imputed inputs.',
        'Record symptoms and share the current readings and model result with the medical officer.',
        ...(modelStatus === 'critical' ? ['Prioritize medical review and follow the approved emergency procedure if severe symptoms are present.'] : []),
      ]} />
    </div>}
    {LEVEL_RANK[evea.status] > 0 && <div className="mt-4 rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-slate-900">EVEA · Behavioral health support</h4><Badge status={evea.status} /></div>
      <p className="mt-2 text-xs text-slate-500">HMM result: {evea.modelStatus.toUpperCase()} · {evea.saved ? 'Saved assessment' : 'Current assessment preview'}</p>
      {evea.flags.map((item) => <div key={item.key} className="mt-4 border-t border-slate-100 pt-3">
        <p className="text-sm font-semibold text-amber-800">{item.title}: {item.value.toFixed(2)}/10 · {item.key === 'alegria' ? 'Low reported joy' : 'Elevated reported level'}</p>
        <Checklist key={`${item.key}:${evea.saved}`} actions={item.actions} />
      </div>)}
      <Checklist key={`${evea.modelStatus}:${evea.saved}`} actions={[
        'Review the check-in responses and any changes in mood, sleep or task performance.',
        'Arrange a private behavioral health follow-up and record a new check-in at the agreed time.',
        ...(evea.status === 'critical' ? ['Prioritize contact with the medical officer to assess symptoms and support needs.'] : []),
      ]} />
      <details className="mt-4 text-xs leading-5 text-slate-500"><summary className="cursor-pointer">Assessment context</summary>
        <p className="mt-2">Dimension review prompts use project thresholds: anxiety, anger or sadness ≥5/10; joy ≤4/10. These are not validated diagnostic cutoffs. The existing HMM uses simulation-derived parameters; its classification is shown separately from dimension flags.</p>
        <p className="mt-2">Isolation, confinement and workload can affect mood and sleep. <a className="underline" href="https://www.nasa.gov/reference/risk-of-behavioral-changes-and-psychiatric-disorders/" target="_blank" rel="noreferrer">NASA behavioral health context</a>.</p>
      </details>
    </div>}
    {!alerts.length && LEVEL_RANK[modelStatus] <= 0 && LEVEL_RANK[evea.status] <= 0 && <p className="mt-3 text-sm text-slate-500">No configured parameter or EVEA alerts.{predicting ? ' Model evaluation is updating.' : predictionError ? ' Model evaluation is unavailable.' : modelStatus === 'unknown' ? ' Model evaluation is pending.' : ''}</p>}
    <GuidanceNotes />
  </div>;
}

export function SummaryHealthStatus({ onReview }) {
  const { metrics, alerts, modelStatus, status, evea } = useGuidance();
  const { predicting, predictionError } = useHealthData();
  const groups = [...new Set(metrics.map((metric) => metric.group))].map((name) => {
    const members = metrics.filter((metric) => metric.group === name);
    return {
      name,
      status: members.reduce((level, metric) => LEVEL_RANK[metric.severity] > LEVEL_RANK[level] ? metric.severity : level, 'unknown'),
      detail: `${members.filter((metric) => metric.severity === 'normal').length}/${members.length} within configured range`,
    };
  });
  groups.push({ name: 'Behavioral health · EVEA', status: evea.status, detail: `${evea.flags.length} review flags · ${evea.saved ? 'Saved assessment' : 'Current preview'}` });
  const previews = [];
  if (alerts.length) {
    const first = alerts[0];
    previews.push({ id: `${first.key}:${first.direction}:${first.severity}`, title: first.title, status: first.severity,
      detail: `${first.value} ${first.unit} · ${first.source}`, actions: first.severity === 'critical'
        ? [first.actions[0], first.actions.at(-1)] : first.actions.slice(0, 2) });
  }
  if (LEVEL_RANK[evea.status] > 0) {
    const mood = evea.flags[0];
    previews.push({ id: `evea:${evea.status}:${mood?.key || 'hmm'}`, title: mood ? `EVEA · ${mood.title}` : 'EVEA assessment', status: evea.status,
      detail: mood ? `${mood.value.toFixed(1)}/10 · ${mood.key === 'alegria' ? 'Low reported joy' : 'Elevated reported level'}` : `HMM result: ${evea.modelStatus.toUpperCase()}`,
      actions: evea.status === 'critical' ? ['Prioritize contact with the medical officer to assess symptoms and support needs.', 'Review the check-in responses and recent changes in mood or sleep.']
        : mood?.actions.slice(0, 2) || ['Arrange a private behavioral health follow-up.', 'Review recent changes in mood, sleep and task performance.'] });
  }
  if (LEVEL_RANK[modelStatus] > 0) previews.push({ id: `model:${modelStatus}`, title: 'XGBoost assessment', status: modelStatus,
    detail: 'Current shared model result', actions: ['Verify the supplied measurements, units and timestamps.', 'Share the readings and model result with the medical officer.'] });
  const priority = previews.sort((a, b) => LEVEL_RANK[b.status] - LEVEL_RANK[a.status]).slice(0, 2);
  return <section className={`summary-focus summary-focus--${status}`} aria-label="Overall monitoring status">
    <div className="summary-focus-main">
      <div className="flex flex-wrap items-center gap-2"><Badge status={status} /><span className="text-[11px] font-medium text-slate-500">Mission health status</span></div>
      <h3 className="summary-focus-title">{status === 'critical' ? 'Priority health review in orbit' : status === 'warning' ? 'Health indicators need attention' : status === 'unknown' ? 'Waiting for health assessment' : 'No configured health alerts'}</h3>
      <p className="summary-focus-description">{alerts.length || evea.flags.length ? `${alerts.length} parameter alerts and ${evea.flags.length} mood flags need review.` : LEVEL_RANK[modelStatus] > 0 || LEVEL_RANK[evea.modelStatus] > 0 ? 'A model assessment needs review alongside the current measurements.' : 'Review current readings and continue routine monitoring.'} {metrics.filter((metric) => metric.source === 'Default').length} default values in use.</p>
      <div className="summary-focus-signals">
        {alerts.slice(0, 3).map((metric) => <span key={metric.key} style={{ color: colors[metric.severity] }}>{metric.title}: {metric.value} {metric.unit}</span>)}
        {alerts.length > 3 && <button type="button" onClick={onReview}>+{alerts.length - 3} more alerts</button>}
        <span>XGBoost: <strong style={{ color: colors[modelStatus] }}>{predicting ? 'Updating…' : predictionError ? 'Unavailable' : modelStatus === 'unknown' ? 'Pending' : modelStatus.toUpperCase()}</strong></span>
        <span>EVEA HMM: <strong style={{ color: colors[evea.modelStatus] }}>{evea.modelStatus.toUpperCase()}</strong></span>
      </div>
      <div className="summary-focus-actions">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2"><h4 className="text-xs font-semibold text-slate-900">Recommended actions</h4><button type="button" onClick={onReview} className="text-xs font-semibold text-blue-700 hover:underline">View all actions ↗</button></div>
        {priority.length ? <div className="summary-focus-action-grid">{priority.map((item) => <div key={item.id}>
          <p className="text-xs font-semibold" style={{ color: colors[item.status] }}>{item.status === 'critical' ? 'Critical' : 'Caution'} · {item.title}</p>
          <p className="mt-1 text-[10px] text-slate-500">{item.detail}</p>
          <Checklist actions={item.actions} />
        </div>)}</div> : <p className="mt-2 text-xs leading-5 text-slate-500">{status === 'unknown' ? 'Complete the measurements and assessment to receive guidance.' : 'No additional actions from the configured checks. Continue scheduled check-ins.'}</p>}
      </div>
    </div>
    <aside className="summary-focus-groups" aria-label="Status by health system">{groups.map((group) => <div key={group.name} className="summary-focus-group">
      <div><p className="text-xs font-semibold text-slate-900">{group.name}</p><p className="mt-1 text-[10px] text-slate-500">{group.detail}</p></div><Badge status={group.status} />
    </div>)}</aside>
  </section>;
}
export function RecommendationsDialog({ open, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    return () => { if (dialog.open) dialog.close(); };
  }, [open]);
  return <dialog ref={ref} onCancel={onClose} aria-labelledby="summary-actions-title" className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-xl backdrop:bg-slate-900/30">
    <div className="flex items-center justify-between gap-3"><h2 id="summary-actions-title" className="text-xl font-semibold text-slate-900">Health review</h2><button type="button" onClick={onClose} aria-label="Close health review" className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button></div>
    <RecommendedActions />
  </dialog>;
}
export function MetricGuidanceDialog({ metricKey, onClose }) {
  const ref = useRef(null);
  const { metrics } = useGuidance();
  const metric = metrics.find((item) => item.key === metricKey);
  useEffect(() => {
    const dialog = ref.current;
    if (metricKey && dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, [metricKey]);
  if (!metric) return null;
  return <dialog ref={ref} onCancel={onClose} aria-labelledby="metric-guidance-title"
    className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-3xl bg-white p-6 text-slate-900 shadow-xl backdrop:bg-slate-900/30">
    <div className="flex items-start justify-between gap-3"><h2 id="metric-guidance-title" className="text-xl font-semibold">{metric.title}</h2><button type="button" onClick={onClose} aria-label="Close recommendations" className="rounded-full bg-slate-100 p-2"><X className="h-4 w-4" /></button></div>
    <p className="mt-5 text-3xl font-semibold">{metric.value ?? '—'} <span className="text-sm font-normal text-slate-500">{metric.unit}</span></p>
    <div className="mt-3 flex items-center gap-2"><Badge status={metric.severity} /><span className="text-xs text-slate-500">{metric.source}</span></div>
    <p className="mt-3 text-xs text-slate-500">Configured range: {metric.range[0]}–{metric.range[1]} {metric.unit}</p>
    <h3 className="mt-6 text-sm font-semibold">Recommended actions</h3>
    {metric.actions.length ? <Checklist key={`${metric.key}:${metric.direction}:${metric.severity}:${metric.source}`} actions={metric.actions} /> : <p className="mt-2 text-sm text-slate-500">{metric.severity === 'unknown' ? 'Add a measurement to assess this parameter.' : 'No configured parameter alert. Continue routine monitoring.'}</p>}
    <div className="mt-6 rounded-2xl bg-slate-50 p-4"><h3 className="text-sm font-semibold">Physiological relevance in spaceflight</h3><p className="mt-2 text-sm leading-6 text-slate-600">{metric.context}</p></div>
    <GuidanceNotes />
  </dialog>;
}
