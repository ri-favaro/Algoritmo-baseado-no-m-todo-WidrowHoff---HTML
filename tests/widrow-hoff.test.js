import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LEARNING_RULES,
  createTrainer,
  evaluateDataset,
  getDecisionBoundaryLine,
  predict,
  validateDataset,
  validateParams,
} from '../v2/src/widrow-hoff.js';
import { PRESETS } from '../v2/src/presets.js';

test('validateDataset rejeita lista vazia, NaN e alvos fora de {+1, -1}', () => {
  assert.equal(validateDataset([]).valid, false);
  assert.equal(validateDataset([{ x1: 1, x2: Number.NaN, t: 1 }]).valid, false);
  assert.equal(validateDataset([{ x1: 1, x2: 2, t: 0 }]).valid, false);
  assert.equal(validateDataset([{ x1: 1, x2: 2, t: 1 }]).valid, true);
});

test('validateParams valida alfa > 0, maxTrain inteiro e campos finitos', () => {
  const invalid = validateParams({
    x0: 1,
    w0: 0,
    w1: 0,
    w2: 0,
    alfa: 0,
    maxTrain: 0,
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.alfa);
  assert.ok(invalid.errors.maxTrain);

  const valid = validateParams({
    x0: 1,
    w0: 0,
    w1: 0,
    w2: 0,
    alfa: 0.5,
    maxTrain: 100,
  });
  assert.equal(valid.valid, true);
});

test('paridade matemática exata com a fórmula Widrow-Hoff da V1 em 1 passo', () => {
  const dataset = [{ x1: 25, x2: 34, t: -1 }];
  const trainer = createTrainer(dataset, {
    x0: 1,
    w0: 0,
    w1: 0,
    w2: 0,
    alfa: 0.5,
    maxTrain: 10,
    rule: LEARNING_RULES.NORMALIZED_LMS,
  });

  const res = trainer.stepSample();
  // s = 0, erro = -1 - 0 = -1, xquadrado = 1 + 625 + 1156 = 1782
  const expectedNormSq = 1 + 25 * 25 + 34 * 34;
  assert.equal(res.step.s, 0);
  assert.equal(res.step.y, -1); // s > 0 ? 1 : -1
  assert.equal(res.step.error, -1);
  assert.equal(res.step.normSq, expectedNormSq);
  assert.ok(Math.abs(res.step.wAfter.w0 - (-0.5 / expectedNormSq)) < 1e-12);
  assert.ok(Math.abs(res.step.wAfter.w1 - ((-0.5 * 25) / expectedNormSq)) < 1e-12);
  assert.ok(Math.abs(res.step.wAfter.w2 - ((-0.5 * 34) / expectedNormSq)) < 1e-12);
});

test('convergência no dataset original Cabelo/Sapato', () => {
  const preset = PRESETS.cabeloSapato;
  const trainer = createTrainer(preset.rows, {
    ...preset.recommendedParams,
    rule: LEARNING_RULES.NORMALIZED_LMS,
  });

  const finalState = trainer.runToEnd();
  assert.equal(finalState.finished, true);
  assert.equal(finalState.stopReason, 'converged');

  const lastEpoch = finalState.history[finalState.history.length - 1];
  assert.equal(lastEpoch.hits, preset.rows.length);

  // Classifica um ponto claramente feminino (cabelo longo, sapato menor) e masculino
  const mulher = predict(finalState.weights, finalState.params.x0, 28, 34);
  const homem = predict(finalState.weights, finalState.params.x0, 4, 43);
  assert.equal(mulher.y, -1);
  assert.equal(homem.y, 1);
});

test('converge nas portas lógicas AND e OR e respeita MaxTrain na porta XOR', () => {
  for (const id of ['andGate', 'orGate']) {
    const preset = PRESETS[id];
    const state = createTrainer(preset.rows, preset.recommendedParams).runToEnd();
    assert.equal(state.stopReason, 'converged', `${id} deveria convergir`);
    const evalRes = evaluateDataset(preset.rows, state.weights, state.params.x0);
    assert.equal(evalRes.hits, 4);
  }

  const xor = PRESETS.xorGate;
  const xorState = createTrainer(xor.rows, xor.recommendedParams).runToEnd();
  assert.equal(xorState.finished, true);
  assert.equal(xorState.stopReason, 'maxTrain');
  assert.equal(xorState.epoch, xor.recommendedParams.maxTrain);
});

test('protege contra divisão por zero quando x0=x1=x2=0', () => {
  const trainer = createTrainer([{ x1: 0, x2: 0, t: 1 }], {
    x0: 0,
    w0: 0.2,
    w1: 0.3,
    w2: 0.4,
    alfa: 0.5,
    maxTrain: 3,
  });

  const res = trainer.stepSample();
  assert.equal(res.step.normSq, 0);
  assert.equal(Number.isFinite(res.step.wAfter.w0), true);
  assert.equal(res.step.wAfter.w0, 0.2);
});

test('getDecisionBoundaryLine lida com pesos nulos e reta vertical', () => {
  const bounds = { xMin: -10, xMax: 10, yMin: -10, yMax: 10 };
  assert.equal(
    getDecisionBoundaryLine({ w0: 1, w1: 0, w2: 0 }, 1, bounds),
    null
  );

  // w0*1 + w1*x1 + 0*x2 = 0 => 2 + (-1)*x1 = 0 => x1 = 2
  const vertical = getDecisionBoundaryLine({ w0: 2, w1: -1, w2: 0 }, 1, bounds);
  assert.ok(vertical);
  assert.ok(Math.abs(vertical.start.x1 - 2) < 1e-6);
  assert.ok(Math.abs(vertical.end.x1 - 2) < 1e-6);
});

test('regra LMS Padrão atualiza pesos sem normalizar por ||x||²', () => {
  const trainer = createTrainer([{ x1: 2, x2: 3, t: 1 }], {
    x0: 1,
    w0: 0,
    w1: 0,
    w2: 0,
    alfa: 0.1,
    maxTrain: 5,
    rule: LEARNING_RULES.STANDARD_LMS,
  });

  const res = trainer.stepSample();
  assert.ok(Math.abs(res.step.wAfter.w0 - 0.1) < 1e-12);
  assert.ok(Math.abs(res.step.wAfter.w1 - 0.2) < 1e-12);
  assert.ok(Math.abs(res.step.wAfter.w2 - 0.3) < 1e-12);
});
