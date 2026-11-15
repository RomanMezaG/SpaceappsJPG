import { useCallback, useEffect, useRef, useState } from 'react';
import { INITIAL_MODEL_INPUTS, MODEL_INPUT_GROUPS } from './modelInputFields';
import { getPredictionStatus } from './predictionStatus';

function getSelectValue(inputs, key) {
  if (key === 'urine_protein') {
    if (inputs.urine_protein_Positive) return 'Positive';
    if (inputs.urine_protein_Trace) return 'Trace';
    return 'Negative';
  }
  if (key === 'urine_glucose') {
    if (inputs.urine_glucose_Positive) return 'Positive';
    if (inputs.urine_glucose_Trace) return 'Trace';
    return 'Negative';
  }
  if (key === 'mission_phase') {
    if (inputs.mission_phase_Late) return 'Late';
    if (inputs.mission_phase_Middle) return 'Middle';
    return 'Early';
  }
  return String(inputs[key]);
}

function updateSelectValue(current, key, value) {
  if (key === 'urine_protein') {
    return {
      ...current,
      urine_protein_Positive: Number(value === 'Positive'),
      urine_protein_Trace: Number(value === 'Trace')
    };
  }
  if (key === 'urine_glucose') {
    return {
      ...current,
      urine_glucose_Positive: Number(value === 'Positive'),
      urine_glucose_Trace: Number(value === 'Trace')
    };
  }
  if (key === 'mission_phase') {
    return {
      ...current,
      mission_phase_Late: Number(value === 'Late'),
      mission_phase_Middle: Number(value === 'Middle')
    };
  }
  return { ...current, [key]: Number(value) };
}

export default function ModelInputPanel({ watchReading = null }) {
  const watchHeartRate = Number.isFinite(watchReading?.bpm) ? watchReading.bpm : null;
  const [inputs, setInputs] = useState(INITIAL_MODEL_INPUTS);
  const [prediction, setPrediction] = useState(null);
  const [predictionSource, setPredictionSource] = useState(null);
  const [predictionHeartRate, setPredictionHeartRate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputsRef = useRef(INITIAL_MODEL_INPUTS);
  const requestId = useRef(0);

  const runPrediction = useCallback(async (values, source) => {
    const currentRequestId = ++requestId.current;
    setLoading(true);
    setError('');
    setPrediction(null);
    setPredictionSource(null);

    try {
      const response = await fetch('/api/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.detail || 'The model could not make a prediction.');
      }
      if (!Number.isFinite(Number(result.prediction))) {
        throw new Error('The model returned a non-numeric prediction.');
      }
      if (currentRequestId === requestId.current) {
        setPrediction(result);
        setPredictionSource(source);
        setPredictionHeartRate(values.heart_rate_bpm);
      }
    } catch (requestError) {
      if (currentRequestId === requestId.current) {
        setError(requestError.message || 'Could not reach the prediction service.');
      }
    } finally {
      if (currentRequestId === requestId.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!Number.isFinite(watchHeartRate)) return;
    const updatedInputs = {
      ...inputsRef.current,
      heart_rate_bpm: watchHeartRate
    };
    inputsRef.current = updatedInputs;
    setInputs(updatedInputs);
    runPrediction(updatedInputs, 'watch');
  }, [watchReading?.timestamp, runPrediction]);

  const canPredict = Object.values(inputs).every(
    (value) => typeof value === 'number' && Number.isFinite(value)
  );
  const numericPrediction = prediction ? Number(prediction.prediction) : null;
  const displayedPrediction = numericPrediction?.toFixed(4);
  const predictionStatus =
    numericPrediction === null ? null : getPredictionStatus(numericPrediction);
  const predictionStatusClass =
    predictionStatus === 'normal'
      ? 'bg-[#34C759]/15 text-[#248A3D]'
      : predictionStatus === 'warning'
      ? 'bg-[#FF9500]/15 text-[#B25E00]'
      : 'bg-[#FF3B30]/15 text-[#D70015]';

  const handlePredict = (event) => {
    event.preventDefault();
    runPrediction(inputsRef.current, 'manual');
  };

  const handleInputChange = (field, value) => {
    const updatedInputs = field.options
      ? updateSelectValue(inputsRef.current, field.key, value)
      : { ...inputsRef.current, [field.key]: value };
    inputsRef.current = updatedInputs;
    setInputs(updatedInputs);
    requestId.current += 1;
    setLoading(false);
    setPrediction(null);
    setPredictionSource(null);
    setError('');
  };

  const handleReset = () => {
    const resetInputs = Number.isFinite(watchHeartRate)
      ? { ...INITIAL_MODEL_INPUTS, heart_rate_bpm: watchHeartRate }
      : INITIAL_MODEL_INPUTS;
    inputsRef.current = resetInputs;
    setInputs(resetInputs);
    requestId.current += 1;
    setLoading(false);
    setPrediction(null);
    setPredictionSource(null);
    setError('');
  };

  return (
    <form
      onSubmit={handlePredict}
      className="overflow-hidden rounded-[24px] bg-white shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 bg-gray-50/80 px-5 py-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">XGBoost Model Inputs (27)</h3>
          <p className="text-xs text-gray-500">
            {Number.isFinite(watchHeartRate)
              ? `Latest watch pulse: ${watchHeartRate} bpm. New live readings update this input and run a prediction automatically.`
              : 'Values are sent to the Python model service in training feature order. Connect a watch to sync heart rate.'}
          </p>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm ring-1 ring-black/5 transition hover:text-gray-900"
        >
          Reset inputs
        </button>
      </div>

      <div className="grid gap-5 p-5 xl:grid-cols-2">
        {MODEL_INPUT_GROUPS.map((group) => (
          <section key={group.title} className="rounded-2xl bg-[#F2F2F7]/60 p-4">
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              {group.title}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {group.fields.map((field) => (
                <label key={field.key} className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">
                    {field.label}
                    {field.key === 'heart_rate_bpm' && Number.isFinite(watchHeartRate) && (
                      <span className="ml-1.5 rounded-full bg-[#34C759]/15 px-2 py-0.5 text-[9px] font-bold text-[#248A3D]">
                        WATCH
                      </span>
                    )}
                  </span>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold tabular-nums text-gray-900">
                      {field.options
                        ? getSelectValue(inputs, field.key)
                        : `${Number(inputs[field.key]).toFixed(
                            Math.max(0, String(field.step).split('.')[1]?.length || 0)
                          )} ${field.unit}`}
                    </span>
                  </div>
                  <input
                    type={field.options ? 'range' : field.inputType || 'range'}
                    min={field.options ? 0 : field.min}
                    max={field.options ? field.options.length - 1 : field.max}
                    step={field.options ? 1 : field.step}
                    value={
                      field.options
                        ? field.options.findIndex(
                            ([value]) => value === getSelectValue(inputs, field.key)
                          )
                        : inputs[field.key]
                    }
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      handleInputChange(
                        field,
                        field.options ? field.options[value][0] : value
                      );
                    }}
                    aria-label={`${field.label}${field.unit ? ` (${field.unit})` : ''}`}
                    className={
                      field.inputType === 'number'
                        ? 'mt-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm'
                        : 'mt-2 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#007AFF]'
                    }
                  />
                  {(field.options || field.min !== undefined || field.max !== undefined) && (
                    <div className="mt-1 flex justify-between text-[10px] text-gray-400">
                      <span>
                        {field.options
                          ? field.options[0][1]
                          : field.min === undefined
                          ? ''
                          : `${field.min} ${field.unit}`}
                      </span>
                      <span>
                        {field.options
                          ? field.options[field.options.length - 1][1]
                          : field.max === undefined
                          ? ''
                          : `${field.max} ${field.unit}`}
                      </span>
                    </div>
                  )}
                </label>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 px-5 py-4">
        <button
          type="submit"
          disabled={loading || !canPredict}
          className="rounded-full bg-[#007AFF] px-5 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-[#0066D6] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? 'Running model…'
            : watchHeartRate !== null
            ? 'Run prediction again'
            : 'Run XGBoost prediction'}
        </button>
        {error && <p role="alert" className="text-sm font-semibold text-[#D70015]">{error}</p>}
      </div>

      {prediction && (
        <section aria-live="polite" className="border-t border-gray-100 bg-[#F2F2F7]/50 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {predictionSource === 'watch'
                  ? 'Watch-triggered XGBoost prediction'
                  : 'Predicted model value'}
              </h4>
              <p className="mt-1 text-2xl font-extrabold text-gray-900">{displayedPrediction}</p>
              {predictionSource === 'watch' && (
                <p className="mt-1 text-xs text-gray-500">
                  Evaluated with watch heart rate: {predictionHeartRate} bpm
                </p>
              )}
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-extrabold ${predictionStatusClass}`}>
              {predictionStatus}
            </span>
          </div>
          {prediction.probabilities && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(prediction.probabilities).map(([label, probability]) => (
                <span key={label} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-black/5">
                  {label}: {(probability * 100).toFixed(1)}%
                </span>
              ))}
            </div>
          )}
        </section>
      )}
    </form>
  );
}
