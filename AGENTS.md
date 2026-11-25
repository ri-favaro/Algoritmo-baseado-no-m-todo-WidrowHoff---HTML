# AGENTS.md

Diretrizes de arquitetura, invariantes e fluxo de validação para agentes de código que trabalham neste repositório.

## Visão Geral do Repositório

Este repositório contém duas versões de um simulador educacional do algoritmo **Widrow-Hoff (Regra Delta / α-LMS)**:

1. **V1 Original (`index.html` na raiz)** e o documento histórico `Comparação entre algoritmo WidrowHoff vs app neuroFURG.docx`.
2. **V2 Interativa (`v2/`)**: aplicação modular em HTML, CSS e JavaScript puro (ES Modules), sem etapa de build e sem dependências externas de runtime ou teste.

## Invariantes Obrigatórias

1. **Preserve a V1 intacta**:
   - **NUNCA** delete, renomeie ou quebre o arquivo `index.html` da raiz nem o `.docx` original.
   - Todas as novas evoluções devem ocorrer dentro de `v2/`, `tests/`, `scripts/` ou na documentação.
2. **Zero dependências externas por padrão**:
   - Mantenha a V2 funcionando diretamente com ES Modules nativos no navegador e testes com `node:test` (`Node >= 20`), sem exigir `npm install` ou bundlers, salvo solicitação explícita do usuário.
3. **Paridade matemática da regra padrão (`normalized-lms`) com a V1**:
   - Potencial de ativação: `s = w0 * x0 + w1 * x1 + w2 * x2`
   - Classificação: `y = s > 0 ? 1 : -1` (estritamente `s > 0`, nunca `>=`)
   - Erro contínuo: `error = t - s`
   - Norma ao quadrado: `normSq = x0*x0 + x1*x1 + x2*x2`
   - Atualização por amostra (online): `w_i = w_i + alfa * error * (x_i / normSq)`
   - Critério de parada: `hits === dataset.length` na passagem da época, `epoch >= maxTrain`, ou guarda de divergência/divisão por zero (`normSq <= 1e-12`).
4. **Separação entre motor puro e DOM**:
   - Toda lógica matemática (`v2/src/widrow-hoff.js`), presets (`v2/src/presets.js`) e parser CSV (`v2/src/csv.js`) devem permanecer livres de APIs de DOM (`document`, `window`) para que sejam 100% testáveis diretamente em Node.js.
5. **Idioma**:
   - Interface, textos didáticos, comentários novos, mensagens de erro e documentação devem estar em **português brasileiro (pt-BR)**.

## Padrões de UI, CSS e Acessibilidade (`v2/`)

- **Tema claro/escuro**: manter `<meta name="color-scheme" content="light dark">`, script inline anti-FOUC no `<head>` e sincronização via `light-dark()` + fallbacks `@media (prefers-color-scheme: dark)`.
- **Validação de formulários**: preferir `:user-invalid` sincronizado com `aria-invalid` e região `aria-live="polite"` única, evitando erros prematuros no carregamento inicial.
- **Modais**: usar `<dialog>` nativo com `.showModal()` (sem `role="dialog"` ou `aria-modal` redundantes) e `overscroll-behavior: contain` no `:modal` e `::backdrop`.
- **Visualização de dados**: nos gráficos em `<canvas>`, garantir suporte a HiDPI (`devicePixelRatio`), atualização de paleta ao trocar tema e distinção por forma além de cor (`+1` círculo vs `-1` losango).
- **Números dinâmicos**: aplicar `font-variant-numeric: tabular-nums` em contadores, pesos, erros e células de tabela para evitar saltos de layout.

## Comandos de Desenvolvimento e Verificação

Execute sempre após alterações em `v2/`, `tests/` ou `scripts/`:

- **Rodar suíte de testes unitários**:
  ```bash
  npm test
  ```
- **Subir servidor HTTP local para testar V1 e V2 no navegador**:
  ```bash
  npm run dev
  ```
  (Acessar `http://127.0.0.1:4173/v2/` e `http://127.0.0.1:4173/index.html`.)
