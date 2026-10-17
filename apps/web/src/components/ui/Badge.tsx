import React from 'react';
import { Activity, AlertTriangle, CheckCircle2, Clock, Moon } from 'lucide-react';

export type BadgeVariant =
  | 'low'
  | 'medium'
  | 'high'
  | 'live'
  | 'estimated'
  | 'closed'
  | 'warning'
  | 'neutral';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  icon?: boolean;
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  children,
  icon = true,
  className = '',
  title,
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'low':
        return {
          bg: 'bg-emerald-950/70 border-emerald-500/30 text-emerald-300',
          Icon: CheckCircle2,
        };
      case 'medium':
        return {
          bg: 'bg-amber-950/70 border-amber-500/30 text-amber-300',
          Icon: Clock,
        };
      case 'high':
        return {
          bg: 'bg-rose-950/70 border-rose-500/30 text-rose-300',
          Icon: AlertTriangle,
        };
      case 'live':
        return {
          bg: 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300',
          Icon: Activity,
        };
      case 'estimated':
        return {
          bg: 'bg-amber-950/80 border-amber-500/40 text-amber-300',
          Icon: AlertTriangle,
        };
      case 'closed':
        return {
          bg: 'bg-slate-900/80 border-slate-700/50 text-slate-400',
          Icon: Moon,
        };
      case 'warning':
        return {
          bg: 'bg-amber-950/70 border-amber-500/30 text-amber-300',
          Icon: AlertTriangle,
        };
      default:
        return {
          bg: 'bg-slate-800/60 border-slate-700/50 text-slate-300',
          Icon: null,
        };
    }
  };

  const { bg, Icon } = getStyles();

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide border shadow-sm ${bg} ${className}`}
    >
      {icon && Icon && <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
      {variant === 'live' && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
      )}
      <span>{children}</span>
    </span>
  );
};
