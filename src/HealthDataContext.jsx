import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useWatchSession } from './SessionGate';
import { INITIAL_MODEL_INPUTS } from './modelInputFields';

const Context = createContext(null);
export const useHealthData = () => useContext(Context);
export const FEATURE_KEYS = Object.keys(INITIAL_MODEL_INPUTS);
const emptyInputs = () => Object.fromEntries(FEATURE_KEYS.map((key) => [key, null]));
const defaultInputs = () => ({ ...INITIAL_MODEL_INPUTS });
const defaultSources = () => Object.fromEntries(FEATURE_KEYS.map((key) => [key, { kind: 'Default', timestamp: null }]));
export const hasValue = (value) => typeof value === 'number' && Number.isFinite(value);

export function extractModelInputs(row) {
  const normalized = Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/^\uFEFF/, '').trim().toLowerCase(), value,
  ]));
  const aliases = {
    heart_rate_bpm: ['heart_rate_bpm', 'pulso_bpm', 'bpm'],
    systolic_bp_mmhg: ['systolic_bp_mmhg', 'systolic'],
    diastolic_bp_mmhg: ['diastolic_bp_mmhg', 'diastolic'],
    blood_glucose_mg_dl: ['blood_glucose_mg_dl', 'glucose_mg_dl'],
    oxygen_saturation_pct: ['oxygen_saturation_pct', 'spo2'],
    body_temperature_c: ['body_temperature_c', 'temperature_c'],
    sleep_duration_hours: ['sleep_duration_hours', 'sleep_hours'],
    stress_level_1_10: ['stress_level_1_10', 'estres_1_10', 'activacion_estimada_1_10'],
  };
  const values = emptyInputs();
  for (const key of FEATURE_KEYS) {
    const alias = (aliases[key] || [key]).find((name) => normalized[name] !== undefined);
    const raw = alias ? normalized[alias] : null;
    if (raw !== null && String(raw).trim() !== '') {
      const value = Number(String(raw).trim());
      if (hasValue(value)) values[key] = value;
    }
  }
  return values;
}

export default function HealthDataProvider({ children }) {
  const { sessionId, expireSession } = useWatchSession();
  const [watchData, setWatchData] = useState(null);
  const [watchError, setWatchError] = useState('');
  const [watchLoading, setWatchLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);
  const [manual, setManual] = useState(defaultInputs);
  const [manualSources, setManualSources] = useState(defaultSources);
  const [allowImputation, setAllowImputation] = useState(false);
  const [result, setResult] = useState(null);
  const [predictionError, setPredictionError] = useState('');
  const [predicting, setPredicting] = useState(false);
  const requestId = useRef(0);
  const predictionAbort = useRef(null);
  const refreshRef = useRef(null);

  useEffect(() => {
    let closed = false;
    let timer;
    let controller;
    let inFlight = false;
    async function poll() {
      if (closed || inFlight) return;
      clearTimeout(timer);
      inFlight = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch('/api/watch', {
          headers: { 'X-Watch-Session': sessionId },
          signal: controller.signal,
          cache: 'no-store',
        });
        const data = await response.json();
        if (closed) return;
        if (!response.ok) {
          if (response.status === 409) expireSession();
          throw new Error(typeof data.detail === 'string' ? data.detail : 'Could not load watch data.');
        }
        setWatchData(data);
        setWatchError('');
        setLastChecked(new Date());
      } catch (error) {
        if (!closed) {
          setWatchData(null);
          setWatchError(error.name === 'AbortError' ? 'Watch service timed out.' : error.message);
        }
      } finally {
        clearTimeout(timeout);
        inFlight = false;
        if (!closed) {
          setWatchLoading(false);
          timer = setTimeout(poll, 2000);
        }
      }
    }
    refreshRef.current = poll;
    poll();
    return () => {
      closed = true;
      clearTimeout(timer);
      controller?.abort();
      refreshRef.current = null;
    };
  }, [sessionId, expireSession]);

  const setInputValues = useCallback((updates, kind = 'Manual') => {
    const accepted = Object.fromEntries(Object.entries(updates).filter(([key]) => FEATURE_KEYS.includes(key)));
    setManual((previous) => ({ ...previous, ...Object.fromEntries(
      Object.entries(accepted).map(([key, value]) => [key, hasValue(value) ? value : null]),
    ) }));
    setManualSources((previous) => ({ ...previous, ...Object.fromEntries(
      Object.entries(accepted).map(([key, value]) => [key, hasValue(value)
        ? { kind, timestamp: new Date().toISOString() } : null]),
    ) }));
  }, []);

  const importModelInputs = useCallback((values) => {
    const available = Object.fromEntries(Object.entries(values).filter(([key, value]) => FEATURE_KEYS.includes(key) && hasValue(value)));
    setManual({ ...defaultInputs(), ...available });
    setManualSources({ ...defaultSources(), ...Object.fromEntries(Object.keys(available).map((key) => [key, { kind: 'CSV', timestamp: new Date().toISOString() }])) });
  }, []);
  const clearInputs = useCallback(() => {
    setManual(defaultInputs());
    setManualSources(defaultSources());
  }, []);

  const { inputs, sources } = useMemo(() => {
    const inputs = { ...manual };
    const sources = { ...manualSources };
    const state = watchData?.estado;
    if (state?.pulso_reciente && hasValue(state.pulso_bpm)) {
      inputs.heart_rate_bpm = state.pulso_bpm;
      sources.heart_rate_bpm = { kind: 'Watch', timestamp: state.pulso_fecha_utc };
      if (hasValue(state.activacion_estimada_1_10)) {
        inputs.stress_level_1_10 = state.activacion_estimada_1_10;
        sources.stress_level_1_10 = { kind: 'Calculated', timestamp: state.activacion_fecha_utc };
      }
    }
    return { inputs, sources };
  }, [manual, manualSources, watchData]);

  const missing = FEATURE_KEYS.filter((key) => !hasValue(inputs[key]));
  const suppliedCount = FEATURE_KEYS.length - missing.length;
  const summaryTime = Date.parse(watchData?.estado?.resumen_fecha_utc || '');
  const activityRecent = Boolean(watchData?.estado?.conectado)
    && Number.isFinite(summaryTime) && Date.now() - summaryTime <= 45000
    && Date.now() >= summaryTime;
  const canPredict = suppliedCount > 0 && (allowImputation || !missing.length);
  const signature = JSON.stringify(inputs);
  const sourceSignature = JSON.stringify(Object.fromEntries(FEATURE_KEYS.map((key) => [key, sources[key]?.kind || 'Missing'])));
  const readingTimestamp = watchData?.estado?.pulso_reciente
    ? watchData.estado.pulso_fecha_utc : null;
  const snapshotKey = `${signature}|${sourceSignature}|${readingTimestamp || ''}|${allowImputation}`;

  const runPrediction = useCallback(async (values, key, impute, timestamp, sourceKinds) => {
    predictionAbort.current?.abort();
    const controller = new AbortController();
    predictionAbort.current = controller;
    const id = ++requestId.current;
    setPredicting(true);
    setPredictionError('');
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const query = new URLSearchParams({ allow_imputation: String(impute), snapshot_id: String(id) });
      const response = await fetch(`/api/predict?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Check the supplied model inputs.');
      if (!hasValue(data.prediction)) throw new Error('The model returned an invalid prediction.');
      if (!Array.isArray(data.provided_features) || !Array.isArray(data.imputed_features) || !data.input_values) {
        throw new Error('Restart the model API to load shared-input support.');
      }
      if (id === requestId.current) setResult({ data, key, values, timestamp, sourceKinds, evaluatedAt: new Date().toISOString() });
    } catch (error) {
      if (id === requestId.current && error.name !== 'AbortError') setPredictionError(error.message);
      if (id === requestId.current && error.name === 'AbortError' && !controller.signal.reason?.includes?.('obsolete')) {
        // An explicit new snapshot invalidates this request before aborting it.
        setPredictionError('Prediction was interrupted or timed out.');
      }
    } finally {
      clearTimeout(timeout);
      if (id === requestId.current) setPredicting(false);
    }
  }, []);

  useEffect(() => {
    requestId.current += 1;
    predictionAbort.current?.abort('obsolete snapshot');
    setResult(null);
    setPredictionError('');
    if (!canPredict) {
      setPredicting(false);
      return;
    }
    setPredicting(true);
    const timer = setTimeout(() => runPrediction(
      JSON.parse(signature), snapshotKey, allowImputation, readingTimestamp, JSON.parse(sourceSignature),
    ), 350);
    return () => {
      clearTimeout(timer);
      requestId.current += 1;
      predictionAbort.current?.abort('obsolete snapshot');
    };
  }, [signature, sourceSignature, snapshotKey, allowImputation, readingTimestamp, canPredict, runPrediction]);

  const value = {
    watchData, watchError, watchLoading, lastChecked, activityRecent,
    refreshWatch: () => refreshRef.current?.(),
    inputs, sources, missing, suppliedCount, canPredict,
    setInputValues, importModelInputs, clearInputs,
    allowImputation, setAllowImputation,
    prediction: result?.key === snapshotKey ? result : null,
    predictionError, predicting,
    predictNow: () => canPredict && runPrediction(inputs, snapshotKey, allowImputation, readingTimestamp, JSON.parse(sourceSignature)),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
