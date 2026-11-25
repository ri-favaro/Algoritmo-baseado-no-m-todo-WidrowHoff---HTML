import { getDecisionBoundaryLine, predict } from './widrow-hoff.js';

/**
 * Lê cores do tema computado no documento para manter os gráficos em Canvas
 * sincronizados com os modos claro/escuro sem depender de classes JS.
 */
function getThemePalette(canvas) {
  const styles = getComputedStyle(canvas);
  const isDark =
    document.querySelector('meta[name="color-scheme"]')?.content === 'dark' ||
    (document.querySelector('meta[name="color-scheme"]')?.content !== 'light' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    isDark,
    bg: styles.getPropertyValue('--surface-canvas').trim() || (isDark ? '#11161f' : '#ffffff'),
    grid: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.08)',
    axis: isDark ? 'rgba(255, 255, 255, 0.24)' : 'rgba(15, 23, 42, 0.25)',
    text: styles.getPropertyValue('--text-muted').trim() || (isDark ? '#94a3b8' : '#475569'),
    textStrong: styles.getPropertyValue('--text-primary').trim() || (isDark ? '#f1f5f9' : '#0f172a'),
    pos: '#10b981',
    posFill: isDark ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.10)',
    neg: '#6366f1',
    negFill: isDark ? 'rgba(99, 102, 241, 0.13)' : 'rgba(99, 102, 241, 0.10)',
    line: isDark ? '#f59e0b' : '#d97706',
    normalVec: isDark ? '#38bdf8' : '#0284c7',
    missRing: '#ef4444',
    activeHalo: '#facc15',
    probe: isDark ? '#f472b6' : '#db2777',
    mseLine: '#ef4444',
    accLine: '#10b981',
  };
}

function setupHiDpiCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(240, Math.round(rect.width));
  const height = Math.max(200, Math.round(rect.height));

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, width, height };
}

function niceStep(range, targetTicks = 6) {
  if (range <= 0) return 1;
  const rough = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  if (norm < 1.5) return 1 * pow;
  if (norm < 3) return 2 * pow;
  if (norm < 7) return 5 * pow;
  return 10 * pow;
}

function formatTick(val) {
  if (Math.abs(val) < 1e-9) return '0';
  if (Math.abs(val) >= 100 || Number.isInteger(val)) return String(Math.round(val * 100) / 100);
  return val.toFixed(1);
}

/**
 * Controlador do gráfico 2D (pontos + semiplanos + reta de decisão + ponto de teste).
 */
export class ScatterBoundaryChart {
  constructor(canvas, { onHover, onClickPoint } = {}) {
    this.canvas = canvas;
    this.onHover = onHover;
    this.onClickPoint = onClickPoint;
    this.lastBounds = null;
    this.lastPad = { left: 48, right: 20, top: 20, bottom: 38 };
    this.lastSize = { width: 0, height: 0 };
    this.lastState = null;

    this._bindEvents();
  }

  _bindEvents() {
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.lastBounds || !this.lastState) return;
      const coords = this._eventToData(e);
      if (!coords) {
        this.onHover?.(null);
        return;
      }

      const { dataX, dataY, px, py } = coords;
      // Busca ponto mais próximo em pixels
      let nearest = null;
      let minDist = 14;
      for (let i = 0; i < this.lastState.dataset.length; i++) {
        const pt = this.lastState.dataset[i];
        const ptPx = this.dataToPixel(pt.x1, pt.x2);
        const dist = Math.hypot(ptPx.x - px, ptPx.y - py);
        if (dist < minDist) {
          minDist = dist;
          nearest = { index: i, ...pt };
        }
      }

      this.onHover?.({
        dataX,
        dataY,
        px,
        py,
        nearest,
      });
    });

    this.canvas.addEventListener('pointerleave', () => {
      this.onHover?.(null);
    });

    this.canvas.addEventListener('click', (e) => {
      const coords = this._eventToData(e);
      if (!coords) return;
      this.onClickPoint?.({
        x1: Number(coords.dataX.toFixed(2)),
        x2: Number(coords.dataY.toFixed(2)),
      });
    });
  }

  _eventToData(e) {
    if (!this.lastBounds) return null;
    const rect = this.canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const { left, right, top, bottom } = this.lastPad;
    const plotW = this.lastSize.width - left - right;
    const plotH = this.lastSize.height - top - bottom;
    if (plotW <= 0 || plotH <= 0) return null;
    if (px < left || px > left + plotW || py < top || py > top + plotH) return null;

    const { xMin, xMax, yMin, yMax } = this.lastBounds;
    const dataX = xMin + ((px - left) / plotW) * (xMax - xMin);
    const dataY = yMax - ((py - top) / plotH) * (yMax - yMin);
    return { dataX, dataY, px, py };
  }

  computeBounds(dataset, probePoint) {
    const xs = dataset.map((d) => d.x1);
    const ys = dataset.map((d) => d.x2);
    if (probePoint && Number.isFinite(probePoint.x1) && Number.isFinite(probePoint.x2)) {
      xs.push(probePoint.x1);
      ys.push(probePoint.x2);
    }

    if (xs.length === 0) {
      return { xMin: -5, xMax: 5, yMin: -5, yMax: 5 };
    }

    let xMin = Math.min(...xs);
    let xMax = Math.max(...xs);
    let yMin = Math.min(...ys);
    let yMax = Math.max(...ys);

    const xSpan = Math.max(xMax - xMin, 2);
    const ySpan = Math.max(yMax - yMin, 2);
    const padX = xSpan * 0.18;
    const padY = ySpan * 0.18;

    return {
      xMin: xMin - padX,
      xMax: xMax + padX,
      yMin: yMin - padY,
      yMax: yMax + padY,
    };
  }

  dataToPixel(x1, x2) {
    const { left, right, top, bottom } = this.lastPad;
    const plotW = this.lastSize.width - left - right;
    const plotH = this.lastSize.height - top - bottom;
    const { xMin, xMax, yMin, yMax } = this.lastBounds;
    return {
      x: left + ((x1 - xMin) / (xMax - xMin)) * plotW,
      y: top + ((yMax - x2) / (yMax - yMin)) * plotH,
    };
  }

  render(state) {
    this.lastState = state;
    const { ctx, width, height } = setupHiDpiCanvas(this.canvas);
    this.lastSize = { width, height };
    const palette = getThemePalette(this.canvas);
    const pad = this.lastPad;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const bounds = this.computeBounds(state.dataset, state.probePoint);
    this.lastBounds = bounds;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.beginPath();
    ctx.rect(pad.left, pad.top, plotW, plotH);
    ctx.clip();

    // 1. Sombreamento dos semiplanos (+1 / -1)
    if (state.showRegions) {
      const cols = 36;
      const rows = 28;
      const cellW = plotW / cols;
      const cellH = plotH / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x1 = bounds.xMin + ((c + 0.5) / cols) * (bounds.xMax - bounds.xMin);
          const x2 = bounds.yMax - ((r + 0.5) / rows) * (bounds.yMax - bounds.yMin);
          const { y } = predict(state.weights, state.x0, x1, x2);
          ctx.fillStyle = y === 1 ? palette.posFill : palette.negFill;
          ctx.fillRect(
            pad.left + c * cellW,
            pad.top + r * cellH,
            Math.ceil(cellW),
            Math.ceil(cellH)
          );
        }
      }
    }

    // 2. Grade e eixos
    const xStep = niceStep(bounds.xMax - bounds.xMin);
    const yStep = niceStep(bounds.yMax - bounds.yMin);

    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    const firstX = Math.ceil(bounds.xMin / xStep) * xStep;
    for (let gx = firstX; gx <= bounds.xMax; gx += xStep) {
      const p = this.dataToPixel(gx, bounds.yMin);
      ctx.beginPath();
      ctx.moveTo(p.x, pad.top);
      ctx.lineTo(p.x, pad.top + plotH);
      ctx.stroke();
    }

    const firstY = Math.ceil(bounds.yMin / yStep) * yStep;
    for (let gy = firstY; gy <= bounds.yMax; gy += yStep) {
      const p = this.dataToPixel(bounds.xMin, gy);
      ctx.beginPath();
      ctx.moveTo(pad.left, p.y);
      ctx.lineTo(pad.left + plotW, p.y);
      ctx.stroke();
    }

    // Eixos em 0 caso estejam visíveis
    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1.2;
    if (bounds.xMin <= 0 && bounds.xMax >= 0) {
      const p0 = this.dataToPixel(0, bounds.yMin);
      ctx.beginPath();
      ctx.moveTo(p0.x, pad.top);
      ctx.lineTo(p0.x, pad.top + plotH);
      ctx.stroke();
    }
    if (bounds.yMin <= 0 && bounds.yMax >= 0) {
      const p0 = this.dataToPixel(bounds.xMin, 0);
      ctx.beginPath();
      ctx.moveTo(pad.left, p0.y);
      ctx.lineTo(pad.left + plotW, p0.y);
      ctx.stroke();
    }

    // 3. Reta de decisão
    const boundary = getDecisionBoundaryLine(state.weights, state.x0, bounds);
    if (boundary) {
      const p1 = this.dataToPixel(boundary.start.x1, boundary.start.x2);
      const p2 = this.dataToPixel(boundary.end.x1, boundary.end.x2);
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // Vetor normal (w1, w2) saindo do ponto médio da reta
      if (state.showNormal && Math.hypot(state.weights.w1, state.weights.w2) > 1e-12) {
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        // Em coordenadas de tela Y cresce para baixo, então invertemos w2
        const dx = state.weights.w1 / (bounds.xMax - bounds.xMin);
        const dy = -state.weights.w2 / (bounds.yMax - bounds.yMin);
        const len = Math.hypot(dx, dy);
        if (len > 1e-9) {
          const arrowLen = 34;
          const ux = (dx / len) * arrowLen;
          const uy = (dy / len) * arrowLen;
          const tipX = midX + ux;
          const tipY = midY + uy;
          ctx.strokeStyle = palette.normalVec;
          ctx.fillStyle = palette.normalVec;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(midX, midY);
          ctx.lineTo(tipX, tipY);
          ctx.stroke();

          const angle = Math.atan2(uy, ux);
          ctx.beginPath();
          ctx.moveTo(tipX, tipY);
          ctx.lineTo(tipX - 8 * Math.cos(angle - 0.45), tipY - 8 * Math.sin(angle - 0.45));
          ctx.lineTo(tipX - 8 * Math.cos(angle + 0.45), tipY - 8 * Math.sin(angle + 0.45));
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // 4. Pontos do dataset
    for (let i = 0; i < state.dataset.length; i++) {
      const sample = state.dataset[i];
      const p = this.dataToPixel(sample.x1, sample.x2);
      const { y } = predict(state.weights, state.x0, sample.x1, sample.x2);
      const isCorrect = y === sample.t;
      const isActive = state.activeSampleIndex === i;

      if (isActive) {
        ctx.strokeStyle = palette.activeHalo;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 11, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (!isCorrect) {
        ctx.strokeStyle = palette.missRing;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.fillStyle = sample.t === 1 ? palette.pos : palette.neg;
      ctx.strokeStyle = palette.bg;
      ctx.lineWidth = 1.8;

      if (sample.t === 1) {
        // Círculo para +1
        ctx.beginPath();
        ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // Losango para -1 (distinção de forma além da cor)
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 6.5);
        ctx.lineTo(p.x + 6.5, p.y);
        ctx.lineTo(p.x, p.y + 6.5);
        ctx.lineTo(p.x - 6.5, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    // 5. Ponto de teste interativo
    if (
      state.probePoint &&
      Number.isFinite(state.probePoint.x1) &&
      Number.isFinite(state.probePoint.x2)
    ) {
      const p = this.dataToPixel(state.probePoint.x1, state.probePoint.x2);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = palette.probe;
      ctx.strokeStyle = palette.bg;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 8.5 : 4;
        const a = (Math.PI / 5) * k - Math.PI / 2;
        const sx = Math.cos(a) * r;
        const sy = Math.sin(a) * r;
        if (k === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // Moldura do plot + rótulos dos eixos fora da área clipada
    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    ctx.fillStyle = palette.text;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let gx = firstX; gx <= bounds.xMax; gx += xStep) {
      const p = this.dataToPixel(gx, bounds.yMin);
      ctx.fillText(formatTick(gx), p.x, pad.top + plotH + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let gy = firstY; gy <= bounds.yMax; gy += yStep) {
      const p = this.dataToPixel(bounds.xMin, gy);
      ctx.fillText(formatTick(gy), pad.left - 8, p.y);
    }

    // Rótulo dos eixos
    ctx.fillStyle = palette.textStrong;
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(state.x1Label || 'X₁', pad.left + plotW / 2, height - 3);

    ctx.save();
    ctx.translate(13, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = 'top';
    ctx.fillText(state.x2Label || 'X₂', 0, 0);
    ctx.restore();
  }
}

/**
 * Gráfico de convergência (MSE e Acurácia % ao longo das épocas).
 */
export class ConvergenceChart {
  constructor(canvas) {
    this.canvas = canvas;
  }

  render(history) {
    const { ctx, width, height } = setupHiDpiCanvas(this.canvas);
    const palette = getThemePalette(this.canvas);
    const pad = { left: 48, right: 44, top: 18, bottom: 30 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = palette.bg;
    ctx.fillRect(0, 0, width, height);

    if (!history || history.length === 0) {
      ctx.fillStyle = palette.text;
      ctx.font = '13px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        'Execute o treinamento para visualizar MSE e acurácia por época.',
        width / 2,
        height / 2
      );
      return;
    }

    // Subamostragem suave para manter performance mesmo com milhares de épocas
    const maxPts = 400;
    let pts = history;
    if (history.length > maxPts) {
      const step = Math.ceil(history.length / maxPts);
      pts = history.filter((_, idx) => idx % step === 0 || idx === history.length - 1);
    }

    const maxMse = Math.max(
      1e-6,
      ...pts.map((h) => (Number.isFinite(h.mse) ? h.mse : 0))
    );
    const firstEpoch = pts[0].epoch;
    const lastEpoch = Math.max(firstEpoch + 1, pts[pts.length - 1].epoch);

    const xOf = (ep) =>
      pad.left + ((ep - firstEpoch) / (lastEpoch - firstEpoch)) * plotW;
    const yMse = (mse) =>
      pad.top + plotH - (Math.min(mse, maxMse) / maxMse) * plotH;
    const yAcc = (acc) => pad.top + plotH - acc * plotH;

    // Linhas horizontais de grade (0%, 50%, 100%)
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = 1;
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const y = pad.top + plotH * (1 - frac);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(pad.left + plotW, y);
      ctx.stroke();
    }

    // Curva MSE
    ctx.strokeStyle = palette.mseLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((h, i) => {
      const x = xOf(h.epoch);
      const y = yMse(h.mse);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Curva Acurácia (pós-época se disponível, senão online)
    ctx.strokeStyle = palette.accLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((h, i) => {
      const acc = h.postEpochAccuracy ?? h.accuracy ?? 0;
      const x = xOf(h.epoch);
      const y = yAcc(acc);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, plotW, plotH);

    // Rótulos MSE (esquerda) e Acurácia (direita)
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = palette.mseLine;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText(maxMse.toFixed(2), pad.left - 6, pad.top + 4);
    ctx.fillText('0', pad.left - 6, pad.top + plotH);

    ctx.fillStyle = palette.accLine;
    ctx.textAlign = 'left';
    ctx.fillText('100%', pad.left + plotW + 6, pad.top + 4);
    ctx.fillText('0%', pad.left + plotW + 6, pad.top + plotH);

    ctx.fillStyle = palette.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`Época ${firstEpoch}`, pad.left + 28, pad.top + plotH + 6);
    ctx.fillText(`Época ${lastEpoch}`, pad.left + plotW - 28, pad.top + plotH + 6);
  }
}
