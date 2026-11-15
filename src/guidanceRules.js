import { getPredictionStatus } from './predictionStatus';

// Project display bands, retained from the original dashboard; not diagnostic cutoffs.
const bpActions = {
  high: ['Pause activity and rest quietly for at least 5 minutes.', 'Check cuff size and placement; repeat two readings one minute apart using the approved measurement procedure.', 'Record both pressure values and any symptoms; request medical review if elevation persists.'],
  low: ['Pause activity and remain supported if lightheaded.', 'Check cuff placement and repeat the measurement.', 'Record dizziness, weakness, medications and recent fluid intake for medical review.'],
};
const define = (key, title, unit, group, range, context, actions) => ({ key, title, unit, group, range, context, actions });
export const GUIDANCE_RULES = [
  define('heart_rate_bpm', 'Heart rate', 'bpm', 'Cardio & respiratory', [55, 95, 45, 130],
    'Changes in gravity and activity affect cardiovascular adaptation. Compare readings with activity and the crew member’s baseline.', {
      high: ['Pause activity and check the reading after resting.', 'Check sensor contact and confirm the pulse with an approved method.', 'Record recent exercise, palpitations and other symptoms.'],
      low: ['Check sensor contact and confirm the pulse.', 'Record whether this occurred during sleep or rest and whether dizziness is present.'],
    }),
  define('systolic_bp_mmhg', 'Systolic pressure', 'mmHg', 'Cardio & respiratory', [100, 128, 85, 150],
    'Blood pressure helps track cardiovascular adaptation across gravity environments. Interpret systolic and diastolic readings together.', bpActions),
  define('diastolic_bp_mmhg', 'Diastolic pressure', 'mmHg', 'Cardio & respiratory', [60, 80, 50, 100],
    'Interpret this reading with systolic pressure, symptoms and the approved mission measurement procedure.', bpActions),
  define('blood_glucose_mg_dl', 'Blood glucose', 'mg/dL', 'Metabolic & recovery', [72, 115, 60, 140],
    'Glucose interpretation depends on meal timing, activity, medications and the measurement method. Record whether the reading was fasting or after food.', {
      high: ['Confirm the glucose reading with the approved measurement method.', 'Record the time of the last meal, symptoms and recent activity.', 'Contact the medical officer for persistent elevation and follow the individual glucose-management plan.'],
      low: ['Confirm the reading promptly and check for symptoms.', 'Follow the crew member’s approved hypoglycemia protocol; alert the medical officer.', 'If the crew member is confused, unconscious or unable to swallow, activate the emergency medical procedure.'],
    }),
  define('oxygen_saturation_pct', 'Oxygen saturation', '%', 'Cardio & respiratory', [95, 100, 91, 100],
    'A closed spacecraft environment requires atmospheric monitoring. Evaluate low oxygen readings alongside sensor quality, cabin information and symptoms.', {
      low: ['Reposition the sensor and repeat the measurement with approved equipment.', 'Check cabin oxygen, carbon dioxide and pressure indicators using the cabin procedure.', 'Report breathing difficulty or a persistent low reading promptly.'],
      high: ['Check units and sensor validity; saturation cannot exceed 100%.', 'Repeat the measurement.'],
    }),
  define('body_temperature_c', 'Body temperature', '°C', 'Metabolic & recovery', [36.2, 37.3, 35.2, 38.2],
    'Temperature trends support assessment of thermal conditions and illness in a closed habitat. Measurement site and device affect interpretation.', {
      high: ['Repeat with an approved thermometer and record the measurement site.', 'Review environmental temperature, recent exertion and accompanying symptoms.', 'Request medical review if the elevation persists.'],
      low: ['Repeat with an approved thermometer.', 'Review exposure and cabin temperature; follow the thermal-care procedure.'],
    }),
  define('sleep_duration_hours', 'Sleep duration', 'hours', 'Metabolic & recovery', [6.8, 8.5, 4.8, 10.5],
    'Isolation, workload and the spacecraft environment can affect sleep and behavioral health. Review sleep alongside fatigue and mission scheduling.', {
      low: ['Review recent sleep and fatigue with the crew lead.', 'Plan a protected rest period and reduce light and noise in the sleep area.'],
      high: ['Confirm sleep duration and device recording accuracy.', 'Review persistent fatigue, interrupted sleep and recent schedule changes.'],
    }),
  define('ambient_radiation_msv_day', 'Ambient radiation', 'mSv/day', 'Environment', [0, 1, 0, 2.5],
    'Space radiation requires dedicated dosimetry and mission-specific exposure limits. A watch cannot measure radiation.', {
      high: ['Verify the dosimeter reading, units and exposure interval.', 'Review the mission radiation alert and shelter procedures with mission control.'],
      low: ['Check dosimeter units and data validity.'],
    }),
  define('urine_specific_gravity', 'Urine specific gravity', 'SG', 'Metabolic & recovery', [1.008, 1.022, 1.003, 1.027],
    'Urine measurements require sample and clinical context; they cannot establish hydration status on their own.', {
      high: ['Confirm sample collection and measurement.', 'Review fluid intake and symptoms with the medical officer.'],
      low: ['Confirm sample collection and measurement.', 'Review recent fluid intake and the trend with the medical officer.'],
    }),
];

export const LEVEL_RANK = { unknown: -1, normal: 0, warning: 1, critical: 2 };
export function assessGuidance(inputs, sources, prediction) {
  const metrics = GUIDANCE_RULES.map((rule) => {
    const value = inputs[rule.key];
    const available = typeof value === 'number' && Number.isFinite(value);
    const [min, max, criticalMin, criticalMax] = rule.range;
    const severity = !available ? 'unknown' : value < criticalMin || value > criticalMax ? 'critical'
      : value < min || value > max ? 'warning' : 'normal';
    const direction = value > max ? 'high' : 'low';
    const actions = severity === 'unknown' || severity === 'normal' ? [] : [...rule.actions[direction]];
    if (severity === 'critical') actions.push('Notify the flight surgeon or medical officer and open a medical event; follow the approved mission protocol.');
    return { ...rule, value, severity, direction, actions, source: sources[rule.key]?.kind || 'Missing' };
  });
  const alerts = metrics.filter((metric) => LEVEL_RANK[metric.severity] > 0)
    .sort((a, b) => LEVEL_RANK[b.severity] - LEVEL_RANK[a.severity]);
  const modelStatus = prediction && Number.isFinite(prediction.data.prediction)
    ? getPredictionStatus(prediction.data.prediction) : 'unknown';
  const parameterStatus = metrics.reduce((level, metric) => LEVEL_RANK[metric.severity] > LEVEL_RANK[level] ? metric.severity : level, 'unknown');
  const status = LEVEL_RANK[modelStatus] > LEVEL_RANK[parameterStatus] ? modelStatus : parameterStatus;
  return { metrics, alerts, modelStatus, status };
}
