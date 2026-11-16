# Amazon Fire Calendar — NASA Space Apps 2026 (Harmonização MODIS ↔ VIIRS)

> 🇺🇸 **[Read this documentation in English (README.md)](README.md)**

Painel web interativo, bilíngue (detecção automática de **Português `PT`** / **Inglês `EN`** pelo navegador, com alternância em 1 clique salva localmente) e responsivo desenvolvido pela equipe **`Printf("Nasarentos");`** para o desafio **"Harmonization of MODIS and VIIRS Hot Spots"** do **NASA Space Apps Challenge**. A plataforma **harmoniza os sensores MODIS (`1 km`) e VIIRS (`375 m`)** da **NASA FIRMS** em um **Calendário Unificado de Atividade de Queima** para a Amazônia e Áreas de Interesse Customizadas (`AOI`).

- **Aplicação Web Ao Vivo:** https://amazon-fire-web.onrender.com
- **API & Documentação Swagger:** https://amazon-fire-api.onrender.com/docs
- **Repositórios GitHub:** [guimark1412/amazon-fire-calendar](https://github.com/guimark1412/amazon-fire-calendar) · [Endrei7/amazon-fire-calendar](https://github.com/Endrei7/amazon-fire-calendar)

> [!TIP]
> **Recomendação — Comece pelo Modo Pitch:** Ao abrir a aplicação ao vivo, recomendamos clicar no botão pulsante **Modo Pitch** (`Pitch Mode`, no canto superior direito no desktop ou na barra inferior no mobile) para iniciar o tour interativo guiado em 6 passos que apresenta na prática a harmonização MODIS (`1 km`) ↔ VIIRS (`375 m`), o calendário sazonal e o laboratório orbital.

---

## Alinhamento Ponto a Ponto com o Desafio da NASA

| O que o Desafio da NASA Pediu | O que Implementamos no Amazon Fire Calendar |
| --- | --- |
| **1. Unificar registros de sensores diferentes (`MODIS 1 km` e `VIIRS 375 m`) que não são comparáveis diretamente** | **Motor de Harmonização Espaço-Temporal (`harmonization.py` e `firms_client.py`):** Integra dados em tempo quase real da **NASA FIRMS** (`MODIS_NRT` + `VIIRS_NOAA20_NRT` com fallback `NOAA21`/`SNPP`) com série histórica; compensa a distorção da pegada orbital (**`Scan × Track` em km²**) e separa focos coincidentes de pequenos focos exclusivos do VIIRS (`VIIRS-Only`) com peso ajustável (`0,50×`–`1,00×`) na aba **`3. MODIS×VIIRS Lab`**. |
| **2. Criar uma aplicação web com um Calendário de Atividade de Queimadas baseado em focos ativos** | **Aplicação Web em 3 Abas Progressivas:** Na aba **`2. Calendar & Matrix`**, entrega o **Espectro Sazonal de Queima** e a **Matriz do Calendário** (mensal e semanal `YYYY-Www`) alternando entre **Índice Harmonizado** e **FRP (MW)**, com filtros por nível de alerta (`Todos`, `Crítico`, `Elevado`, `Normal`). Na aba **`1. Map & Series`**, oferece seletor de datas popover e *cross-filtering* bidirecional entre gráfico e mapa. |
| **3. Apoiar alertas precoces e resposta a emergências para antecipar períodos críticos** | **Painel de Alerta Precoce & Exportação Aberta:** Calcula desvio percentual acumulado (YTD), identifica o pico sazonal frente à média histórica MODIS (2024–2025) e exibe recomendações operacionais; no mapa, entrega camadas de **Pontos**, **Pegada (`Scan×Track`)** e **Grid Harmonizado**, exporta em **`CSV` (14 colunas)** e **`GeoJSON`**, e inclui **Modo Pitch guiado em 6 passos**. |
| **4. Permitir que cientistas e gestores analisem padrões históricos e condições incomuns** | **Filtros Globais & Simulador Orbital:** Alternância instantânea entre **Ambos \| MODIS \| VIIRS** (preservando o fator de calibração ancorado nos dois sensores), escala **Mensal \| Semanal**, filtros de confiança (`Todas`, `Nominal + Alta`, `Apenas Alta`), filtros dia/noite e **Simulador de Varredura (`0°–55°`)**. |
| **5. Analisar dentro de uma Área de Interesse (`AOI`) selecionada** | **7 Regiões Pré-definidas + `AOI` Customizada:** Suporta Amazônia Legal (Brasil), Amazônia Continental (Norte da América do Sul) e 5 estados brasileiros (`Amazonas`, `Pará`, `Mato Grosso`, `Rondônia` e `Acre`) com recorte por polígonos geográficos reais, além de desenho interativo no mapa ou coordenadas `West / South / East / North`. |

---

## Principais Funcionalidades

### 1. Arquitetura em 3 Abas de Revelação Progressiva
1. **`1. Map & Series` (`Mapa & Série`)**
   - **Mapa interativo (`Pontos`, `Pegada Scan×Track` e `Grid Harmonizado`):** camadas de base **Mapa Escuro**, **Satélite** e **NASA GIBS True Color** (`MODIS Terra` / `VIIRS NOAA-20`), com amostragem de até **2.000 focos** na visão pontual.
   - **Escala Calibrada Unificada + Modo Bruto Opcional:** por padrão, todas as janelas — incluindo os **últimos 7 dias ao vivo**, semana atual (`YYYY-Www`), seleções mensais (`YYYY-MM`) e intervalos customizados — utilizam a mesma régua calibrada da série histórica. Dentro do seletor **`Período ativo`**, o botão **`Escala Calibrada (Padrão)`** (ativado por padrão) permite desligar a reescala (`raw_live=true`) a qualquer momento para inspecionar todos os focos brutos da NASA FIRMS.
   - **Seletor de Período & Cross-Filtering:** atalhos relativos dinâmicos (*Últimos 30 dias*, *Pico da Seca Ago–Set*, *Ano completo Jan–hoje*), seleção livre de datas no calendário e clique direto nas barras do gráfico ou cards da matriz.
   - **Série Temporal Multi-Métrica (`Recharts`):** alterna entre **Índice Harmonizado**, **Contagem Bruta**, **Coincidência vs. `VIIRS-Only`** e **Energia `FRP` (MW)**.
2. **`2. Calendar & Matrix` (`Calendário & Matriz`)**
   - **Espectro Sazonal de Queima (`BurningHeatmap`):** barras contínuas ao longo do ano coloridas pelo nível de alerta (`Normal`, `Elevado`, `Crítico`) com desvio percentual por período.
   - **Popover de Alerta Precoce (`EarlyWarningPopover`):** resume o status geral da região, desvio acumulado YTD, período de pico e recomendação operacional.
   - **Matriz do Calendário (`CalendarMatrix`):** alterna entre **Índice Harmonizado** e **FRP (MW)**, filtra por status (`Todos`, `Crítico`, `Elevado`, `Normal`) e agrupa semanas por trimestres recolhíveis na visão semanal (`YYYY-Www`).
3. **`3. MODIS×VIIRS Lab` (`Lab MODIS×VIIRS`)**
   - **Comparativo Antes vs. Depois:** evidencia o falso alarme da soma bruta contra a curva calibrada na régua histórica MODIS.
   - **Controles Interativos & Pipeline ao Vivo:** ajuste do **Peso `VIIRS-Only`** (`0,50×`, `0,85×`, `1,00×`), **Simulador Orbital `Scan × Track`** (`0°` a `55°`) e faixa visual em **3 etapas** (`01 Ponderação VIIRS-Only` → `02 Conversão à Escala MODIS` → `03 Índice Harmonizado`).
   - **Arquitetura Científica inline:** seção expansível detalhando os **4 Pilares de Harmonização** e as equações do pipeline.

### 2. Experiência de Uso, Exportação, Modo Pitch & Mobile
- **Controles Polidos:** grupos de botões segmentados com pílula deslizante animada (`SlidingToggleGroup`) e tooltips informativos `(i)` com delay de `500 ms` no desktop e suporte dedicado ao toque no mobile (inclusive dentro de botões de seleção).
- **Exportação:** **CSV** do calendário harmonizado (14 colunas: índice harmonizado, contagens brutas/coincidentes/`VIIRS-Only`, `anomaly_zscore`, `FRP` e alerta) e **GeoJSON** (`FeatureCollection` com focos e polígonos do grid espacial).
- **Modo Pitch (Tour em 6 Passos):** apresentação guiada passo a passo (`topbar`, mapa, gráfico, matriz, laboratório e resumo executivo), com destaque prévio na barra de abas antes da transição de aba e ações interativas ao vivo.
- **Interface Responsiva Mobile (`max-width: 768px`):** abertura em tela cheia que aguarda o carregamento inicial (`/api/fires`, `/api/timeline`, `/api/grid`), exibe animação minimalista de celular para monitor recomendando visualização no computador e dissolve revelando o painel; cabeçalho enxuto com faixa de KPIs em 1 linha, controles globais/exportação/idioma recolhidos em menu lateral (`☰`), controles de 4 opções em grade `2×2` e barra inferior fixa (**Painel**, **Matriz**, **Lab NASA** e **Pitch**).

---

## Metodologia de Harmonização no Backend

1. **Correção de Geometria Orbital (`scan × track`):** combina a razão empírica MODIS/VIIRS nos períodos de sobreposição com a razão efetiva de área do pixel (`avg_viirs_area / avg_modis_area`), mantendo o mesmo fator ancorado em ambos os sensores inclusive em consultas de sensor único (`MODIS` ou `VIIRS`).
2. **Clusterização Espaço-Temporal:** separa detecções VIIRS coincidentes com eventos MODIS (`coincident_viirs`) de pequenos focos isolados (`viirs_only_small`), ponderados por `viirs_only_weight` (`0.0–1.0`, padrão `0.85`).
3. **Baseline Dinâmica, Alertas & Visão Semanal:** recalcula dinamicamente a **Média MODIS** de referência (`2024–2025`) para cada região ou `AOI`, aplica guarda de excesso absoluto em `_classify_alert` para evitar falsos alertas em meses com baseline baixa e divide a média mensal pela contagem real de semanas ativas no modo semanal (`YYYY-Www`).
4. **Integração Ao Vivo + Histórico Contínuo:** consulta os feeds `NRT` da **NASA FIRMS** (`MODIS_NRT` e `VIIRS_NOAA20_NRT`, com fallback para `VIIRS_NOAA21_NRT` e `VIIRS_SNPP_NRT`) em cache de **10 minutos** (`CACHE_TTL_SECONDS = 600`) com controle *single-flight* por região/sensor, integrando à série histórica calibrada em `backend/data/amazon_sample_fires.csv` — que é atualizada diariamente de forma automática via **GitHub Actions** (`.github/workflows/update-fires-csv.yml` e `backend/scripts/update_historical_csv.py`).

---

## Dados da NASA, Stack & Estrutura do Projeto

- **Dados da NASA:** NASA FIRMS active fire hotspots (`MODIS C6.1` 1 km e `VIIRS NOAA-20 / NRT` 375 m — `FRP`, confiança, `scan`, `track`) + imagens NASA GIBS True Color WMTS.
- **Backend (`backend/`):** Python 3.9+, FastAPI, `httpx`, `uvicorn`, `pytest`
  - Endpoints: `/api/health`, `/api/regions`, `/api/fires`, `/api/timeline`, `/api/grid`
- **Frontend (`frontend/`):** React 19, TypeScript, Vite 8, Leaflet (`react-leaflet`), Recharts, Lucide Icons, CSS modular (`index.css`)
- **Deploy (`render.yaml`):** Render blueprint com web service (`amazon-fire-api`) e static site (`amazon-fire-web`)
- **Automação de Dados (`.github/workflows/update-fires-csv.yml`):** cron diário (`06:15 UTC`) que executa `backend/scripts/update_historical_csv.py` com `FIRMS_MAP_KEY` para anexar novos dias UTC completos e calibrados ao histórico (`backend/data/amazon_sample_fires.csv`)

---

## Como Rodar Localmente

### 1. Backend (FastAPI + NASA FIRMS)
```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
- Swagger local: `http://localhost:8000/docs`
- Copie `backend/.env.example` para `backend/.env` e configure `FIRMS_MAP_KEY` (opcional — sem chave, o sistema utiliza automaticamente `backend/data/amazon_sample_fires.csv` como fallback).
- Testes automatizados (**19 testes** — `18` de API/coerência sazonal em `backend/tests/test_api.py` e `1` do atualizador histórico em `backend/tests/test_update_historical_csv.py`):
```powershell
cd backend
python -m pytest -v
```

### 2. Frontend (React + TypeScript + Vite)
```powershell
cd frontend
npm install
npm run dev
```
- Acesse `http://localhost:5173` (a variável `VITE_API_URL` conecta ao backend).
- Build de produção: `npm run build` (`tsc && vite build`).
