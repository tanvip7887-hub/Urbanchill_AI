'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { History, TrendingDown, TrendingUp, Minus, Info } from 'lucide-react';
import ObservedModeledBadge from './ObservedModeledBadge';
import { fetchAirQualityValidation, type ValidationResult, type ValidationPeriod } from '@/lib/apiClient';

interface HistoricalValidationChartProps {
  cityName: string;
  lat?: number;
  lon?: number;
  currentNo2?: number;
}

/**
 * HistoricalValidationChart — Predicted vs. observed NO₂ comparison for
 * 2 stored historical periods. Line/bar combo chart using pure SVG.
 *
 * Satisfies ENR-01: "Validate against historical periods" + "not just a live snapshot".
 */
export default function HistoricalValidationChart({
  cityName,
  lat,
  lon,
  currentNo2,
}: HistoricalValidationChartProps) {
  const [data, setData] = useState<ValidationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!cityName) return;
    setIsLoading(true);
    fetchAirQualityValidation(cityName, lat, lon)
      .then(setData)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, [cityName, lat, lon]);

  // Build all periods including current
  const periods: Array<{
    label: string;
    predicted: number;
    observed: number;
    isCurrent?: boolean;
  }> = [];

  if (data) {
    data.validation_periods.forEach((p) => {
      periods.push({
        label: p.period_label,
        predicted: p.predicted_avg_no2,
        observed: p.observed_avg_no2,
      });
    });
  }
  if (data && currentNo2 !== undefined) {
    periods.push({
      label: 'Current (Live)',
      predicted: data.current_avg_no2,
      observed: currentNo2,
      isCurrent: true,
    });
  }

  const allValues = periods.flatMap((p) => [p.predicted, p.observed]);
  const maxVal = allValues.length ? Math.max(...allValues) * 1.2 : 80;
  const minVal = 0;

  const chartW = 280;
  const chartH = 120;
  const padL = 32;
  const padB = 28;
  const plotW = chartW - padL - 8;
  const plotH = chartH - padB - 8;

  const xPos = (i: number) => padL + (i / Math.max(periods.length - 1, 1)) * plotW;
  const yPos = (v: number) => 8 + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

  const predictedLine = periods
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(p.predicted).toFixed(1)}`)
    .join(' ');
  const observedLine = periods
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(i).toFixed(1)} ${yPos(p.observed).toFixed(1)}`)
    .join(' ');

  return (
    <div className="bg-white dark:bg-gray-900/95 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-2xl p-5 shadow-sm w-full text-gray-900 dark:text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
          <span className="text-gray-900 dark:text-white text-xs font-bold uppercase tracking-wider">
            Historical Validation
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <ObservedModeledBadge source="observed" size="sm" showIcon={false} />
          <ObservedModeledBadge source="modeled" size="sm" showIcon={false} />
        </div>
      </div>
      <p className="text-gray-500 text-[11px] mb-3">{cityName} — NO₂ predicted vs. observed</p>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 bg-violet-500 inline-block rounded" />
          <span className="text-[11px] text-violet-600 dark:text-violet-400 font-medium">Predicted</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-6 h-0.5 inline-block rounded border-dashed border-b" style={{ borderBottom: '2px dashed #22c55e', background: 'none' }} />
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Observed</span>
        </div>
      </div>

      {/* SVG Chart */}
      {isLoading ? (
        <div className="h-32 bg-gray-100 dark:bg-white/5 rounded-xl animate-pulse" />
      ) : periods.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-gray-400 text-sm">
          No validation data
        </div>
      ) : (
        <svg width="100%" height={chartH} viewBox={`0 0 ${chartW} ${chartH}`} className="overflow-visible">
          {/* Y-axis gridlines */}
          {[0, 0.25, 0.5, 0.75, 1].map((t) => {
            const y = 8 + plotH - t * plotH;
            const v = Math.round(minVal + t * (maxVal - minVal));
            return (
              <g key={t}>
                <line
                  x1={padL}
                  y1={y}
                  x2={chartW - 8}
                  y2={y}
                  stroke="currentColor"
                  className="text-gray-200 dark:text-white/10"
                  strokeWidth={1}
                />
                <text x={padL - 4} y={y + 4} fontSize={8} fill="currentColor" className="text-gray-400 dark:text-gray-500" textAnchor="end">
                  {v}
                </text>
              </g>
            );
          })}


          {/* WHO guideline line (25 µg/m³) */}
          {maxVal > 25 && (
            <>
              <line
                x1={padL}
                y1={yPos(25)}
                x2={chartW - 8}
                y2={yPos(25)}
                stroke="#f59e0b"
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.4}
              />
              <text x={chartW - 10} y={yPos(25) - 3} fontSize={7} fill="#f59e0b" opacity={0.6} textAnchor="end">
                WHO 25
              </text>
            </>
          )}

          {/* Predicted line */}
          <path d={predictedLine} fill="none" stroke="#8b5cf6" strokeWidth={2} strokeLinejoin="round" />
          {/* Observed dashed line */}
          <path
            d={observedLine}
            fill="none"
            stroke="#22c55e"
            strokeWidth={2}
            strokeDasharray="5 3"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {periods.map((p, i) => (
            <g key={i}>
              <circle cx={xPos(i)} cy={yPos(p.predicted)} r={3} fill="#8b5cf6" />
              <circle cx={xPos(i)} cy={yPos(p.observed)} r={3} fill="#22c55e" />
              {/* X label */}
              <text
                x={xPos(i)}
                y={chartH - 4}
                fontSize={7}
                fill={p.isCurrent ? '#60a5fa' : 'rgba(255,255,255,0.35)'}
                textAnchor="middle"
              >
                {p.label.length > 12 ? p.label.slice(0, 12) + '…' : p.label}
              </text>
            </g>
          ))}
        </svg>
      )}

      {/* Period Cards */}
      {data && (
        <div className="mt-4 space-y-2">
          {data.validation_periods.map((p: ValidationPeriod, i) => {
            const delta = p.predicted_avg_no2 - p.observed_avg_no2;
            const absDelta = Math.abs(delta);
            const Icon = absDelta < 1 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
            const color =
              absDelta < 2 ? 'text-emerald-400' : absDelta < 5 ? 'text-amber-400' : 'text-red-400';
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-gray-900 dark:text-white text-xs font-semibold">{p.period_label}</span>
                  <div className={`flex items-center gap-1 ${color}`}>
                    <Icon className="w-3.5 h-3.5" />
                    <span className="font-mono text-xs font-bold">
                      {delta > 0 ? '+' : ''}{delta.toFixed(1)} µg/m³
                    </span>
                  </div>
                </div>
                <div className="flex gap-3 mt-2">
                  <div className="flex-1">
                    <div className="text-gray-500 text-[10px] mb-0.5">Predicted</div>
                    <div className="text-violet-600 dark:text-violet-400 font-mono text-xs font-bold">
                      {p.predicted_avg_no2} µg/m³
                    </div>
                    <ObservedModeledBadge source="modeled" size="sm" showIcon={false} className="mt-1" />
                  </div>
                  <div className="flex-1">
                    <div className="text-gray-500 text-[10px] mb-0.5">Observed</div>
                    <div className="text-emerald-600 dark:text-emerald-400 font-mono text-xs font-bold">
                      {p.observed_avg_no2} µg/m³
                    </div>
                    <ObservedModeledBadge source="observed" size="sm" showIcon={false} className="mt-1" />
                  </div>
                </div>
                <p className="text-gray-500 dark:text-gray-400 text-[11px] mt-2 leading-relaxed">{p.validation_note}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Methodology note */}
      {data && (
        <div className="mt-3 flex items-start gap-1.5">
          <Info className="w-3.5 h-3.5 text-gray-400 mt-0.5 flex-shrink-0" />
          <p className="text-gray-500 dark:text-gray-400 text-[11px] leading-relaxed">{data.methodology_note}</p>
        </div>
      )}

    </div>
  );
}
