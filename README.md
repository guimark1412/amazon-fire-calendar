# Amazon Fire Calendar — NASA Space Apps 2026 (MODIS ↔ VIIRS Harmonization)

> 🇧🇷 **[Leia esta documentação em Português (README.pt-BR.md)](README.pt-BR.md)**

Interactive, bilingual (automatic browser detection for **English `EN`** / **Portuguese `PT`**, with 1-click persisted switching) and responsive web dashboard built by team **`Printf("Nasarentos");`** for the **NASA Space Apps Challenge** **"Harmonization of MODIS and VIIRS Hot Spots"** challenge. The platform **harmonizes NASA FIRMS MODIS (`1 km`) and VIIRS (`375 m`) active fire sensors** into a **Unified Fire Activity Calendar** for the Amazon and Custom Areas of Interest (`AOI`).

- **Live Web App:** https://amazon-fire-web.onrender.com
- **API & Swagger Docs:** https://amazon-fire-api.onrender.com/docs
- **GitHub Repositories:** [guimark1412/amazon-fire-calendar](https://github.com/guimark1412/amazon-fire-calendar) · [Endrei7/amazon-fire-calendar](https://github.com/Endrei7/amazon-fire-calendar)

> [!TIP]
> **Recommended — Start with Pitch Mode:** When opening the live app, click the pulsing **Pitch Mode** button (top-right on desktop or bottom bar on mobile) to launch a 6-step guided tour demonstrating MODIS (`1 km`) ↔ VIIRS (`375 m`) harmonization, the seasonal calendar, and the orbital lab in action.

---

## Point-by-Point Alignment with the NASA Challenge

| What the NASA Challenge Requested | What We Implemented in Amazon Fire Calendar |
| --- | --- |
| **1. Unify records from different sensors (`MODIS 1 km` and `VIIRS 375 m`) that are not directly comparable** | **Spatiotemporal Harmonization Engine (`harmonization.py` and `firms_client.py`):** Integrates near-real-time **NASA FIRMS** feeds (`MODIS_NRT` + `VIIRS_NOAA20_NRT` with `NOAA21`/`SNPP` fallback) with a calibrated historical series; compensates for orbital footprint distortion (**`Scan × Track` in km²**) and separates coincident detections from small `VIIRS-Only` burns with adjustable weighting (`0.50×`–`1.00×`) in tab **`3. MODIS×VIIRS Lab`**. |
| **2. Build a web app featuring a Fire Activity Calendar based on active fire detections** | **3-Tab Progressive Disclosure Web App:** Tab **`2. Calendar & Matrix`** delivers the **Seasonal Burning Spectrum** and **Calendar Matrix** (monthly and ISO-weekly `YYYY-Www`) toggling between **Harmonized Index** and **FRP (MW)**, with alert-level filters (`All`, `Critical`, `Elevated`, `Normal`). Tab **`1. Map & Series`** adds a popover date picker and bidirectional cross-filtering between chart and map. |
| **3. Support early warnings and emergency response to anticipate critical periods** | **Early Warning Brief & Open Export:** Computes cumulative year-to-date (YTD) deviation, identifies the seasonal peak against the 2024–2025 MODIS baseline, and surfaces operational guidance; the map renders **Points**, **Scan×Track Footprints**, and **Harmonized Grid** layers, exports **`CSV` (14 columns)** and **`GeoJSON`**, and includes a **6-step guided Pitch Mode**. |
| **4. Enable scientists and managers to analyze historical patterns and unusual conditions** | **Global Filters & Orbital Simulator:** Instant switching across **Both \| MODIS \| VIIRS** (preserving the two-sensor anchored calibration factor), **Monthly \| Weekly** resolution, confidence filters (`All`, `Nominal + High`, `High Only`), day/night filtering, and a **Swath Angle Simulator (`0°–55°`)**. |
| **5. Analyze within a selected Area of Interest (`AOI`)** | **7 Preset Regions + Custom `AOI`:** Supports Legal Amazon (Brazil), Continental Amazon (Northern South America), and 5 Brazilian states (`Amazonas`, `Pará`, `Mato Grosso`, `Rondônia`, and `Acre`) clipped to geographic boundary polygons, plus interactive map drawing or `West / South / East / North` coordinates. |

---

## Key Features

### 1. Progressive Disclosure 3-Tab Architecture
1. **`1. Map & Series`**
   - **Interactive Map (`Points`, `Scan×Track Footprints`, and `Harmonized Grid`):** **Dark Map**, **Satellite**, and **NASA GIBS True Color** (`MODIS Terra` / `VIIRS NOAA-20`) basemap layers, sampling up to **2,000 hotspots** in point view.
   - **Unified Calibrated Scale + Optional Raw NASA Mode:** By default, all windows—including the trailing **7-day live view**, weekly (`YYYY-Www`), monthly (`YYYY-MM`), and custom ranges—use the same calibrated MODIS-equivalent baseline scale. Inside the **`Active period`** date picker popover, the **`Calibrated Scale (Default)`** toggle (active by default) can be switched off at any time (`raw_live=true`) to inspect all unscaled raw NASA FIRMS detections.
   - **Period Selector & Cross-Filtering:** Dynamic relative presets (*Last 30 days*, *Dry Season Peak Aug–Sep*, *Full Year Jan–today*), free calendar range selection, and click-to-filter on chart bars or matrix cards.
   - **Multi-Metric Time Series (`Recharts`):** Toggles between **Harmonized Index**, **Raw Counts**, **Coincident vs. `VIIRS-Only`**, and **Thermal Power `FRP` (MW)**.
2. **`2. Calendar & Matrix`**
   - **Seasonal Burning Spectrum (`BurningHeatmap`):** Continuous period bars colored by alert status (`Normal`, `Elevated`, `Critical`) with percentage deviation per period.
   - **Early Warning Popover (`EarlyWarningPopover`):** Summarizes regional status, cumulative YTD deviation, peak period, and operational recommendations.
   - **Calendar Matrix (`CalendarMatrix`):** Toggles between **Harmonized Index** and **FRP (MW)**, filters by alert status (`All`, `Critical`, `Elevated`, `Normal`), and groups weeks into collapsible quarters in Weekly (`YYYY-Www`) mode.
3. **`3. MODIS×VIIRS Lab`**
   - **Before vs. After Comparison:** Exposes the raw-sum false alarm against the calibrated MODIS historical scale.
   - **Interactive Controls & Live Pipeline:** **`VIIRS-Only` Weight** (`0.50×`, `0.85×`, `1.00×`), **`Scan × Track` Orbital Simulator** (`0°` to `55°`), and a 3-stage pipeline strip (`01 VIIRS-Only Weighting` → `02 MODIS Scale Conversion` → `03 Harmonized Index`).
   - **Inline Scientific Architecture:** Collapsible panel detailing the **4 Harmonization Pillars** and backend equations.

### 2. UX Polish, Export, Pitch Mode & Mobile
- **Refined Controls:** Animated sliding pill groups (`SlidingToggleGroup`) and `(i)` info tooltips with a `500 ms` hover delay on desktop and touch support on mobile (including inside toggle buttons).
- **Open Export:** **CSV** export of the harmonized calendar (14 columns: harmonized index, raw/coincident/`VIIRS-Only` counts, `anomaly_zscore`, `FRP`, and alert level) and **GeoJSON** (`FeatureCollection` with hotspots and spatial grid polygons).
- **Pitch Mode (6-Step Guided Tour):** Step-by-step walkthrough (`topbar`, map, chart, matrix, lab, and executive wrap-up) with tab-handoff spotlight cues and live map actions.
- **Mobile Responsive UI (`max-width: 768px`):** Full-screen splash waiting for initial data (`/api/fires`, `/api/timeline`, `/api/grid`) with a minimal phone-to-monitor animation recommending desktop viewing, single-line KPI strip, collapsible side drawer (`☰`) for global filters/export/language, `2×2` segmented controls, and fixed bottom navigation (**Panel**, **Matrix**, **Lab NASA**, **Pitch**).

---

## Backend Harmonization Methodology

1. **Orbital Geometry Correction (`scan × track`):** Combines the empirical MODIS/VIIRS ratio across overlapping periods with the effective pixel footprint ratio (`avg_viirs_area / avg_modis_area`), keeping the same calibration factor anchored across both sensors even for single-sensor queries (`MODIS` or `VIIRS`).
2. **Spatiotemporal Clustering:** Separates VIIRS detections coincident with MODIS fire events (`coincident_viirs`) from isolated small burns (`viirs_only_small`), weighted by `viirs_only_weight` (`0.0–1.0`, default `0.85`).
3. **Dynamic Baseline, Alerts & Weekly View:** Dynamically recomputes the reference **MODIS Average** (`2024–2025`) for each region or `AOI`, applies an absolute-excess guard in `_classify_alert` to prevent false alerts in low-baseline months, and divides monthly averages by active week count in weekly (`YYYY-Www`) mode.
4. **Live + Continuous Historical Integration:** Queries **NASA FIRMS** `NRT` feeds (`MODIS_NRT` and `VIIRS_NOAA20_NRT`, with fallback to `VIIRS_NOAA21_NRT` and `VIIRS_SNPP_NRT`) with a **10-minute cache** (`CACHE_TTL_SECONDS = 600`) and per-region/sensor single-flight locking, merging with the calibrated historical dataset in `backend/data/amazon_sample_fires.csv`—automatically updated daily via **GitHub Actions** (`.github/workflows/update-fires-csv.yml` and `backend/scripts/update_historical_csv.py`).

---

## NASA Data, Tech Stack & Project Structure

- **NASA Data:** NASA FIRMS active fire hotspots (`MODIS C6.1` 1 km and `VIIRS NOAA-20 / NRT` 375 m — `FRP`, confidence, `scan`, `track`) + NASA GIBS True Color WMTS imagery.
- **Backend (`backend/`):** Python 3.9+, FastAPI, `httpx`, `uvicorn`, `pytest`
  - Endpoints: `/api/health`, `/api/regions`, `/api/fires`, `/api/timeline`, `/api/grid`
- **Frontend (`frontend/`):** React 19, TypeScript, Vite 8, Leaflet (`react-leaflet`), Recharts, Lucide Icons, modular CSS (`index.css`)
- **Deployment (`render.yaml`):** Render blueprint with web service (`amazon-fire-api`) and static site (`amazon-fire-web`)
- **Automated Data Pipeline (`.github/workflows/update-fires-csv.yml`):** Daily cron (`06:15 UTC`) running `backend/scripts/update_historical_csv.py` with `FIRMS_MAP_KEY` to append newly completed, calibrated UTC days to `backend/data/amazon_sample_fires.csv`

---

## Running Locally

### 1. Backend (FastAPI + NASA FIRMS)
```powershell
cd backend
python -m uvicorn app.main:app --reload --port 8000
```
- Local Swagger docs: `http://localhost:8000/docs`
- Copy `backend/.env.example` to `backend/.env` and set `FIRMS_MAP_KEY` (optional — without a key, the backend automatically falls back to `backend/data/amazon_sample_fires.csv`).
- Automated tests (**19 tests** — `18` API & seasonal coherence tests in `backend/tests/test_api.py` and `1` historical updater test in `backend/tests/test_update_historical_csv.py`):
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
- Open `http://localhost:5173` (`VITE_API_URL` connects to the backend).
- Production build: `npm run build` (`tsc && vite build`).
