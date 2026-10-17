/**
 * lib/format.ts — formatting utilities for wait ranges, timestamps, and occupancy levels.
 * DOC3 §3.3.
 */

export function formatWaitRange(range?: [number, number]): string {
  if (!range) return '-- min';
  const [min, max] = range;
  if (min === 0 && max === 0) return 'No wait';
  if (min === max) return `~${min} min`;
  return `~${min}–${max} min`;
}

export function formatClockTime(epochMs: number): string {
  if (!epochMs) return '';
  const date = new Date(epochMs);
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatSecondsAgo(epochMs: number): string {
  if (!epochMs) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - epochMs) / 1000));
  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  return `${diffMin}m ago`;
}
