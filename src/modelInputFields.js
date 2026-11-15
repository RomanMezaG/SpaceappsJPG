export const INITIAL_MODEL_INPUTS = {
  mission_day: 89.7,
  heart_rate_bpm: 69,
  systolic_bp_mmhg: 116,
  diastolic_bp_mmhg: 74,
  blood_glucose_mg_dl: 94.2,
  oxygen_saturation_pct: 97.8,
  ambient_radiation_msv_day: 0.451,
  radiation_dose_interval_msv: 0.2708,
  radiation_cumulative_msv: 42.261,
  body_temperature_c: 36.75,
  sleep_duration_hours: 6.72,
  urine_ph: 6.17,
  urine_specific_gravity: 1.0185,
  intraocular_pressure_mmhg: 15.9,
  muscle_mass_kg: 30.91,
  baseline_muscle_mass_kg: 32.52,
  muscular_atrophy_pct: 3.86,
  exercise_duration_min_day: 96,
  water_intake_l_day: 2.34,
  calorie_intake_kcal_day: 2411,
  stress_level_1_10: 3.2,
  mission_phase_Late: 0,
  mission_phase_Middle: 0,
  urine_protein_Positive: 0,
  urine_protein_Trace: 0,
  urine_glucose_Positive: 0,
  urine_glucose_Trace: 0
};

export const MODEL_INPUT_GROUPS = [
  {
    title: 'Mission and Vital Signs',
    fields: [
      { key: 'mission_day', label: 'Mission day', unit: 'day', inputType: 'number', min: 0, max: 179.4, step: 0.1 },
      { key: 'mission_phase', label: 'Mission phase', options: [['Early', 'Early'], ['Middle', 'Middle'], ['Late', 'Late']] },
      { key: 'heart_rate_bpm', label: 'Heart rate', unit: 'bpm', min: 45.9, max: 96.8, step: 0.1 },
      { key: 'systolic_bp_mmhg', label: 'Systolic blood pressure', unit: 'mmHg', min: 86, max: 144, step: 1 },
      { key: 'diastolic_bp_mmhg', label: 'Diastolic blood pressure', unit: 'mmHg', min: 53, max: 98, step: 1 },
      { key: 'blood_glucose_mg_dl', label: 'Blood glucose', unit: 'mg/dL', min: 65.3, max: 130.6, step: 0.1 },
      { key: 'oxygen_saturation_pct', label: 'Oxygen saturation', unit: '%', min: 95.1, max: 100, step: 0.1 },
      { key: 'body_temperature_c', label: 'Body temperature', unit: '°C', min: 35.86, max: 37.67, step: 0.01 }
    ]
  },
  {
    title: 'Radiation and Sleep',
    fields: [
      { key: 'ambient_radiation_msv_day', label: 'Ambient radiation', unit: 'mSv/day', min: 0.3, max: 1.529, step: 0.001 },
      { key: 'radiation_dose_interval_msv', label: 'Radiation dose (interval)', unit: 'mSv', min: 0.1799, max: 0.9172, step: 0.0001 },
      { key: 'radiation_cumulative_msv', label: 'Cumulative radiation dose', unit: 'mSv', min: 0.231, max: 97.671, step: 0.001 },
      { key: 'sleep_duration_hours', label: 'Sleep duration', unit: 'hours', min: 3.5, max: 9.93, step: 0.01 },
    ]
  },
  {
    title: 'Urinalysis and Eye Health',
    fields: [
      { key: 'urine_ph', label: 'Urine pH', unit: 'pH', min: 4.5, max: 8, step: 0.01 },
      { key: 'urine_specific_gravity', label: 'Urine specific gravity', unit: 'SG', min: 1.003, max: 1.035, step: 0.0001 },
      { key: 'intraocular_pressure_mmhg', label: 'Intraocular pressure', unit: 'mmHg', min: 9.5, max: 22.6, step: 0.1 },
      { key: 'urine_protein', label: 'Urine protein', options: [['Negative', 'Negative'], ['Trace', 'Trace'], ['Positive', 'Positive']] },
      { key: 'urine_glucose', label: 'Urine glucose', options: [['Negative', 'Negative'], ['Trace', 'Trace'], ['Positive', 'Positive']] }
    ]
  },
  {
    title: 'Musculoskeletal Health and Exercise',
    fields: [
      { key: 'muscle_mass_kg', label: 'Muscle mass', unit: 'kg', min: 19.8, max: 39.56, step: 0.01 },
      { key: 'baseline_muscle_mass_kg', label: 'Baseline muscle mass', unit: 'kg', min: 21.77, max: 39.42, step: 0.01 },
      { key: 'muscular_atrophy_pct', label: 'Muscular atrophy', unit: '%', min: 0, max: 14.73, step: 0.01 },
      { key: 'exercise_duration_min_day', label: 'Exercise duration', unit: 'min/day', min: 20.7, max: 160, step: 0.1 }
    ]
  },
  {
    title: 'Nutrition and Stress',
    fields: [
      { key: 'water_intake_l_day', label: 'Water intake', unit: 'L/day', min: 1.2, max: 3.6, step: 0.01 },
      { key: 'calorie_intake_kcal_day', label: 'Calorie intake', unit: 'kcal/day', min: 1700, max: 3300, step: 1 },
      { key: 'stress_level_1_10', label: 'Stress', unit: '/ 10', min: 1, max: 10, step: 0.1 },
    ]
  }
];
