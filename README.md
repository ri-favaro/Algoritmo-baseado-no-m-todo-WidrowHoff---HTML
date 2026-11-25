# Algoritmo Baseado no Método de Widrow-Hoff — HTML (V1 + V2)

Simulador educacional do algoritmo **Widrow-Hoff (Regra Delta / α-LMS)** em HTML, CSS e JavaScript puros.

Este repositório guarda duas gerações do mesmo projeto:

- **V1 (Original — [index.html](./index.html))**: versão original de faculdade desenvolvida em 2023 (*Exercício TP1-P1*, por Geovanne Pelozone Nery e Luiz Ricardo Favaro) sem uso de LLMs, criada para comparar a implementação própria do método de Widrow-Hoff com o aplicativo *NeuroFURG*. Ela foi **preservada intacta** na raiz.
- **V2 (Interativa — [v2/index.html](./v2/index.html))**: evolução completa com visualização geométrica 2D da reta de decisão, curvas de convergência (MSE e acurácia), execução passo a passo por amostra ou época, inspetor algébrico em tempo real, preditor interativo, novos presets didáticos e suíte de testes automatizados.

---

## O que o projeto faz

O programa treina um classificador linear binário (neurônio tipo ADALINE / regra de Widrow-Hoff) sobre entradas bidimensionais $(X_1, X_2)$ com entrada de bias $X_0$ e alvo $T \in \{+1, -1\}$.

No conjunto de dados clássico do projeto original (**Cabelo / Sapato**):
- **$X_1$**: comprimento do cabelo (cm)
- **$X_2$**: numeração do sapato
- **$T = -1$**: Mulher (8 amostras de treino)
- **$T = +1$**: Homem (8 amostras de treino)

### Fórmulas implementadas

Para cada amostra $(x_0, x_1, x_2)$ e alvo $t \in \{+1, -1\}$:

1. **Potencial de ativação linear**:
   $$s = w_0 x_0 + w_1 x_1 + w_2 x_2$$
2. **Saída classificada (degrau bipolar)**:
   $$\hat{y} = \begin{cases} +1 & \text{se } s > 0 \\ -1 & \text{caso contrário} \end{cases}$$
3. **Erro contínuo (LMS)**:
   $$e = t - s$$
4. **Atualização dos pesos — Widrow-Hoff Normalizado ($\alpha$-LMS, padrão da V1)**:
   $$\|x\|^2 = x_0^2 + x_1^2 + x_2^2$$
   $$w_i \leftarrow w_i + \alpha \cdot e \cdot \frac{x_i}{\|x\|^2}$$
5. **Modo alternativo (ADALINE / LMS Padrão, opcional na V2)**:
   $$w_i \leftarrow w_i + \alpha \cdot e \cdot x_i$$

O treinamento avança por épocas até atingir **100% de acertos** na passagem da época ou o limite máximo de épocas (`MaxTrain`).

---

## Comparativo: V1 Original vs. V2

| Recurso | V1 (`index.html`) | V2 (`v2/index.html`) |
| --- | --- | --- |
| Preservação | Versão histórica intacta | Nova pasta `v2/` com link para V1 |
| Visualização 2D | Não possui | Gráfico interativo com pontos, semiplanos, reta $s=0$ e vetor normal |
| Curva de aprendizado | Apenas lista textual de logs | Gráfico em tempo real de **MSE** e **Acurácia (%)** |
| Controle de execução | Tudo de uma vez (`while (true)`) | **Executar Tudo**, **Play/Pausar**, **Próx. Época**, **Próx. Amostra** e velocidade |
| Inspetor matemático | Não possui | Exibe a substituição numérica de $s$, $\hat{y}$, $e$, $\|x\|^2$ e $\Delta w$ |
| Testador de novos pontos | Não possui | Formulário e clique direto no gráfico para classificar $(X_1, X_2)$ |
| Datasets e tabela | Apenas Cabelo/Sapato fixo | Cabelo/Sapato, **AND**, **OR**, **XOR** (limitação linear), **Clusters 2D**, edição inline e **CSV** |
| Validação e segurança | Sem validação contra `NaN` ou loop infinito | Validação de formulário, guarda contra $\|x\|^2 = 0$ e limite de divergência |
| Tema e acessibilidade | Toggle manual simples | Segue preferência do SO (`light-dark()`), sem FOUC, modal nativo e semântica ARIA |

---

## Como executar

> **Nota:** A **V2** utiliza ES Modules nativos (`<script type="module">`). Por segurança dos navegadores (CORS), abra-a através de um servidor HTTP local (ou GitHub Pages), e não diretamente via `file://`.

### Opção 1: Usando o servidor local incluído (requer Node.js ≥ 20)

```bash
npm run dev
```

Depois acesse no navegador:
- **V2 (Nova):** `http://127.0.0.1:4173/v2/`
- **V1 (Original):** `http://127.0.0.1:4173/index.html`

### Opção 2: Qualquer servidor estático

Você também pode usar a extensão *Live Server* do VS Code, `npx serve .` ou `python -m http.server 8000` na raiz do repositório.

---

## Como usar a V2 (Passo a passo rápido)

1. **Escolha um dataset** em *1. Conjunto de Dados* (o padrão é o **Cabelo / Sapato** original) ou importe um arquivo `.csv` com colunas `x1,x2,t`.
2. **Edite amostras ou adicione novas** pelo formulário, diretamente nas células da tabela, ou alterando o modo de clique do gráfico para *Adicionar +1 / -1*.
3. **Ajuste os hiperparâmetros** (`X₀`, `w₀`, `w₁`, `w₂`, `α`, `MaxTrain` e a regra de atualização) — os valores padrão recomendados já vêm preenchidos.
4. **Execute o treinamento**:
   - Use **Próx. Amostra** para acompanhar passo a passo no *Inspetor Matemático* cada cálculo de peso.
   - Use **Play** para assistir a reta de decisão girar e separar as classes ao vivo.
   - Use **Executar Tudo** para convergir instantaneamente.
5. **Teste novos pontos** digitando $(X_1, X_2)$ no card *5. Testar Novo Ponto* ou clicando diretamente sobre o plano 2D (no modo *Testar ponto*).
6. Experimente o preset **Porta Lógica XOR** para visualizar na prática por que um neurônio linear único não converge quando os dados não são linearmente separáveis.

---

## Testes automatizados

A V2 conta com testes unitários usando o runner nativo do Node.js (`node:test`), sem necessidade de instalar dependências externas:

```bash
npm test
```

## Estrutura do repositório

```text
├── index.html                 # V1 original (preservada intacta)
├── Comparação entre algoritmo WidrowHoff vs app neuroFURG.docx
├── package.json               # Scripts dev e test (zero dependências)
├── AGENTS.md                  # Guia de arquitetura e regras para agentes de IA
├── README.md                  # Documentação do projeto
├── scripts/
│   └── serve.mjs              # Servidor HTTP local simples para desenvolvimento
├── tests/
│   ├── widrow-hoff.test.js    # Testes do motor matemático, convergência e bordas
│   └── csv.test.js            # Testes de importação/exportação CSV
└── v2/
    ├── index.html             # Interface semântica da V2
    ├── styles.css             # Tokens, tema claro/escuro e layout responsivo
    └── src/
        ├── app.js             # Orquestração de estado, DOM, playback e acessibilidade
        ├── charts.js          # Renderizadores HiDPI em Canvas (2D + Convergência)
        ├── csv.js             # Parser e serializador CSV
        ├── presets.js         # Datasets pré-configurados (Cabelo/Sapato, AND, OR, XOR, Clusters)
        └── widrow-hoff.js     # Motor matemático puro (α-LMS normalizado e LMS padrão)
```
