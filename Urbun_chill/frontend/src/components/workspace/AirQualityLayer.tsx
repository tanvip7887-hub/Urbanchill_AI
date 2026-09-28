'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, AlertTriangle, Info, X } from 'lucide-react';
import mapboxgl from 'mapbox-gl';
import ObservedModeledBadge from './ObservedModeledBadge';
import type { AirQualityResult, HotspotResult, NO2RiskLevel } from '@/lib/apiClient';

interface AirQualityLayerProps {
  map: mapboxgl.Map | null;
  isMapLoaded: boolean;
  isVisible: boolean;
  opacity: number;
  airQualityData: AirQualityResult | null;
  hotspotData: HotspotResult | null;
  isLoading: boolean;
  onCellClick?: (cellId: string) => void;
}

const NO2_RISK_COLORS: Record<NO2RiskLevel, string> = {
  Good: '#22c55e',      // green-500
  Moderate: '#f59e0b',  // amber-500
  High: '#f97316',      // orange-500
  Critical: '#ef4444',  // red-500
};

const SOURCE_ID = 'aq-no2-grid';
const HOTSPOT_SOURCE_ID = 'aq-hotspots';
const LAYER_ID = 'aq-no2-fill';
const LAYER_BORDER_ID = 'aq-no2-border';
const HOTSPOT_LAYER_ID = 'aq-hotspot-glow';

/**
 * AirQualityLayer — Mapbox GL overlay for NO2 data.
 * Follows the same pattern as the existing heat GridLayer in InteractiveMapViewer.
 * Toggled next to "Ground Surface Heat" in the Layers Sidebar.
 */
export default function AirQualityLayer({
  map,
  isMapLoaded,
  isVisible,
  opacity,
  airQualityData,
  hotspotData,
  isLoading,
  onCellClick,
}: AirQualityLayerProps) {
  const popupRef = useRef<mapboxgl.Popup | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{
    no2: number;
    risk: NO2RiskLevel;
    cellId: string;
    x: number;
    y: number;
  } | null>(null);

  // Build GeoJSON FeatureCollection from grid cells
  const buildGeoJSON = useCallback(
    (data: AirQualityResult): GeoJSON.FeatureCollection => {
      // Since the API doesn't return geometry in the grid, we construct polygons
      // from lat/lon using the standard step from the GIS layer
      const step = 0.016;
      return {
        type: 'FeatureCollection',
        features: data.grid.map((cell) => {
          const risk =
            data.risk_classification[cell.cell_id]?.level || 'Moderate';
          return {
            type: 'Feature',
            properties: {
              cell_id: cell.cell_id,
              no2_value: cell.no2_value,
              risk_level: risk,
              source: cell.source,
              date: cell.date,
            },
            geometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [cell.lon - step / 2, cell.lat - step / 2],
                  [cell.lon + step / 2, cell.lat - step / 2],
                  [cell.lon + step / 2, cell.lat + step / 2],
                  [cell.lon - step / 2, cell.lat + step / 2],
                  [cell.lon - step / 2, cell.lat - step / 2],
                ],
              ],
            },
          } as GeoJSON.Feature;
        }),
      };
    },
    []
  );

  // Add/update NO2 grid layer
  useEffect(() => {
    if (!map || !isMapLoaded || !airQualityData) return;

    const geojson = buildGeoJSON(airQualityData);

    // Add or update source
    if (map.getSource(SOURCE_ID)) {
      (map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
    } else {
      map.addSource(SOURCE_ID, { type: 'geojson', data: geojson });
    }

    // Fill layer
    if (!map.getLayer(LAYER_ID)) {
      map.addLayer({
        id: LAYER_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: {
          'fill-color': [
            'match',
            ['get', 'risk_level'],
            'Good', NO2_RISK_COLORS.Good,
            'Moderate', NO2_RISK_COLORS.Moderate,
            'High', NO2_RISK_COLORS.High,
            'Critical', NO2_RISK_COLORS.Critical,
            '#94a3b8'
          ],
          'fill-opacity': isVisible ? (opacity / 100) * 0.65 : 0,
        },
      });
    }

    // Border layer
    if (!map.getLayer(LAYER_BORDER_ID)) {
      map.addLayer({
        id: LAYER_BORDER_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: {
          'line-color': [
            'match',
            ['get', 'risk_level'],
            'Good', NO2_RISK_COLORS.Good,
            'Moderate', NO2_RISK_COLORS.Moderate,
            'High', NO2_RISK_COLORS.High,
            'Critical', NO2_RISK_COLORS.Critical,
            '#94a3b8'
          ],
          'line-width': 1.2,
          'line-opacity': isVisible ? 0.7 : 0,
        },
      });
    }

    // Hotspot glow layer
    if (hotspotData && hotspotData.features.length > 0) {
      const hotspotGeoJSON: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: hotspotData.features.map((f) => ({
          ...f,
          geometry: f.geometry as GeoJSON.Polygon,
        })),
      };
      if (map.getSource(HOTSPOT_SOURCE_ID)) {
        (map.getSource(HOTSPOT_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(hotspotGeoJSON);
      } else {
        map.addSource(HOTSPOT_SOURCE_ID, { type: 'geojson', data: hotspotGeoJSON });
        map.addLayer({
          id: HOTSPOT_LAYER_ID,
          type: 'fill',
          source: HOTSPOT_SOURCE_ID,
          paint: {
            'fill-color': '#ef4444',
            'fill-opacity': isVisible ? 0.18 : 0,
          },
        });
      }
    }

    // Click handler
    const handleClick = (e: mapboxgl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: [LAYER_ID] });
      if (features.length && onCellClick) {
        onCellClick(features[0].properties?.cell_id || '');
      }
    };
    map.on('click', LAYER_ID, handleClick);
    return () => {
      map.off('click', LAYER_ID, handleClick);
    };
  }, [map, isMapLoaded, airQualityData, hotspotData, buildGeoJSON, isVisible, opacity, onCellClick]);

  // Update opacity on change
  useEffect(() => {
    if (!map || !isMapLoaded) return;
    if (map.getLayer(LAYER_ID)) {
      map.setPaintProperty(LAYER_ID, 'fill-opacity', isVisible ? (opacity / 100) * 0.65 : 0);
      map.setPaintProperty(LAYER_BORDER_ID, 'line-opacity', isVisible ? 0.7 : 0);
    }
    if (map.getLayer(HOTSPOT_LAYER_ID)) {
      map.setPaintProperty(HOTSPOT_LAYER_ID, 'fill-opacity', isVisible ? 0.18 : 0);
    }
  }, [map, isMapLoaded, isVisible, opacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !isMapLoaded) return;
      [LAYER_ID, LAYER_BORDER_ID, HOTSPOT_LAYER_ID].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      [SOURCE_ID, HOTSPOT_SOURCE_ID].forEach((id) => {
        if (map.getSource(id)) map.removeSource(id);
      });
    };
  }, []); // eslint-disable-line

  if (!isVisible) return null;

  return (
    <>
      {/* NO2 Risk Legend */}
      <AnimatePresence>
        {isVisible && airQualityData && (
          <motion.div
            key="aq-legend"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="absolute right-4 top-24 z-20 bg-gray-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl w-56"
          >
            <div className="flex items-center gap-2 mb-3">
              <Wind className="w-4 h-4 text-sky-400" />
              <span className="text-white text-xs font-bold uppercase tracking-wider">
                NO₂ Air Quality
              </span>
              <ObservedModeledBadge source="observed" size="sm" />
            </div>
            <div className="space-y-1.5">
              {(
                [
                  { label: 'Good', range: '< 25 µg/m³', color: NO2_RISK_COLORS.Good },
                  { label: 'Moderate', range: '25–40', color: NO2_RISK_COLORS.Moderate },
                  { label: 'High', range: '40–100', color: NO2_RISK_COLORS.High },
                  { label: 'Critical', range: '> 100', color: NO2_RISK_COLORS.Critical },
                ] as const
              ).map(({ label, range, color }) => (
                <div key={label} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-sm flex-shrink-0"
                    style={{ backgroundColor: color, opacity: 0.8 }}
                  />
                  <span className="text-white/80 text-[11px]">{label}</span>
                  <span className="text-white/40 text-[10px] ml-auto font-mono">{range}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="flex items-center justify-between">
                <span className="text-white/50 text-[10px]">City Avg NO₂</span>
                <span className="text-white font-mono text-xs font-bold">
                  {airQualityData.avg_no2.toFixed(1)} µg/m³
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-white/50 text-[10px]">Risk Level</span>
                <span
                  className="text-xs font-bold"
                  style={{ color: NO2_RISK_COLORS[airQualityData.city_risk_level] }}
                >
                  {airQualityData.city_risk_level}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <Info className="w-3 h-3 text-white/30" />
                <span className="text-white/30 text-[9px] leading-tight">
                  CAMS Reanalysis — {airQualityData.date}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading indicator */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute top-36 right-4 z-20 bg-sky-500/20 border border-sky-500/30 rounded-xl px-3 py-2 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
          <span className="text-sky-400 text-xs font-medium">Loading NO₂ data…</span>
        </motion.div>
      )}
    </>
  );
}
