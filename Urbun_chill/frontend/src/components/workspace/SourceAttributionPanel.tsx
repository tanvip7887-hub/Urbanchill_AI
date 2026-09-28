'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PieChart, Info, ChevronDown, RefreshCw } from 'lucide-react';
import ObservedModeledBadge from './ObservedModeledBadge';
import {
  fetchSourceAttribution,
  type SourceAttributionResult,
} from '@/lib/apiClient';

interface SourceAttributionPanelProps {
  cityName: string;
  selectedCellId: string | null;
  lat?: number;
  lon?: number;
  isVisible: boolean;
}

const SOURCES = [
  {
    key: 'traffic_pct',
    label: 'Traffic & Transport',
    color: '#f97316',
    bg: 'bg-orange-500/20',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
  },
  {
    key: 'industrial_pct',
    label: 'Industrial & Commercial',
    color: '#8b5cf6',
    bg: 'bg-violet-500/20',
    border: 'border-violet-500/30',
    text: 'text-violet-400',
  },
  {
    key: 'weather_pct',
    label: 'Weather / Dispersion',
    color: '#06b6d4',
    bg: 'bg-cyan-500/20',
    border: 'border-cyan-500/30',
    text: 'text-cyan-400',
  },
  {
    key: 'residential_pct',
    label: 'Residential & Domestic',
    color: '#84cc16',
    bg: 'bg-lime-500/20',
    border: 'border-lime-500/30',
    text: 'text-lime-400',
  },
] as const;

type SourceKey = (typeof SOURCES)[number]['key'];

/**
 * SourceAttributionPanel — Donut-style chart showing traffic/industrial/weather/residential
 * NO₂ source contribution per selected grid cell.
 *
 * Satisfies ENR-01: "Attribute contributions across ≥ 3 sources, with stated assumptions"
 */
export default function SourceAttributionPanel({
  cityName,
  selectedCellId,
  lat,
  lon,
  isVisible,
}: SourceAttributionPanelProps) {
  const [data, setData] = useState<SourceAttributionResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const cellId = selectedCellId || 'c_012';

  useEffect(() => {
    if (!isVisible || !cityName) return;
    setIsLoading(true);
    fetchSourceAttribution(cityName, cellId, lat, lon)
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [cityName, cellId, lat, lon, isVisible]);

  if (!isVisible) return null;

  // Build SVG donut segments
  const buildDonutPath = (pct: number, offset: number, total: number) => {
    if (total === 0) return '';
    const r = 38;
    const cx = 50;
    const cy = 50;
    const circumference = 2 * Math.PI * r;
    const dashLen = (pct / 100) * circumference;
    const gapLen = circumference - dashLen;
    const rotation = (offset / 100) * 360 - 90;
    return `stroke-dasharray: ${dashLen} ${gapLen}; stroke-dashoffset: ${-offset * circumference / 100}; transform: rotate(${rotation}deg); transform-origin: ${cx}px ${cy}px;`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-sm w-full"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-sky-500" />
          <span className="text-gray-900 dark:text-white text-xs font-bold uppercase tracking-wider">
            Source Attribution
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <ObservedModeledBadge source="modeled" size="sm" />
          {isLoading && (
            <RefreshCw className="w-3 h-3 text-gray-500 animate-spin" />
          )}
        </div>
      </div>

      {/* Cell label */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-gray-500 text-[10px]">Cell:</span>
        <span className="text-sky-400 font-mono text-[11px] font-semibold">{cellId}</span>
        {data && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-amber-400 font-mono text-[11px]">
              {data.no2_value} µg/m³
            </span>
          </>
        )}
      </div>

      {/* SVG Donut Chart */}
      <div className="relative flex justify-center mb-4">
        {isLoading ? (
          <div className="w-28 h-28 rounded-full border-4 border-white/10 animate-pulse" />
        ) : data ? (
          <div className="relative w-28 h-28">
            <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
              {(() => {
                let offset = 0;
                return SOURCES.map(({ key, color }) => {
                  const pct = data[key as SourceKey];
                  const r = 38;
                  const circumference = 2 * Math.PI * r;
                  const dashLen = (pct / 100) * circumference;
                  const segOffset = (offset / 100) * circumference;
                  const seg = (
                    <circle
                      key={key}
                      cx="50"
                      cy="50"
                      r={r}
                      fill="none"
                      stroke={color}
                      strokeWidth="10"
                      strokeDasharray={`${dashLen} ${circumference - dashLen}`}
                      strokeDashoffset={-segOffset}
                      className="transition-all duration-700"
                    />
                  );
                  offset += pct;
                  return seg;
                });
              })()}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-gray-900 dark:text-white text-lg font-black leading-none">NO₂</span>
              <span className="text-gray-500 dark:text-gray-400 text-[10px]">Sources</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Source Bars */}
      <div className="space-y-2">
        {SOURCES.map(({ key, label, color, text, bg, border }) => {
          const pct = data?.[key as SourceKey] ?? 0;
          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-gray-700 dark:text-gray-300 text-[11px]">{label}</span>
                <span className={`${text} font-mono text-xs font-bold`}>
                  {isLoading ? '…' : `${pct.toFixed(1)}%`}
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 dark:bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: isLoading ? '0%' : `${pct}%` }}
                  transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color, opacity: 0.8 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Method */}
      {data && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-white/10">
          <p className="text-gray-500 dark:text-gray-400 text-[10px] leading-relaxed">
            {data.attribution_method}
          </p>
        </div>
      )}


      {/* Assumptions Accordion */}
      {data && data.assumptions.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setShowAssumptions((v) => !v)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 transition-colors text-[11px]"
          >
            <Info className="w-3 h-3" />
            <span>Stated Assumptions ({data.assumptions.length})</span>
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showAssumptions ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {showAssumptions && (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-1.5 overflow-hidden"
              >
                {data.assumptions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="text-violet-500 text-[10px] mt-0.5 flex-shrink-0">•</span>
                    <span className="text-gray-500 text-[10px] leading-relaxed">{a}</span>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}
