'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Compass,
  Maximize2,
  ZoomIn,
  ZoomOut,
  MapPin,
  X,
  Thermometer,
  Leaf,
  Building,
  AlertTriangle,
  Flame,
  Globe2,
  Layers,
  Sparkles,
  Droplets,
  Rotate3d,
  MessageCircle,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Clock,
} from 'lucide-react';

import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

import type { CityResult, AppState, HeatRisk } from '@/lib/globeConfig';
import {
  API_BASE,
  fetchHistoricalTimeline,
  fetchAirQuality,
  fetchAirQualityHotspots,
  type TimelineYear,
  type AirQualityResult,
  type HotspotResult
} from '@/lib/apiClient';
import HeatAlertBroadcastModal from '@/components/workspace/HeatAlertBroadcastModal';
import AirQualityLayer from '@/components/workspace/AirQualityLayer';

interface InteractiveMapViewerProps {
  city: CityResult;
  appState: AppState;
  activeLayers: Record<string, boolean>;
  layerOpacities: Record<string, number>;
  selectedYear?: number;
  isTimeSliderActive?: boolean;
  onToggleTimeSlider?: () => void;
}

interface SectorProperties {
  id: string;
  name: string;
  category: string;
  lst: number;
  ndvi: number;
  building_density: number;
  green_cover: number;
  population_density: number;
  heat_risk: HeatRisk;
  lat: number;
  lon: number;
  primary_factors: string[];
  heat_hazard_index?: number;
  vulnerability_index?: number;
  data_quality_score?: number;
}

const RISK_THEME: Record<HeatRisk, { badge: string; border: string; color: string }> = {
  Low: {
    badge: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    border: 'border-emerald-500',
    color: '#10b981',  // emerald-500
  },
  Moderate: {
    badge: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
    border: 'border-amber-500',
    color: '#f59e0b',  // amber-500
  },
  High: {
    badge: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
    border: 'border-orange-500',
    color: '#f97316',  // orange-500
  },
  Critical: {
    badge: 'bg-red-500/10 text-red-500 border-red-500/20',
    border: 'border-red-500',
    color: '#ef4444',  // red-500
  },
};

// Public Mapbox GL token loaded exclusively via NEXT_PUBLIC_MAPBOX_TOKEN environment variable.
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';

export type VizPreset = 'canopy' | 'buildings' | 'roads' | 'dual_sensors';

export default function InteractiveMapViewer({
  city,
  appState,
  activeLayers,
  layerOpacities,
  selectedYear = 2026,
  isTimeSliderActive = false,
  onToggleTimeSlider,
}: InteractiveMapViewerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);

  const [mapStyle, setMapStyle] = useState<'satellite' | 'dark'>('satellite');
  const [activeSector, setActiveSector] = useState<SectorProperties | null>(null);
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [pitch3D, setPitch3D] = useState(50);
  const [rawLiveGeoJSON, setRawLiveGeoJSON] = useState<GeoJSON.FeatureCollection<GeoJSON.Polygon, SectorProperties> | null>(null);
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
  const [vizPreset, setVizPreset] = useState<VizPreset>('canopy');
  const [isLiveRefreshing, setIsLiveRefreshing] = useState(false);
  const [liveMetadata, setLiveMetadata] = useState<{
    ambient_temp?: number;
    apparent_temp?: number;
    skin_temp?: number;
    humidity?: number;
    direct_radiation?: number;
    weather_condition?: string;
    generated_at?: string;
  } | null>(null);
  const [showSensorBeacons, setShowSensorBeacons] = useState(true);
  const markersRef = useRef<mapboxgl.Marker[]>([]);

  const [timelineData, setTimelineData] = useState<TimelineYear[]>([]);

  // Air Quality Layer State (ENR-01)
  const [airQualityData, setAirQualityData] = useState<AirQualityResult | null>(null);
  const [hotspotData, setHotspotData] = useState<HotspotResult | null>(null);
  const [isAQLoading, setIsAQLoading] = useState(false);

  useEffect(() => {
    if (!activeLayers['no2']) return;
    setIsAQLoading(true);
    Promise.all([
      fetchAirQuality(city.name, city.lat, city.lon),
      fetchAirQualityHotspots(city.name, city.lat, city.lon, 40),
    ])
      .then(([aq, hotspots]) => {
        setAirQualityData(aq);
        setHotspotData(hotspots);
      })
      .catch(console.error)
      .finally(() => setIsAQLoading(false));
  }, [activeLayers['no2'], city.name, city.lat, city.lon]);

  // Fetch verified historical model timeline for the selected city
  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      try {
        const data = await fetchHistoricalTimeline(city.name);
        if (active && Array.isArray(data) && data.length > 0) {
          setTimelineData(data);
        }
      } catch (e) {
        // Fallback to model slope
      }
    }
    loadTimeline();
    return () => { active = false; };
  }, [city.name]);

  // Dynamically compute annual anomaly deltas anchored to live reanalysis
  const { yearDelta, ndviDelta, bDensDelta } = useMemo(() => {
    const base2026 = timelineData.find((t) => t.year === 2026);
    const currentYearData = timelineData.find((t) => t.year === selectedYear);
    if (base2026 && currentYearData) {
      return {
        yearDelta: Number((currentYearData.avg_lst - base2026.avg_lst).toFixed(2)),
        ndviDelta: Number((currentYearData.avg_ndvi - base2026.avg_ndvi).toFixed(2)),
        bDensDelta: Number(((currentYearData.built_up_percent - base2026.built_up_percent) / 100).toFixed(2)),
      };
    }
    // IPCC urban warming slope (+0.32°C/year)
    const dy = (selectedYear - 2026) * 0.32;
    return {
      yearDelta: Number(dy.toFixed(2)),
      ndviDelta: Number((-dy * 0.03).toFixed(2)),
      bDensDelta: Number((dy * 0.025).toFixed(2)),
    };
  }, [timelineData, selectedYear]);

  // Real-time live GIS fetcher connected to backend reanalysis
  const refreshLiveGIS = useCallback(async () => {
    setIsLiveRefreshing(true);
    try {
      let url = `${API_BASE}/layers/${encodeURIComponent(city.name)}/all?lat=${city.lat}&lon=${city.lon}`;
      if (
        city.bbox &&
        city.bbox.length === 4 &&
        city.bbox[1] > city.bbox[0] &&
        city.bbox[3] > city.bbox[2]
      ) {
        url += `&min_lat=${city.bbox[0]}&max_lat=${city.bbox[1]}&min_lon=${city.bbox[2]}&max_lon=${city.bbox[3]}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.geojson && Array.isArray(data.geojson.features)) {
          setRawLiveGeoJSON(data.geojson);
          if (data.geojson.metadata) {
            setLiveMetadata(data.geojson.metadata);
          }
        }
      }
    } catch (err) {
      // Fallback to dynamic math computation
    } finally {
      setIsLiveRefreshing(false);
    }
  }, [city.name, city.lat, city.lon, city.bbox]);

  useEffect(() => {
    refreshLiveGIS();
  }, [refreshLiveGIS]);

  // Generate GeoJSON thermal grid dynamically covering 100% of the selected area or coordinates
  const geojsonData = useMemo(() => {
    const features: GeoJSON.Feature<GeoJSON.Polygon, SectorProperties>[] = [];
    const gridSize = 5;
    const hasBbox = Boolean(
      city.bbox &&
      city.bbox.length === 4 &&
      city.bbox[1] > city.bbox[0] &&
      city.bbox[3] > city.bbox[2]
    );

    const latSpan = hasBbox ? (city.bbox![1] - city.bbox![0]) : 0.08;
    const lonSpan = hasBbox ? (city.bbox![3] - city.bbox![2]) : 0.08;
    const minLat = hasBbox ? city.bbox![0] : city.lat - latSpan / 2;
    const minLon = hasBbox ? city.bbox![2] : city.lon - lonSpan / 2;
    const latStep = latSpan / gridSize;
    const lonStep = lonSpan / gridSize;

    // Derived from latitude envelope if backend layers are still loading
    const latAbs = Math.abs(city.lat);
    const baseLST = Number((38.0 - (latAbs > 25 ? (latAbs - 25) * 0.40 : 0.0)).toFixed(1));
    const baseNDVI = Number(Math.max(0.12, Math.min(0.45, 0.28 - (latAbs < 25 ? 0.05 : 0.0))).toFixed(2));

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const cellMinLat = minLat + r * latStep;
        const cellMaxLat = minLat + (r + 1) * latStep;
        const cellMinLon = minLon + c * lonStep;
        const cellMaxLon = minLon + (c + 1) * lonStep;
        const cLat = (cellMinLat + cellMaxLat) / 2;
        const cLon = (cellMinLon + cellMaxLon) / 2;

        const rNorm = (r - (gridSize - 1) / 2) / ((gridSize - 1) / 2 || 1);
        const cNorm = (c - (gridSize - 1) / 2) / ((gridSize - 1) / 2 || 1);
        const dist = Math.sqrt(rNorm * rNorm + cNorm * cNorm) / 1.414;
        // Realistic microclimate spread: vegetative/topographic perimeter is cool; concrete core is hot
        const tempVariation = (0.45 - dist) * 7.5 + Math.sin(r * 2.2) * 1.4;
        const calcLST = Number((baseLST + tempVariation).toFixed(1));
        const calcNDVI = Number(Math.max(0.06, Math.min(0.80, baseNDVI + dist * 0.22 - (1.0 - dist) * 0.08 + Math.cos(c * 1.9) * 0.05)).toFixed(2));
        const bDensity = Number(Math.max(0.08, Math.min(0.92, 0.85 - dist * 0.55 + Math.sin(r * 1.7) * 0.05)).toFixed(2));
        const gCover = Number(Math.max(0.05, Math.min(0.75, calcNDVI * 0.85)).toFixed(2));
        const popDensity = Math.round(Math.max(1200, Math.min(26000, 22000 * (1.0 - dist))));

        let risk: HeatRisk = 'Low';
        if (calcLST >= 41.5) risk = 'Critical';
        else if (calcLST >= 37.0) risk = 'High';
        else if (calcLST >= 33.5) risk = 'Moderate';

        const sectorNames = [
          'Urban Core & Transit Terminal',
          'Industrial Manufacturing Zone',
          'Commercial Business District',
          'High-Density Residential Sector',
          'Mixed Commercial Corridor',
          'Low-Albedo Asphalt District',
          'Suburban Residential West',
          'Ecological Buffer & Parklands',
          'Waterfront Riparian Corridor',
        ];
        const nameIdx = Math.abs(r * 3 + c) % sectorNames.length;
        const sectorName = `${city.name} ${sectorNames[nameIdx]}`;

        const polygonCoords = [
          [
            [cellMinLon, cellMinLat],
            [cellMaxLon, cellMinLat],
            [cellMaxLon, cellMaxLat],
            [cellMinLon, cellMaxLat],
            [cellMinLon, cellMinLat],
          ],
        ];

        features.push({
          type: 'Feature',
          properties: {
            id: `sector_${r}_${c}`,
            name: sectorName,
            category: r === 2 && c === 2 ? 'Commercial Core' : (r === 0 || r === 4 || c === 0 || c === 4) ? 'Suburban Fringe' : 'Mixed Urban Mass',
            lst: calcLST,
            ndvi: calcNDVI,
            building_density: bDensity,
            green_cover: gCover,
            population_density: popDensity,
            heat_risk: risk,
            lat: Number(cLat.toFixed(4)),
            lon: Number(cLon.toFixed(4)),
            primary_factors: [
              calcLST >= 38 ? `Elevated Land Surface Temperature (${calcLST}°C)` : 'Stable thermal readings',
              calcNDVI < 0.2 ? `Deficit in canopy cover (NDVI: ${calcNDVI})` : 'Adequate vegetation buffer',
              bDensity > 0.65 ? `High impervious built mass (${Math.round(bDensity * 100)}%)` : 'Moderate permeable setbacks',
            ],
          },
          geometry: {
            type: 'Polygon',
            coordinates: polygonCoords,
          },
        });
      }
    }

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [city.lat, city.lon, city.name, city.bbox]);

  // Instantly apply yearDelta (2018-2026 animation) in memory with 60fps responsiveness
  const displayedGeoJSON = useMemo(() => {
    const baseSource = rawLiveGeoJSON || geojsonData;
    if (!baseSource || !Array.isArray(baseSource.features)) return baseSource;

    let minLST = Infinity;
    let maxLST = -Infinity;
    baseSource.features.forEach((f: any) => {
      const val = Number(f.properties.lst ?? 30.0);
      if (val < minLST) minLST = val;
      if (val > maxLST) maxLST = val;
    });

    const lstRange = maxLST - minLST > 1.2 ? maxLST - minLST : 6.0;

    const features = baseSource.features.map((f: any) => {
      const origLST = Number(f.properties.lst ?? 30.0);
      const adjLST = Number((origLST + yearDelta).toFixed(1));

      const origNDVI = Number(f.properties.ndvi ?? 0.25);
      const adjNDVI = Number(Math.max(0.05, Math.min(0.85, origNDVI + ndviDelta)).toFixed(2));

      const origBDens = Number(f.properties.building_density ?? 0.5);
      const adjBDens = Number(Math.max(0.05, Math.min(0.95, origBDens + bDensDelta)).toFixed(2));

      const origGCover = Number(f.properties.green_cover ?? 0.2);
      const adjGCover = Number(Math.max(0.05, Math.min(0.85, origGCover + ndviDelta * 0.9)).toFixed(2));

      // Dynamic normalized heat intensity anchored to city baseline:
      // When scrubbing backwards in time, temperatures cool down and normHeat drops across the map!
      const normHeat = Math.max(0.0, Math.min(1.0, (adjLST - minLST) / lstRange));

      // Realistic historical risk tier based on adjusted temperature and intensity
      let risk: HeatRisk = 'Low';
      if (normHeat >= 0.80 || adjLST >= 40.0) risk = 'Critical';
      else if (normHeat >= 0.55 || adjLST >= 36.5) risk = 'High';
      else if (normHeat >= 0.30 || adjLST >= 32.5) risk = 'Moderate';
      else risk = 'Low';

      return {
        ...f,
        properties: {
          ...f.properties,
          lst: adjLST,
          ndvi: adjNDVI,
          building_density: adjBDens,
          green_cover: adjGCover,
          heat_intensity: Number(normHeat.toFixed(2)),
          heat_risk: risk,
        },
      };
    });

    return {
      type: 'FeatureCollection' as const,
      features,
    };
  }, [rawLiveGeoJSON, geojsonData, yearDelta, ndviDelta, bDensDelta]);

  const { minTemp, maxTemp } = useMemo(() => {
    if (!displayedGeoJSON?.features || displayedGeoJSON.features.length === 0) {
      return { minTemp: 28, maxTemp: 42 };
    }
    let min = 999;
    let max = -999;
    displayedGeoJSON.features.forEach((f: any) => {
      const t = f.properties.lst;
      if (t < min) min = t;
      if (t > max) max = t;
    });
    return { minTemp: Number(min.toFixed(1)), maxTemp: Number(max.toFixed(1)) };
  }, [displayedGeoJSON]);

  // Keep inspector modal in sync when scrubbing the year
  useEffect(() => {
    if (activeSector && displayedGeoJSON?.features) {
      const updated = displayedGeoJSON.features.find(
        (f: any) => f.properties.id === activeSector.id
      );
      if (updated) {
        setActiveSector(updated.properties);
      }
    }
  }, [yearDelta, displayedGeoJSON]);

  // Initialize Mapbox map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const styleUri =
      mapStyle === 'satellite'
        ? 'mapbox://styles/mapbox/satellite-streets-v12'
        : 'mapbox://styles/mapbox/dark-v11';

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: styleUri,
      center: [city.lon, city.lat],
      zoom: 12.2,
      pitch: pitch3D,
      bearing: -15,
      attributionControl: false,
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    map.on('load', () => {
      setIsMapLoaded(true);

      // Add 3D terrain and sky if available
      try {
        map.addSource('mapbox-dem', {
          type: 'raster-dem',
          url: 'mapbox://mapbox.mapbox-terrain-dem-v1',
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.4 });
      } catch (err) {
        // terrain optional
      }

      // Add GeoJSON Thermal Sectors Source
      const initialData = displayedGeoJSON || geojsonData;
      map.addSource('thermal-sectors', {
        type: 'geojson',
        data: initialData,
      });

      // Add Points GeoJSON Source for Continuous Smooth GPU Heatmap
      const initialPoints = {
        type: 'FeatureCollection' as const,
        features: (initialData?.features || []).map((f: any) => ({
          type: 'Feature' as const,
          properties: {
            id: f.properties.id,
            lst: f.properties.lst,
            heat_intensity: f.properties.heat_intensity ?? 0.5,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [f.properties.lon, f.properties.lat],
          },
        })),
      };
      map.addSource('thermal-points', {
        type: 'geojson',
        data: initialPoints,
      });

      // Layer 0: Continuous GPU Thermal Heatmap (Organic liquid microclimate field - NO harsh boxy seams)
      const baseHeatmapOpacity = activeLayers['lst'] ? ((layerOpacities['lst'] ?? 80) / 100) * 0.75 : 0;
      map.addLayer({
        id: 'thermal-heatmap-layer',
        type: 'heatmap',
        source: 'thermal-points',
        paint: {
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'heat_intensity'],
            0.0, 0.20,
            0.5, 0.60,
            1.0, 1.0,
          ],
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 0.6,
            12, 1.2,
            15, 1.8,
          ],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0.0, 'rgba(6, 182, 212, 0)',
            0.15, 'rgba(6, 182, 212, 0.35)',   // Cool Cyan
            0.35, 'rgba(16, 185, 129, 0.55)',  // Emerald Green
            0.55, 'rgba(132, 204, 22, 0.65)',  // Lime Green
            0.72, 'rgba(245, 158, 11, 0.78)',  // Golden Amber
            0.88, 'rgba(234, 88, 12, 0.88)',   // Warm Orange
            1.0, 'rgba(220, 38, 38, 0.95)',    // Crimson Red
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 50,
            12, 110,
            15, 200,
          ],
          'heatmap-opacity': baseHeatmapOpacity,
        },
      });

      // Layer 1: Ground Surface Heat (LST) Soft Ambient Wash (Subtle, never opaque cardboard tiles)
      map.addLayer({
        id: 'thermal-sectors-fill',
        type: 'fill',
        source: 'thermal-sectors',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'heat_intensity'],
            0.0, '#06b6d4',
            0.22, '#10b981',
            0.45, '#84cc16',
            0.65, '#f59e0b',
            0.82, '#ea580c',
            1.0, '#dc2626',
          ],
          'fill-opacity': 0.12,
        },
      });

      // Layer 2: Greenery & Canopy (NDVI) Vegetation Proxy
      const ndviOpacity = activeLayers['ndvi'] ? ((layerOpacities['ndvi'] ?? 80) / 100) * 0.55 : 0;
      map.addLayer({
        id: 'canopy-ndvi-fill',
        type: 'fill',
        source: 'thermal-sectors',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'ndvi'],
            0.08, 'rgba(253, 224, 71, 0.20)',
            0.18, '#86efac',
            0.32, '#22c55e',
            0.50, '#15803d',
          ],
          'fill-opacity': ndviOpacity,
        },
      });

      // Layer 3: Built Massing & Urban Morphology Density
      const landUseOpacity = activeLayers['land_use'] ? ((layerOpacities['land_use'] ?? 60) / 100) * 0.50 : 0;
      map.addLayer({
        id: 'landuse-morphology-fill',
        type: 'fill',
        source: 'thermal-sectors',
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['get', 'building_density'],
            0.15, '#94a3b8',
            0.45, '#64748b',
            0.70, '#6366f1',
            0.90, '#4338ca',
          ],
          'fill-opacity': landUseOpacity,
        },
      });

      // Layer 4: Priority Heat Risk Hazard Overlay
      map.addLayer({
        id: 'heat-risk-highlight',
        type: 'fill',
        source: 'thermal-sectors',
        paint: {
          'fill-color': [
            'match',
            ['get', 'heat_risk'],
            'Critical', '#ef4444',
            'High', '#f97316',
            'rgba(0,0,0,0)',
          ],
          'fill-opacity': activeLayers['heat_risk']
            ? [
                'match',
                ['get', 'heat_risk'],
                'Critical', 0.35,
                'High', 0.20,
                0,
              ]
            : 0,
        },
      });

      // Layer 5: Soft Sector Perimeter Hairline (Super subtle reference, NEVER thick harsh fence)
      map.addLayer({
        id: 'thermal-sectors-line',
        type: 'line',
        source: 'thermal-sectors',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.6,
          'line-opacity': 0.08,
        },
      });

      // Layer 6: Dynamic Active Sector Highlight Outline (Only selected neighborhood glows)
      map.addLayer({
        id: 'thermal-sector-active-outline',
        type: 'line',
        source: 'thermal-sectors',
        filter: ['==', 'id', ''],
        paint: {
          'line-color': '#38bdf8',
          'line-width': 2.2,
          'line-opacity': 0.95,
        },
      });

      // 3D Thermal Buildings Extrusion (Matching Digital Twin Reference Images 2 & 4)
      try {
        if (map.getSource('composite') && !map.getLayer('3d-buildings-extrusion')) {
          map.addLayer({
            id: '3d-buildings-extrusion',
            source: 'composite',
            'source-layer': 'building',
            filter: ['==', 'extrude', 'true'],
            type: 'fill-extrusion',
            minzoom: 12.0,
            paint: {
              'fill-extrusion-color': [
                'interpolate',
                ['linear'],
                ['get', 'height'],
                0, '#10b981',   // Ground low-rise structures (emerald green)
                12, '#84cc16',  // Low residential (lime)
                28, '#f59e0b',  // Mid-rise commercial (amber)
                50, '#ea580c',  // High-rise core (orange)
                85, '#ef4444'   // Skyscrapers & dense towers (crimson red)
              ],
              'fill-extrusion-height': [
                'interpolate',
                ['linear'],
                ['zoom'],
                12.0, 0,
                14.0, ['get', 'height']
              ],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': vizPreset === 'buildings' ? 0.95 : (activeLayers['land_use'] ? 0.85 : 0.65),
              'fill-extrusion-vertical-gradient': true,
            },
          });
        }
      } catch (err) {
        // Non-blocking if vector style doesn't expose composite building layer
      }

      // Thermal Arterial Corridors & Road Heat Radiance (Matching Digital Twin Reference Image 3)
      try {
        if (map.getSource('composite')) {
          if (!map.getLayer('thermal-roads-glow')) {
            map.addLayer({
              id: 'thermal-roads-glow',
              source: 'composite',
              'source-layer': 'road',
              filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary', 'street'],
              type: 'line',
              paint: {
                'line-color': [
                  'match',
                  ['get', 'class'],
                  ['motorway', 'trunk'], '#ff2a00',
                  ['primary'], '#ff6b00',
                  ['secondary'], '#f59e0b',
                  '#fbbf24'
                ],
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 1.2,
                  13, 3.8,
                  16, 8.0
                ],
                'line-blur': 2.2,
                'line-opacity': vizPreset === 'roads' ? 0.95 : 0.50,
              },
            });
          }

          if (!map.getLayer('thermal-roads-core')) {
            map.addLayer({
              id: 'thermal-roads-core',
              source: 'composite',
              'source-layer': 'road',
              filter: ['in', 'class', 'motorway', 'trunk', 'primary', 'secondary'],
              type: 'line',
              paint: {
                'line-color': '#fff7c2',
                'line-width': [
                  'interpolate', ['linear'], ['zoom'],
                  10, 0.6,
                  13, 1.5,
                  16, 3.0
                ],
                'line-opacity': vizPreset === 'roads' ? 0.95 : 0.60,
              },
            });
          }
        }
      } catch (err) {
        // Non-blocking
      }

      // Universal Sector Hover & Click Inspectors across all active fill layers
      const interactiveLayers = [
        'thermal-sectors-fill',
        'canopy-ndvi-fill',
        'landuse-morphology-fill',
        'heat-risk-highlight',
      ];

      interactiveLayers.forEach((layerId) => {
        map.on('mouseenter', layerId, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', layerId, () => {
          map.getCanvas().style.cursor = '';
        });
        map.on('click', layerId, (e) => {
          if (!e.features || !e.features[0]) return;
          const props = e.features[0].properties as SectorProperties;
          if (props) {
            setActiveSector({
              ...props,
              primary_factors: Array.isArray(props.primary_factors)
                ? props.primary_factors
                : typeof props.primary_factors === 'string'
                ? JSON.parse(props.primary_factors)
                : [],
            });
          }
        });
      });
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setIsMapLoaded(false);
    };
  }, [mapStyle]); // re-init when basemap style changes

  // Update center or fitBounds when city changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (
      city.bbox &&
      city.bbox.length === 4 &&
      city.bbox[1] > city.bbox[0] &&
      city.bbox[3] > city.bbox[2]
    ) {
      map.fitBounds(
        [
          [city.bbox[2], city.bbox[0]],
          [city.bbox[3], city.bbox[1]],
        ],
        {
          padding: 60,
          duration: 1800,
          pitch: pitch3D,
          maxZoom: 15.5,
        }
      );
    } else {
      map.flyTo({
        center: [city.lon, city.lat],
        zoom: 12.4,
        pitch: pitch3D,
        bearing: -15,
        duration: 2200,
        essential: true,
      });
    }
  }, [city.lat, city.lon, city.bbox, pitch3D]);

  // Update GeoJSON source data when city, live data, or year changes
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const source = mapRef.current.getSource('thermal-sectors') as mapboxgl.GeoJSONSource;
    if (source && displayedGeoJSON) {
      source.setData(displayedGeoJSON);
    }
    const pointsSource = mapRef.current.getSource('thermal-points') as mapboxgl.GeoJSONSource;
    if (pointsSource && displayedGeoJSON) {
      pointsSource.setData({
        type: 'FeatureCollection' as const,
        features: (displayedGeoJSON.features || []).map((f: any) => ({
          type: 'Feature' as const,
          properties: {
            id: f.properties.id,
            lst: f.properties.lst,
            heat_intensity: f.properties.heat_intensity ?? 0.5,
          },
          geometry: {
            type: 'Point' as const,
            coordinates: [f.properties.lon, f.properties.lat],
          },
        })),
      });
    }
  }, [displayedGeoJSON, isMapLoaded]);

  // Highlight active selected sector outline dynamically
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;
    if (map.getLayer('thermal-sector-active-outline')) {
      map.setFilter('thermal-sector-active-outline', [
        '==',
        'id',
        activeSector ? activeSector.id : '',
      ]);
    }
  }, [activeSector, isMapLoaded]);

  // Update layer opacities dynamically without reloading map
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;

    // 0. Continuous GPU Heatmap
    const baseLstOpacity = activeLayers['lst'] ? ((layerOpacities['lst'] ?? 80) / 100) * 0.75 : 0;
    const heatmapOpacity = vizPreset === 'roads' ? 0.20 : (vizPreset === 'buildings' ? 0.35 : baseLstOpacity);
    if (map.getLayer('thermal-heatmap-layer')) {
      map.setPaintProperty('thermal-heatmap-layer', 'heatmap-opacity', heatmapOpacity);
    }

    // 1. Soft Sector Fill (Subtle background wash)
    if (map.getLayer('thermal-sectors-fill')) {
      map.setPaintProperty(
        'thermal-sectors-fill',
        'fill-opacity',
        activeLayers['lst'] ? (vizPreset === 'roads' ? 0.05 : 0.14) : 0
      );
    }

    // 2. Greenery & Canopy (NDVI)
    const ndviOpacity = activeLayers['ndvi'] ? ((layerOpacities['ndvi'] ?? 80) / 100) * 0.55 : 0;
    if (map.getLayer('canopy-ndvi-fill')) {
      map.setPaintProperty('canopy-ndvi-fill', 'fill-opacity', ndviOpacity);
    }

    // 3. Buildings & Roads (Land Use Morphology)
    const landUseOpacity = activeLayers['land_use'] ? ((layerOpacities['land_use'] ?? 60) / 100) * 0.50 : 0;
    if (map.getLayer('landuse-morphology-fill')) {
      map.setPaintProperty('landuse-morphology-fill', 'fill-opacity', landUseOpacity);
    }
    if (map.getLayer('3d-buildings-extrusion')) {
      map.setPaintProperty(
        '3d-buildings-extrusion',
        'fill-extrusion-opacity',
        vizPreset === 'buildings' ? 0.95 : (activeLayers['land_use'] ? 0.80 : 0.40)
      );
    }

    // Thermal Road Radiance
    if (map.getLayer('thermal-roads-glow')) {
      map.setPaintProperty(
        'thermal-roads-glow',
        'line-opacity',
        vizPreset === 'roads' ? 0.95 : (activeLayers['land_use'] ? 0.50 : 0.15)
      );
    }
    if (map.getLayer('thermal-roads-core')) {
      map.setPaintProperty(
        'thermal-roads-core',
        'line-opacity',
        vizPreset === 'roads' ? 0.95 : (activeLayers['land_use'] ? 0.60 : 0.20)
      );
    }

    // 4. Priority Heat Risk Hazard Overlay
    if (map.getLayer('heat-risk-highlight')) {
      map.setPaintProperty(
        'heat-risk-highlight',
        'fill-opacity',
        activeLayers['heat_risk']
          ? [
              'match',
              ['get', 'heat_risk'],
              'Critical', 0.35,
              'High', 0.20,
              0,
            ]
          : 0
      );
    }
  }, [activeLayers, layerOpacities, isMapLoaded, vizPreset]);

  // Update real-time 3D sensor pin beacons on the map (Only active in Dual-Zone Sensors mode)
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Only display sensor pin beacons in Dual-Zone Sensors mode to keep the map neat & clean
    if (vizPreset !== 'dual_sensors' || !displayedGeoJSON?.features || displayedGeoJSON.features.length === 0) {
      return;
    }

    const features = displayedGeoJSON.features;
    const coolest = features.reduce((min, f) => (f.properties.lst < min.properties.lst ? f : min), features[0]);
    const hottest = features.reduce((max, f) => (f.properties.lst > max.properties.lst ? f : max), features[0]);
    const transit = features.reduce((max, f) => (f.properties.building_density > max.properties.building_density ? f : max), features[0]);

    const beaconList = [
      {
        feature: coolest,
        label: 'Eco Refuge',
        isHot: false,
        pulseBg: 'bg-emerald-500/40',
        dotBg: 'bg-emerald-400',
        textAccent: 'text-emerald-400',
        border: 'border-emerald-500/40',
      },
      {
        feature: hottest,
        label: 'Thermal Core',
        isHot: true,
        pulseBg: 'bg-red-500/40',
        dotBg: 'bg-red-500',
        textAccent: 'text-red-400',
        border: 'border-red-500/40',
      },
      ...(transit.properties.id !== hottest.properties.id && transit.properties.id !== coolest.properties.id
        ? [{
            feature: transit,
            label: 'Transit Corridor',
            isHot: false,
            pulseBg: 'bg-amber-500/40',
            dotBg: 'bg-amber-400',
            textAccent: 'text-amber-400',
            border: 'border-amber-500/40',
          }]
        : []),
    ];

    beaconList.forEach(({ feature, label, pulseBg, dotBg, textAccent, border }) => {
      const el = document.createElement('div');
      el.className = 'group relative flex flex-col items-center cursor-pointer transition-transform hover:scale-110 select-none';
      el.innerHTML = `
        <div class="relative flex items-center justify-center">
          <span class="absolute w-7 h-7 rounded-full ${pulseBg} animate-ping"></span>
          <span class="relative w-3.5 h-3.5 rounded-full ${dotBg} border-2 border-white shadow-lg"></span>
        </div>
        <div class="mt-1 px-2.5 py-0.5 rounded-full bg-slate-950/90 text-white border ${border} shadow-2xl backdrop-blur-md text-[10px] flex items-center gap-1.5 whitespace-nowrap">
          <span class="font-mono font-bold ${textAccent}">${feature.properties.lst}°C</span>
          <span class="text-[8.5px] uppercase tracking-wider text-gray-400">${label}</span>
        </div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setActiveSector(feature.properties);
        map.easeTo({
          center: [feature.properties.lon, feature.properties.lat],
          zoom: 14.5,
          duration: 800,
        });
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([feature.properties.lon, feature.properties.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
    };
  }, [isMapLoaded, displayedGeoJSON, vizPreset]);

  // Handle Preset Mode switching matching the 4 reference image styles
  const handleSelectPreset = (preset: VizPreset) => {
    setVizPreset(preset);
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (preset === 'canopy') {
      setPitch3D(48);
      map.easeTo({
        center: [city.lon, city.lat],
        zoom: 12.6,
        pitch: 48,
        bearing: -15,
        duration: 1200,
      });
    } else if (preset === 'buildings') {
      setPitch3D(62);
      map.easeTo({
        center: [city.lon, city.lat],
        zoom: 15.2,
        pitch: 62,
        bearing: -32,
        duration: 1400,
      });
    } else if (preset === 'roads') {
      setMapStyle('dark');
      setPitch3D(35);
      map.easeTo({
        center: [city.lon, city.lat],
        zoom: 13.0,
        pitch: 35,
        bearing: -5,
        duration: 1200,
      });
    } else if (preset === 'dual_sensors') {
      setPitch3D(45);
      setShowSensorBeacons(true);
      map.easeTo({
        center: [city.lon, city.lat],
        zoom: 12.8,
        pitch: 45,
        bearing: 0,
        duration: 1200,
      });
    }
  };

  // Controls Handlers
  const handleZoomIn = () => mapRef.current?.zoomIn({ duration: 300 });
  const handleZoomOut = () => mapRef.current?.zoomOut({ duration: 300 });
  const handleResetBearing = () => mapRef.current?.resetNorthPitch({ duration: 800 });
  const handleToggle3D = () => {
    const nextPitch = pitch3D === 0 ? 55 : 0;
    setPitch3D(nextPitch);
    mapRef.current?.easeTo({ pitch: nextPitch, duration: 800 });
  };
  const handleFitBounds = () => {
    if (
      city.bbox &&
      city.bbox.length === 4 &&
      city.bbox[1] > city.bbox[0] &&
      city.bbox[3] > city.bbox[2]
    ) {
      mapRef.current?.fitBounds(
        [
          [city.bbox[2], city.bbox[0]],
          [city.bbox[3], city.bbox[1]],
        ],
        {
          padding: 60,
          duration: 1200,
          pitch: pitch3D,
          maxZoom: 15.5,
        }
      );
    } else {
      mapRef.current?.flyTo({
        center: [city.lon, city.lat],
        zoom: 12.2,
        pitch: pitch3D,
        duration: 1200,
      });
    }
  };

  return (
    <div
      className="relative w-full h-full flex-1 min-w-0 overflow-hidden bg-gray-950"
      aria-label="Real Mapbox Digital Twin Map Viewport"
    >
      {/* Real Mapbox GL JS Container */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

      {/* Unified Glass Top HUD Header (100% Non-Overlapping & Responsive) */}
      <header className="absolute top-3 inset-x-3 z-20 pointer-events-auto flex items-center justify-between gap-3 select-none">
        {/* Left: City Digital Twin Badge & Telemetry */}
        <div className="flex items-center gap-2 bg-gray-950/80 dark:bg-white/8 backdrop-blur-xl border border-white/12 dark:border-white/15 rounded-2xl px-3 py-1.5 shadow-2xl text-gray-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shadow-sm shadow-emerald-500/50" />
            <span className="text-xs font-bold text-white tracking-wide uppercase">
              {city.name}
            </span>
            {onToggleTimeSlider ? (
              <button
                onClick={onToggleTimeSlider}
                className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 hover:bg-primary/20 text-gray-300 hover:text-primary transition-colors cursor-pointer flex items-center gap-1"
                title="Toggle Historical Trends timeline"
              >
                <Clock className="w-2.5 h-2.5 text-primary" />
                <span>{selectedYear}</span>
              </button>
            ) : (
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-white/10 text-gray-300">
                {selectedYear}
              </span>
            )}
          </div>

          <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-white/10 text-[11px] text-gray-400">
            <span>Air: <strong className="text-emerald-400 font-mono">{liveMetadata?.ambient_temp ?? 25.4}°C</strong></span>
            <span>Surface: <strong className="text-orange-400 font-mono">{liveMetadata?.skin_temp ?? 28.8}°C</strong></span>
            <button
              onClick={refreshLiveGIS}
              disabled={isLiveRefreshing}
              className="p-1 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="Refresh live telemetry"
            >
              <RefreshCw className={`w-3 h-3 ${isLiveRefreshing ? 'animate-spin text-primary' : ''}`} />
            </button>
          </div>
        </div>

        {/* Center: 4 Visualization Mode Presets (Matching user reference) */}
        <nav className="flex items-center gap-1 p-1 bg-gray-950/80 dark:bg-white/8 backdrop-blur-xl border border-white/12 dark:border-white/15 rounded-2xl shadow-2xl">
          <button
            onClick={() => handleSelectPreset('canopy')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              vizPreset === 'canopy'
                ? 'bg-primary text-white shadow-md font-semibold shadow-primary/25'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="3D Canopy Heat Model & Draped Surface"
          >
            <Globe2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Canopy</span>
          </button>

          <button
            onClick={() => handleSelectPreset('buildings')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              vizPreset === 'buildings'
                ? 'bg-amber-500 text-white shadow-md font-semibold shadow-amber-500/25'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="3D Building Facade Stratification ('Heat Map Mode')"
          >
            <Building className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">3D Buildings</span>
          </button>

          <button
            onClick={() => handleSelectPreset('roads')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              vizPreset === 'roads'
                ? 'bg-red-500 text-white shadow-md font-semibold shadow-red-500/25'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Arterial Heat Flow & Road Corridors"
          >
            <Flame className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Road Corridors</span>
          </button>

          <button
            onClick={() => handleSelectPreset('dual_sensors')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
              vizPreset === 'dual_sensors'
                ? 'bg-emerald-500 text-white shadow-md font-semibold shadow-emerald-500/25'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Dual-Zone Sensor Beacons"
          >
            <MapPin className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sensors</span>
          </button>
        </nav>

        {/* Right: Basemap toggle & Alert Broadcast */}
        <div className="flex items-center gap-1.5 bg-gray-950/80 dark:bg-white/8 backdrop-blur-xl border border-white/12 dark:border-white/15 rounded-2xl p-1 shadow-2xl">
          <button
            onClick={() => setMapStyle((s) => (s === 'satellite' ? 'dark' : 'satellite'))}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-gray-200 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
            title="Toggle Satellite vs Dark Streets basemap"
          >
            <Globe2 className="w-3.5 h-3.5 text-primary" />
            <span className="capitalize">{mapStyle === 'satellite' ? 'Satellite' : 'Dark'}</span>
          </button>

          <button
            onClick={() => setIsAlertModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-medium transition-all cursor-pointer"
            title="Broadcast Emergency Heat Alert"
          >
            <MessageCircle className="w-3.5 h-3.5 text-amber-400" />
            <span>Alert</span>
          </button>
        </div>
      </header>

      {/* Right-Side Floating Navigation Controls (Cleanly docked below top header) */}
      <div className="absolute right-3 top-16 flex flex-col gap-1.5 z-20 pointer-events-auto">
        <button
          onClick={handleZoomIn}
          aria-label="Zoom in"
          title="Zoom in"
          className="w-8 h-8 rounded-xl bg-gray-950/80 dark:bg-white/8 backdrop-blur-md border border-white/12 dark:border-white/15 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 shadow-lg transition-all cursor-pointer"
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleZoomOut}
          aria-label="Zoom out"
          title="Zoom out"
          className="w-8 h-8 rounded-xl bg-gray-950/80 dark:bg-white/8 backdrop-blur-md border border-white/12 dark:border-white/15 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 shadow-lg transition-all cursor-pointer"
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleToggle3D}
          aria-label="Toggle 3D Perspective Pitch"
          title={`3D Tilt Angle (${pitch3D}°)`}
          className="w-8 h-8 rounded-xl bg-gray-950/80 dark:bg-white/8 backdrop-blur-md border border-white/12 dark:border-white/15 flex items-center justify-center text-gray-300 hover:text-primary hover:bg-white/15 shadow-lg transition-all cursor-pointer"
        >
          <Rotate3d className="w-3.5 h-3.5 text-primary" />
        </button>

        <button
          onClick={handleResetBearing}
          aria-label="Reset North"
          title="Reset North"
          className="w-8 h-8 rounded-xl bg-gray-950/80 dark:bg-white/8 backdrop-blur-md border border-white/12 dark:border-white/15 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 shadow-lg transition-all cursor-pointer"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={handleFitBounds}
          aria-label="Recenter city view"
          title="Recenter city view"
          className="w-8 h-8 rounded-xl bg-gray-950/80 dark:bg-white/8 backdrop-blur-md border border-white/12 dark:border-white/15 flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/15 shadow-lg transition-all cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Dynamic Multi-Layer Legend (Docked cleanly in bottom-right corner) */}
      {!isLegendCollapsed ? (
        <div className="absolute bottom-6 right-6 z-20 pointer-events-auto bg-white/92 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-2xl p-3 shadow-2xl text-gray-700 dark:text-gray-100 flex flex-col gap-2 select-none w-64 max-w-[90vw] transition-all">
          <div className="flex items-center justify-between pb-1.5 border-b border-gray-200 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200">
              <Layers className="w-3.5 h-3.5 text-primary" />
              <span>Map Scale</span>
            </div>
            <button
              onClick={() => setIsLegendCollapsed(true)}
              className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors cursor-pointer"
              title="Minimize scale"
              aria-label="Minimize scale"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Ground Surface Heat Legend */}
          {activeLayers['lst'] && (
            <div className="space-y-1">
              <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Thermometer className="w-3 h-3 text-red-400" />
                  <span>Surface Heat</span>
                </span>
                <span className="text-primary font-mono text-[10px]">{minTemp}°C to {maxTemp}°C</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 via-amber-400 via-orange-500 to-red-500 shadow-inner" />
              <div className="flex justify-between text-[8px] text-gray-500 dark:text-gray-400 font-medium">
                <span>Cooler (Cyan/Green)</span>
                <span>Moderate (Amber)</span>
                <span>Extreme (Red)</span>
              </div>
            </div>
          )}

          {/* Greenery & Trees Legend */}
          {activeLayers['ndvi'] && (
            <div className={`space-y-1 ${activeLayers['lst'] ? 'border-t border-gray-200 dark:border-gray-700/60 pt-1.5' : ''}`}>
              <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Leaf className="w-3 h-3 text-emerald-400" />
                  <span>Greenery (NDVI)</span>
                </span>
                <span className="text-emerald-400 font-mono text-[10px]">0.06 to 0.80</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-lime-200 via-emerald-500 to-emerald-900 shadow-inner" />
              <div className="flex justify-between text-[8px] text-gray-500 dark:text-gray-400 font-medium">
                <span>Sparse</span>
                <span>Moderate Canopy</span>
                <span>Dense Park</span>
              </div>
            </div>
          )}

          {/* Buildings & Roads Legend */}
          {activeLayers['land_use'] && (
            <div className={`space-y-1 ${(activeLayers['lst'] || activeLayers['ndvi']) ? 'border-t border-gray-200 dark:border-gray-700/60 pt-1.5' : ''}`}>
              <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <Building className="w-3 h-3 text-indigo-400" />
                  <span>Built Mass Density</span>
                </span>
                <span className="text-indigo-400 font-mono text-[10px]">8% to 92%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-gradient-to-r from-slate-400 via-indigo-400 to-indigo-700 shadow-inner" />
              <div className="flex justify-between text-[8px] text-gray-500 dark:text-gray-400 font-medium">
                <span>Low Built</span>
                <span>Medium</span>
                <span>High Impervious</span>
              </div>
            </div>
          )}

          {/* Heat Risk Areas Legend */}
          {activeLayers['heat_risk'] && (
            <div className={`space-y-1 ${(activeLayers['lst'] || activeLayers['ndvi'] || activeLayers['land_use']) ? 'border-t border-gray-200 dark:border-gray-700/60 pt-1.5' : ''}`}>
              <div className="flex justify-between items-center text-[10px] font-semibold text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Risk Priority Zones</span>
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center text-[8px] font-bold">
                <span className="py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">Low</span>
                <span className="py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30">Mod</span>
                <span className="py-0.5 rounded bg-orange-500/20 text-orange-700 dark:text-orange-300 border border-orange-500/30">High</span>
                <span className="py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-300 border border-red-500/30">Crit</span>
              </div>
            </div>
          )}

          {/* Fallback if all layers are toggled off */}
          {!activeLayers['lst'] && !activeLayers['ndvi'] && !activeLayers['land_use'] && !activeLayers['heat_risk'] && (
            <div className="text-[10px] text-gray-400 italic py-1 text-center">
              All map overlays hidden. Toggle any layer in the left sidebar.
            </div>
          )}

          <div className="border-t border-gray-200 dark:border-gray-700/80 pt-1 mt-0.5">
            <span className="text-[9px] text-gray-500 dark:text-gray-400 font-mono block">25 spatial model sectors</span>
            <span className="text-[8px] text-gray-400 leading-tight block">
              Click any sector to inspect microclimate variables and send alert broadcasts.
            </span>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsLegendCollapsed(false)}
          className="absolute bottom-6 right-6 z-20 pointer-events-auto bg-white/92 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-xl px-3 py-1.5 shadow-2xl text-gray-700 dark:text-gray-200 flex items-center gap-2 text-xs font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 transition-all"
          title="Expand map scale"
          aria-label="Expand map scale"
        >
          <Layers className="w-3.5 h-3.5 text-primary" />
          <span>Map Scale</span>
          <ChevronUp className="w-3.5 h-3.5 text-gray-400 dark:text-gray-400" />
        </button>
      )}

      {/* Quick toggle button to open Yearly Trends from map viewport if closed */}
      {!isTimeSliderActive && onToggleTimeSlider && (
        <button
          onClick={onToggleTimeSlider}
          className="absolute bottom-6 left-6 z-20 pointer-events-auto bg-white/92 dark:bg-slate-900/90 backdrop-blur-xl border border-gray-200/80 dark:border-gray-700/80 rounded-xl px-3 py-1.5 shadow-2xl text-gray-700 dark:text-gray-200 flex items-center gap-2 text-xs font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white transition-all select-none"
          title="Open Yearly Trends (2018–2026)"
        >
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span>Yearly Trends</span>
          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
            {selectedYear}
          </span>
        </button>
      )}

      {/* Selected Sector Telemetry Modal Popup */}
      <AnimatePresence>
        {activeSector && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="
              absolute left-6 bottom-20 z-30 pointer-events-auto
              w-80 rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-2xl
              border border-gray-200 dark:border-gray-700 p-4 shadow-2xl
            "
          >
            <div className="flex items-start justify-between pb-2 border-b border-gray-200 dark:border-gray-700 mb-3">
              <div>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider block">
                  Neighborhood Details
                </span>
                <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{activeSector.name}</h4>
              </div>
              <button
                onClick={() => setActiveSector(null)}
                className="text-gray-400 hover:text-gray-700 dark:hover:text-white p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                aria-label="Close inspector"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-medium">Ground Heat</span>
                <span className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono">{activeSector.lst}°C</span>
              </div>
              <div className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-750 border border-gray-200 dark:border-gray-700">
                <span className="text-[10px] text-gray-500 dark:text-gray-400 block font-medium">Greenery Index</span>
                <span className="text-lg font-bold text-primary font-mono">{activeSector.ndvi}</span>
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700/80">
                <span className="text-gray-500 dark:text-gray-400">{selectedYear < 2026 ? 'Modeled Risk:' : 'Heat Risk Level:'}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${RISK_THEME[activeSector.heat_risk].badge}`}>
                  {activeSector.heat_risk}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700/80">
                <span className="text-gray-500 dark:text-gray-400">Heat Intensity:</span>
                <span className="text-primary font-mono font-bold">{Math.round((activeSector.heat_hazard_index ?? 0.65) * 100)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700/80">
                <span className="text-gray-500 dark:text-gray-400" title="Estimated from built-form morphology; not direct census data.">Estimated Population Exposure Proxy:</span>
                <span className="text-primary font-mono font-bold">{Math.round((activeSector.vulnerability_index ?? 0.55) * 100)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700/80">
                <span className="text-gray-500 dark:text-gray-400">Building Coverage:</span>
                <span className="text-gray-900 dark:text-gray-200 font-mono font-medium">{Math.round(activeSector.building_density * 100)}%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-gray-100 dark:border-gray-700/80">
                <span className="text-gray-500 dark:text-gray-400">Data Reliability:</span>
                <span className="text-primary font-mono font-bold">{activeSector.data_quality_score ?? 85}%</span>
              </div>
            </div>

            <div className="mt-2.5 pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 block">Main Factors Driving Heat</span>
                <span className="text-[9px] text-gray-400 dark:text-gray-500">Spatial Proxy Analysis</span>
              </div>
              <ul className="space-y-1 text-[11px] text-gray-700 dark:text-gray-300">
                {activeSector.primary_factors.map((factor, i) => (
                  <li key={i} className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />
                    <span>{factor}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Broadcast to this specific neighborhood */}
            <div className="mt-3 pt-2.5 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setIsAlertModalOpen(true)}
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer hover:scale-[1.01]"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send WhatsApp & SMS to {activeSector.name}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* NO₂ Air Quality Mapbox Layer (ENR-01) */}
      <AirQualityLayer
        map={mapRef.current}
        isMapLoaded={isMapLoaded}
        isVisible={!!activeLayers['no2']}
        opacity={layerOpacities['no2'] ?? 80}
        airQualityData={airQualityData}
        hotspotData={hotspotData}
        isLoading={isAQLoading}
      />

      {/* Emergency WhatsApp & SMS Heat Broadcast Modal */}
      <HeatAlertBroadcastModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        city={city}
        sectorName={activeSector?.name}
        currentTemp={activeSector?.lst ?? (36.5 + yearDelta)}
        heatRisk={activeSector?.heat_risk ?? 'High'}
      />
    </div>
  );
}
