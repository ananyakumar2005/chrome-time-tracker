// lib/timeTracker.js
// Utility helpers for time formatting, calculations, and aggregation.

/**
 * Format elapsed seconds into compact human-readable text.
 * E.g., 3665s -> "1h 1m", 125s -> "2m", 45s -> "45s".
 */
export function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${s}s`;
}

/**
 * Convert seconds into decimal hours (e.g. 5400s -> 1.5).
 */
export function secondsToHours(seconds, precision = 1) {
  if (!seconds || seconds <= 0) return 0;
  return Number((seconds / 3600).toFixed(precision));
}

/**
 * Compute percentage share of a value out of a total.
 */
export function calculatePercentage(part, total) {
  if (!total || total <= 0) return 0;
  return Math.round((part / total) * 100);
}
