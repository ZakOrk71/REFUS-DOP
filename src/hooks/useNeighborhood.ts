import { useEffect, useRef } from 'react';
import { useAppStore, effectiveHeading } from '../store/useAppStore';
import { QUARTIERS } from '../data/quartiers';
import { haversine, destination } from '../lib/geo';
import { quartierAt, type NeighborhoodPoly } from '../lib/polygon';
import { fetchNeighborhoods } from '../services/osmService';
import type { LatLng } from '../types';

/**
 * Détection du quartier courant et du prochain quartier (selon le cap).
 * Utilise les polygones OSM (point-in-polygon) quand ils sont chargés, avec
 * repli sur le jeu de quartiers embarqué (proximité pondérée par l'importance).
 * Le nombre de polygones reste faible : le calcul est négligeable côté UI.
 */
export function useNeighborhood(): void {
  const fix = useAppStore((s) => s.fix);
  const setCurrentQuartier = useAppStore((s) => s.setCurrentQuartier);
  const setNextQuartier = useAppStore((s) => s.setNextQuartier);

  const polys = useRef<NeighborhoodPoly[]>([]);
  const loadedCenter = useRef<LatLng | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    if (!fix) return;

    // Charge/rafraîchit les polygones quand on a bougé de > 2 km.
    if (!loadedCenter.current || haversine(loadedCenter.current, fix.pos) > 2000) {
      if (!busy.current) {
        busy.current = true;
        loadedCenter.current = fix.pos;
        void fetchNeighborhoods(fix.pos, 5000)
          .then((p) => { if (p.length) polys.current = p; })
          .finally(() => { busy.current = false; });
      }
    }

    const current = detect(fix.pos, polys.current);
    setCurrentQuartier(current);

    // Prochain quartier : on projette devant selon le cap et on cherche un
    // quartier différent de l'actuel.
    const heading = effectiveHeading(useAppStore.getState());
    if (heading !== null) {
      const reach = Math.max(400, Math.min(2500, fix.speed * 50 + 400));
      const ahead = destination(fix.pos, heading, reach);
      const next = detect(ahead, polys.current);
      setNextQuartier(next && next !== current ? next : null);
    }
  }, [fix, setCurrentQuartier, setNextQuartier]);
}

/** Quartier au point donné : polygone si possible, sinon plus proche embarqué. */
function detect(p: LatLng, polys: NeighborhoodPoly[]): string | null {
  const byPoly = polys.length ? quartierAt(p, polys) : null;
  if (byPoly) return byPoly;
  return nearestQuartier(p);
}

function nearestQuartier(p: LatLng): string | null {
  let best: { n: string; score: number } | null = null;
  for (const q of QUARTIERS) {
    const d = haversine(p, { lat: q.y, lng: q.x });
    if (d > 1200) continue;
    const score = -d + q.w * 150;
    if (!best || score > best.score) best = { n: q.n, score };
  }
  return best?.n ?? null;
}
