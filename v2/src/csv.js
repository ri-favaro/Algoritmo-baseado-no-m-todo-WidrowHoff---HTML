/**
 * Utilitários para importação e exportação CSV de conjuntos de dados (x1, x2, t).
 */

/**
 * Serializa uma lista de amostras para CSV com cabeçalho padrão.
 * @param {Array<{ x1: number, x2: number, t: number }>} rows
 * @returns {string}
 */
export function serializeDatasetToCsv(rows) {
  const lines = ['x1,x2,t'];
  for (const row of rows) {
    lines.push(`${Number(row.x1)},${Number(row.x2)},${Number(row.t)}`);
  }
  return lines.join('\n');
}

/**
 * Faz o parse de texto CSV (separador `,` ou `;`) para `{ x1, x2, t }[]`.
 * @param {string} csvText
 * @returns {{ rows: Array<{ x1: number, x2: number, t: number }>, errors: string[] }}
 */
export function parseDatasetCsv(csvText) {
  if (typeof csvText !== 'string' || csvText.trim() === '') {
    return { rows: [], errors: ['O arquivo CSV está vazio.'] };
  }

  const lines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const rows = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split(/[;,]/).map((part) => part.trim());

    // Ignora linha de cabeçalho se contiver texto não numérico na primeira linha
    if (
      i === 0 &&
      parts.length >= 3 &&
      Number.isNaN(Number(parts[0])) &&
      Number.isNaN(Number(parts[1]))
    ) {
      continue;
    }

    if (parts.length < 3) {
      errors.push(`Linha ${i + 1}: esperado 3 colunas (x1, x2, t).`);
      continue;
    }

    const x1 = Number(parts[0]);
    const x2 = Number(parts[1]);
    const t = Number(parts[2]);

    if (!Number.isFinite(x1) || !Number.isFinite(x2)) {
      errors.push(`Linha ${i + 1}: x1 e x2 precisam ser números válidos.`);
      continue;
    }

    if (t !== 1 && t !== -1) {
      errors.push(`Linha ${i + 1}: o alvo t deve ser +1 ou -1 (recebido "${parts[2]}").`);
      continue;
    }

    rows.push({ x1, x2, t });
  }

  if (rows.length === 0 && errors.length === 0) {
    errors.push('Nenhuma amostra válida encontrada no CSV.');
  }

  return { rows, errors };
}
