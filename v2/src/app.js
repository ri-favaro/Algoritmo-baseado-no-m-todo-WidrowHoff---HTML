import {
  DEFAULT_PARAMS,
  LEARNING_RULES,
  createTrainer,
  evaluateDataset,
  getDecisionBoundaryLine,
  predict,
  validateDataset,
  validateParams,
} from './widrow-hoff.js';
import { PRESETS } from './presets.js';
import { parseDatasetCsv, serializeDatasetToCsv } from './csv.js';
import { ConvergenceChart, ScatterBoundaryChart } from './charts.js';

const MAX_LOG_ITEMS = 250;

const state = {
  presetId: 'cabeloSapato',
  dataset: PRESETS.cabeloSapato.rows.map((r) => ({ ...r })),
  params: { ...DEFAULT_PARAMS, ...PRESETS.cabeloSapato.recommendedParams },
  trainer: null,
  timerId: null,
  playing: false,
  probePoint: null,
};

// Elementos do DOM
const els = {
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  openHelpBtn: document.getElementById('openHelpBtn'),
  helpDialog: document.getElementById('helpDialog'),

  presetSelect: document.getElementById('presetSelect'),
  presetDescription: document.getElementById('presetDescription'),
  datasetCountBadge: document.getElementById('datasetCountBadge'),
  addSampleForm: document.getElementById('addSampleForm'),
  inputX1: document.getElementById('inputX1'),
  inputX2: document.getElementById('inputX2'),
  labelX1: document.getElementById('labelX1'),
  labelX2: document.getElementById('labelX2'),
  thX1: document.getElementById('thX1'),
  thX2: document.getElementById('thX2'),
  targetPosLabel: document.getElementById('targetPosLabel'),
  targetNegLabel: document.getElementById('targetNegLabel'),
  datasetBody: document.getElementById('datasetBody'),
  datasetAlert: document.getElementById('datasetAlert'),
  importCsvBtn: document.getElementById('importCsvBtn'),
  exportCsvBtn: document.getElementById('exportCsvBtn'),
  clearTableBtn: document.getElementById('clearTableBtn'),
  csvFileInput: document.getElementById('csvFileInput'),

  paramsForm: document.getElementById('paramsForm'),
  restoreParamsBtn: document.getElementById('restoreParamsBtn'),
  paramRule: document.getElementById('paramRule'),
  paramX0: document.getElementById('paramX0'),
  paramW0: document.getElementById('paramW0'),
  paramW1: document.getElementById('paramW1'),
  paramW2: document.getElementById('paramW2'),
  paramAlfa: document.getElementById('paramAlfa'),
  paramMaxTrain: document.getElementById('paramMaxTrain'),
  paramsAlert: document.getElementById('paramsAlert'),

  runAllBtn: document.getElementById('runAllBtn'),
  playPauseBtn: document.getElementById('playPauseBtn'),
  stepEpochBtn: document.getElementById('stepEpochBtn'),
  stepSampleBtn: document.getElementById('stepSampleBtn'),
  resetBtn: document.getElementById('resetBtn'),
  playModeSelect: document.getElementById('playModeSelect'),
  speedRange: document.getElementById('speedRange'),
  speedValue: document.getElementById('speedValue'),

  kpiEpoch: document.getElementById('kpiEpoch'),
  kpiStatus: document.getElementById('kpiStatus'),
  kpiAccuracy: document.getElementById('kpiAccuracy'),
  kpiOnlineHits: document.getElementById('kpiOnlineHits'),
  kpiMse: document.getElementById('kpiMse'),
  kpiRuleLabel: document.getElementById('kpiRuleLabel'),
  kpiWeights: document.getElementById('kpiWeights'),
  kpiEquation: document.getElementById('kpiEquation'),

  canvasModeSelect: document.getElementById('canvasModeSelect'),
  toggleRegions: document.getElementById('toggleRegions'),
  toggleNormal: document.getElementById('toggleNormal'),
  scatterCanvas: document.getElementById('scatterCanvas'),
  scatterTooltip: document.getElementById('scatterTooltip'),
  legendPos: document.getElementById('legendPos'),
  legendNeg: document.getElementById('legendNeg'),
  convergenceCanvas: document.getElementById('convergenceCanvas'),

  stepBadge: document.getElementById('stepBadge'),
  mathInspector: document.getElementById('mathInspector'),
  probeLabelX1: document.getElementById('probeLabelX1'),
  probeLabelX2: document.getElementById('probeLabelX2'),
  probeX1: document.getElementById('probeX1'),
  probeX2: document.getElementById('probeX2'),
  predictResult: document.getElementById('predictResult'),

  logSummary: document.getElementById('logSummary'),
  logList: document.getElementById('logList'),
};

const scatterChart = new ScatterBoundaryChart(els.scatterCanvas, {
  onHover: handleScatterHover,
  onClickPoint: handleScatterClick,
});
const convergenceChart = new ConvergenceChart(els.convergenceCanvas);

// --- Gerenciamento de Tema (padrão dark-mode-toggle) ---
function setupTheme() {
  const meta = document.querySelector('meta[name="color-scheme"]');
  const darkMedia = window.matchMedia('(prefers-color-scheme: dark)');

  const getSystemScheme = () => (darkMedia.matches ? 'dark' : 'light');
  const getRenderedScheme = () => {
    const content = meta.content;
    if (content === 'dark' || content === 'light') return content;
    return getSystemScheme();
  };

  els.themeToggleBtn.addEventListener('click', () => {
    const target = getRenderedScheme() === 'dark' ? 'light' : 'dark';
    const system = getSystemScheme();
    try {
      if (target === system) {
        localStorage.removeItem('color-scheme');
      } else {
        localStorage.setItem('color-scheme', target);
      }
    } catch {}
    meta.content = target === system ? 'light dark' : target;
    renderCharts();
  });

  window.addEventListener('storage', (e) => {
    if (e.key === 'color-scheme') {
      meta.content = e.newValue ?? 'light dark';
      renderCharts();
    }
  });

  darkMedia.addEventListener('change', () => {
    renderCharts();
  });
}

// --- Modal Dialog nativo com fallback para light-dismiss ---
function setupDialog() {
  els.openHelpBtn.addEventListener('click', () => {
    els.helpDialog.showModal();
  });

  els.helpDialog.addEventListener('close', () => {
    els.helpDialog.returnValue = '';
  });

  if (!('closedBy' in HTMLDialogElement.prototype)) {
    const outside = (e, dialog) => {
      const r = dialog.getBoundingClientRect();
      return (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      );
    };
    let pressedOutside = false;
    els.helpDialog.addEventListener('pointerdown', (e) => {
      pressedOutside = outside(e, els.helpDialog);
    });
    els.helpDialog.addEventListener('pointerup', (e) => {
      if (pressedOutside && outside(e, els.helpDialog)) {
        els.helpDialog.close();
      }
    });
  }
}

// --- Acessibilidade e validação após interação (:user-invalid + ARIA) ---
function setupAriaValidation() {
  const announcer = document.createElement('div');
  announcer.setAttribute('aria-live', 'polite');
  announcer.classList.add('visually-hidden');
  document.body.append(announcer);

  let announceTimer = null;
  let announcedField = null;
  const flagged = new WeakSet();
  const announced = new WeakSet();

  const linkError = (el, shown) => {
    const errorId = el.dataset.error;
    if (!errorId) return;
    const ids = (el.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (shown) ids.push(errorId);
    if (ids.length) el.setAttribute('aria-describedby', ids.join(' '));
    else el.removeAttribute('aria-describedby');
  };

  const announceError = (el) => {
    const error = document.getElementById(el.dataset.error);
    if (!error) return;
    const label = el.labels?.[0] ? `${el.labels[0].textContent.trim()}: ` : '';
    clearTimeout(announceTimer);
    announcer.textContent = '';
    announcedField = el;
    announceTimer = setTimeout(() => {
      announcer.textContent = label + error.textContent.replace(/\s+/g, ' ').trim();
    }, 500);
  };

  const syncAria = (el, announce = false) => {
    if (!el.matches?.('input, select, textarea')) return;
    let invalid = false;
    try {
      invalid = el.matches(':user-invalid');
    } catch {
      invalid = el.classList.contains('user-invalid-fallback');
    }

    if (invalid) {
      if (announce && !announced.has(el)) {
        announceError(el);
        announced.add(el);
      }
      el.setAttribute('aria-invalid', 'true');
      linkError(el, true);
      flagged.add(el);
    } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
      el.setAttribute('aria-invalid', 'false');
      linkError(el, false);
      flagged.delete(el);
      announced.delete(el);
      if (announcedField === el) {
        clearTimeout(announceTimer);
        announcer.textContent = '';
      }
    }
  };

  document.querySelectorAll('input, select').forEach((el) => syncAria(el));
  document.addEventListener('blur', (e) => syncAria(e.target, true), true);
  document.addEventListener('input', (e) => {
    if (e.target.hasAttribute('aria-invalid')) syncAria(e.target);
  });
  document.addEventListener('change', (e) => syncAria(e.target, true), true);
  document.addEventListener(
    'invalid',
    (e) => {
      announced.add(e.target);
      syncAria(e.target);
    },
    true
  );
  document.addEventListener(
    'reset',
    (e) => {
      setTimeout(() => [...e.target.elements].forEach((el) => syncAria(el)));
    },
    true
  );
}

// --- Sincronização de Estado & Treinador ---
function getCurrentPreset() {
  return PRESETS[state.presetId] || PRESETS.cabeloSapato;
}

function readParamsFromInputs() {
  return {
    rule: els.paramRule.value,
    x0: els.paramX0.value,
    w0: els.paramW0.value,
    w1: els.paramW1.value,
    w2: els.paramW2.value,
    alfa: els.paramAlfa.value,
    maxTrain: els.paramMaxTrain.value,
  };
}

function writeParamsToInputs(params) {
  els.paramRule.value = params.rule || LEARNING_RULES.NORMALIZED_LMS;
  els.paramX0.value = params.x0;
  els.paramW0.value = params.w0;
  els.paramW1.value = params.w1;
  els.paramW2.value = params.w2;
  els.paramAlfa.value = params.alfa;
  els.paramMaxTrain.value = params.maxTrain;
}

function stopPlayback() {
  if (state.timerId !== null) {
    clearTimeout(state.timerId);
    state.timerId = null;
  }
  state.playing = false;
  els.playPauseBtn.textContent = 'Play';
}

function rebuildTrainer() {
  stopPlayback();
  const dsCheck = validateDataset(state.dataset);
  const paramCheck = validateParams(readParamsFromInputs());

  els.datasetAlert.hidden = dsCheck.valid;
  if (!dsCheck.valid) els.datasetAlert.textContent = dsCheck.error;

  els.paramsAlert.hidden = paramCheck.valid;
  if (!paramCheck.valid) {
    els.paramsAlert.textContent = Object.values(paramCheck.errors)[0];
  }

  state.params = paramCheck.params;

  if (dsCheck.valid && paramCheck.valid) {
    state.trainer = createTrainer(state.dataset, state.params);
  } else {
    state.trainer = null;
  }

  updateControlStates();
  renderAll();
}

function updateControlStates() {
  const ready = Boolean(state.trainer);
  const finished = state.trainer?.getState().finished ?? false;
  els.runAllBtn.disabled = !ready || finished;
  els.playPauseBtn.disabled = !ready || finished;
  els.stepEpochBtn.disabled = !ready || finished;
  els.stepSampleBtn.disabled = !ready || finished;
  els.resetBtn.disabled = !ready;
}

function getDisplayState() {
  if (state.trainer) {
    return state.trainer.getState();
  }
  return {
    params: state.params,
    weights: {
      w0: Number(state.params.w0) || 0,
      w1: Number(state.params.w1) || 0,
      w2: Number(state.params.w2) || 0,
    },
    epoch: 0,
    sampleIndex: 0,
    totalSamples: state.dataset.length,
    finished: false,
    stopReason: null,
    lastStep: null,
    history: [],
  };
}

// --- Renderização ---
function renderPresetLabels() {
  const preset = getCurrentPreset();
  els.presetDescription.textContent = preset.description;
  els.labelX1.textContent = preset.x1Label;
  els.labelX2.textContent = preset.x2Label;
  els.thX1.textContent = preset.x1Label;
  els.thX2.textContent = preset.x2Label;
  els.targetPosLabel.textContent = preset.classPosLabel;
  els.targetNegLabel.textContent = preset.classNegLabel;
  els.legendPos.textContent = preset.classPosLabel;
  els.legendNeg.textContent = preset.classNegLabel;
  els.probeLabelX1.textContent = `${preset.x1Label} (teste)`;
  els.probeLabelX2.textContent = `${preset.x2Label} (teste)`;
}

function renderDatasetTable() {
  const tState = getDisplayState();
  const preset = getCurrentPreset();
  const activeIndex =
    tState.lastStep && !tState.finished ? tState.lastStep.sampleIndex : -1;

  els.datasetCountBadge.textContent = `${state.dataset.length} ${
    state.dataset.length === 1 ? 'amostra' : 'amostras'
  }`;

  const frag = document.createDocumentFragment();
  state.dataset.forEach((row, idx) => {
    const tr = document.createElement('tr');
    if (idx === activeIndex) tr.classList.add('is-active-row');

    const { y } = predict(tState.weights, tState.params.x0, row.x1, row.x2);
    const isHit = y === row.t;

    const tdIdx = document.createElement('td');
    tdIdx.dataset.label = '#';
    tdIdx.textContent = String(idx + 1);

    const tdX1 = document.createElement('td');
    tdX1.dataset.label = preset.x1Label;
    const inX1 = document.createElement('input');
    inX1.type = 'number';
    inX1.step = 'any';
    inX1.className = 'cell-input';
    inX1.value = String(row.x1);
    inX1.setAttribute('aria-label', `X1 da amostra ${idx + 1}`);
    inX1.addEventListener('change', () => {
      const val = Number(inX1.value);
      if (Number.isFinite(val)) {
        state.dataset[idx].x1 = val;
        rebuildTrainer();
      } else {
        inX1.value = String(state.dataset[idx].x1);
      }
    });
    tdX1.appendChild(inX1);

    const tdX2 = document.createElement('td');
    tdX2.dataset.label = preset.x2Label;
    const inX2 = document.createElement('input');
    inX2.type = 'number';
    inX2.step = 'any';
    inX2.className = 'cell-input';
    inX2.value = String(row.x2);
    inX2.setAttribute('aria-label', `X2 da amostra ${idx + 1}`);
    inX2.addEventListener('change', () => {
      const val = Number(inX2.value);
      if (Number.isFinite(val)) {
        state.dataset[idx].x2 = val;
        rebuildTrainer();
      } else {
        inX2.value = String(state.dataset[idx].x2);
      }
    });
    tdX2.appendChild(inX2);

    const tdT = document.createElement('td');
    tdT.dataset.label = 'Alvo (T)';
    const tBtn = document.createElement('button');
    tBtn.type = 'button';
    tBtn.className = 'target-btn';
    tBtn.dataset.t = String(row.t);
    tBtn.textContent = row.t === 1 ? '+1' : '-1';
    tBtn.title = 'Clique para alternar entre +1 e -1';
    tBtn.addEventListener('click', () => {
      state.dataset[idx].t = state.dataset[idx].t === 1 ? -1 : 1;
      rebuildTrainer();
    });
    tdT.appendChild(tBtn);

    const tdStatus = document.createElement('td');
    tdStatus.dataset.label = 'Predição';
    const spanStatus = document.createElement('span');
    spanStatus.className = `status-dot ${isHit ? 'ok' : 'miss'}`;
    spanStatus.textContent = isHit ? '✓ Acerto' : `✕ (${y > 0 ? '+1' : '-1'})`;
    tdStatus.appendChild(spanStatus);

    const tdAct = document.createElement('td');
    tdAct.dataset.label = 'Ação';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger btn-icon';
    delBtn.textContent = '✕';
    delBtn.setAttribute('aria-label', `Remover amostra ${idx + 1}`);
    delBtn.addEventListener('click', () => {
      state.dataset.splice(idx, 1);
      rebuildTrainer();
    });
    tdAct.appendChild(delBtn);

    tr.append(tdIdx, tdX1, tdX2, tdT, tdStatus, tdAct);
    frag.appendChild(tr);
  });

  els.datasetBody.replaceChildren(frag);
}

function renderKpis() {
  const tState = getDisplayState();
  const evalNow =
    state.dataset.length > 0
      ? evaluateDataset(state.dataset, tState.weights, tState.params.x0)
      : { hits: 0, total: 0, accuracy: 0, mse: 0 };

  els.kpiEpoch.textContent = `${tState.epoch} / ${tState.params.maxTrain}`;

  let statusClass = 'pill-idle';
  let statusText = 'Pronto';
  if (state.playing) {
    statusClass = 'pill-running';
    statusText = 'Treinando...';
  } else if (tState.stopReason === 'converged') {
    statusClass = 'pill-ok';
    statusText = 'Convergiu ✓';
  } else if (tState.stopReason === 'maxTrain') {
    statusClass = 'pill-warn';
    statusText = 'Limite MaxTrain';
  } else if (tState.stopReason === 'diverged') {
    statusClass = 'pill-danger';
    statusText = 'Divergiu';
  } else if (tState.epoch > 0 || tState.sampleIndex > 0) {
    statusClass = 'pill-running';
    statusText = 'Pausado';
  }

  els.kpiStatus.className = `pill ${statusClass}`;
  els.kpiStatus.textContent = statusText;

  const pct = (evalNow.accuracy * 100).toFixed(1);
  els.kpiAccuracy.textContent = `${evalNow.hits} / ${evalNow.total} (${pct}%)`;

  const lastEpoch = tState.history[tState.history.length - 1];
  els.kpiOnlineHits.textContent = lastEpoch
    ? `Online na época ${lastEpoch.epoch}: ${lastEpoch.hits}/${lastEpoch.total}`
    : 'Online na época: —';

  els.kpiMse.textContent =
    state.dataset.length > 0 && Number.isFinite(evalNow.mse)
      ? evalNow.mse.toFixed(4)
      : '—';

  els.kpiRuleLabel.textContent =
    tState.params.rule === LEARNING_RULES.NORMALIZED_LMS
      ? 'α-LMS Normalizado (V1)'
      : 'ADALINE / LMS Padrão';

  const { w0, w1, w2 } = tState.weights;
  els.kpiWeights.textContent = `${w0.toFixed(4)}, ${w1.toFixed(4)}, ${w2.toFixed(4)}`;

  const boundary = getDecisionBoundaryLine(tState.weights, tState.params.x0, {
    xMin: -100,
    xMax: 100,
    yMin: -100,
    yMax: 100,
  });
  els.kpiEquation.textContent = boundary ? boundary.equation : 'Reta indefinida (w₁=w₂=0)';
}

function renderMathInspector() {
  const tState = getDisplayState();
  const step = tState.lastStep;

  if (!step) {
    els.stepBadge.className = 'pill pill-idle tabular-nums';
    els.stepBadge.textContent = 'Aguardando';
    els.mathInspector.innerHTML =
      '<p class="card-desc" style="margin:0">Clique em <strong>Próx. Amostra</strong> ou <strong>Play (Por amostra)</strong> para ver cada substituição numérica de <code class="mono">s</code>, <code class="mono">e = t - s</code> e <code class="mono">Δw</code> em tempo real.</p>';
    return;
  }

  els.stepBadge.className = `pill ${step.hit ? 'pill-ok' : 'pill-warn'} tabular-nums`;
  els.stepBadge.textContent = `Época ${step.epochNumber} · Amostra ${step.sampleIndex + 1}`;

  const fmt = (n) => (Number.isFinite(n) ? n.toFixed(5) : String(n));
  const ruleExpr =
    step.rule === LEARNING_RULES.NORMALIZED_LMS
      ? `‖x‖² = ${step.normSq.toFixed(2)}`
      : 'LMS Padrão (sem ‖x‖²)';

  els.mathInspector.innerHTML = `
    <div class="math-line">
      <span>Entrada: (${step.x0}, ${step.sample.x1}, ${step.sample.x2})</span>
      <span>Alvo t = <strong>${step.sample.t > 0 ? '+1' : '-1'}</strong></span>
    </div>
    <div class="math-line">
      <span>s = w₀·x₀ + w₁·x₁ + w₂·x₂</span>
      <span><strong>${fmt(step.s)}</strong></span>
    </div>
    <div class="math-line">
      <span>Saída ŷ = (s &gt; 0 ? +1 : -1)</span>
      <span><strong>${step.y > 0 ? '+1' : '-1'}</strong> (${step.hit ? 'Acerto ✓' : 'Erro ✕'})</span>
    </div>
    <div class="math-line">
      <span>Erro LMS: e = t - s</span>
      <span><strong>${fmt(step.error)}</strong> (${ruleExpr})</span>
    </div>
    <div class="math-line">
      <span>Δw = (${fmt(step.deltas.dw0)}, ${fmt(step.deltas.dw1)}, ${fmt(step.deltas.dw2)})</span>
      <span>w' = (${fmt(step.wAfter.w0)}, ${fmt(step.wAfter.w1)}, ${fmt(step.wAfter.w2)})</span>
    </div>
  `;
}

function renderPredictionBox() {
  if (!state.probePoint) {
    els.predictResult.innerHTML =
      '<span class="card-desc" style="margin: 0">Digite coordenadas ou clique no gráfico para classificar um ponto.</span>';
    return;
  }

  const tState = getDisplayState();
  const preset = getCurrentPreset();
  const res = predict(
    tState.weights,
    tState.params.x0,
    state.probePoint.x1,
    state.probePoint.x2
  );
  const label = res.y === 1 ? preset.classPosLabel : preset.classNegLabel;
  const pillClass = res.y === 1 ? 'pill-ok' : 'pill-running';

  els.predictResult.innerHTML = `
    <div>
      <div style="font-size: 0.78rem; color: var(--text-muted)">
        Ponto (${state.probePoint.x1}, ${state.probePoint.x2})
      </div>
      <div style="font-weight: 700; margin-top: 0.1rem">
        Classe prevista: <span class="pill ${pillClass}">${label}</span>
      </div>
    </div>
    <div class="mono tabular-nums" style="font-size: 0.82rem; text-align: right">
      <div>s = ${res.s.toFixed(4)}</div>
      <div>Dist. à reta = ${res.absMargin.toFixed(4)}</div>
    </div>
  `;
}

function renderLog() {
  const history = getDisplayState().history;
  if (history.length === 0) {
    els.logSummary.textContent = 'Nenhuma época executada ainda.';
    els.logList.replaceChildren();
    return;
  }

  const slice = history.slice(-MAX_LOG_ITEMS).reverse();
  els.logSummary.textContent =
    history.length > MAX_LOG_ITEMS
      ? `Mostrando últimas ${MAX_LOG_ITEMS} de ${history.length} épocas`
      : `${history.length} ${history.length === 1 ? 'época' : 'épocas'} registradas`;

  const frag = document.createDocumentFragment();
  for (const item of slice) {
    const li = document.createElement('li');
    li.textContent =
      `Época ${item.epoch} | w0=${item.weights.w0.toFixed(5)} ` +
      `w1=${item.weights.w1.toFixed(5)} w2=${item.weights.w2.toFixed(5)} | ` +
      `Online=${item.hits}/${item.total} | Pós-época=${item.postEpochHits}/${item.total} | ` +
      `MSE=${item.mse.toFixed(5)}`;
    frag.appendChild(li);
  }
  els.logList.replaceChildren(frag);
}

function renderCharts() {
  const tState = getDisplayState();
  const preset = getCurrentPreset();
  const activeIdx =
    tState.lastStep && !tState.finished ? tState.lastStep.sampleIndex : -1;

  scatterChart.render({
    dataset: state.dataset,
    weights: tState.weights,
    x0: tState.params.x0,
    x1Label: preset.x1Label,
    x2Label: preset.x2Label,
    showRegions: els.toggleRegions.checked,
    showNormal: els.toggleNormal.checked,
    activeSampleIndex: activeIdx,
    probePoint: state.probePoint,
  });

  convergenceChart.render(tState.history);
}

function renderAll() {
  renderPresetLabels();
  renderDatasetTable();
  renderKpis();
  renderMathInspector();
  renderPredictionBox();
  renderLog();
  renderCharts();
}

// --- Interações do Canvas ---
function handleScatterHover(info) {
  if (!info) {
    els.scatterTooltip.hidden = true;
    return;
  }
  const tState = getDisplayState();
  const { s, y } = predict(tState.weights, tState.params.x0, info.dataX, info.dataY);

  if (info.nearest) {
    const n = info.nearest;
    const samplePred = predict(tState.weights, tState.params.x0, n.x1, n.x2);
    els.scatterTooltip.textContent =
      `#${n.index + 1} (${n.x1}, ${n.x2}) | T=${n.t > 0 ? '+1' : '-1'} | ŷ=${
        samplePred.y > 0 ? '+1' : '-1'
      } (s=${samplePred.s.toFixed(3)})`;
  } else {
    els.scatterTooltip.textContent =
      `(${info.dataX.toFixed(2)}, ${info.dataY.toFixed(2)}) | s=${s.toFixed(3)} → ${
        y > 0 ? '+1' : '-1'
      }`;
  }

  els.scatterTooltip.hidden = false;
  els.scatterTooltip.style.left = `${Math.min(info.px + 12, els.scatterCanvas.clientWidth - 190)}px`;
  els.scatterTooltip.style.top = `${Math.max(info.py - 32, 8)}px`;
}

function handleScatterClick(pt) {
  const mode = els.canvasModeSelect.value;
  if (mode === 'probe') {
    state.probePoint = pt;
    els.probeX1.value = String(pt.x1);
    els.probeX2.value = String(pt.x2);
    renderPredictionBox();
    renderCharts();
    return;
  }

  const target = mode === 'addPos' ? 1 : -1;
  state.dataset.push({ x1: pt.x1, x2: pt.x2, t: target });
  rebuildTrainer();
}

// --- Controles de Treinamento ---
function scheduleNextTick() {
  if (!state.playing || !state.trainer) return;
  const speed = Number(els.speedRange.value) || 20;
  const delayMs = Math.max(16, Math.round(1000 / speed));

  state.timerId = setTimeout(() => {
    if (!state.playing || !state.trainer) return;
    const mode = els.playModeSelect.value;
    const res =
      mode === 'sample' ? state.trainer.stepSample() : state.trainer.stepEpoch();

    if (res.done) {
      stopPlayback();
    }
    updateControlStates();
    renderDatasetTable();
    renderKpis();
    renderMathInspector();
    renderPredictionBox();
    renderLog();
    renderCharts();

    if (state.playing) {
      scheduleNextTick();
    }
  }, delayMs);
}

// --- Inicialização de Presets & Listeners ---
function initPresets() {
  const frag = document.createDocumentFragment();
  for (const preset of Object.values(PRESETS)) {
    const opt = document.createElement('option');
    opt.value = preset.id;
    opt.textContent = preset.name;
    frag.appendChild(opt);
  }
  els.presetSelect.replaceChildren(frag);
  els.presetSelect.value = state.presetId;

  els.presetSelect.addEventListener('change', () => {
    state.presetId = els.presetSelect.value;
    const preset = getCurrentPreset();
    state.dataset = preset.rows.map((r) => ({ ...r }));
    state.probePoint = null;
    els.probeX1.value = '';
    els.probeX2.value = '';
    writeParamsToInputs({
      ...preset.recommendedParams,
      rule: els.paramRule.value,
    });
    rebuildTrainer();
  });
}

function bindEvents() {
  els.addSampleForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!els.addSampleForm.reportValidity()) return;

    const x1 = Number(els.inputX1.value);
    const x2 = Number(els.inputX2.value);
    const t = Number(
      document.querySelector('input[name="targetRadio"]:checked').value
    );

    if (!Number.isFinite(x1) || !Number.isFinite(x2)) return;
    state.dataset.push({ x1, x2, t });
    els.inputX1.value = '';
    els.inputX2.value = '';
    els.inputX1.focus();
    rebuildTrainer();
  });

  els.clearTableBtn.addEventListener('click', () => {
    state.dataset = [];
    rebuildTrainer();
  });

  els.exportCsvBtn.addEventListener('click', () => {
    const csv = serializeDatasetToCsv(state.dataset);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `widrow-hoff-${state.presetId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  els.importCsvBtn.addEventListener('click', () => {
    els.csvFileInput.value = '';
    els.csvFileInput.click();
  });

  els.csvFileInput.addEventListener('change', async () => {
    const file = els.csvFileInput.files?.[0];
    if (!file) return;
    const text = await file.text();
    const { rows, errors } = parseDatasetCsv(text);
    if (rows.length > 0) {
      state.dataset = rows;
      rebuildTrainer();
    }
    if (errors.length > 0) {
      els.datasetAlert.hidden = false;
      els.datasetAlert.textContent = errors.slice(0, 3).join(' ');
    }
  });

  els.restoreParamsBtn.addEventListener('click', () => {
    const preset = getCurrentPreset();
    writeParamsToInputs({
      ...preset.recommendedParams,
      rule: LEARNING_RULES.NORMALIZED_LMS,
    });
    rebuildTrainer();
  });

  [
    els.paramRule,
    els.paramX0,
    els.paramW0,
    els.paramW1,
    els.paramW2,
    els.paramAlfa,
    els.paramMaxTrain,
  ].forEach((el) => {
    el.addEventListener('change', () => rebuildTrainer());
  });

  els.runAllBtn.addEventListener('click', () => {
    if (!state.trainer) return;
    stopPlayback();
    state.trainer.runToEnd();
    updateControlStates();
    renderAll();
  });

  els.playPauseBtn.addEventListener('click', () => {
    if (!state.trainer) return;
    if (state.playing) {
      stopPlayback();
      renderKpis();
      return;
    }
    if (state.trainer.getState().finished) return;
    state.playing = true;
    els.playPauseBtn.textContent = 'Pausar';
    renderKpis();
    scheduleNextTick();
  });

  els.stepEpochBtn.addEventListener('click', () => {
    if (!state.trainer) return;
    stopPlayback();
    state.trainer.stepEpoch();
    updateControlStates();
    renderAll();
  });

  els.stepSampleBtn.addEventListener('click', () => {
    if (!state.trainer) return;
    stopPlayback();
    state.trainer.stepSample();
    updateControlStates();
    renderAll();
  });

  els.resetBtn.addEventListener('click', () => {
    rebuildTrainer();
  });

  els.speedRange.addEventListener('input', () => {
    els.speedValue.textContent = els.speedRange.value;
  });

  [els.toggleRegions, els.toggleNormal].forEach((cb) => {
    cb.addEventListener('change', () => renderCharts());
  });

  const handleProbeInput = () => {
    const raw1 = els.probeX1.value.trim();
    const raw2 = els.probeX2.value.trim();
    if (raw1 === '' || raw2 === '') {
      state.probePoint = null;
    } else {
      const x1 = Number(raw1);
      const x2 = Number(raw2);
      state.probePoint =
        Number.isFinite(x1) && Number.isFinite(x2) ? { x1, x2 } : null;
    }
    renderPredictionBox();
    renderCharts();
  };

  els.probeX1.addEventListener('input', handleProbeInput);
  els.probeX2.addEventListener('input', handleProbeInput);

  window.addEventListener('resize', () => renderCharts());
}

function init() {
  setupTheme();
  setupDialog();
  setupAriaValidation();
  initPresets();
  writeParamsToInputs(state.params);
  bindEvents();
  rebuildTrainer();
}

init();
