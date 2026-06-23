import { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { QUARTIERS } from '../data/quartiers';
import { haversine } from '../lib/geo';
import type { LatLng } from '../types';

/**
 * Détection du quartier courant. Phase 1 : approximation par le quartier
 * embarqué le plus proche (pondéré par l'importance). Sera remplacé en Phase 4
 * par un vrai point-in-polygon sur les limites OSM (dans un Web Worker).
 */
export function useNeighborhood(): void {
  const fix = useAppStore((s) => s.fix);
  const setCurrentQuartier = useAppStore((s) => s.setCurrentQuartier);

  useEffect(() => {
    if (!fix) return;
    const q = nearestQuartier(fix.pos);
    setCurrentQuartier(q);
  }, [fix, setCurrentQuartier]);
}

function nearestQuartier(p: LatLng): string | null {
  let best: { n: string; score: number } | null = null;
  for (const q of QUARTIERS) {
    const d = haversine(p, { lat: q.y, lng: q.x });
    if (d > 1200) continue; // hors de portée d'un quartier
    // Plus proche + plus important = meilleur.
    const score = -d + q.w * 150;
    if (!best || score > best.score) best = { n: q.n, score };
  }
  return best?.n ?? null;
}
