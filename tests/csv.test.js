import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDatasetCsv, serializeDatasetToCsv } from '../v2/src/csv.js';

test('parseDatasetCsv aceita vírgula, ponto e vírgula e cabeçalho opcional', () => {
  const csv = [
    'x1;x2;t',
    '25;34;-1',
    '4,40,+1',
    '6, 38, 1',
  ].join('\n');

  const { rows, errors } = parseDatasetCsv(csv);
  assert.equal(errors.length, 0);
  assert.deepEqual(rows, [
    { x1: 25, x2: 34, t: -1 },
    { x1: 4, x2: 40, t: 1 },
    { x1: 6, x2: 38, t: 1 },
  ]);
});

test('parseDatasetCsv reporta linhas inválidas sem descartar linhas válidas', () => {
  const csv = [
    '1,2,1',
    'abc,2,-1',
    '3,4,0',
    '5,6,-1',
  ].join('\n');

  const { rows, errors } = parseDatasetCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(errors.length, 2);
});

test('serializeDatasetToCsv realiza roundtrip consistente', () => {
  const original = [
    { x1: 1.5, x2: -2, t: 1 },
    { x1: 3, x2: 4.25, t: -1 },
  ];
  const csv = serializeDatasetToCsv(original);
  const parsed = parseDatasetCsv(csv);
  assert.equal(parsed.errors.length, 0);
  assert.deepEqual(parsed.rows, original);
});
