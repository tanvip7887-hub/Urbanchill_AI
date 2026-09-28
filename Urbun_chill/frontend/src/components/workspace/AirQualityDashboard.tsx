'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wind,
  Map,
  PieChart,
  History,
  Sliders,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Info,
  TrendingDown,
} from 'lucide-react';

import ObservedModeledBadge from './ObservedModeledBadge';
import SourceAttributionPanel from './SourceAttributionPanel';
import HistoricalValidationChart from './HistoricalValidationChart';
import PollutionSimulator from './PollutionSimulator';
import {
  fetchAirQuality,
  fetchAirQualityHotspots,
  type AirQualityResult,
  type HotspotResult,
  type NO2RiskLevel,
} from '@/lib/apiClient';

interface AirQualityDashboardProps {
  cityName: string;
  lat?: number;
  lon?: number;
  onReturnToMap: () => void;
}

type ActivePanel = 'map' | 'attribution' | 'validation' | 'simulation';

const NO2_RISK_COLORS: Record<NO2RiskLevel, { text: string; bg: string; border: string }> = {
  Good: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  Moderate: { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  High: { text: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/30' },
  Critical: { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30' },
};

/**
 * AirQualityDashboard — Full-page view for the Air Quality module (ENR-01).
 * Integrates all 5 sub-components:
 *   - NO₂ grid map (via AirQualityLayer in InteractiveMapViewer)
 *   - Source Attribution Panel
 *   - Historical Validation Chart
 *   - Pollution Simulator
 *   - ObservedModeledBadge throughout
 *
 * Can be accessed from the EcmeSideNav as "Air Quality" view.
 */
export default function AirQualityDashboard({
  cityName,
  lat,
  lon,
  onReturnToMap,
}: AirQualityDashboardProps) {
  const [aqData, setAqData] = useState<AirQualityResult | null>(null);
  const [hotspotData, setHotspotData] = useState<HotspotResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>('map');
  const [selectedCellId, setSelectedCellId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!cityName) return;
    setIsLoading(true);
    setError(null);
    try {
      const [aq, hotspots] = await Promise.all([
        fetchAirQuality(cityName, lat, lon),
        fetchAirQualityHotspots(cityName, lat, lon, 40),
      ]);
      setAqData(aq);
      setHotspotData(hotspots);
      // Auto-select a moderate-risk cell for attribution
      const highCell = aq.grid.find(
        (c) => aq.risk_classification[c.cell_id]?.level === 'High'
      ) || aq.grid[12];
      if (highCell) setSelectedCellId(highCell.cell_id);
    } catch (e: any) {
      setError(e.message || 'Failed to load air quality data');
    } finally {
      setIsLoading(false);
    }
  }, [cityName, lat, lon]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const riskTheme = aqData
    ? NO2_RISK_COLORS[aqData.city_risk_level]
    : NO2_RISK_COLORS.Moderate;

  const PANELS = [
    { id: 'map' as const, label: 'NO₂ Grid', icon: Map },
    { id: 'attribution' as const, label: 'Source Attribution', icon: PieChart },
    { id: 'validation' as const, label: 'Historical Validation', icon: History },
    { id: 'simulation' as const, label: 'Pollution Simulator', icon: Sliders },
  ];

  return (
    <div className="flex-1 w-full min-w-0 flex flex-col h-full bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 overflow-hidden">
      {/* Top Bar */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-gray-900/80 backdrop-blur-xl flex-shrink-0 w-full">

        <button
          onClick={onReturnToMap}
          className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Return to Map</span>
        </button>
        <div className="h-5 w-px bg-gray-200 dark:bg-white/10" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center flex-shrink-0">
            <Wind className="w-4 h-4 text-sky-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-gray-900 dark:text-white font-bold text-sm truncate">
              Air Quality Intelligence — {cityName}
            </h1>
            <p className="text-gray-500 dark:text-gray-500 text-[11px]">NO₂ Tropospheric Column · ENR-01 · HackMatrix 5.0</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {isLoading && <RefreshCw className="w-4 h-4 text-sky-400 animate-spin" />}
          <button
            onClick={loadData}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-sky-400 transition-colors p-1.5 rounded-lg hover:bg-sky-500/10"
            title="Refresh data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Error Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-red-500/10 border-b border-red-500/20 px-6 py-2 flex items-center gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-red-300 text-xs">{error}</span>
          </motion.div>
        )}
      </AnimatePresence>


      {/* Summary Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 px-6 py-4 border-b border-gray-200 dark:border-white/10 flex-shrink-0 w-full">

        {[
          {
            label: 'City Avg NO₂',
            value: aqData ? `${aqData.avg_no2.toFixed(1)} µg/m³` : '—',
            badge: 'observed' as const,
            sub: 'CAMS Reanalysis',
            icon: Wind,
            color: 'text-sky-400',
          },
          {
            label: 'Risk Level',
            value: aqData?.city_risk_level || '—',
            badge: 'modeled' as const,
            sub: 'WHO/EU threshold classifier',
            icon: AlertTriangle,
            color: aqData ? riskTheme.text : 'text-gray-400',
          },
          {
            label: 'Hotspot Cells',
            value: hotspotData ? `${hotspotData.hotspot_count} / ${hotspotData.total_cells_analyzed}` : '—',
            badge: 'observed' as const,
            sub: '> 40 µg/m³ (EU limit)',
            icon: Map,
            color: 'text-amber-400',
          },
          {
            label: 'Data Source',
            value: 'Open-Meteo CAMS',
            badge: 'observed' as const,
            sub: aqData?.date || 'Today',
            icon: CheckCircle,
            color: 'text-emerald-400',
          },
        ].map(({ label, value, badge, sub, icon: Icon, color }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 w-full shadow-sm"
          >
            <div className="flex items-center justify-between mb-2">
              <Icon className={`w-4 h-4 ${color}`} />
              <ObservedModeledBadge source={badge} size="sm" showIcon={false} />
            </div>
            <div className={`${color} font-bold text-base font-mono leading-none`}>
              {isLoading ? (
                <span className="text-gray-600 animate-pulse text-sm">Loading…</span>
              ) : (
                value
              )}
            </div>
            <div className="text-gray-600 dark:text-white/60 text-[11px] mt-1">{label}</div>
            <div className="text-gray-400 dark:text-gray-600 text-[10px] mt-0.5">{sub}</div>
          </motion.div>
        ))}
      </div>

      {/* Panel Navigation */}
      <div className="flex items-center gap-1.5 px-6 py-3 border-b border-gray-200 dark:border-white/10 bg-gray-100/50 dark:bg-gray-900/50 flex-shrink-0 overflow-x-auto w-full">
        {PANELS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActivePanel(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
              activePanel === id
                ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200/60 dark:hover:bg-white/5'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 w-full overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {/* NO₂ Grid Table View */}
          {activePanel === 'map' && (
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4 w-full"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-gray-900 dark:text-white font-bold text-sm flex items-center gap-2">
                  <Wind className="w-4 h-4 text-sky-400" />
                  NO₂ Spatial Grid — {aqData?.grid.length ?? 0} Cells
                </h2>
                <div className="flex items-center gap-2 text-[11px] text-gray-500">
                  <ObservedModeledBadge source="observed" size="sm" />
                  <span>= NO₂ value</span>
                  <ObservedModeledBadge source="modeled" size="sm" />
                  <span>= Risk classification</span>
                </div>
              </div>

              {/* Grid cards */}
              {isLoading ? (
                <div className="grid grid-cols-5 gap-3 w-full">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div key={i} className="h-24 bg-gray-200 dark:bg-white/5 rounded-xl animate-pulse w-full" />
                  ))}
                </div>
              ) : aqData ? (
                <div className="grid grid-cols-5 gap-3 w-full">
                  {aqData.grid.map((cell) => {
                    const risk = aqData.risk_classification[cell.cell_id];
                    const theme = risk ? NO2_RISK_COLORS[risk.level] : NO2_RISK_COLORS.Moderate;
                    const isSelected = selectedCellId === cell.cell_id;
                    return (
                      <motion.button
                        key={cell.cell_id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          setSelectedCellId(cell.cell_id);
                          setActivePanel('attribution');
                        }}
                        className={`
                          relative p-3.5 rounded-xl border text-left transition-all w-full
                          ${theme.bg} ${theme.border}
                          ${isSelected ? 'ring-2 ring-sky-500 ring-offset-1 ring-offset-white dark:ring-offset-gray-950' : ''}
                        `}
                      >

                        <div className={`${theme.text} font-mono text-sm font-bold`}>
                          {cell.no2_value}
                        </div>
                        <div className="text-gray-500 dark:text-gray-500 text-[9px] font-mono">{cell.cell_id}</div>
                        <div className={`${theme.text} text-[9px] font-semibold mt-1`}>
                          {risk?.level}
                        </div>
                        <div className="absolute top-1.5 right-1.5">
                          <ObservedModeledBadge source={cell.source} size="sm" showIcon={false} />
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              ) : null}

              {/* Hotspot summary */}
              {hotspotData && hotspotData.hotspot_count > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 flex items-center gap-3"
                >
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <div className="text-red-300 font-semibold text-sm">
                      {hotspotData.hotspot_count} NO₂ Hotspot
                      {hotspotData.hotspot_count !== 1 ? 's' : ''} detected
                    </div>
                    <div className="text-red-400/60 text-xs">
                      Cells exceeding EU annual limit of 40 µg/m³
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Assumptions */}
              {aqData && aqData.assumptions.length > 0 && (
                <div className="bg-violet-500/5 border border-violet-500/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                    <span className="text-violet-700 dark:text-violet-300 text-xs font-semibold">Stated Data Assumptions</span>
                  </div>
                  <ul className="space-y-1">
                    {aqData.assumptions.map((a, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-violet-500 mt-0.5 flex-shrink-0">•</span>
                        <span className="text-gray-500 dark:text-violet-300/60 text-[11px] leading-relaxed">{a}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </motion.div>
          )}

          {/* Source Attribution Panel */}
          {activePanel === 'attribution' && (
            <motion.div
              key="attribution"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col lg:flex-row gap-6 w-full"
            >
              <div className="w-full lg:w-96 flex-shrink-0">
                <SourceAttributionPanel
                  cityName={cityName}
                  selectedCellId={selectedCellId}
                  lat={lat}
                  lon={lon}
                  isVisible={true}
                />
              </div>
              <div className="flex-1 space-y-4">
                <h3 className="text-gray-900 dark:text-white font-bold text-sm">Select a cell from the NO₂ Grid</h3>
                <p className="text-gray-500 text-xs leading-relaxed">
                  Click any cell in the NO₂ Grid tab to update the source attribution chart.
                  The model uses Random Forest feature importances calibrated against road density,
                  building density, wind dispersion, and humidity data.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                  {aqData?.grid.slice(0, 8).map((cell) => {
                    const risk = aqData.risk_classification[cell.cell_id];
                    const theme = risk ? NO2_RISK_COLORS[risk.level] : NO2_RISK_COLORS.Moderate;
                    return (
                      <button
                        key={cell.cell_id}
                        onClick={() => setSelectedCellId(cell.cell_id)}
                        className={`p-3 rounded-xl border text-left transition-all w-full ${theme.bg} ${theme.border} ${
                          selectedCellId === cell.cell_id
                            ? 'ring-2 ring-sky-500'
                            : 'hover:border-sky-500/40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-gray-700 dark:text-white font-mono text-xs">{cell.cell_id}</span>
                          <span className={`${theme.text} font-mono text-xs font-bold`}>
                            {cell.no2_value} µg/m³
                          </span>
                        </div>
                        <div className={`${theme.text} text-[10px] mt-1`}>{risk?.level}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* Historical Validation */}
          {activePanel === 'validation' && (
            <motion.div
              key="validation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col lg:flex-row gap-6 w-full"
            >
              <div className="w-full lg:w-96 flex-shrink-0">
                <HistoricalValidationChart
                  cityName={cityName}
                  lat={lat}
                  lon={lon}
                  currentNo2={aqData?.avg_no2}
                />
              </div>
              <div className="flex-1 space-y-4">
                <h3 className="text-gray-900 dark:text-white font-bold text-sm flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-400" />
                  Why Historical Validation Matters
                </h3>
                <div className="space-y-3 text-gray-500 dark:text-gray-400 text-xs leading-relaxed">
                  <p>
                    Historical validation confirms the model isn't just reporting a live snapshot —
                    it can match known past conditions, satisfying ENR-01's requirement that
                    predictions are "validated against historical periods."
                  </p>
                  <p>
                    Two periods are compared per city: a prior-year annual average and a seasonal
                    (monsoon) period. Both use CAMS reanalysis as the "observed" reference.
                  </p>
                  <div className="bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                    <div className="text-gray-900 dark:text-white text-xs font-semibold mb-2">Source Classification</div>
                    <div className="flex items-center gap-2 mb-2">
                      <ObservedModeledBadge source="observed" size="sm" />
                      <span className="text-gray-600 dark:text-gray-300">CAMS Reanalysis (Open-Meteo historical archive)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ObservedModeledBadge source="modeled" size="sm" />
                      <span className="text-gray-600 dark:text-gray-300">UrbanChill trend projection from current baseline</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Pollution Simulator — inline panel */}
          {activePanel === 'simulation' && (
            <motion.div
              key="simulation"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-5xl"
            >

              <PollutionSimulator
                cityName={cityName}
                lat={lat}
                lon={lon}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  );
}
