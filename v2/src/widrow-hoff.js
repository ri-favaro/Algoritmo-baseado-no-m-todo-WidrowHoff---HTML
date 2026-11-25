/**
 * Motor matemático do algoritmo de Widrow-Hoff (Regra Delta / α-LMS).
 *
 * Preserva a fórmula exata da V1 (LMS Normalizado por ||x||²) como modo padrão,
 * permitindo também comparar com o LMS Padrão (ADALINE clássico) e executar
 * o treinamento amostra a amostra, época a época ou completo.
 */

export const LEARNING_RULES = Object.freeze({
  NORMALIZED_LMS: 'normalized-lms',
  STANDARD_LMS: 'standard-lms',
});

export const DEFAULT_PARAMS = Object.freeze({
  x0: 1,
  w0: 0,
  w1: 0,
  w2: 0,
  alfa: 0.5,
  maxTrain: 5000,
  rule: LEARNING_RULES.NORMALIZED_LMS,
});

const EPSILON = 1e-12;
const DIVERGENCE_LIMIT = 1e12;

/**
 * Valida os hiperparâmetros de treinamento.
 * @param {Partial<typeof DEFAULT_PARAMS>} rawParams
 * @returns {{ valid: boolean, errors: Record<string, string>, params: typeof DEFAULT_PARAMS }}
 */
export function validateParams(rawParams = {}) {
  const errors = {};
  const x0 = Number(rawParams.x0);
  const w0 = Number(rawParams.w0);
  const w1 = Number(rawParams.w1);
  const w2 = Number(rawParams.w2);
  const alfa = Number(rawParams.alfa);
  const maxTrain = Number(rawParams.maxTrain);
  const rule =
    rawParams.rule === LEARNING_RULES.STANDARD_LMS
      ? LEARNING_RULES.STANDARD_LMS
      : LEARNING_RULES.NORMALIZED_LMS;

  if (!Number.isFinite(x0)) errors.x0 = 'Informe um valor numérico válido para X₀ (bias).';
  if (!Number.isFinite(w0)) errors.w0 = 'Informe um valor numérico válido para w₀.';
  if (!Number.isFinite(w1)) errors.w1 = 'Informe um valor numérico válido para w₁.';
  if (!Number.isFinite(w2)) errors.w2 = 'Informe um valor numérico válido para w₂.';
  if (!Number.isFinite(alfa) || alfa <= 0) {
    errors.alfa = 'A taxa de aprendizagem (α) deve ser um número maior que 0.';
  } else if (rule === LEARNING_RULES.NORMALIZED_LMS && alfa > 2) {
    errors.alfa = 'Para α-LMS normalizado, recomenda-se 0 < α ≤ 2 para estabilidade.';
  }
  if (!Number.isInteger(maxTrain) || maxTrain < 1 || maxTrain > 200000) {
    errors.maxTrain = 'MaxTrain deve ser um inteiro entre 1 e 200.000.';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    params: { x0, w0, w1, w2, alfa, maxTrain, rule },
  };
}

/**
 * Valida o conjunto de amostras de treinamento.
 * @param {Array<{ x1: number, x2: number, t: number }>} dataset
 * @returns {{ valid: boolean, error: string | null }}
 */
export function validateDataset(dataset) {
  if (!Array.isArray(dataset) || dataset.length === 0) {
    return { valid: false, error: 'Adicione pelo menos 1 amostra na tabela de dados.' };
  }

  for (let i = 0; i < dataset.length; i++) {
    const row = dataset[i];
    if (
      !row ||
      !Number.isFinite(Number(row.x1)) ||
      !Number.isFinite(Number(row.x2))
    ) {
      return {
        valid: false,
        error: `Linha ${i + 1}: X₁ e X₂ devem ser números válidos.`,
      };
    }
    const t = Number(row.t);
    if (t !== 1 && t !== -1) {
      return {
        valid: false,
        error: `Linha ${i + 1}: o alvo T deve ser +1 ou -1.`,
      };
    }
  }

  return { valid: true, error: null };
}

/**
 * Calcula a saída linear s, classe predita y ∈ {+1, -1} e distância à fronteira.
 * Mantém a regra exata da V1: `s > 0 ? 1 : -1`.
 *
 * @param {{ w0: number, w1: number, w2: number }} weights
 * @param {number} x0
 * @param {number} x1
 * @param {number} x2
 */
export function predict(weights, x0, x1, x2) {
  const s = weights.w0 * x0 + weights.w1 * x1 + weights.w2 * x2;
  const y = s > 0 ? 1 : -1;
  const weightNorm = Math.hypot(weights.w1, weights.w2);
  const signedDistance = weightNorm > EPSILON ? s / weightNorm : 0;
  return {
    s,
    y,
    signedDistance,
    absMargin: Math.abs(signedDistance),
  };
}

/**
 * Avalia todo o dataset com os pesos fornecidos sem alterá-los.
 */
export function evaluateDataset(dataset, weights, x0) {
  let hits = 0;
  let sumSquaredError = 0;

  for (let i = 0; i < dataset.length; i++) {
    const sample = dataset[i];
    const { s, y } = predict(weights, x0, sample.x1, sample.x2);
    const error = sample.t - s;
    if (y === sample.t) hits++;
    sumSquaredError += error * error;
  }

  const total = dataset.length;
  return {
    hits,
    total,
    accuracy: total > 0 ? hits / total : 0,
    mse: total > 0 ? sumSquaredError / total : 0,
  };
}

/**
 * Calcula o segmento da reta de decisão `w0*x0 + w1*x1 + w2*x2 = 0` dentro dos limites do gráfico.
 * Retorna `null` quando `w1` e `w2` são ambos nulos.
 *
 * @param {{ w0: number, w1: number, w2: number }} weights
 * @param {number} x0
 * @param {{ xMin: number, xMax: number, yMin: number, yMax: number }} bounds
 */
export function getDecisionBoundaryLine(weights, x0, bounds) {
  const { w0, w1, w2 } = weights;
  const bias = w0 * x0;

  if (Math.abs(w1) <= EPSILON && Math.abs(w2) <= EPSILON) {
    return null;
  }

  const { xMin, xMax, yMin, yMax } = bounds;
  const candidates = [];

  if (Math.abs(w2) > EPSILON) {
    const yAtXMin = (-bias - w1 * xMin) / w2;
    const yAtXMax = (-bias - w1 * xMax) / w2;
    if (yAtXMin >= yMin - EPSILON && yAtXMin <= yMax + EPSILON) {
      candidates.push({ x1: xMin, x2: clamp(yAtXMin, yMin, yMax) });
    }
    if (yAtXMax >= yMin - EPSILON && yAtXMax <= yMax + EPSILON) {
      candidates.push({ x1: xMax, x2: clamp(yAtXMax, yMin, yMax) });
    }
  }

  if (Math.abs(w1) > EPSILON) {
    const xAtYMin = (-bias - w2 * yMin) / w1;
    const xAtYMax = (-bias - w2 * yMax) / w1;
    if (xAtYMin >= xMin - EPSILON && xAtYMin <= xMax + EPSILON) {
      candidates.push({ x1: clamp(xAtYMin, xMin, xMax), x2: yMin });
    }
    if (xAtYMax >= xMin - EPSILON && xAtYMax <= xMax + EPSILON) {
      candidates.push({ x1: clamp(xAtYMax, xMin, xMax), x2: yMax });
    }
  }

  // Deduplica cantos que coincidem nos vértices do retângulo
  const unique = [];
  for (const pt of candidates) {
    if (!unique.some((u) => Math.hypot(u.x1 - pt.x1, u.x2 - pt.x2) < 1e-6)) {
      unique.push(pt);
    }
  }

  if (unique.length < 2) {
    return null;
  }

  return {
    start: unique[0],
    end: unique[1],
    equation: formatLineEquation(bias, w1, w2),
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatLineEquation(bias, w1, w2) {
  if (Math.abs(w2) > EPSILON) {
    const slope = -w1 / w2;
    const intercept = -bias / w2;
    const sign = intercept >= 0 ? '+' : '-';
    return `x₂ = ${slope.toFixed(4)}·x₁ ${sign} ${Math.abs(intercept).toFixed(4)}`;
  }
  const xVal = -bias / w1;
  return `x₁ = ${xVal.toFixed(4)}`;
}

/**
 * Cria uma sessão stateful de treinamento do algoritmo Widrow-Hoff,
 * permitindo avançar por amostra individual (`stepSample`), por época (`stepEpoch`)
 * ou executar até o término (`runToEnd`).
 *
 * @param {Array<{ x1: number, x2: number, t: number }>} rawDataset
 * @param {Partial<typeof DEFAULT_PARAMS>} rawParams
 */
export function createTrainer(rawDataset, rawParams = {}) {
  const datasetCheck = validateDataset(rawDataset);
  if (!datasetCheck.valid) {
    throw new Error(datasetCheck.error);
  }

  const paramCheck = validateParams(rawParams);
  if (!paramCheck.valid) {
    const firstMsg = Object.values(paramCheck.errors)[0];
    throw new Error(firstMsg);
  }

  const dataset = rawDataset.map((row) => ({
    x1: Number(row.x1),
    x2: Number(row.x2),
    t: Number(row.t),
  }));
  const params = paramCheck.params;

  let weights = {
    w0: params.w0,
    w1: params.w1,
    w2: params.w2,
  };

  let epoch = 0; // Épocas completas concluídas
  let sampleIndex = 0; // Próxima amostra dentro da época corrente
  let currentEpochHits = 0;
  let currentEpochSqErr = 0;
  let finished = false;
  let stopReason = null; // 'converged' | 'maxTrain' | 'diverged' | null
  let lastStep = null;
  const history = [];

  function stepSample() {
    if (finished) {
      return { done: true, step: lastStep, epochSummary: null, state: getState() };
    }

    const sample = dataset[sampleIndex];
    const wBefore = { ...weights };
    const { s, y } = predict(wBefore, params.x0, sample.x1, sample.x2);
    const hit = y === sample.t;
    if (hit) currentEpochHits++;

    const error = sample.t - s;
    currentEpochSqErr += error * error;

    const normSq =
      params.x0 * params.x0 + sample.x1 * sample.x1 + sample.x2 * sample.x2;

    let scale = 0;
    if (params.rule === LEARNING_RULES.NORMALIZED_LMS) {
      // Evita divisão por zero caso x0 = x1 = x2 = 0
      scale = normSq > EPSILON ? (params.alfa * error) / normSq : 0;
    } else {
      scale = params.alfa * error;
    }

    const deltas = {
      dw0: scale * params.x0,
      dw1: scale * sample.x1,
      dw2: scale * sample.x2,
    };

    weights = {
      w0: wBefore.w0 + deltas.dw0,
      w1: wBefore.w1 + deltas.dw1,
      w2: wBefore.w2 + deltas.dw2,
    };

    const diverged =
      !Number.isFinite(weights.w0) ||
      !Number.isFinite(weights.w1) ||
      !Number.isFinite(weights.w2) ||
      Math.abs(weights.w0) > DIVERGENCE_LIMIT ||
      Math.abs(weights.w1) > DIVERGENCE_LIMIT ||
      Math.abs(weights.w2) > DIVERGENCE_LIMIT;

    lastStep = {
      epochNumber: epoch + 1,
      sampleIndex,
      sample: { ...sample },
      x0: params.x0,
      wBefore,
      s,
      y,
      hit,
      error,
      normSq,
      deltas,
      wAfter: { ...weights },
      rule: params.rule,
    };

    sampleIndex++;
    let epochSummary = null;

    if (diverged) {
      epoch++;
      finished = true;
      stopReason = 'diverged';
      const evalStats = evaluateDataset(dataset, weights, params.x0);
      epochSummary = {
        epoch,
        hits: currentEpochHits,
        postEpochHits: evalStats.hits,
        total: dataset.length,
        accuracy: currentEpochHits / dataset.length,
        postEpochAccuracy: evalStats.accuracy,
        mse: currentEpochSqErr / dataset.length,
        weights: { ...weights },
        converged: false,
        stoppedByMaxTrain: false,
        diverged: true,
      };
      history.push(epochSummary);
      sampleIndex = 0;
      currentEpochHits = 0;
      currentEpochSqErr = 0;
    } else if (sampleIndex >= dataset.length) {
      epoch++;
      const total = dataset.length;
      const converged = currentEpochHits === total;
      const stoppedByMaxTrain = !converged && epoch >= params.maxTrain;
      const evalStats = evaluateDataset(dataset, weights, params.x0);

      epochSummary = {
        epoch,
        hits: currentEpochHits,
        postEpochHits: evalStats.hits,
        total,
        accuracy: currentEpochHits / total,
        postEpochAccuracy: evalStats.accuracy,
        mse: currentEpochSqErr / total,
        weights: { ...weights },
        converged,
        stoppedByMaxTrain,
        diverged: false,
      };
      history.push(epochSummary);

      if (converged) {
        finished = true;
        stopReason = 'converged';
      } else if (stoppedByMaxTrain) {
        finished = true;
        stopReason = 'maxTrain';
      }

      sampleIndex = 0;
      currentEpochHits = 0;
      currentEpochSqErr = 0;
    }

    return {
      done: finished,
      step: lastStep,
      epochSummary,
      state: getState(),
    };
  }

  function stepEpoch() {
    if (finished) {
      return { done: true, epochSummary: history[history.length - 1] ?? null, state: getState() };
    }
    const targetEpoch = epoch + 1;
    let lastResult = null;
    while (!finished && epoch < targetEpoch) {
      lastResult = stepSample();
    }
    return {
      done: finished,
      epochSummary: lastResult?.epochSummary ?? null,
      state: getState(),
    };
  }

  function runToEnd() {
    while (!finished) {
      stepEpoch();
    }
    return getState();
  }

  function getState() {
    return {
      params: { ...params },
      weights: { ...weights },
      epoch,
      sampleIndex,
      totalSamples: dataset.length,
      finished,
      stopReason,
      lastStep,
      history,
    };
  }

  return {
    stepSample,
    stepEpoch,
    runToEnd,
    getState,
  };
}
