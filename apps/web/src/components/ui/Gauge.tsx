import React from 'react';
import type { OccupancyLevel } from '@messpulse/shared';

interface GaugeProps {
  value: number;
  capacity: number;
  level: OccupancyLevel;
  className?: string;
}

export const Gauge: React.FC<GaugeProps> = ({
  value,
  capacity,
  level,
  className = '',
}) => {
  // Clamp percentage display for the stroke at 100% (DOC3 §3.3 overflow handling)
  const safeCapacity = capacity > 0 ? capacity : 1;
  const rawRatio = value / safeCapacity;
  const strokePercentage = Math.min(100, Math.max(0, Math.round(rawRatio * 100)));
  const displayPercentage = Math.max(0, Math.round(rawRatio * 100));

  // Color selection based on level
  const getColor = () => {
    switch (level) {
      case 'low':
        return {
          stroke: '#10b981', // emerald-500
          glow: 'rgba(16, 185, 129, 0.25)',
          text: 'text-emerald-400',
          bg: '#064e3b',
        };
      case 'medium':
        return {
          stroke: '#f59e0b', // amber-500
          glow: 'rgba(245, 158, 11, 0.25)',
          text: 'text-amber-400',
          bg: '#78350f',
        };
      case 'high':
      default:
        return {
          stroke: '#f43f5e', // rose-500
          glow: 'rgba(244, 63, 94, 0.25)',
          text: 'text-rose-400',
          bg: '#881337',
        };
    }
  };

  const { stroke, glow, text } = getColor();

  // SVG semi-circle arc math
  // Arc angle spans 220 degrees from 160 deg to 380 deg (-20 deg)
  const radius = 80;
  const circumference = 2 * Math.PI * radius;
  // Arc is ~220 degrees (61% of full circle)
  const arcLength = circumference * (220 / 360);
  const strokeDashoffset = arcLength - (arcLength * strokePercentage) / 100;

  return (
    <div className={`relative flex flex-col items-center justify-center ${className}`}>
      <svg
        className="w-56 h-48 overflow-visible"
        viewBox="0 0 200 170"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor={glow} />
          </filter>
        </defs>

        {/* Background Track Arc */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke="#1e293b"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          transform="rotate(160 100 100)"
        />

        {/* Dynamic Value Arc with Glow */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          stroke={stroke}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(160 100 100)"
          filter="url(#gauge-glow)"
          className="transition-all duration-700 ease-out"
        />
      </svg>

      {/* Center occupancy reading */}
      <div className="absolute top-16 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-extrabold tracking-tight text-white font-mono">
          {value}
        </span>
        <span className="text-xs uppercase font-medium tracking-wider text-slate-400 mt-0.5">
          of {capacity} seated
        </span>
        <span className={`text-sm font-bold mt-1 uppercase tracking-wider ${text}`}>
          {displayPercentage}% • {level}
        </span>
      </div>
    </div>
  );
};
