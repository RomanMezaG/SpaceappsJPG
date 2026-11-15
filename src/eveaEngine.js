import EVEA_MODEL from '../models/modelo_evea.json';

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

export const predecirSecuenciaEVEA = (secuenciaRespuestas) => {
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

