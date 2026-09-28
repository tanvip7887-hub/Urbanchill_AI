'use client';

import { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Clock,
  Thermometer,
  Leaf,
  Building,
  AlertTriangle,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { fetchHistoricalTimeline, type TimelineYear } from '@/lib/apiClient';

interface TimeSliderBarProps {
  currentYear: number;
  onYearChange: (year: number) => void;
  cityName?: string;
  onClose?: () => void;
}

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

export default function TimeSliderBar({
  currentYear,
  onYearChange,
  cityName = 'Pune',
  onClose,
}: TimeSliderBarProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [timelineData, setTimelineData] = useState<TimelineYear[]>([]);

  useEffect(() => {
    let active = true;
    async function loadTimeline() {
      try {
        const data = await fetchHistoricalTimeline(cityName);
        if (active && Array.isArray(data) && data.length > 0) {
          setTimelineData(data);
        }
      } catch (e) {
        // Non-blocking
      }
    }
    loadTimeline();
    return () => { active = false; };
  }, [cityName]);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      onYearChange(currentYear >= 2026 ? 2018 : currentYear + 1);
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying, currentYear, onYearChange]);

  const yearData = timelineData.find((t) => t.year === currentYear);

  if (isCollapsed) {
    return (
      <div
        className="
          flex items-center gap-3 px-3.5 py-2 rounded-2xl
          bg-slate-900/95 dark:bg-gray-900/95 backdrop-blur-2xl
          border border-gray-700/80
          shadow-2xl text-gray-100
          pointer-events-auto select-none
          min-w-[300px] sm:min-w-[420px] max-w-[95vw]
          transition-all animate-in fade-in slide-in-from-bottom-2 duration-200
        "
        aria-label="Historical retrospective warming time slider (collapsed)"
      >
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          aria-label={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
          className="
            w-8 h-8 rounded-xl
            flex items-center justify-center
            shadow-xs bg-primary text-white hover:bg-primary/90 cursor-pointer shrink-0
          "
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
        </button>

        <button
          onClick={() => {
            setIsPlaying(false);
            onYearChange(2026);
          }}
          title="Reset to current year (2026)"
          aria-label="Reset timeline"
          className="
            w-8 h-8 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700
            flex items-center justify-center cursor-pointer transition-colors shrink-0
          "
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs font-bold text-primary font-mono">{currentYear}</span>
          {currentYear < 2026 && (
            <span className="text-[10px] text-emerald-400 font-semibold font-mono">
              ({((currentYear - 2026) * 0.32).toFixed(1)}°C)
            </span>
          )}
        </div>

        <div className="flex-1 min-w-[90px]">
          <input
            type="range"
            min={2018}
            max={2026}
            step={1}
            value={currentYear}
            onChange={(e) => {
              setIsPlaying(false);
              onYearChange(parseInt(e.target.value));
            }}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-700 accent-primary"
            aria-label="Year slider"
          />
        </div>

        <div className="flex items-center gap-1 shrink-0 border-l border-gray-700 pl-2">
          <button
            onClick={() => setIsCollapsed(false)}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Expand timeline panel"
            aria-label="Expand timeline panel"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Close timeline"
              aria-label="Close timeline"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="
        card card-border card-shadow
        flex flex-col gap-2.5 px-5 py-3 rounded-2xl
        bg-slate-900/95 dark:bg-gray-900/95 backdrop-blur-2xl
        border border-gray-700/80
        shadow-2xl text-gray-100
        pointer-events-auto select-none
        min-w-[320px] sm:min-w-[440px] md:min-w-[500px]
      "
      aria-label="Historical retrospective warming time slider"
    >
      {/* Header Row with Title, City, Minimize, and Close */}
      <div className="flex items-center justify-between pb-1 border-b border-gray-700/60">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-bold text-gray-200">
            Past Historical Trend
          </span>
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
            {cityName} • 2018–2026
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="p-1 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Minimize timeline to compact bar"
            aria-label="Minimize timeline"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Close yearly trend slider"
              aria-label="Close yearly trend slider"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
      {/* Live Past Yearly Data Analytics Card for Selected Year */}
      {yearData && (
        <div className="grid grid-cols-4 gap-2 px-3 py-2 rounded-xl bg-slate-800/80 border border-gray-700/80 text-center">
          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-gray-400 font-semibold block flex items-center justify-center gap-1">
              <Thermometer className="w-2.5 h-2.5 text-red-400" />
              <span>Surface Heat</span>
            </span>
            <span className="text-xs font-bold font-mono text-white">{yearData.avg_lst}°C</span>
            {currentYear < 2026 && (
              <span className="text-[8.5px] text-emerald-400 font-semibold block">
                {((yearData.avg_lst - (timelineData[timelineData.length - 1]?.avg_lst ?? 28.8))).toFixed(1)}°C vs 2026
              </span>
            )}
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-gray-400 font-semibold block flex items-center justify-center gap-1">
              <Leaf className="w-2.5 h-2.5 text-emerald-400" />
              <span>Canopy Cover</span>
            </span>
            <span className="text-xs font-bold font-mono text-emerald-400">{yearData.green_cover_percent}%</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-gray-400 font-semibold block flex items-center justify-center gap-1">
              <Building className="w-2.5 h-2.5 text-indigo-400" />
              <span>Built-Up Area</span>
            </span>
            <span className="text-xs font-bold font-mono text-indigo-300">{yearData.built_up_percent}%</span>
          </div>

          <div className="space-y-0.5">
            <span className="text-[9px] uppercase text-gray-400 font-semibold block flex items-center justify-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
              <span>Historical Risk</span>
            </span>
            <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-full inline-block ${
              yearData.heat_risk_level === 'Critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              yearData.heat_risk_level === 'High' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
              yearData.heat_risk_level === 'Moderate' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {yearData.heat_risk_level}
            </span>
          </div>
        </div>
      )}

      {/* Play Controls & Scrub Slider Row */}
      <div className="flex items-center gap-4">
        {/* Play/Pause & Reset Actions */}
        <div className="flex items-center gap-1.5 pr-3 border-r border-gray-700">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            aria-label={isPlaying ? 'Pause timeline animation' : 'Play timeline animation'}
            className="
              button button-solid w-9 h-9 rounded-xl
              flex items-center justify-center
              shadow-xs bg-primary text-white hover:bg-primary/90 cursor-pointer
            "
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              onYearChange(2026);
            }}
            title="Reset to current year (2026)"
            aria-label="Reset timeline"
            className="
              w-9 h-9 rounded-xl bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700
              flex items-center justify-center cursor-pointer transition-colors
            "
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Scrub Slider & Indicators */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-semibold text-gray-200">
              <Clock className="w-3.5 h-3.5 text-primary" /> Past Historical Trend
            </span>
            <span className="font-bold text-primary font-mono">
              Year {currentYear} {currentYear < 2026 && <span className="text-emerald-400 font-semibold text-[11px]">({((currentYear - 2026) * 0.32).toFixed(1)}°C)</span>}
            </span>
          </div>

          <input
            type="range"
            min={2018}
            max={2026}
            step={1}
            value={currentYear}
            onChange={(e) => {
              setIsPlaying(false);
              onYearChange(parseInt(e.target.value));
            }}
            className="w-full h-2 rounded-full appearance-none cursor-pointer bg-gray-700 accent-primary"
            aria-label="Historical retrospective year slider"
          />

          <div className="flex justify-between text-[10px] font-mono text-gray-400 font-medium">
            <span>2018</span>
            <span>2020</span>
            <span>2022</span>
            <span>2024</span>
            <span className="font-bold text-primary">2026</span>
          </div>
        </div>
      </div>

      <div className="text-[8.5px] text-gray-400 font-sans leading-tight border-t border-gray-800 pt-1">
        Reconstructed multi-year indicators anchored to real-time observations with IPCC urban expansion trajectory.
      </div>
    </div>
  );
}
