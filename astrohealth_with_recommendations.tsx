import React, { useState, useMemo } from 'react';
import ModelInputPanel from './src/ModelInputPanel';
import SmartWatchPanel from './src/SmartWatchPanel';
import SmartWatchModelPanel from './src/SmartWatchModelPanel';
import EVEA_MODEL from './models/modelo_evea.json';
import {
  Heart,
  Activity,
  Droplets,
  Moon,
  Thermometer,
  Brain,
  Sliders,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Wind,
  Radio,
  X,
  Dumbbell,
  ScanLine,
  FlaskConical,
  Smile,
  Info,
  BarChart3,
  ShieldAlert,
  ShieldCheck,
  Upload,
  FileSpreadsheet,
  ChevronLeft,
  ClipboardCheck
} from 'lucide-react';

const EVEA_LABELS = [
  { id: 'p01', label: 'p01 • Nervous / Tense', dim: 'Anxiety' },
  { id: 'p02', label: 'p02 • Irritated / Annoyed', dim: 'Anger' },
  { id: 'p03', label: 'p03 • Cheerful / Lively', dim: 'Joy' },
  { id: 'p04', label: 'p04 • Sad / Downcast', dim: 'Sadness' },
  { id: 'p05', label: 'p05 • Anxious / Restless', dim: 'Anxiety' },
  { id: 'p06', label: 'p06 • Optimistic / Content', dim: 'Joy' },
  { id: 'p07', label: 'p07 • Melancholic / Subdued', dim: 'Sadness' },
  { id: 'p08', label: 'p08 • Angry / Frustrated', dim: 'Anger' },
  { id: 'p09', label: 'p09 • Worried / On edge', dim: 'Anxiety' },
  { id: 'p10', label: 'p10 • Discouraged / Dejected', dim: 'Sadness' },
  { id: 'p11', label: 'p11 • Hostile / Impatient', dim: 'Anger' },
  { id: 'p12', label: 'p12 • Jovial / Enthusiastic', dim: 'Joy' },
  { id: 'p13', label: 'p13 • Uneasy / Agitated', dim: 'Anxiety' },
  { id: 'p14', label: 'p14 • Furious / Disgusted', dim: 'Anger' },
  { id: 'p15', label: 'p15 • Satisfied / Positive', dim: 'Joy' },
  { id: 'p16', label: 'p16 • Distressed / Pessimistic', dim: 'Sadness' }
];

// 4x4 linear algebra in JavaScript to run ClasificadorEVEA exactly
const invertMatrix4x4 = (m) => {
  const n = 4;
  const aug = m.map((row, i) => [
    ...row,
    ...(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)))
  ]);
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(aug[r][i]) > Math.abs(aug[pivot][i])) pivot = r;
    }
    [aug[i], aug[pivot]] = [aug[pivot], aug[i]];
    const div = aug[i][i];
    for (let j = 0; j < 2 * n; j++) aug[i][j] /= div;
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = aug[r][i];
        for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[i][j];
      }
    }
  }
  return aug.map((row) => row.slice(n));
};

const logDet4x4 = (m) => {
  const a = m.map((r) => [...r]);
  let det = 1;
  for (let i = 0; i < 4; i++) {
    let pivot = i;
    for (let r = i + 1; r < 4; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    }
    if (pivot !== i) {
      [a[i], a[pivot]] = [a[pivot], a[i]];
      det = -det;
    }
    det *= a[i][i];
    for (let r = i + 1; r < 4; r++) {
      const f = a[r][i] / a[i][i];
      for (let c = i; c < 4; c++) a[r][c] -= f * a[i][c];
    }
  }
  return Math.log(Math.abs(det));
};

const EVEA_INVERSAS = EVEA_MODEL.covarianzas.map(invertMatrix4x4);
const EVEA_LOGDET = EVEA_MODEL.covarianzas.map(logDet4x4);

const calcularPuntajesEVEA = (respuestas16) => {
  const { ansiedad, ira, alegria, tristeza } = EVEA_MODEL.items_evea;
  const meanOf = (idxs) =>
    idxs.reduce((acc, idx) => acc + Number(respuestas16[idx - 1] ?? 0), 0) / idxs.length;
  return [meanOf(ansiedad), meanOf(ira), meanOf(alegria), meanOf(tristeza)];
};

const predecirSecuenciaEVEA = (secuenciaRespuestas) => {
  let previa = [...EVEA_MODEL.inicio];
  return secuenciaRespuestas.map((resp16, stepIdx) => {
    const x = calcularPuntajesEVEA(resp16);
    if (stepIdx > 0) {
      const nextPrevia = [0, 0, 0];
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          nextPrevia[j] += previa[i] * EVEA_MODEL.transicion[i][j];
        }
      }
      previa = nextPrevia;
    }
    const logPesos = [0, 1, 2].map((k) => {
      const delta = x.map((val, d) => val - EVEA_MODEL.medias[k][d]);
      let dist = 0;
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
          dist += delta[i] * EVEA_INVERSAS[k][i][j] * delta[j];
        }
      }
      const logEvidencia = -0.5 * (dist + EVEA_LOGDET[k]);
      return logEvidencia + Math.log(previa[k]);
    });
    const maxLog = Math.max(...logPesos);
    const exps = logPesos.map((lp) => Math.exp(lp - maxLog));
    const sumExp = exps.reduce((a, b) => a + b, 0);
    const posterior = exps.map((e) => e / sumExp);
    previa = posterior;
    const bestIdx = posterior.indexOf(Math.max(...posterior));
    return {
      estado: EVEA_MODEL.clases[bestIdx],
      probabilidades: {
        normal: posterior[0],
        warning: posterior[1],
        critic: posterior[2]
      },
      puntajes: {
        ansiedad: x[0],
        ira: x[1],
        alegria: x[2],
        tristeza: x[3]
      }
    };
  });
};

/**
 * Initial definition of the 13 exact biomedical and aerospace parameters
 */
const INITIAL_METRICS = [
  {
    id: 'cardiac',
    title: 'Cardiac Parameters',
    category: 'Cardiovascular',
    system: 'cardio',
    value: 66,
    unit: 'LPM',
    secondaryLabel: 'HRV: 59 ms',
    min: 40,
    max: 180,
    step: 1,
    optimalMin: 55,
    optimalMax: 95,
    criticalMin: 45,
    criticalMax: 130,
    color: '#FF2D55',
    iconName: 'heart',
    updatedAt: '1m ago',
    history: [64, 68, 65, 67, 63, 66],
    spaceContext:
      'In microgravity, plasma volume drops ~10-15% and fluids shift toward the head, changing cardiac output and heart rate variability (HRV).'
  },
  {
    id: 'glucose',
    title: 'Glucose',
    category: 'Metabolism',
    system: 'metabolic',
    value: 94,
    unit: 'mg/dL',
    secondaryLabel: 'Continuous interstitial sensor',
    min: 50,
    max: 240,
    step: 1,
    optimalMin: 72,
    optimalMax: 115,
    criticalMin: 60,
    criticalMax: 140,
    color: '#FF9500',
    iconName: 'activity',
    updatedAt: '2m ago',
    history: [90, 96, 102, 95, 92, 94],
    spaceContext:
      'Peripheral insulin resistance may rise slightly during long spaceflights due to gravitational inactivity and metabolic stress.'
  },
  {
    id: 'oxygenation',
    title: 'Oxygenation',
    category: 'Respiratory',
    system: 'cardio',
    value: 98,
    unit: 'SpO₂ %',
    secondaryLabel: 'Peripheral arterial saturation',
    min: 80,
    max: 100,
    step: 1,
    optimalMin: 95,
    optimalMax: 100,
    criticalMin: 91,
    criticalMax: 100,
    color: '#007AFF',
    iconName: 'wind',
    updatedAt: 'Now',
    history: [98, 99, 97, 98, 98, 98],
    spaceContext:
      'Critical monitoring in the pressurized cabin and during EVA suit depressurization to prevent hypobaric hypoxia or decompression sickness.'
  },
  {
    id: 'respiration',
    title: 'Respiration',
    category: 'Respiratory',
    system: 'cardio',
    value: 14,
    unit: 'rpm',
    secondaryLabel: 'Stable minute ventilation',
    min: 6,
    max: 40,
    step: 1,
    optimalMin: 12,
    optimalMax: 18,
    criticalMin: 8,
    criticalMax: 26,
    color: '#30B0C7',
    iconName: 'lungs',
    updatedAt: '1m ago',
    history: [14, 15, 13, 14, 15, 14],
    spaceContext:
      'Without natural thermal convection in 0g, ventilatory control is vital to avoid local CO₂ buildup around the astronaut.'
  },
  {
    id: 'radiation',
    title: 'Radiation',
    category: 'Space Environment',
    system: 'metabolic',
    value: 0.64,
    unit: 'mSv/d',
    secondaryLabel: 'GCR + SPE dosimetry',
    min: 0.1,
    max: 5.0,
    step: 0.05,
    optimalMin: 0.2,
    optimalMax: 1.0,
    criticalMin: 0.1,
    criticalMax: 2.5,
    color: '#AF52DE',
    iconName: 'radio',
    updatedAt: '3m ago',
    history: [0.58, 0.61, 0.65, 0.62, 0.63, 0.64],
    spaceContext:
      'Cumulative exposure to galactic cosmic rays (GCR) and solar energetic particles (SPE) outside Earth’s magnetic shield.'
  },
  {
    id: 'bloodPressure',
    title: 'Blood Pressure',
    category: 'Cardiovascular',
    system: 'cardio',
    value: 118,
    unit: 'mmHg',
    secondaryLabel: 'Diastolic: 76 mmHg',
    min: 75,
    max: 190,
    step: 1,
    optimalMin: 100,
    optimalMax: 128,
    criticalMin: 85,
    criticalMax: 150,
    color: '#FF3B30',
    iconName: 'bp',
    updatedAt: '4m ago',
    history: [116, 120, 119, 117, 118, 118],
    spaceContext:
      'Assesses baroreflex adaptation in microgravity and helps anticipate orthostatic intolerance before returning to planetary gravity.'
  },
  {
    id: 'temperature',
    title: 'Temperature',
    category: 'Vital Signs',
    system: 'metabolic',
    value: 36.7,
    unit: '°C',
    secondaryLabel: 'Core thermoregulation',
    min: 34.5,
    max: 40.5,
    step: 0.1,
    optimalMin: 36.2,
    optimalMax: 37.3,
    criticalMin: 35.2,
    criticalMax: 38.2,
    color: '#FF9500',
    iconName: 'thermometer',
    updatedAt: '2m ago',
    history: [36.6, 36.7, 36.8, 36.7, 36.6, 36.7],
    spaceContext:
      'Thermoregulation in space depends almost entirely on evaporation and the LCVG liquid cooling circuit during extravehicular activity.'
  },
  {
    id: 'sleep',
    title: 'Sleep',
    category: 'Recovery',
    system: 'metabolic',
    value: 7.4,
    unit: 'hrs',
    secondaryLabel: 'Circadian efficiency 91%',
    min: 2.0,
    max: 11.0,
    step: 0.1,
    optimalMin: 6.8,
    optimalMax: 8.5,
    criticalMin: 4.8,
    criticalMax: 10.5,
    color: '#5856D6',
    iconName: 'moon',
    updatedAt: 'Today',
    history: [6.9, 7.2, 7.5, 7.1, 7.3, 7.4],
    spaceContext:
      'In low Earth orbit there are 16 sunrises every 24 hours; keeping stable circadian cycles preserves cognitive and motor acuity.'
  },
  {
    id: 'psychological',
    title: 'EVEA HMM Assessment',
    category: 'Psychological • Gaussian HMM',
    system: 'metabolic',
    value: 91,
    unit: '%',
    secondaryLabel: 'EVEA state: NORMAL',
    min: 0,
    max: 100,
    step: 1,
    optimalMin: 80,
    optimalMax: 100,
    criticalMin: 60,
    criticalMax: 100,
    color: '#34C759',
    iconName: 'smile',
    updatedAt: 'EVEA HMM',
    history: [89, 91, 90, 92, 90, 91],
    spaceContext:
      'Temporal Bayesian classifier (Gaussian Hidden Markov Model) over the 16 EVEA questions grouped into Anxiety, Anger, Joy and Sadness during orbital confinement.'
  },
  {
    id: 'muscleDensity',
    title: 'Muscle Density',
    category: 'Musculoskeletal',
    system: 'mares',
    value: 96.5,
    unit: '%',
    secondaryLabel: 'Relative to pre-flight baseline',
    min: 75,
    max: 105,
    step: 0.5,
    optimalMin: 95.0,
    optimalMax: 102.0,
    criticalMin: 90.0,
    criticalMax: 105.0,
    color: '#FF2D55',
    iconName: 'muscle',
    updatedAt: 'Weekly',
    history: [98.0, 97.5, 97.2, 97.0, 96.8, 96.5],
    spaceContext:
      'Without axial gravitational load, antigravity muscles (soleus, gastrocnemius and quadriceps) lose mass and density at an accelerated rate.'
  },
  {
    id: 'ultrasound',
    title: 'Ultrasound',
    category: 'Orbital Imaging',
    system: 'mares',
    value: 24.8,
    unit: 'mm',
    secondaryLabel: 'Rectus femoris thickness / ONSD',
    min: 15.0,
    max: 35.0,
    step: 0.1,
    optimalMin: 23.5,
    optimalMax: 27.5,
    criticalMin: 20.5,
    criticalMax: 30.5,
    color: '#007AFF',
    iconName: 'ultrasound',
    updatedAt: '1d ago',
    history: [25.4, 25.2, 25.1, 25.0, 24.9, 24.8],
    spaceContext:
      'Onboard portable ultrasound to quantify muscle cross-sectional architecture and optic nerve sheath diameter (SANS syndrome).'
  },
  {
    id: 'urine',
    title: 'Urine',
    category: 'Renal Biochemistry',
    system: 'metabolic',
    value: 1.015,
    unit: 'g/mL',
    secondaryLabel: 'Specific gravity • Optimal hydration',
    min: 1.002,
    max: 1.035,
    step: 0.001,
    optimalMin: 1.008,
    optimalMax: 1.022,
    criticalMin: 1.003,
    criticalMax: 1.027,
    color: '#FFCC00',
    iconName: 'urine',
    updatedAt: 'Today',
    history: [1.018, 1.016, 1.017, 1.014, 1.015, 1.015],
    spaceContext:
      'Bone resorption in microgravity increases urinary calcium excretion; monitoring concentration and hydration helps prevent kidney stones in flight.'
  },
  {
    id: 'mares',
    title: 'MARES Results',
    category: 'Muscle Atrophy Research',
    system: 'mares',
    value: 415,
    unit: 'N',
    secondaryLabel: 'Orbital goal: 97%',
    min: 150,
    max: 600,
    step: 5,
    optimalMin: 380,
    optimalMax: 520,
    criticalMin: 320,
    criticalMax: 580,
    color: '#FF2D55',
    iconName: 'mares',
    updatedAt: 'Session today',
    history: [425, 420, 412, 418, 410, 415],
    spaceContext:
      'Muscle Atrophy Research and Exercise System (MARES): measures force-velocity curves and joint torque to calibrate exercise countermeasures in 0g.'
  }
];

/**
 * Renders the icon for each of the 13 parameters
 */
const ParameterIcon = ({ name, color, size = 16 }) => {
  const props = { style: { color, width: size, height: size } };
  switch (name) {
    case 'heart':
      return <Heart {...props} />;
    case 'activity':
      return <Activity {...props} />;
    case 'wind':
      return <Wind {...props} />;
    case 'lungs':
      return <Wind {...props} />;
    case 'radio':
      return <Radio {...props} />;
    case 'bp':
      return <Heart {...props} />;
    case 'thermometer':
      return <Thermometer {...props} />;
    case 'moon':
      return <Moon {...props} />;
    case 'smile':
      return <Smile {...props} />;
    case 'muscle':
      return <Dumbbell {...props} />;
    case 'ultrasound':
      return <ScanLine {...props} />;
    case 'urine':
      return <FlaskConical {...props} />;
    case 'mares':
      return <Dumbbell {...props} />;
    default:
      return <Activity {...props} />;
  }
};

/**
 * Apple Health-style mini bar chart for each card
 */
const SparklineBars = ({ history, currentValue, color, min, max }) => {
  const series = [...history.slice(-6), currentValue];
  const range = max - min || 1;

  return (
    <div className="flex h-10 items-end justify-end gap-1">
      {series.map((val, idx) => {
        const isLast = idx === series.length - 1;
        const heightPct = Math.max(18, Math.min(100, ((val - min) / range) * 100));
        return (
          <div
            key={idx}
            className="w-2 rounded-full transition-all duration-300"
            style={{
              height: `${heightPct}%`,
              backgroundColor: isLast ? color : `${color}45`
            }}
          />
        );
      })}
    </div>
  );
};

/**
 * Classifies each parameter as 'normal', 'warning' or 'critical'
 */
const getMetricSeverity = (metric) => {
  if (metric.value < metric.criticalMin || metric.value > metric.criticalMax) {
    return 'critical';
  }
  if (metric.value < metric.optimalMin || metric.value > metric.optimalMax) {
    return 'warning';
  }
  return 'normal';
};

const ACTIONS = {
  cardiac: {
    high: ['Stop activity and rest seated for 5 min', 'Check pulse manually and log any palpitations', 'Review caffeine intake and recent exercise'],
    low: ['Check sensor contact', 'Ask about dizziness; stay seated if lightheaded']
  },
  oxygenation: {
    low: ['Check cabin O₂ and CO₂', 'Reposition sensor and repeat measurement', 'Breathe slowly for 2 min and reassess']
  },
  bloodPressure: {
    high: ['Rest seated for 10 min and repeat measurement', 'Reduce sodium and caffeine at the next meal'],
    low: ['Sit down or raise legs', 'Hydrate with electrolytes (500 ml)', 'Avoid fast translation through the station']
  },
  temperature: {
    high: ['Second reading with an oral thermometer', 'Increase fluids', 'Review infection and medication checklist'],
    low: ['Add insulating layers', 'Reassess in 15 min']
  },
  sleep: {
    low: ['Schedule a protected rest period', 'Reduce light and noise in the rest module', 'Postpone non-critical EVA tasks']
  },
  radiation: {
    high: ['Move to the shielded shelter', 'Log time and location of the exposure', 'Suspend EVA until the rate drops']
  },
  respiration: {
    high: ['Pause activity and breathe slowly for 3 min', 'Compare cabin CO₂ against alarms'],
    low: ['Assess crew member responsiveness', 'Check sensors and cabin O₂']
  },
  psychological: {
    high: ['Behavioral health support session (BHP) today', 'Contact family or ground team', 'Reduce task load and reinforce sleep routine']
  }
};
const GENERIC_ACTIONS = ['Repeat the measurement to confirm', 'Log the value in the medical record'];
const ESCALATE_ACTION = 'Notify the flight surgeon and open a medical event';

const getRecommendations = (metric, severity) => {
  if (severity === 'normal') return [];
  const dir = metric.value > metric.optimalMax ? 'high' : 'low';
  const table = ACTIONS[metric.id];
  const steps = [...(table?.[dir] ?? table?.high ?? table?.low ?? GENERIC_ACTIONS)];
  if (severity === 'critical') steps.push(ESCALATE_ACTION);
  return steps;
};

/**
 * Apple Health-style clinical range bar (shows the current value against the optimal range)
 */
const ClinicalRangeBar = ({ value, min, max, optimalMin, optimalMax, color, severity }) => {
  const totalRange = max - min || 1;
  const optStartPct = Math.max(0, Math.min(100, ((optimalMin - min) / totalRange) * 100));
  const optWidthPct = Math.max(5, Math.min(100 - optStartPct, ((optimalMax - optimalMin) / totalRange) * 100));
  const markerPct = Math.max(2, Math.min(98, ((value - min) / totalRange) * 100));
  const markerColor =
    severity === 'critical' ? '#FF3B30' : severity === 'warning' ? '#FF9500' : color;

  return (
    <div className="relative mt-2.5 h-2 w-full rounded-full bg-gray-100">
      {/* Optimal zone */}
      <div
        className="absolute top-0 h-full rounded-full opacity-25"
        style={{
          left: `${optStartPct}%`,
          width: `${optWidthPct}%`,
          backgroundColor: color
        }}
      />
      {/* Current reading marker */}
      <div
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm transition-all duration-300"
        style={{
          left: `${markerPct}%`,
          backgroundColor: markerColor
        }}
      />
    </div>
  );
};

export default function App() {
  const [metrics, setMetrics] = useState(INITIAL_METRICS);
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedMetricId, setSelectedMetricId] = useState(null);
  const [csvRecords, setCsvRecords] = useState([]);
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvIndex, setCsvIndex] = useState(0);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvError, setCsvError] = useState('');
  const [csvExplicitStatus, setCsvExplicitStatus] = useState(null); // State dictated by the last CSV column
  const [eveaAnswers, setEveaAnswers] = useState([2, 2, 7, 2, 3, 7, 2, 2, 3, 2, 2, 7, 2, 2, 7, 2]);
  const [eveaHistory, setEveaHistory] = useState([]);
  const [doneActions, setDoneActions] = useState({});
  const toggleAction = (key) => setDoneActions((d) => ({ ...d, [key]: !d[key] }));

  // Live result of the EVEA classifier (Gaussian HMM)
  const eveaEvaluation = useMemo(() => {
    const seq = [...eveaHistory, eveaAnswers];
    const results = predecirSecuenciaEVEA(seq);
    return results[results.length - 1];
  }, [eveaAnswers, eveaHistory]);

  const syncEveaToMetric = (evalNow) => {
    const confidencePct = Math.round(evalNow.probabilidades[evalNow.estado] * 100);
    const psychScore =
      evalNow.estado === 'critic'
        ? Math.max(35, Math.min(58, Math.round(62 - evalNow.puntajes.ansiedad * 2)))
        : evalNow.estado === 'warning'
        ? Math.max(65, Math.min(78, Math.round(84 - evalNow.puntajes.ansiedad * 2)))
        : Math.max(85, Math.min(99, Math.round(80 + evalNow.puntajes.alegria * 2.2)));

    const displayState = evalNow.estado === 'critic' ? 'CRITICAL' : evalNow.estado.toUpperCase();

    setMetrics((prev) =>
      prev.map((m) =>
        m.id === 'psychological'
          ? {
              ...m,
              value: psychScore,
              secondaryLabel: `State: ${displayState} (${confidencePct}% prob.)`,
              updatedAt: `Day ${eveaHistory.length + 1}`
            }
          : m
      )
    );
  };

  const handleUpdateEveaItem = (index, val) => {
    const num = Math.max(0, Math.min(10, Math.round(Number(val) || 0)));
    const updated = eveaAnswers.map((v, i) => (i === index ? num : v));
    setEveaAnswers(updated);
    setCsvExplicitStatus(null);
    const evalNow = predecirSecuenciaEVEA([...eveaHistory, updated]).slice(-1)[0];
    syncEveaToMetric(evalNow);
  };

  const handleRecordEveaDay = () => {
    const nextHist = [...eveaHistory.slice(-14), eveaAnswers];
    setEveaHistory(nextHist);
    const evalNow = predecirSecuenciaEVEA([...nextHist, eveaAnswers]).slice(-1)[0];
    syncEveaToMetric(evalNow);
  };

  // Normalizes the last CSV column value to 'NORMAL', 'WARNING' or 'CRITICAL'
  const parseLastColumnStatus = (rowObj, headersList) => {
    if (!rowObj || !headersList || headersList.length === 0) return null;
    const lastHeader = headersList[headersList.length - 1];
    const rawStatus = String(rowObj[lastHeader] ?? '').trim().toUpperCase();
    if (!rawStatus) return null;

    if (
      rawStatus.includes('CRIT') ||
      rawStatus.includes('DANGER') ||
      rawStatus.includes('HIGH') ||
      rawStatus.includes('ALTO') ||
      rawStatus.includes('EMERGENCY') ||
      rawStatus === '2'
    ) {
      return { level: 'CRITICAL', rawLabel: String(rowObj[lastHeader]).trim(), column: lastHeader };
    }
    if (
      rawStatus.includes('WARN') ||
      rawStatus.includes('ALERT') ||
      rawStatus.includes('MOD') ||
      rawStatus.includes('CAUTION') ||
      rawStatus.includes('PRECAUCION') ||
      rawStatus === '1'
    ) {
      return { level: 'WARNING', rawLabel: String(rowObj[lastHeader]).trim(), column: lastHeader };
    }
    if (
      rawStatus.includes('NORM') ||
      rawStatus.includes('OK') ||
      rawStatus.includes('STABLE') ||
      rawStatus.includes('OPTIM') ||
      rawStatus.includes('GOOD') ||
      rawStatus === '0'
    ) {
      return { level: 'NORMAL', rawLabel: String(rowObj[lastHeader]).trim(), column: lastHeader };
    }
    return null;
  };

  // Flexible mapping of CSV columns to the 13 exact parameters + reading of the last column
  const mapCsvRowToMetrics = (rowObj, allRows, currentIdx, headersList) => {
    // Exclude the last column from numeric mapping because it dictates the global state
    const featureEntries = Object.entries(rowObj).slice(0, -1);

    const findVal = (keywords) => {
      const entry = featureEntries.find(([key]) =>
        keywords.some((kw) => key.toLowerCase().includes(kw))
      );
      if (!entry) return null;
      const num = parseFloat(String(entry[1]).replace(/[^\d.-]/g, ''));
      return Number.isNaN(num) ? null : num;
    };

    const columnMatchers = {
      cardiac: ['cardiac', 'heart', 'hr', 'bpm', 'lpm', 'frecuencia'],
      glucose: ['glucose', 'glucosa', 'sugar'],
      oxygenation: ['spo2', 'oxygen', 'oxigen', 'o2'],
      respiration: ['resp', 'breath', 'rpm'],
      radiation: ['rad', 'msv', 'dosim'],
      bloodPressure: ['sys', 'bp', 'pressure', 'presion', 'arterial'],
      temperature: ['temp', 'celsius'],
      sleep: ['sleep', 'sueno', 'sueño'],
      psychological: ['psych', 'psico', 'stress', 'mood', 'mental', 'cognitive'],
      muscleDensity: ['muscle', 'density', 'densidad', 'lean'],
      ultrasound: ['ultra', 'ecograf', 'onsd', 'thickness'],
      urine: ['urin', 'orina', 'gravity', 'renal'],
      mares: ['mares', 'force', 'torque', 'strength', 'atrophy']
    };

    // Extract the official state from the last column of the history
    const statusFromLastCol = parseLastColumnStatus(rowObj, headersList);
    setCsvExplicitStatus(statusFromLastCol);

    setMetrics((prev) =>
      prev.map((m) => {
        const keywords = columnMatchers[m.id] || [m.id];
        const extracted = findVal(keywords);
        const nextVal =
          extracted !== null ? Math.max(m.min, Math.min(m.max, extracted)) : m.value;

        // Build a chronological history of up to 6 previous points from the CSV
        const startSlice = Math.max(0, currentIdx - 6);
        const sliceRows = allRows.slice(startSlice, currentIdx);
        const csvHist = sliceRows
          .map((r) => {
            const entries = Object.entries(r).slice(0, -1);
            const entry = entries.find(([k]) =>
              keywords.some((kw) => k.toLowerCase().includes(kw))
            );
            const v = entry ? parseFloat(String(entry[1]).replace(/[^\d.-]/g, '')) : NaN;
            return Number.isNaN(v) ? null : Math.max(m.min, Math.min(m.max, v));
          })
          .filter((v) => v !== null);

        let secondaryLabel = m.secondaryLabel;
        if (m.id === 'bloodPressure') {
          secondaryLabel = `Diastolic: ${Math.round(nextVal * 0.64)} mmHg`;
        } else if (m.id === 'cardiac') {
          secondaryLabel = `HRV: ${Math.max(18, Math.round(115 - nextVal * 0.85))} ms`;
        } else if (m.id === 'mares') {
          secondaryLabel = `Meta orbital: ${Math.round((nextVal / 430) * 100)}%`;
        }

        return {
          ...m,
          value: nextVal,
          secondaryLabel,
          history: csvHist.length >= 1 ? csvHist : m.history,
          updatedAt: `Historial #${currentIdx + 1}`
        };
      })
    );
  };

  // Processes the loaded CSV file as a chronological history
  const handleCsvUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsvError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = String(e.target?.result || '');
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        if (lines.length < 2) {
          setCsvError('The CSV file must contain headers and at least one history row.');
          return;
        }

        const delimiter = lines[0].includes(';') ? ';' : ',';
        const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));

        const parsedRows = lines.slice(1).map((line) => {
          const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = cols[i] ?? '';
          });
          return obj;
        });

        // Since it is a history, default to the last (most recent) record
        const latestIdx = parsedRows.length - 1;
        setCsvHeaders(headers);
        setCsvRecords(parsedRows);
        setCsvIndex(latestIdx);
        setCsvFileName(file.name);
        setActivePreset('csv');
        mapCsvRowToMetrics(parsedRows[latestIdx], parsedRows, latestIdx, headers);
      } catch (err) {
        setCsvError('Could not read the CSV file structure.');
      }
    };
    reader.readAsText(file);
  };

  const handleSelectCsvRecord = (nextIdx) => {
    if (!csvRecords.length) return;
    const bounded = Math.max(0, Math.min(csvRecords.length - 1, nextIdx));
    setCsvIndex(bounded);
    mapCsvRowToMetrics(csvRecords[bounded], csvRecords, bounded, csvHeaders);
  };

  // Updates any of the 13 parameters in real time (manual simulation mode)
  const updateMetricValue = (id, rawValue) => {
    const parsed = parseFloat(rawValue);
    if (Number.isNaN(parsed)) return;
    setCsvExplicitStatus(null); // When a slider is edited manually, return to dynamic threshold calculation

    setMetrics((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const clamped = Math.max(m.min, Math.min(m.max, parsed));
        let secondaryLabel = m.secondaryLabel;
        if (id === 'bloodPressure') {
          const diastolic = Math.round(clamped * 0.64);
          secondaryLabel = `Diastolic: ${diastolic} mmHg`;
        } else if (id === 'cardiac') {
          const hrv = Math.max(18, Math.round(115 - clamped * 0.85));
          secondaryLabel = `HRV: ${hrv} ms`;
        } else if (id === 'mares') {
          const pctGoal = Math.round((clamped / 430) * 100);
          secondaryLabel = `Meta orbital: ${pctGoal}%`;
        }
        return {
          ...m,
          value: clamped,
          secondaryLabel,
          updatedAt: 'Just now'
        };
      })
    );
  };

  // Evaluates the global state, prioritizing the last CSV column when active
  const { criticalMetrics, warningMetrics, normalMetrics, heroStatus } = useMemo(() => {
    const critical = [];
    const warning = [];
    const normal = [];

    metrics.forEach((m) => {
      // For the EVEA HMM assessment, use the Hidden Markov Model classification directly
      const sev =
        m.id === 'psychological' && !csvExplicitStatus
          ? eveaEvaluation.estado === 'critic'
            ? 'critical'
            : eveaEvaluation.estado === 'warning'
            ? 'warning'
            : 'normal'
          : getMetricSeverity(m);

      if (sev === 'critical') critical.push(m);
      else if (sev === 'warning') warning.push(m);
      else normal.push(m);
    });

    const effectiveLevel = csvExplicitStatus
      ? csvExplicitStatus.level
      : critical.length > 0
      ? 'CRITICAL'
      : warning.length > 0
      ? 'WARNING'
      : 'NORMAL';

    const sourceNote = csvExplicitStatus
      ? `Official classification set by the last column of the history ("${csvExplicitStatus.column}": ${csvExplicitStatus.rawLabel}).`
      : null;

    // Biomedical integrity index (0 - 100%)
    const rawScore = Math.round(
      ((normal.length * 1 + warning.length * 0.65 + critical.length * 0.15) / metrics.length) * 100
    );

    if (effectiveLevel === 'CRITICAL') {
      return {
        criticalMetrics: critical,
        warningMetrics: warning,
        normalMetrics: normal,
        heroStatus: {
          level: 'CRITICAL',
          badge: 'CRITICAL',
          headline: 'Priority Biomedical Alert in Orbit',
          summary:
            sourceNote ||
            `${critical.length} ${
              critical.length === 1
                ? 'critical parameter has crossed'
                : 'critical parameters have crossed'
            } the physiological safety threshold. Immediate telemetry review required.`,
          accent: '#FF3B30',
          bgSoft: 'rgba(255, 59, 48, 0.10)',
          borderClass: 'ring-2 ring-[#FF3B30]/60 shadow-[0_8px_30px_rgba(255,59,48,0.14)]',
          score: Math.min(64, rawScore)
        }
      };
    }

    if (effectiveLevel === 'WARNING') {
      return {
        criticalMetrics: critical,
        warningMetrics: warning,
        normalMetrics: normal,
        heroStatus: {
          level: 'WARNING',
          badge: 'WARNING',
          headline: 'Preventive Physiological Watch',
          summary:
            sourceNote ||
            `${warning.length} ${
              warning.length === 1 ? 'parameter shows' : 'parameters show'
            } moderate deviation from the optimal orbital range. Keep monitoring continuously.`,
          accent: '#FF9500',
          bgSoft: 'rgba(255, 149, 0, 0.12)',
          borderClass: 'ring-2 ring-[#FF9500]/55 shadow-[0_8px_28px_rgba(255,149,0,0.12)]',
          score: Math.max(72, Math.min(89, rawScore))
        }
      };
    }

    return {
      criticalMetrics: critical,
      warningMetrics: warning,
      normalMetrics: normal,
      heroStatus: {
        level: 'NORMAL',
        badge: 'NORMAL',
        headline: 'Physiological Systems Stable in Microgravity',
        summary:
          sourceNote ||
          'All 13 vital, environmental and metabolic biomarkers and MARES results are within optimal mission parameters.',
        accent: '#34C759',
        bgSoft: 'rgba(52, 199, 89, 0.12)',
        borderClass: 'ring-1 ring-black/5 shadow-[0_4px_24px_rgba(0,0,0,0.04)]',
        score: csvExplicitStatus ? Math.max(94, rawScore) : 100
      }
    };
  }, [metrics, csvExplicitStatus, eveaEvaluation]);

  // Prioritized action plan: critical first, then cautions
  const actionPlan = useMemo(
    () =>
      [
        ...criticalMetrics.map((m) => ({ metric: m, severity: 'critical' })),
        ...warningMetrics.map((m) => ({ metric: m, severity: 'warning' }))
      ].map((x) => ({ ...x, steps: getRecommendations(x.metric, x.severity) })),
    [criticalMetrics, warningMetrics]
  );

  // Apple Fitness / Health-style radial ring calculation
  const ringRadius = 46;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringDashOffset =
    ringCircumference - (heroStatus.score / 100) * ringCircumference;

  // Summary by key system for the hero preview
  const systemSummaries = useMemo(() => {
    const cardioMetrics = metrics.filter((m) => m.system === 'cardio');
    const metabolicMetrics = metrics.filter((m) => m.system === 'metabolic');
    const maresMetrics = metrics.filter((m) => m.system === 'mares');

    const getGroupStatus = (group) => {
      const hasCrit = group.some((m) => getMetricSeverity(m) === 'critical');
      if (hasCrit) return { status: 'CRITICAL', color: '#FF3B30' };
      const hasWarn = group.some((m) => getMetricSeverity(m) === 'warning');
      if (hasWarn) return { status: 'WARNING', color: '#FF9500' };
      return { status: 'NORMAL', color: '#34C759' };
    };

    const cardioState = getGroupStatus(cardioMetrics);
    const metabolicState = getGroupStatus(metabolicMetrics);
    const maresState = getGroupStatus(maresMetrics);

    return [
      {
        key: 'cardio',
        label: 'Cardio & Respiratory',
        detail: `${cardioMetrics.filter((m) => getMetricSeverity(m) === 'normal').length}/${cardioMetrics.length} estables`,
        ...cardioState
      },
      {
        key: 'metabolic',
        label: 'Metabolic & Environment',
        detail: `${metabolicMetrics.filter((m) => getMetricSeverity(m) === 'normal').length}/${metabolicMetrics.length} estables`,
        ...metabolicState
      },
      {
        key: 'mares',
        label: 'Muscular & MARES',
        detail: `${maresMetrics.filter((m) => getMetricSeverity(m) === 'normal').length}/${maresMetrics.length} estables`,
        ...maresState
      }
    ];
  }, [metrics]);

  const selectedMetric = useMemo(
    () => metrics.find((m) => m.id === selectedMetricId) || null,
    [metrics, selectedMetricId]
  );

  const maresMetric = useMemo(
    () => metrics.find((m) => m.id === 'mares'),
    [metrics]
  );
  const muscleMetric = useMemo(
    () => metrics.find((m) => m.id === 'muscleDensity'),
    [metrics]
  );
  const ultrasoundMetric = useMemo(
    () => metrics.find((m) => m.id === 'ultrasound'),
    [metrics]
  );

  const focusMetricCard = (id) => {
    setSelectedMetricId(id);
    const el = document.getElementById(`metric-card-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="min-h-screen bg-[#F2F2F7] text-gray-900 antialiased selection:bg-[#007AFF]/20">
      {/* TRANSLUCENT TOP BAR, APPLE HEALTH iOS STYLE */}
      <header className="sticky top-0 z-30 border-b border-black/5 bg-[#F2F2F7]/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3.5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-[#34C759]" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">
                AstroHealth • Orbital Telemetry iOS
              </span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 sm:text-3xl">
              Health Summary
            </h1>
          </div>

          {/* Mission scenario controls and view tabs */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Button to import astronaut_health_monitoring_fixed.csv */}
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-bold text-[#007AFF] shadow-sm ring-1 ring-[#007AFF]/25 transition hover:bg-[#007AFF]/5">
              <Upload className="h-3.5 w-3.5" />
              <span>{csvFileName ? 'Change CSV' : 'Load CSV'}</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvUpload}
                className="hidden"
              />
            </label>

            <div className="flex items-center rounded-full bg-white p-1 shadow-sm ring-1 ring-black/5">
              {[
                { id: 'summary', label: 'Summary', icon: BarChart3 },
                { id: 'inputs', label: 'Model Input (25)', icon: Sliders },
                { id: 'evea', label: 'EVEA HMM', icon: ClipboardCheck },
                { id: 'mares', label: 'MARES', icon: Dumbbell },
                { id: 'watch', label: 'Smart Watch', icon: Activity },
                { id: 'watchModel', label: 'Watch + XGBoost', icon: Heart }
              ].map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      activeTab === tab.id
                        ? 'bg-[#007AFF] text-white shadow-sm'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {/* CSV TELEMETRY BAR WHEN THE FILE IS LOADED */}
        {(csvRecords.length > 0 || csvError) && (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-black/5">
            {csvError ? (
              <p className="text-xs font-semibold text-[#FF3B30]">{csvError}</p>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-gray-900">
                        CSV History: <span className="text-[#007AFF]">{csvFileName}</span>
                      </p>
                      {csvExplicitStatus && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase text-white"
                          style={{ backgroundColor: heroStatus.accent }}
                        >
                          {csvExplicitStatus.column}: {csvExplicitStatus.rawLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500">
                      Historical entry {csvIndex + 1} of {csvRecords.length} • Chart shows the last 6 previous readings
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectCsvRecord(csvIndex - 1)}
                    disabled={csvIndex === 0}
                    className="inline-flex items-center gap-1 rounded-full bg-[#F2F2F7] px-3 py-1 text-xs font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Previous
                  </button>
                  <span className="min-w-[68px] text-center text-xs font-bold text-gray-800">
                    #{csvIndex + 1} / {csvRecords.length}
                  </span>
                  <button
                    onClick={() => handleSelectCsvRecord(csvIndex + 1)}
                    disabled={csvIndex >= csvRecords.length - 1}
                    className="inline-flex items-center gap-1 rounded-full bg-[#F2F2F7] px-3 py-1 text-xs font-bold text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
                  >
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* HERO PREVIEW: GLOBAL CLINICAL STATE (NORMAL / WARNING / CRITICAL), APPLE HEALTH iOS STYLE */}
        <section
          aria-label="Global Clinical Status of the Astronaut"
          className={`mb-7 overflow-hidden rounded-[28px] bg-white p-5 transition-all duration-300 sm:p-6 ${heroStatus.borderClass}`}
        >
          <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            {/* Bloque Izquierdo: Anillo Radial Apple Health + Badge Protagonista */}
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              {/* Radial progress ring, Apple Fitness / Health style */}
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
                {heroStatus.level === 'CRITICAL' && (
                  <span
                    className="absolute inset-1 animate-ping rounded-full opacity-20"
                    style={{ backgroundColor: heroStatus.accent }}
                  />
                )}
                <svg className="h-28 w-28 -rotate-90 transform" viewBox="0 0 112 112">
                  <circle
                    cx="56"
                    cy="56"
                    r={ringRadius}
                    fill="transparent"
                    stroke="#F2F2F7"
                    strokeWidth="10"
                  />
                  <circle
                    cx="56"
                    cy="56"
                    r={ringRadius}
                    fill="transparent"
                    stroke={heroStatus.accent}
                    strokeWidth="10"
                    strokeDasharray={ringCircumference}
                    strokeDashoffset={ringDashOffset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span
                    className="text-2xl font-extrabold tracking-tight"
                    style={{ color: heroStatus.accent }}
                  >
                    {heroStatus.score}%
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    Index
                  </span>
                </div>
              </div>

              {/* Main NORMAL / WARNING / CRITICAL label + summary */}
              <div className="max-w-xl">
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-white shadow-sm"
                    style={{ backgroundColor: heroStatus.accent }}
                  >
                    {heroStatus.level === 'CRITICAL' ? (
                      <ShieldAlert className="h-3.5 w-3.5" />
                    ) : heroStatus.level === 'WARNING' ? (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    ) : (
                      <ShieldCheck className="h-3.5 w-3.5" />
                    )}
                    {heroStatus.badge}
                  </span>
                  <span className="text-xs font-semibold text-gray-400">
                    Global Physiological Status • 13 Parameters
                  </span>
                </div>

                <h2 className="mt-2 text-xl font-extrabold tracking-tight text-gray-900 sm:text-2xl">
                  {heroStatus.headline}
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-gray-600 sm:text-sm">
                  {heroStatus.summary}
                </p>

                {/* Interactive chips for active alerts, if any */}
                {(criticalMetrics.length > 0 || warningMetrics.length > 0) && (
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {criticalMetrics.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => focusMetricCard(m.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-[#FF3B30]/12 px-2.5 py-1 text-[11px] font-bold text-[#D70015] transition hover:bg-[#FF3B30]/20"
                      >
                        <span>{m.title}:</span>
                        <span>
                          {m.value} {m.unit}
                        </span>
                      </button>
                    ))}
                    {warningMetrics.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => focusMetricCard(m.id)}
                        className="inline-flex items-center gap-1 rounded-full bg-[#FF9500]/15 px-2.5 py-1 text-[11px] font-bold text-[#B25E00] transition hover:bg-[#FF9500]/25"
                      >
                        <span>{m.title}:</span>
                        <span>
                          {m.value} {m.unit}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {actionPlan.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-white/70 p-3 ring-1 ring-black/5">
                    <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-gray-900">
                      <ClipboardCheck className="h-3.5 w-3.5" /> Recommended actions
                    </p>
                    {actionPlan.slice(0, 3).map(({ metric, severity, steps }) => (
                      <div key={metric.id} className="border-t border-black/5 py-2 first:border-t-0">
                        <button
                          onClick={() => focusMetricCard(metric.id)}
                          className={`text-[11px] font-bold ${
                            severity === 'critical' ? 'text-[#D70015]' : 'text-[#B25E00]'
                          }`}
                        >
                          {severity === 'critical' ? 'Critical' : 'Caution'} · {metric.title}
                        </button>
                        {steps.slice(0, 2).map((st, i) => {
                          const k = `${metric.id}-${i}`;
                          return (
                            <label key={k} className="mt-1 flex cursor-pointer items-start gap-2 text-xs text-gray-700">
                              <input
                                type="checkbox"
                                checked={!!doneActions[k]}
                                onChange={() => toggleAction(k)}
                                className="mt-0.5"
                              />
                              <span className={doneActions[k] ? 'text-gray-400 line-through' : ''}>{st}</span>
                            </label>
                          );
                        })}
                      </div>
                    ))}
                    {actionPlan.length > 3 && (
                      <p className="pt-1 text-[11px] text-gray-500">
                        +{actionPlan.length - 3} more parameters. Open each for details.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right block: breakdown by the 3 biomedical systems */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 lg:w-[410px] lg:grid-cols-1">
              {systemSummaries.map((sys) => (
                <div
                  key={sys.key}
                  className="flex items-center justify-between rounded-2xl bg-[#F2F2F7]/75 px-4 py-2.5"
                >
                  <div>
                    <p className="text-xs font-bold text-gray-900">{sys.label}</p>
                    <p className="text-[11px] text-gray-500">{sys.detail}</p>
                  </div>
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${sys.color}18`,
                      color: sys.color
                    }}
                  >
                    {sys.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {activeTab === 'watch' && <SmartWatchPanel />}
        {activeTab === 'watchModel' && <SmartWatchModelPanel />}

        {/* DEDICATED VIEW: EVEA PSYCHOLOGICAL CLASSIFIER (GAUSSIAN HMM) */}
        {activeTab === 'evea' && (
          <div className="mb-8 space-y-6">
            <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#34C759]/12 px-3 py-1 text-xs font-bold text-[#248A3D]">
                    <Brain className="h-3.5 w-3.5" />
                    EVEA Classifier • Gaussian Hidden Markov Model
                  </span>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
                    Mood Assessment (16 Items • 0–10)
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Computes the 4 dimensions (Anxiety, Anger, Joy, Sadness) in real time with a temporal transition matrix and updates the Psychological parameter.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-[#F2F2F7] px-4 py-3 text-right">
                    <span className="text-[11px] font-semibold uppercase text-gray-500">
                      EVEA Prediction
                    </span>
                    <div
                      className="text-2xl font-extrabold uppercase"
                      style={{
                        color:
                          eveaEvaluation.estado === 'critic'
                            ? '#FF3B30'
                            : eveaEvaluation.estado === 'warning'
                            ? '#FF9500'
                            : '#34C759'
                      }}
                    >
                      {eveaEvaluation.estado === 'critic' ? 'CRITICAL' : eveaEvaluation.estado}
                    </div>
                  </div>
                  <button
                    onClick={handleRecordEveaDay}
                    className="rounded-2xl bg-[#007AFF] px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#0066D6]"
                  >
                    Save Day ({eveaHistory.length + 1})
                  </button>
                </div>
              </div>

              {/* Dimensiones y probabilidades posteriores */}
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Anxiety (p01,05,09,13)', val: eveaEvaluation.puntajes.ansiedad, color: '#FF9500' },
                  { label: 'Anger (p02,08,11,14)', val: eveaEvaluation.puntajes.ira, color: '#FF3B30' },
                  { label: 'Joy (p03,06,12,15)', val: eveaEvaluation.puntajes.alegria, color: '#34C759' },
                  { label: 'Sadness (p04,07,10,16)', val: eveaEvaluation.puntajes.tristeza, color: '#5856D6' }
                ].map((d) => (
                  <div key={d.label} className="rounded-2xl bg-[#F2F2F7]/75 p-3.5">
                    <p className="text-[11px] font-semibold text-gray-500">{d.label}</p>
                    <p className="mt-1 text-2xl font-bold" style={{ color: d.color }}>
                      {d.val.toFixed(2)} <span className="text-xs font-medium text-gray-400">/ 10</span>
                    </p>
                  </div>
                ))}
              </div>

              {/* Probabilities of the temporal Bayes filter */}
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#F2F2F7]/60 px-4 py-2.5 text-xs">
                <span className="font-bold text-gray-700">Probabilidad Posterior HMM:</span>
                <span className="font-bold text-[#34C759]">
                  Normal: {(eveaEvaluation.probabilidades.normal * 100).toFixed(1)}%
                </span>
                <span className="font-bold text-[#FF9500]">
                  Warning: {(eveaEvaluation.probabilidades.warning * 100).toFixed(1)}%
                </span>
                <span className="font-bold text-[#FF3B30]">
                  Critic: {(eveaEvaluation.probabilidades.critic * 100).toFixed(1)}%
                </span>
                {eveaHistory.length > 0 && (
                  <button
                    onClick={() => setEveaHistory([])}
                    className="ml-auto text-[11px] font-bold text-gray-500 underline hover:text-gray-800"
                  >
                    Reset sequence ({eveaHistory.length} previous days)
                  </button>
                )}
              </div>

              {/* Grid of the 16 questions p01 - p16 */}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {EVEA_LABELS.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-2xl bg-[#F2F2F7]/65 p-3.5 ring-1 ring-black/5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-gray-800">{item.label}</span>
                      <span className="rounded-md bg-white px-2 py-0.5 text-xs font-extrabold text-[#007AFF] shadow-sm">
                        {eveaAnswers[idx]}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] font-medium text-gray-400">{item.dim}</p>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      value={eveaAnswers[idx]}
                      onChange={(e) => handleUpdateEveaItem(idx, e.target.value)}
                      className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#007AFF]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* DEDICATED VIEW: MARES OUTPUT AND RESULTS DETAIL */}
        {activeTab === 'mares' && maresMetric && (
          <div className="mb-8 space-y-6">
            <div className="rounded-[26px] bg-white p-6 shadow-[0_2px_16px_rgba(0,0,0,0.04)] ring-1 ring-black/5">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-5">
                <div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FF2D55]/10 px-3 py-1 text-xs font-bold text-[#FF2D55]">
                    <Dumbbell className="h-3.5 w-3.5" />
                    Muscle Atrophy Research and Exercise System (MARES)
                  </span>
                  <h3 className="mt-2 text-2xl font-bold tracking-tight text-gray-900">
                    Output and Biomechanical Results in Orbit
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Isokinetic and isometric dynamometry of the lower limbs to prevent neuromuscular atrophy in 0g.
                  </p>
                </div>

                <div className="rounded-2xl bg-[#F2F2F7] px-4 py-3 text-right">
                  <span className="text-[11px] font-semibold uppercase text-gray-500">
                    Current Peak Torque / Force
                  </span>
                  <div className="text-3xl font-bold text-[#FF2D55]">
                    {maresMetric.value} <span className="text-sm font-semibold text-gray-600">N</span>
                  </div>
                </div>
              </div>

              {/* Comparison of coupled musculoskeletal indicators */}
              <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-[#F2F2F7]/70 p-4">
                  <p className="text-xs font-semibold text-gray-500">MARES Isokinetic Strength</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{maresMetric.value} N</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Referencia pre-vuelo: <span className="font-semibold">430 N</span> (
                    {Math.round((maresMetric.value / 430) * 100)}% conservado)
                  </p>
                </div>

                <div className="rounded-2xl bg-[#F2F2F7]/70 p-4">
                  <p className="text-xs font-semibold text-gray-500">Muscle Density Basal</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {muscleMetric ? muscleMetric.value : 96.5}%
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Lean mass in quadriceps and triceps surae
                  </p>
                </div>

                <div className="rounded-2xl bg-[#F2F2F7]/70 p-4">
                  <p className="text-xs font-semibold text-gray-500">Ultrasonido Recto Femoral</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">
                    {ultrasoundMetric ? ultrasoundMetric.value : 24.8} mm
                  </p>
                  <p className="mt-1 text-xs text-gray-600">
                    Transverse ultrasound thickness in orbit
                  </p>
                </div>
              </div>

              {/* Repetition / set curve of the MARES session */}
              <div className="mt-6">
                <div className="mb-2 flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                    Torque Curve per Set (Extension/Flexion Protocol)
                  </h4>
                  <span className="text-xs font-semibold text-[#FF2D55]">
                    Adjust the value in real time:
                  </span>
                </div>
                <input
                  type="range"
                  min={maresMetric.min}
                  max={maresMetric.max}
                  step={maresMetric.step}
                  value={maresMetric.value}
                  onChange={(e) => updateMetricValue('mares', e.target.value)}
                  className="mb-4 h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-[#FF2D55]"
                />
                <div className="grid grid-cols-6 gap-3 rounded-2xl bg-[#F2F2F7]/60 p-4 pt-8">
                  {[0.92, 0.98, 1.0, 0.96, 0.93, 0.89].map((factor, index) => {
                    const seriesForce = Math.round(maresMetric.value * factor);
                    const barHeight = Math.max(25, Math.min(100, (seriesForce / 600) * 100));
                    return (
                      <div key={index} className="flex flex-col items-center">
                        <span className="mb-1.5 text-xs font-bold text-gray-800">{seriesForce}N</span>
                        <div className="flex h-32 w-full max-w-[44px] items-end rounded-xl bg-white p-1 shadow-inner">
                          <div
                            className="w-full rounded-lg bg-gradient-to-t from-[#FF2D55] to-[#FF6482] transition-all duration-300"
                            style={{ height: `${barHeight}%` }}
                          />
                        </div>
                        <span className="mt-2 text-[11px] font-semibold text-gray-500">
                          Serie {index + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MAIN GRID: MODEL INPUT PANEL + APPLE HEALTH SUMMARY */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* DATA INPUT COLUMN */}
          {activeTab === 'inputs' && (
            <aside
              className="lg:col-span-12"
            >
              <ModelInputPanel />
            </aside>
          )}

          {/* COLUMNA DE RESUMEN APPLE HEALTH (13 TARJETAS FIJADAS) */}
          {(activeTab === 'summary' || activeTab === 'mares') && (
            <section className="lg:col-span-12">
              <div className="mb-3 flex items-center justify-between px-1">
                <h3 className="text-lg font-bold tracking-tight text-gray-900">
                  Pinned • Health Monitoring
                </h3>
                <span className="text-xs font-medium text-gray-500">
                  Tap a card for clinical details
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {metrics.map((metric) => {
                  const isEveaMetric = metric.id === 'psychological';
                  const severity = isEveaMetric
                    ? eveaEvaluation.estado === 'critic'
                      ? 'critical'
                      : eveaEvaluation.estado === 'warning'
                      ? 'warning'
                      : 'normal'
                    : getMetricSeverity(metric);
                  const isCritical = severity === 'critical';
                  const isWarning = severity === 'warning';
                  const eveaDisplayState =
                    eveaEvaluation.estado === 'critic'
                      ? 'CRITICAL'
                      : eveaEvaluation.estado.toUpperCase();

                  return (
                    <div
                      id={`metric-card-${metric.id}`}
                      key={metric.id}
                      onClick={() =>
                        isEveaMetric ? setActiveTab('evea') : setSelectedMetricId(metric.id)
                      }
                      className={`group cursor-pointer rounded-[22px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                        isCritical
                          ? 'ring-2 ring-[#FF3B30]'
                          : isWarning
                          ? 'ring-2 ring-[#FF9500]'
                          : 'ring-1 ring-black/5'
                      }`}
                    >
                      {/* iOS Health card header */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ParameterIcon name={metric.iconName} color={metric.color} size={17} />
                          <span
                            className="truncate text-xs font-bold tracking-tight"
                            style={{ color: metric.color }}
                          >
                            {metric.title}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-gray-400">
                          <span>{metric.updatedAt}</span>
                          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </div>

                      {/* Main value and sparkline */}
                      <div className="mt-3 flex items-end justify-between gap-3">
                        <div className="min-w-0">
                          {isEveaMetric ? (
                            <div className="flex items-baseline gap-1.5">
                              <span
                                className="text-[24px] font-extrabold leading-none tracking-tight"
                                style={{
                                  color: isCritical
                                    ? '#FF3B30'
                                    : isWarning
                                    ? '#FF9500'
                                    : '#34C759'
                                }}
                              >
                                {eveaDisplayState}
                              </span>
                              <span className="text-xs font-semibold text-gray-500">
                                ({Math.round(eveaEvaluation.probabilidades[eveaEvaluation.estado] * 100)}%)
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-baseline gap-1">
                              <span className="text-[28px] font-bold leading-none tracking-tight text-gray-900">
                                {metric.value}
                              </span>
                              <span className="text-xs font-semibold text-gray-500">
                                {metric.unit}
                              </span>
                            </div>
                          )}
                          <p className="mt-1 truncate text-[11px] font-medium text-gray-500">
                            {isEveaMetric
                              ? `Ans ${eveaEvaluation.puntajes.ansiedad.toFixed(1)} • Ale ${eveaEvaluation.puntajes.alegria.toFixed(1)}`
                              : metric.secondaryLabel}
                          </p>
                        </div>

                        <div className="w-24 shrink-0">
                          <SparklineBars
                            history={metric.history}
                            currentValue={metric.value}
                            color={
                              isCritical ? '#FF3B30' : isWarning ? '#FF9500' : metric.color
                            }
                            min={metric.min}
                            max={metric.max}
                          />
                        </div>
                      </div>

                      {/* Optimal range bar */}
                      <ClinicalRangeBar
                        value={metric.value}
                        min={metric.min}
                        max={metric.max}
                        optimalMin={metric.optimalMin}
                        optimalMax={metric.optimalMax}
                        color={metric.color}
                        severity={severity}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* DETAIL MODAL, iOS HEALTH SHEET STYLE */}
      {selectedMetric && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setSelectedMetricId(null)}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-t-[28px] bg-[#F2F2F7] shadow-2xl sm:rounded-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-black/5 bg-white px-6 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${selectedMetric.color}18` }}
                >
                  <ParameterIcon
                    name={selectedMetric.iconName}
                    color={selectedMetric.color}
                    size={20}
                  />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400">
                    {selectedMetric.category}
                  </p>
                  <h3 className="text-base font-bold text-gray-900">{selectedMetric.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedMetricId(null)}
                className="rounded-full bg-gray-100 p-2 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-6">
              <div className="rounded-[22px] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Real-Time Reading
                  </span>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600">
                    Optimal: {selectedMetric.optimalMin}–{selectedMetric.optimalMax} {selectedMetric.unit}
                  </span>
                </div>

                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-4xl font-bold tracking-tight text-gray-900">
                    {selectedMetric.value}
                  </span>
                  <span className="text-base font-semibold text-gray-500">
                    {selectedMetric.unit}
                  </span>
                  <span className="ml-2 text-xs font-medium text-gray-400">
                    ({selectedMetric.secondaryLabel})
                  </span>
                </div>

                {/* Enlarged history chart */}
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[11px] font-medium text-gray-400">
                    <span>-12h Orbit</span>
                    <span>-6h</span>
                    <span>Now</span>
                  </div>
                  <div className="flex h-28 items-end gap-2 rounded-2xl bg-[#F2F2F7]/70 p-3">
                    {[...selectedMetric.history, selectedMetric.value].map((val, i, arr) => {
                      const isLast = i === arr.length - 1;
                      const range = selectedMetric.max - selectedMetric.min || 1;
                      const pct = Math.max(
                        15,
                        Math.min(100, ((val - selectedMetric.min) / range) * 100)
                      );
                      return (
                        <div key={i} className="flex h-full flex-1 flex-col justify-end">
                          <div
                            className="w-full rounded-full transition-all duration-300"
                            style={{
                              height: `${pct}%`,
                              backgroundColor: isLast
                                ? selectedMetric.color
                                : `${selectedMetric.color}55`
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Direct control inside the modal */}
              <div className="rounded-[22px] bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-800">
                    Adjust Input Value
                  </span>
                  <span className="text-xs font-bold" style={{ color: selectedMetric.color }}>
                    {selectedMetric.value} {selectedMetric.unit}
                  </span>
                </div>
                <input
                  type="range"
                  min={selectedMetric.min}
                  max={selectedMetric.max}
                  step={selectedMetric.step}
                  value={selectedMetric.value}
                  onChange={(e) => updateMetricValue(selectedMetric.id, e.target.value)}
                  style={{ accentColor: selectedMetric.color }}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200"
                />
              </div>

              {/* Recommended actions */}
              {(() => {
                const entry = actionPlan.find((x) => x.metric.id === selectedMetric.id);
                if (!entry) {
                  return (
                    <div className="rounded-[22px] bg-white p-4 text-xs text-gray-600 shadow-sm">
                      <CheckCircle2 className="mr-1 inline h-4 w-4 text-[#34C759]" />
                      Within optimal range. No action required.
                    </div>
                  );
                }
                return (
                  <div className="rounded-[22px] bg-white p-4 shadow-sm">
                    <h4 className="mb-1 text-xs font-bold text-gray-900">Recommended actions</h4>
                    {entry.steps.map((st, i) => {
                      const k = `${selectedMetric.id}-${i}`;
                      return (
                        <label
                          key={k}
                          className="flex cursor-pointer items-start gap-2 border-t border-gray-100 py-2 text-xs text-gray-700 first:border-t-0"
                        >
                          <input
                            type="checkbox"
                            checked={!!doneActions[k]}
                            onChange={() => toggleAction(k)}
                            className="mt-0.5"
                          />
                          <span className={doneActions[k] ? 'text-gray-400 line-through' : ''}>{st}</span>
                        </label>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Aerospace relevance */}
              <div className="rounded-[22px] bg-white p-4 shadow-sm">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#007AFF]" />
                  <div>
                    <h4 className="text-xs font-bold text-gray-900">
                      Physiological Relevance in Microgravity
                    </h4>
                    <p className="mt-1 text-xs leading-relaxed text-gray-600">
                      {selectedMetric.spaceContext}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}