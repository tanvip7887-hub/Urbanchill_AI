'use client';

import { motion } from 'framer-motion';
import { Eye, Cpu } from 'lucide-react';

type DataSource = 'observed' | 'modeled';

interface ObservedModeledBadgeProps {
  source: DataSource;
  size?: 'sm' | 'md';
  showIcon?: boolean;
  className?: string;
}

/**
 * ObservedModeledBadge — Shared badge component extending the existing
 * "Data Reliability" visual language.
 *
 * observed = raw data from sensors/reanalysis (satellite, weather API)
 * modeled  = ML classification, simulation output, source attribution
 *
 * Satisfies ENR-01: "Label observed vs. modeled at every stage"
 */
export default function ObservedModeledBadge({
  source,
  size = 'sm',
  showIcon = true,
  className = '',
}: ObservedModeledBadgeProps) {
  const isObserved = source === 'observed';

  const config = {
    observed: {
      label: 'Observed',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      text: 'text-emerald-400',
      dot: 'bg-emerald-400',
      Icon: Eye,
      tooltip: 'Raw data from sensors or reanalysis (CAMS/Open-Meteo)',
    },
    modeled: {
      label: 'Modelled',
      bg: 'bg-violet-500/10 border-violet-500/30',
      text: 'text-violet-400',
      dot: 'bg-violet-400',
      Icon: Cpu,
      tooltip: 'Derived via ML inference, simulation, or attribution model',
    },
  }[source];

  const sizeClasses = {
    sm: 'text-[10px] px-1.5 py-0.5 gap-1',
    md: 'text-xs px-2 py-1 gap-1.5',
  }[size];

  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      title={config.tooltip}
      className={`
        inline-flex items-center rounded-full border font-semibold uppercase tracking-wide
        ${config.bg} ${config.text} ${sizeClasses} ${className}
      `}
    >
      {showIcon && <config.Icon className={size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'} />}
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dot} ${
          isObserved ? 'animate-pulse' : ''
        }`}
      />
      {config.label}
    </motion.span>
  );
}
