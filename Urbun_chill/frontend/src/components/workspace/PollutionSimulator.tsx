'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wind,
  Car,
  Factory,
  Trees,
  Zap,
  TrendingDown,
  RotateCcw,
  CheckCircle,
  Info,
} from 'lucide-react';
import ObservedModeledBadge from './ObservedModeledBadge';
import {
  simulatePollutionReduction,
  type PollutionSimResult,
  type PollutionScenario,
} from '@/lib/apiClient';

interface PollutionSimulatorProps {
  cityName: string;
  lat?: number;
  lon?: number;
  onApplyResult?: (result: PollutionSimResult) => void;
}

const ACTION_CONFIG = [
  {
    key: 'traffic_restriction_pct',
    label: 'Traffic Restriction',
    icon: Car,
    color: '#f97316',
    description: 'Odd-even scheme, congestion pricing',
    max: 60,
  },
  {
    key: 'industrial_control_pct',
    label: 'Industrial Control',
    icon: Factory,
    color: '#8b5cf6',
    description: 'Scrubbers + emission caps',
    max: 80,
  },
  {
    key: 'green_buffer_pct',
    label: 'Green Buffer',
    icon: Trees,
    color: '#22c55e',
    description: 'Urban forestry & roadside vegetation',
    max: 40,
  },
  {
    key: 'vehicle_emission_standard_pct',
    label: 'Vehicle Emission Std',
    icon: Zap,
    color: '#06b6d4',
    description: 'BS-VI / Euro-7 + EV mandate',
    max: 50,
  },
] as const;

type ActionKey = (typeof ACTION_CONFIG)[number]['key'];

/**
 * PollutionSimulator — Inline panel (not a modal).
 * Renders directly inside AirQualityDashboard's content area.
 * Compares ≥ 4 actions with animated per-cell projected outcomes.
 * Satisfies ENR-01: "Compare ≥ 3 possible actions"
 */
export default function PollutionSimulator({
  cityName,
  lat,
  lon,
  onApplyResult,
}: PollutionSimulatorProps) {
  const [actions, setActions] = useState<Record<ActionKey, number>>({
    traffic_restriction_pct: 20,
    industrial_control_pct: 15,
    green_buffer_pct: 10,
    vehicle_emission_standard_pct: 15,
  });
  const [result, setResult] = useState<PollutionSimResult | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [activeTab, setActiveTab] = useState<'sliders' | 'scenarios' | 'results'>('sliders');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    setIsCalculating(true);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      simulatePollutionReduction(cityName, actions, lat, lon)
        .then(setResult)
        .catch(console.error)
        .finally(() => setIsCalculating(false));
    }, 400);
    return () => clearTimeout(debounceRef.current);
  }, [cityName, actions, lat, lon]);

  const handleReset = () => {
    setActions({
      traffic_restriction_pct: 0,
      industrial_control_pct: 0,
      green_buffer_pct: 0,
      vehicle_emission_standard_pct: 0,
    });
  };

  const agg = result?.city_aggregate;
  const improvedPct = agg ? Math.abs(agg.avg_delta_pct).toFixed(1) : '--';

  return (
    <div className="space-y-5 w-full">
      {/* Header */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center">
            <Wind className="w-4 h-4 text-sky-500" />
          </div>
          <div>
            <h2 className="text-gray-900 dark:text-white font-bold text-sm">
              NO₂ Pollution Simulator
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-gray-500 text-xs">{cityName}</span>
              <ObservedModeledBadge source="modeled" size="sm" />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
        {[
          {
            label: 'Baseline NO₂',
            value: agg ? `${agg.avg_baseline_no2} µg/m³` : '—',
            sub: 'City avg (observed)',
            color: 'text-amber-500 dark:text-amber-400',
          },
          {
            label: 'Projected NO₂',
            value: agg ? `${agg.avg_projected_no2} µg/m³` : '—',
            sub: 'After interventions',
            color: 'text-sky-600 dark:text-sky-400',
          },
          {
            label: 'Improvement',
            value: isCalculating ? '…' : `${improvedPct}%`,
            sub: 'NO₂ reduction',
            color: 'text-emerald-600 dark:text-emerald-400',
          },
        ].map(({ label, value, sub, color }) => (
          <div
            key={label}
            className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 text-center shadow-sm w-full"
          >
            <div className={`${color} text-base font-bold font-mono`}>
              {isCalculating ? (
                <span className="animate-pulse text-gray-400 dark:text-white/40">…</span>
              ) : (
                value
              )}
            </div>
            <div className="text-gray-700 dark:text-white text-[11px] font-medium mt-0.5">{label}</div>
            <div className="text-gray-400 dark:text-gray-500 text-[10px]">{sub}</div>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 bg-gray-100/80 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-1 w-full">

        {(
          [
            { id: 'sliders', label: 'Configure Actions' },
            { id: 'scenarios', label: 'Preset Scenarios' },
            { id: 'results', label: 'Cell Results' },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === id
                ? 'bg-sky-500 text-white shadow'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {/* Sliders */}
        {activeTab === 'sliders' && (
          <motion.div
            key="sliders"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3 w-full"
          >
            {ACTION_CONFIG.map(({ key, label, icon: Icon, color, description, max }) => (
              <div
                key={key}
                className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4 w-full shadow-sm"
              >

                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: color + '20', border: `1px solid ${color}40` }}
                    >
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <div>
                      <div className="text-gray-900 dark:text-white text-sm font-semibold">{label}</div>
                      <div className="text-gray-500 text-[11px]">{description}</div>
                    </div>
                  </div>
                  <span className="font-mono text-base font-bold" style={{ color }}>
                    {actions[key]}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={5}
                  value={actions[key]}
                  onChange={(e) =>
                    setActions((prev) => ({
                      ...prev,
                      [key]: parseInt(e.target.value),
                    }))
                  }
                  className="w-full h-2 rounded-full appearance-none cursor-pointer"
                  style={{ accentColor: color }}
                  aria-label={`${label} intensity`}
                  id={`pollution-action-${key}`}
                />
                <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-600 mt-1">
                  <span>0%</span>
                  <span>{max}%</span>
                </div>
              </div>
            ))}

            <div className="flex gap-2 pt-1">
              <button
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-gray-100 dark:bg-white/5 hover:bg-gray-200 dark:hover:bg-white/10 border border-gray-200 dark:border-white/10 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white text-sm font-medium transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
              {onApplyResult && result && (
                <button
                  onClick={() => onApplyResult(result)}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-sm font-bold transition-all shadow-lg shadow-sky-500/20"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Apply to Map
                </button>
              )}
            </div>
          </motion.div>
        )}

        {/* Preset Scenarios */}
        {activeTab === 'scenarios' && (
          <motion.div
            key="scenarios"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-3 w-full"
          >
            {result?.scenario_comparison.map((sc: PollutionScenario) => (
              <motion.div
                key={sc.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 hover:border-sky-500/40 rounded-xl p-4 cursor-pointer transition-all shadow-sm w-full"
                onClick={() => {
                  if (sc.id !== 'custom') {
                    const newActions = sc.actions as Record<ActionKey, number>;
                    setActions({
                      traffic_restriction_pct: newActions.traffic_restriction_pct ?? 0,
                      industrial_control_pct: newActions.industrial_control_pct ?? 0,
                      green_buffer_pct: newActions.green_buffer_pct ?? 0,
                      vehicle_emission_standard_pct: newActions.vehicle_emission_standard_pct ?? 0,
                    });
                    setActiveTab('sliders');
                  }
                }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-900 dark:text-white text-sm font-semibold">{sc.name}</span>
                  <div className="flex items-center gap-1.5">
                    <TrendingDown className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-mono text-sm font-bold">
                      −{sc.est_no2_reduction_pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-xs">{sc.description}</p>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Cell Results */}
        {activeTab === 'results' && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-2 w-full"
          >
            {isCalculating ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm animate-pulse">
                Computing per-cell projections…
              </div>
            ) : (
              result?.cell_results.slice(0, 10).map((c) => (
                <div
                  key={c.cell_id}
                  className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-lg p-3 flex items-center justify-between shadow-sm w-full"
                >

                  <div>
                    <span className="text-gray-900 dark:text-white text-xs font-mono font-semibold">{c.cell_id}</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-amber-500 dark:text-amber-400 text-[11px] font-mono">
                        {c.baseline_no2} µg/m³
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-sky-600 dark:text-sky-400 text-[11px] font-mono">
                        {c.projected_no2} µg/m³
                      </span>
                      <ObservedModeledBadge source="modeled" size="sm" showIcon={false} />
                    </div>
                  </div>
                  <div
                    className={`text-sm font-bold font-mono ${
                      c.delta < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                    }`}
                  >
                    {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}
                  </div>
                </div>
              ))
            )}
            {result && result.cell_results.length > 10 && (
              <p className="text-gray-400 dark:text-gray-600 text-xs text-center pt-1">
                Showing 10 of {result.cell_results.length} cells
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scientific Disclaimer */}
      <div className="flex items-start gap-2 bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
        <Info className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 mt-0.5 flex-shrink-0" />
        <p className="text-violet-600 dark:text-violet-300/70 text-[11px] leading-relaxed">
          <span className="font-semibold text-violet-700 dark:text-violet-300">Modelled projection. </span>
          Asymptotic saturation curves calibrated against published urban NO₂ intervention studies.
          Assumes uniform spatial intervention and average atmospheric conditions.
        </p>
      </div>
    </div>
  );
}
