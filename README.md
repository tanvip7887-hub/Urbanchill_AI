# UrbanChill AI: Urban Environmental Digital Twin

**UrbanChill AI** is a Geo-Intelligent Digital Twin Platform that monitors, analyzes, predicts, and simulates both **urban heat** and **air quality** conditions. It combines satellite imagery, GIS technologies, spatial databases, and machine learning into a single interactive application — shifting urban environmental management from reactive observation toward proactive, testable planning.

Every value in the platform is explicitly tagged **Observed** (measured directly from satellite/sensor data) or **Modeled** (AI-predicted), so users always know what they're looking at.

## 🌟 Key Features

### Heat Module
- **Interactive 3D Earth Visualization:** Built with CesiumJS, allowing global city search and realistic 3D globe exploration.
- **Satellite Image Processing:** Integrates with Google Earth Engine to retrieve Landsat-8 and Sentinel-2 datasets.
- **Environmental Indicators:** Calculates Land Surface Temperature (LST) and Normalized Difference Vegetation Index (NDVI).
- **Heat-Risk Prediction:** Random Forest model predicts urban heat-risk severity from spatial features.
- **Cooling Simulator ("What-If"):** Evaluates the impact of tree planting, reflective/white roofs, ponds & water bodies, and neighborhood parks on ground temperature, greenery index, and heat risk, with per-cell projected cooling.

### Air Quality Module
- **5-Day NO₂ Forecast:** Predicts air-quality levels (NO₂) for a defined urban area over the coming days, using Sentinel-5P data and wind-driven dispersion modeling.
- **Source Attribution:** Estimates the likely contribution of traffic, industrial activity, weather, and residential sources to pollution levels, with stated assumptions displayed alongside every estimate.
- **Pollution Simulator:** Compares at least three interventions — traffic restriction, industrial control, and a comprehensive combined scenario — showing projected pollution reduction for each before any action is taken.
- **Pollution Hotspot Map:** NO₂ layer with color-coded hotspot glow (Good / Moderate / High / Critical), plus a dedicated NO₂ Grid view for cell-level detail.
- **Historical Validation:** Compares model predictions against real observed data across multiple independent periods (e.g. seasonal windows and a full annual period), not just a live snapshot.

### Shared Platform Features
- **Spatial Analytics Dashboard:** Charts and insights comparing cities, heat distribution, air quality, and green cover.
- **Compare Cities & Yearly Trends:** Benchmark environmental risk across cities and over time.
- **Automated Report Generation:** PDF reports with maps, statistics, and mitigation recommendations.
- **Observed vs. Modeled Labeling:** Every data point across every view is explicitly tagged, with source and reliability information.

## 🏗️ System Architecture

UrbanChill AI follows a modular, cloud-based 5-layer architecture. The air-quality module extends each layer as a parallel branch alongside the existing heat pipeline — no layer was replaced.

1. **Presentation Layer (Frontend)** — user interactions, 3D visualization, and dashboard rendering.
   *(React, TypeScript, CesiumJS, Tailwind CSS, Shadcn UI, Recharts)*
2. **Application Layer (Backend)** — APIs, validation, and orchestration between ML/GIS modules.
   *(FastAPI, Python)*
3. **GIS Processing Layer** — retrieves satellite imagery, processes rasters, extracts LST/NDVI/NO₂, performs spatial analysis.
   *(Google Earth Engine, GeoPandas, Rasterio, Rioxarray, Shapely, GDAL)*
4. **Machine Learning Layer** — predicts heat-risk and air-quality risk, and estimates pollution source attribution.
   *(Scikit-Learn, Random Forest)*
5. **Data Layer** — stores users, analysis history, spatial datasets, air-quality readings, attribution, and validation records.
   *(PostgreSQL, PostGIS)*

## 💻 Technology Stack

### Frontend (`/frontend`)
- **Framework:** React + TypeScript (Vite/Next.js)
- **UI & Styling:** Tailwind CSS, Shadcn UI
- **3D Engine:** CesiumJS
- **Charts & State:** Recharts, React Query

### Backend (`/backend`)
- **Framework:** FastAPI (Python)
- **Spatial Processing:** GeoPandas, Rasterio, Shapely, Rioxarray, GDAL
- **Satellite Data:** Google Earth Engine API (Landsat-8, Sentinel-2, Sentinel-5P NO₂)
- **Weather Data:** Open-Meteo API
- **Machine Learning:** Scikit-learn (Random Forest)
- **Reporting:** ReportLab
- **Database:** PostgreSQL + PostGIS
- **Deployment:** Vercel (frontend), Render (backend)

## 3. Repository & Directory Structure

### 3.1 Folder Hierarchy & File Layout

```text
UrbanChill/
├── backend/                          # FastAPI Application
│   ├── api/
│   │   └── routes/
│   │       ├── simulation.py         # Heat cooling simulation endpoints
│   │       └── air_quality.py        # Air-quality endpoints (forecast, attribution, simulation, validation, hotspots)
│   ├── core/
│   │   ├── gis_engine.py             # Satellite/GIS processing (heat)
│   │   ├── simulation_engine.py      # Cooling simulation logic
│   │   ├── air_quality_gis.py        # NO2 + proxy layer acquisition
│   │   └── air_quality_engine.py     # Source attribution + pollution simulation logic
│   ├── db.py                         # Database connection logic
│   ├── env/                          # Environment configurations
│   ├── main.py                       # Application entry point
│   ├── requirements.txt              # Python dependencies
│   └── tests/                        # Unit and integration tests
├── frontend/                         # React Application
│   ├── public/                       # Static assets
│   ├── src/
│   │   ├── components/
│   │   │   ├── workspace/
│   │   │   │   └── CesiumGlobe.tsx   # 3D globe + heat/air-quality overlays
│   │   │   └── cesium/
│   │   │       └── InterventionLayer.tsx
│   │   └── ...                       # Simulator views, attribution panels, badges
│   ├── package.json                  # Node dependencies
│   └── next.config.ts                # Next.js configuration
└── README.md                         # Project documentation
```

### 3.2 Key File Responsibilities

- **`backend/main.py`**: Main entry point for the FastAPI application.
- **`backend/db.py`**: Handles connecting to the PostgreSQL/PostGIS database.
- **`backend/core/air_quality_engine.py`**: Source attribution and pollution-reduction simulation logic.
- **`backend/api/routes/air_quality.py`**: Air-quality forecast, attribution, simulation, validation, and hotspot endpoints.
- **`frontend/src/`**: All React components, hooks, and UI logic for the 3D dashboard, including the Cooling Simulator and Pollution Simulator.
- **`frontend/next.config.ts`**: Configuration for the Next.js frontend application.

### 3.3 Codebase Navigation Guide

- **Working on APIs or ML models?** Head to `backend/api/` and `backend/core/`.
- **Working on air quality specifically?** `backend/core/air_quality_engine.py`, `backend/core/air_quality_gis.py`, and `backend/api/routes/air_quality.py`.
- **Modifying the UI or 3D Dashboard?** Look inside `frontend/src/`.
- **Looking for project requirements?** Check `backend/requirements.txt` and `frontend/package.json`.

## 🔄 User & Data Workflow

1. **User Interaction**: User searches or clicks a city on the interactive 3D Earth.
2. **Request Routing**: CesiumJS performs a smooth camera fly and sends coordinates to the FastAPI backend.
3. **Data Retrieval**: Backend queries Google Earth Engine for satellite imagery (Landsat/Sentinel-2 for heat, Sentinel-5P for NO₂) and Open-Meteo for weather data.
4. **Processing**: System calculates LST, NDVI, and NO₂; aligns all indicators to a common spatial grid.
5. **ML Prediction**: Random Forest models predict heat-risk zones and pollution risk; a separate attribution step estimates traffic/industrial/weather/residential source contribution.
6. **Simulation**: On request, the Cooling Simulator and Pollution Simulator recompute per-cell projected outcomes for selected interventions.
7. **Validation**: Forecasts are checked against stored historical observed data for past periods.
8. **Result Delivery**: Results are saved to PostGIS, tagged Observed or Modeled, and visualized on the React dashboard.

## 🗄️ Data Layer — Air Quality Tables

```sql
air_quality_readings (
  id, city_id, cell_id, date, no2_value, pollutant_type, source  -- 'observed' | 'modeled'
)

source_attribution (
  id, cell_id, date, traffic_pct, industrial_pct, weather_pct, residential_pct, assumptions_json
)

pollution_actions (
  id, cell_id, action_type, reduction_pct, date_applied
)

historical_validation (
  id, city_id, period_label, date_range, predicted_avg_no2, observed_avg_no2
)
```

## 🚀 Getting Started

### Prerequisites
- **Node.js** v20+ for the frontend.
- **Python** 3.10+ for the backend.
- **PostgreSQL + PostGIS** for database storage.
- **Google Earth Engine** credentials (Landsat/Sentinel-2/Sentinel-5P access).

### 1. Setup the Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`
pip install -r requirements.txt
# Set your environment variables in .env (Database URL, Google Earth Engine credentials)
uvicorn main:app --reload
```
The backend API will run on `http://localhost:8000`.

### 2. Setup the Frontend
```bash
cd frontend
npm install
npm run dev
```
The frontend will be available at `http://localhost:3000`.
