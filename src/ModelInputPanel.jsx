import { MODEL_INPUT_GROUPS } from './modelInputFields';
import { hasValue, useHealthData } from './HealthDataContext';
import SharedPrediction from './SharedPrediction';
import { Badge, useGuidance } from './HealthGuidance.jsx';

const categories = {
  mission_phase: ['mission_phase_Late', 'mission_phase_Middle'],
  urine_protein: ['urine_protein_Positive', 'urine_protein_Trace'],
  urine_glucose: ['urine_glucose_Positive', 'urine_glucose_Trace'],
};

function categoryValue(inputs, key) {
  const [a, b] = categories[key];
  if (!hasValue(inputs[a]) || !hasValue(inputs[b])) return '';
  if (key === 'mission_phase') return inputs[a] ? 'Late' : inputs[b] ? 'Middle' : 'Early';
  return inputs[a] ? 'Positive' : inputs[b] ? 'Trace' : 'Negative';
}

export default function ModelInputPanel() {
  const { inputs, sources, setInputValues, clearInputs } = useHealthData();
  const { metrics } = useGuidance();

  function change(field, raw) {
    if (field.options) {
      const [a, b] = categories[field.key];
      setInputValues({
        [a]: raw === '' ? null : Number(raw === (field.key === 'mission_phase' ? 'Late' : 'Positive')),
        [b]: raw === '' ? null : Number(raw === (field.key === 'mission_phase' ? 'Middle' : 'Trace')),
      });
    } else {
      setInputValues({ [field.key]: raw.trim() === '' ? null : Number(raw) });
    }
  }

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="font-semibold text-slate-900">XGBoost Model Inputs (27)</h2>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Default settings and sliders are restored. Values stay synchronized
              with Summary and Smart Watch; available live readings take priority.
            </p>
          </div>
          <button type="button" onClick={clearInputs} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">
            Reset inputs
          </button>
        </header>
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          {MODEL_INPUT_GROUPS.map((group) => <section key={group.title} className="rounded-2xl bg-slate-50 p-4">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{group.title}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => {
                const key = field.options ? categories[field.key][0] : field.key;
                const source = sources[key];
                const assessment = metrics.find((metric) => metric.key === field.key);
                const flagged = assessment?.severity === 'warning' || assessment?.severity === 'critical';
                const locked = ['Watch', 'Calculated'].includes(source?.kind);
                const value = field.options ? categoryValue(inputs, field.key) : inputs[field.key];
                const min = field.options ? 0 : Math.min(field.min ?? 0, hasValue(value) ? value : field.min ?? 0);
                const max = field.options ? field.options.length - 1 : Math.max(field.max ?? 100, hasValue(value) ? value : field.max ?? 100);
                const sliderValue = field.options
                  ? Math.max(0, field.options.findIndex(([option]) => option === value))
                  : hasValue(value) ? value : min;
                return <label key={field.key} className={`block min-w-0 rounded-xl p-2 ${flagged ? `summary-parameter--${assessment.severity}` : ''}`}>
                  <span className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-700">
                    {field.label}{field.unit ? ` (${field.unit})` : ''}
                    {flagged && <Badge status={assessment.severity} />}
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-slate-500">
                      {source?.kind || 'No data'}
                    </span>
                  </span>
                  <p className="mb-2 text-sm font-bold tabular-nums text-slate-900">
                    {field.options
                      ? field.options.find(([option]) => option === value)?.[1] || 'Not provided'
                      : hasValue(value) ? `${value} ${field.unit || ''}` : 'Not provided'}
                  </p>
                  <input
                    type={field.options ? 'range' : field.inputType || 'range'}
                    min={min}
                    max={max}
                    step={field.options ? 1 : field.step || 'any'}
                    disabled={locked}
                    value={sliderValue}
                    aria-label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`}
                    title={locked ? 'Updated automatically from the live feed' : field.label}
                    onChange={(event) => change(field, field.options
                      ? field.options[Number(event.target.value)][0]
                      : event.target.value)}
                    className={field.inputType === 'number'
                      ? 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm'
                      : 'h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-[#007AFF] disabled:cursor-default disabled:opacity-60'}
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                    <span>{field.options ? field.options[0][1] : `${min} ${field.unit || ''}`}</span>
                    <span>{field.options ? field.options[field.options.length - 1][1] : `${max} ${field.unit || ''}`}</span>
                  </div>
                  {source?.timestamp && <span className="mt-1 block text-[10px] text-slate-400">
                    {new Date(source.timestamp).toLocaleTimeString('en-US')}
                  </span>}
                </label>;
              })}
            </div>
          </section>)}
        </div>
      </section>
      <SharedPrediction />
    </div>
  );
}
