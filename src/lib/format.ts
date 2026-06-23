/** Formatage d'affichage. */

/** m/s → km/h arrondi. */
export const msToKmh = (ms: number): number => Math.round(ms * 3.6);

/** Distance lisible (m ou km). */
export function fmtDist(m: number | null | undefined): string {
  if (m == null) return '';
  return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Durée lisible à partir de millisecondes. */
export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}
