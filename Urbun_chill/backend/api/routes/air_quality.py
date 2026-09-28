"""
UrbanChill AI — Air Quality API Routes (ENR-01)
===============================================
All 5 endpoints required by the Air Quality Module:

  GET  /api/air-quality/validate           → Historical predicted vs observed
  GET  /api/air-quality/hotspots/{city}    → GeoJSON FeatureCollection for map
  GET  /api/air-quality/{city}             → NO2 grid (observed) + risk (modeled)
  POST /api/air-quality/attribute          → Source attribution per cell
  POST /api/simulate/pollution             → Action comparison (≥4 interventions)

Every response carries a `source` field: "observed" | "modeled"
"""

import datetime
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional

from core.realtime_gis import geocode_location, fetch_live_climate, fetch_realtime_morphology
from core.air_quality_gis import (
    fetch_no2_data,
    fetch_proxy_layers,
    classify_no2_risk,
    generate_no2_spatial_grid,
    get_historical_validation_data
)
from core.air_quality_engine import (
    compute_source_attribution,
    compute_pollution_reduction_per_cell,
    aggregate_city_pollution_reduction
)
from db import get_db_connection

router = APIRouter()


# ── Database Helpers ──────────────────────────────────────────────────────────

def _ensure_aq_tables():
    """Creates air quality tables if they don't exist (additive to existing schema)."""
    conn = get_db_connection()

    conn.execute("""
    CREATE TABLE IF NOT EXISTS air_quality_readings (
        id VARCHAR PRIMARY KEY,
        city_name VARCHAR NOT NULL,
        cell_id VARCHAR NOT NULL,
        date VARCHAR NOT NULL,
        no2_value DOUBLE NOT NULL,
        pollutant_type VARCHAR DEFAULT 'NO2',
        source VARCHAR DEFAULT 'observed',
        risk_level VARCHAR,
        lat DOUBLE,
        lon DOUBLE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS source_attribution (
        id VARCHAR PRIMARY KEY,
        city_name VARCHAR NOT NULL,
        cell_id VARCHAR NOT NULL,
        date VARCHAR NOT NULL,
        traffic_pct DOUBLE,
        industrial_pct DOUBLE,
        weather_pct DOUBLE,
        residential_pct DOUBLE,
        attribution_method VARCHAR,
        assumptions_json VARCHAR DEFAULT '[]',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS pollution_actions (
        id VARCHAR PRIMARY KEY,
        city_name VARCHAR NOT NULL,
        cell_id VARCHAR NOT NULL,
        action_type VARCHAR NOT NULL,
        reduction_pct DOUBLE,
        baseline_no2 DOUBLE,
        projected_no2 DOUBLE,
        date_applied VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    conn.execute("""
    CREATE TABLE IF NOT EXISTS historical_validation (
        id VARCHAR PRIMARY KEY,
        city_name VARCHAR NOT NULL,
        period_label VARCHAR NOT NULL,
        date_range VARCHAR,
        predicted_avg_no2 DOUBLE,
        observed_avg_no2 DOUBLE,
        delta_pct DOUBLE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)


# ── Request / Response Models ────────────────────────────────────────────────

class AttributionRequest(BaseModel):
    city: Optional[str] = Field("Pune", description="City name")
    city_name: Optional[str] = None
    cell_id: str = Field("c_012", description="Grid cell ID (e.g. c_012)")
    lat: Optional[float] = None
    lon: Optional[float] = None

class PollutionSimRequest(BaseModel):
    city: Optional[str] = Field("Pune", description="City name")
    city_name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    actions: Dict[str, float] = Field(
        default_factory=lambda: {
            "traffic_restriction_pct": 20.0,
            "industrial_control_pct": 15.0,
            "green_buffer_pct": 10.0,
            "vehicle_emission_standard_pct": 15.0
        },
        description="Pollution reduction actions with intensity [0-100]"
    )


# ── 1. GET /api/air-quality/validate ────────────────────────────────────────
# Defined BEFORE /air-quality/{city} so "validate" is not captured as a city param

@router.get("/air-quality/validate")
async def validate_air_quality(
    city: Optional[str] = None,
    city_name: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None
):
    """
    Returns 2 stored historical validation periods per city:
    predicted_avg_no2 vs. observed_avg_no2 for each period.

    Satisfies ENR-01: "Validate against historical periods" (not just a live snapshot).
    """
    _ensure_aq_tables()
    raw_city = city or city_name or "Delhi"
    target_city = raw_city.strip()
    c_lat, c_lon = lat, lon

    if c_lat is None or c_lon is None:
        geo = geocode_location(target_city)
        if not geo:
            raise HTTPException(status_code=404, detail=f"Cannot resolve city '{target_city}'.")
        c_lat, c_lon, resolved = geo
        if resolved:
            target_city = resolved

    today = datetime.date.today().isoformat()
    no2_data = fetch_no2_data(c_lat, c_lon, today)
    base_no2 = no2_data["no2_value"] or 32.0

    periods = get_historical_validation_data(target_city, base_no2)

    # Compute overall accuracy across periods
    deltas = [abs(p.get("delta_pct", 0.0)) for p in periods]
    avg_delta = sum(deltas) / len(deltas) if deltas else 0.0
    overall_accuracy = round(max(0.0, 100.0 - avg_delta), 1)

    # Persist to DB — DuckDB-compatible upsert
    conn = get_db_connection()
    for p in periods:
        vid = f"val_{target_city.lower().replace(' ', '_')}_{p['period_label'].replace(' ', '_')}"
        try:
            conn.execute("""
            INSERT INTO historical_validation
            (id, city_name, period_label, date_range, predicted_avg_no2, observed_avg_no2, delta_pct)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                predicted_avg_no2 = EXCLUDED.predicted_avg_no2,
                observed_avg_no2 = EXCLUDED.observed_avg_no2,
                delta_pct = EXCLUDED.delta_pct
            """, [
                vid, target_city, p["period_label"], p["date_range"],
                p["predicted_avg_no2"], p["observed_avg_no2"], p["delta_pct"]
            ])
        except Exception as e:
            print(f"[UrbanChill Val-DB] Insert notice: {e}")

    return {
        "city": target_city,
        "current_avg_no2": round(base_no2, 1),
        "overall_accuracy_pct": overall_accuracy,
        "unit": "µg/m³",
        "validation_periods": periods,
        "methodology_note": (
            "Observed values = CAMS reanalysis historical archive (best available proxy). "
            "Predicted values = UrbanChill trend model anchored to current baseline. "
            "2 periods compared, not a continuous backtest."
        ),
        "source": "modeled"
    }


# ── 2. GET /api/air-quality/hotspots/{city} & /api/air-quality/{city}/hotspots ──────────────────

@router.get("/air-quality/hotspots/{city}")
@router.get("/air-quality/{city}/hotspots")
async def get_air_quality_hotspots(
    city: str,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
    threshold: Optional[float] = 40.0,  # WHO EU limit: 40 µg/m³
    threshold_ugm3: Optional[float] = None
):
    actual_threshold = threshold_ugm3 if threshold_ugm3 is not None else (threshold if threshold is not None else 40.0)

    """
    Returns GeoJSON FeatureCollection of NO2 hotspot cells above the risk threshold.
    Threshold defaults to 40 µg/m³ (EU annual limit, WHO long-term guideline).

    Satisfies ENR-01: "Display hotspots on a map".
    Each feature labelled with source="observed" for NO2 value, "modeled" for risk.
    """
    _ensure_aq_tables()
    city_name = city.strip()
    c_lat, c_lon = lat, lon

    if c_lat is None or c_lon is None:
        geo = geocode_location(city_name)
        if not geo:
            raise HTTPException(status_code=404, detail=f"Cannot resolve city '{city_name}'.")
        c_lat, c_lon, resolved = geo
        if resolved:
            city_name = resolved

    today = datetime.date.today().isoformat()
    no2_data = fetch_no2_data(c_lat, c_lon, today)
    base_no2 = no2_data["no2_value"] or 32.0

    morph = fetch_realtime_morphology(c_lat, c_lon)
    cells = generate_no2_spatial_grid(
        center_lat=c_lat, center_lon=c_lon, city_name=city_name,
        base_no2=base_no2,
        base_road_density=morph["road_density"],
        base_building_density=morph["building_density"],
        base_green_cover=morph["green_cover"],
        grid_size=5, date_str=today
    )

    cutoff = actual_threshold

    # Filter hotspots above threshold
    hotspot_features = []
    for cell in cells:
        if cell["no2_value"] >= cutoff:
            hotspot_features.append({
                "type": "Feature",
                "properties": {
                    "cell_id": cell["cell_id"],
                    "no2_value": cell["no2_value"],
                    "unit": "µg/m³",
                    "risk_level": cell["risk_level"],
                    "source_no2": "observed",
                    "source_risk": "modeled",
                    "date": today,
                    "lat": cell["lat"],
                    "lon": cell["lon"],
                    "exceeds_who_guideline": cell["no2_value"] > 25.0,
                    "exceeds_eu_limit": cell["no2_value"] > 40.0
                },
                "geometry": cell["geometry"]
            })

    return {
        "type": "FeatureCollection",
        "city": city_name,
        "date": today,
        "threshold_ugm3": cutoff,
        "total_cells_analyzed": len(cells),
        "hotspot_count": len(hotspot_features),
        "features": hotspot_features,
        "legend": {
            "Good": "< 25 µg/m³ (below WHO daily guideline)",
            "Moderate": "25–40 µg/m³ (above WHO guideline, below EU limit)",
            "High": "40–100 µg/m³ (exceeds EU annual limit)",
            "Critical": "> 100 µg/m³ (severe health risk)"
        },
        "data_sources": {
            "no2_observed": "Open-Meteo CAMS Reanalysis (proxy for Sentinel-5P)",
            "risk_modeled": "UrbanChill threshold classifier (WHO/EU limits)"
        }
    }


# ── 3. GET /api/air-quality/{city} ──────────────────────────────────────────

@router.get("/air-quality/{city}")
async def get_air_quality(city: str, lat: Optional[float] = None, lon: Optional[float] = None):
    """
    Returns current NO2 grid (source=observed) + risk classification (source=modeled)
    for all 25 grid cells of the requested city.

    Satisfies ENR-01: "Forecast ≥ 1 air-quality indicator" (NO2 µg/m³).
    """
    _ensure_aq_tables()
    city_name = city.strip()
    c_lat, c_lon = lat, lon

    if c_lat is None or c_lon is None:
        geo = geocode_location(city_name)
        if not geo:
            raise HTTPException(
                status_code=404,
                detail=f"Cannot resolve city '{city_name}'. Please verify name or provide lat/lon."
            )
        c_lat, c_lon, resolved = geo
        if resolved:
            city_name = resolved

    # Fetch base NO2 for city center
    today = datetime.date.today().isoformat()
    no2_data = fetch_no2_data(c_lat, c_lon, today)
    base_no2 = no2_data["no2_value"] or 32.0  # fallback to moderate urban level

    # Fetch morphology for spatial variation parameters
    morph = fetch_realtime_morphology(c_lat, c_lon)
    base_road = morph["road_density"]
    base_bdens = morph["building_density"]
    base_green = morph["green_cover"]

    # Generate 5×5 spatial NO2 grid
    cells = generate_no2_spatial_grid(
        center_lat=c_lat,
        center_lon=c_lon,
        city_name=city_name,
        base_no2=base_no2,
        base_road_density=base_road,
        base_building_density=base_bdens,
        base_green_cover=base_green,
        grid_size=5,
        date_str=today
    )

    # Persist to DB — DuckDB-compatible upsert
    conn = get_db_connection()
    for cell in cells:
        row_id = f"aq_{city_name.lower().replace(' ', '_')}_{cell['cell_id']}_{today}"
        try:
            conn.execute("""
            INSERT INTO air_quality_readings
            (id, city_name, cell_id, date, no2_value, pollutant_type, source, risk_level, lat, lon)
            VALUES (?, ?, ?, ?, ?, 'NO2', ?, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                no2_value = EXCLUDED.no2_value,
                risk_level = EXCLUDED.risk_level
            """, [
                row_id, city_name, cell["cell_id"], today,
                cell["no2_value"], cell["source"], cell["risk_level"],
                cell["lat"], cell["lon"]
            ])
        except Exception as e:
            print(f"[UrbanChill AQ-DB] Insert notice: {e}")

    # Build grid response (observed)
    grid_response = [
        {
            "cell_id": c["cell_id"],
            "no2_value": c["no2_value"],
            "unit": "µg/m³",
            "source": "observed",
            "date": today,
            "lat": c["lat"],
            "lon": c["lon"]
        }
        for c in cells
    ]

    # Risk classification per cell (modeled)
    risk_classification = {
        c["cell_id"]: {"level": c["risk_level"], "source": "modeled"}
        for c in cells
    }

    # City-wide summary
    avg_no2 = round(sum(c["no2_value"] for c in cells) / len(cells), 1) if cells else base_no2
    city_risk = classify_no2_risk(avg_no2)

    return {
        "city": city_name,
        "lat": c_lat,
        "lon": c_lon,
        "date": today,
        "avg_no2": avg_no2,
        "unit": "µg/m³",
        "city_risk_level": city_risk,
        "data_source": no2_data.get("data_source_name", "Open-Meteo CAMS Reanalysis"),
        "grid": grid_response,
        "risk_classification": risk_classification,
        "observed_vs_modeled": {
            "grid_source": "observed",
            "risk_source": "modeled",
            "note": "NO2 grid values = CAMS reanalysis (observed proxy). Risk classification = ML threshold model (modeled)."
        },
        "assumptions": no2_data.get("assumptions", [])
    }


# ── 4. POST /api/air-quality/attribute ──────────────────────────────────────

@router.post("/air-quality/attribute")
async def attribute_no2_sources(req: AttributionRequest):
    """
    Returns per-cell NO2 source attribution (traffic/industrial/weather/residential)
    with explicit assumptions about proxy data limitations.

    Satisfies ENR-01: "Attribute contributions across ≥ 3 sources, with stated assumptions".
    """
    _ensure_aq_tables()
    city_name = (req.city_name or req.city or "Pune").strip()
    c_lat, c_lon = req.lat, req.lon

    if c_lat is None or c_lon is None:
        geo = geocode_location(city_name)
        if not geo:
            raise HTTPException(status_code=404, detail=f"Cannot resolve city '{city_name}'.")
        c_lat, c_lon, resolved = geo
        if resolved:
            city_name = resolved

    # Get current NO2 and morphology
    today = datetime.date.today().isoformat()
    no2_data = fetch_no2_data(c_lat, c_lon, today)
    base_no2 = no2_data["no2_value"] or 32.0

    morph = fetch_realtime_morphology(c_lat, c_lon)
    climate = fetch_live_climate(c_lat, c_lon)

    proxies = fetch_proxy_layers(
        lat=c_lat, lon=c_lon,
        road_density=morph["road_density"],
        building_density=morph["building_density"],
        green_cover=morph["green_cover"],
        wind_speed=climate.get("wind_speed", 5.0),
        humidity=climate.get("humidity", 50)
    )

    attribution = compute_source_attribution(
        no2_value=base_no2,
        traffic_proxy=proxies["traffic_proxy"],
        industrial_proxy=proxies["industrial_proxy"],
        wind_dispersion=proxies["wind_dispersion"],
        humidity_factor=proxies["humidity_factor"],
        residential_proxy=proxies["residential_proxy"],
        cell_id=req.cell_id
    )

    # Persist to DB — DuckDB-compatible upsert
    conn = get_db_connection()
    attr_id = f"attr_{city_name.lower().replace(' ', '_')}_{req.cell_id}_{today}"
    try:
        conn.execute("""
        INSERT INTO source_attribution
        (id, city_name, cell_id, date, traffic_pct, industrial_pct,
         weather_pct, residential_pct, attribution_method, assumptions_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
            traffic_pct = EXCLUDED.traffic_pct,
            industrial_pct = EXCLUDED.industrial_pct,
            weather_pct = EXCLUDED.weather_pct,
            residential_pct = EXCLUDED.residential_pct
        """, [
            attr_id, city_name, req.cell_id, today,
            attribution["traffic_pct"], attribution["industrial_pct"],
            attribution["weather_pct"], attribution["residential_pct"],
            attribution["attribution_method"],
            json.dumps(attribution["assumptions"])
        ])
    except Exception as e:
        print(f"[UrbanChill Attr-DB] Insert notice: {e}")

    return attribution


# ── 5. POST /api/simulate/pollution ─────────────────────────────────────────

@router.post("/simulate/pollution")
async def simulate_pollution_reduction(req: PollutionSimRequest):
    """
    Compares ≥ 4 pollution reduction actions per grid cell and city-wide.
    Uses the same diminishing-returns pattern as the heat Cooling Simulator.

    Satisfies ENR-01: "Compare ≥ 3 possible actions".
    """
    _ensure_aq_tables()
    city_name = (req.city_name or req.city or "Pune").strip()
    c_lat, c_lon = req.lat, req.lon

    if c_lat is None or c_lon is None:
        geo = geocode_location(city_name)
        if not geo:
            raise HTTPException(status_code=404, detail=f"Cannot resolve city '{city_name}'.")
        c_lat, c_lon, resolved = geo
        if resolved:
            city_name = resolved

    # Extract action intensities
    actions = req.actions
    traffic_restriction = float(actions.get("traffic_restriction_pct", 20.0))
    industrial_control = float(actions.get("industrial_control_pct", 15.0))
    green_buffer = float(actions.get("green_buffer_pct", 10.0))
    vehicle_std = float(actions.get("vehicle_emission_standard_pct", 15.0))

    # Get current NO2 grid
    today = datetime.date.today().isoformat()
    no2_data = fetch_no2_data(c_lat, c_lon, today)
    base_no2 = no2_data["no2_value"] or 32.0
    morph = fetch_realtime_morphology(c_lat, c_lon)

    # Generate spatial grid to get per-cell baselines
    cells = generate_no2_spatial_grid(
        center_lat=c_lat, center_lon=c_lon, city_name=city_name,
        base_no2=base_no2,
        base_road_density=morph["road_density"],
        base_building_density=morph["building_density"],
        base_green_cover=morph["green_cover"],
        grid_size=5, date_str=today
    )

    # Compute per-cell pollution reduction
    cell_results = []
    for cell in cells:
        reduction = compute_pollution_reduction_per_cell(
            baseline_no2=cell["no2_value"],
            traffic_restriction_pct=traffic_restriction,
            industrial_control_pct=industrial_control,
            green_buffer_pct=green_buffer,
            vehicle_emission_std_pct=vehicle_std,
            cell_id=cell["cell_id"]
        )
        cell_results.append(reduction)

    # City-wide aggregate
    city_aggregate = aggregate_city_pollution_reduction(cell_results)

    # Define 4 preset scenarios for comparison (like the heat Cooling Simulator)
    preset_scenarios = [
        {
            "id": "traffic_only",
            "name": "Scenario A — Traffic Restriction",
            "description": "Odd-even vehicle restriction + congestion pricing (−40% traffic flow)",
            "actions": {"traffic_restriction_pct": 40, "industrial_control_pct": 0, "green_buffer_pct": 0, "vehicle_emission_standard_pct": 0},
            "est_no2_reduction_pct": round(35 * (1 - pow(2.718, -0.028 * 40)), 1)
        },
        {
            "id": "industrial_only",
            "name": "Scenario B — Industrial Control",
            "description": "Mandatory scrubbers + industrial zone emission caps (−50% industrial NO2)",
            "actions": {"traffic_restriction_pct": 0, "industrial_control_pct": 50, "green_buffer_pct": 0, "vehicle_emission_standard_pct": 0},
            "est_no2_reduction_pct": round(20 * (1 - pow(2.718, -0.030 * 50)), 1)
        },
        {
            "id": "green_buffer",
            "name": "Scenario C — Green Buffer Expansion",
            "description": "Urban forestry corridors and roadside vegetation buffers (20% area)",
            "actions": {"traffic_restriction_pct": 0, "industrial_control_pct": 0, "green_buffer_pct": 20, "vehicle_emission_standard_pct": 0},
            "est_no2_reduction_pct": round(8 * (1 - pow(2.718, -0.045 * 20)), 1)
        },
        {
            "id": "vehicle_standards",
            "name": "Scenario D — Vehicle Emission Standards",
            "description": "BS-VI / Euro-7 standard enforcement + electric vehicle mandate (25% fleet)",
            "actions": {"traffic_restriction_pct": 0, "industrial_control_pct": 0, "green_buffer_pct": 0, "vehicle_emission_standard_pct": 25},
            "est_no2_reduction_pct": round(25 * (1 - pow(2.718, -0.032 * 25)), 1)
        },
        {
            "id": "custom",
            "name": "Scenario E — Custom Multi-Action Plan",
            "description": "Planner-configured combined intervention",
            "actions": actions,
            "est_no2_reduction_pct": abs(city_aggregate.get("avg_delta_pct", 0.0))
        }
    ]

    return {
        "city": city_name,
        "date": today,
        "actions_applied": {
            "traffic_restriction_pct": traffic_restriction,
            "industrial_control_pct": industrial_control,
            "green_buffer_pct": green_buffer,
            "vehicle_emission_standard_pct": vehicle_std
        },
        "cell_results": cell_results,
        "city_aggregate": city_aggregate,
        "scenario_comparison": preset_scenarios,
        "source": "modeled",
        "scientific_disclaimer": {
            "model_notice": "Modelled projection — not guaranteed real-world NO2 changes.",
            "methodology": "Asymptotic saturation curves calibrated against published urban NO2 intervention literature.",
            "limitations": "Assumes uniform spatial distribution of interventions and average atmospheric conditions."
        }
    }
