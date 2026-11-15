import { useMemo } from 'react';
import { useWatchSession } from './SessionGate.jsx';
import { predecirSecuenciaEVEA } from './eveaEngine.js';

export function useEveaAssessment() {
  const { eveaAnswers, eveaHistory, eveaCurrentSaved } = useWatchSession();
  const evaluation = useMemo(() => {
    if (eveaAnswers.length !== 16 || !eveaAnswers.every((value) => Number.isInteger(value) && value >= 0 && value <= 10)) return null;
    const sequence = eveaCurrentSaved && eveaHistory.length
      ? eveaHistory : [...eveaHistory.slice(-14), eveaAnswers];
    return predecirSecuenciaEVEA(sequence).at(-1);
  }, [eveaAnswers, eveaHistory, eveaCurrentSaved]);
  return { evaluation, saved: eveaCurrentSaved };
}
