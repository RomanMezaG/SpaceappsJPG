import { useHealthData } from './HealthDataContext';
import { getPredictionStatus } from './predictionStatus';
import { RecommendedActions } from './HealthGuidance.jsx';

export default function SharedPrediction({ showRecommendations = true }) {
  const { prediction, predicting, predictionError, suppliedCount, missing,
    allowImputation, setAllowImputation, canPredict, predictNow, sources } = useHealthData();
  const defaultCount = Object.values(sources).filter((source) => source?.kind === 'Default').length;
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">XGBoost · shared result</h3>
          <p className="mt-1 text-xs text-slate-500">{suppliedCount}/27 inputs configured · {defaultCount} defaults · same data across all tabs</p>
        </div>
        <button type="button" onClick={predictNow} disabled={!canPredict || predicting}
          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
          {predicting ? 'Updating…' : 'Run prediction'}
        </button>
      </div>
      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer">Missing input options</summary>
      <label className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600">
        <input type="checkbox" checked={allowImputation}
          onChange={(event) => setAllowImputation(event.target.checked)} className="mt-1" />
        <span>Allow the saved model imputer to fill missing inputs for prediction.
          Filled inputs remain marked as missing in the interface.</span>
      </label>
      </details>
      {!canPredict && <p className="mt-3 text-sm text-slate-500">
        {suppliedCount ? `${missing.length} inputs missing. Add values or enable imputation to predict.` : 'Waiting for available inputs.'}
      </p>}
      {predictionError && <p role="alert" className="mt-3 text-sm text-amber-800">{predictionError}</p>}
      {prediction && <div className="mt-4 border-t border-slate-100 pt-4" aria-live="polite">
        <p className="text-3xl font-semibold text-slate-900">{prediction.data.prediction.toFixed(4)}</p>
        <p className="mt-1 text-sm font-medium text-slate-600">Model output: {getPredictionStatus(prediction.data.prediction)}</p>
        <p className="mt-2 text-xs text-slate-500">
          {prediction.data.provided_features.length} supplied · {prediction.data.imputed_features.length} imputed
          {' · '}Evaluated {new Date(prediction.evaluatedAt).toLocaleTimeString('en-US')}
        </p>
        <details className="mt-3 text-xs text-slate-500">
          <summary className="cursor-pointer">Inputs used for this result</summary>
          <div className="mt-2 max-h-48 overflow-auto rounded-xl bg-slate-50 p-3 font-mono">
            {Object.entries(prediction.data.input_values).map(([key, value]) => <p key={key}>
              {key}: {value === null ? 'Missing · imputed internally' : `${value} · ${prediction.sourceKinds?.[key] || 'Supplied'}`}
            </p>)}
          </div>
        </details>
      </div>}
      {showRecommendations && <RecommendedActions />}
    </section>
  );
}
