import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { fetchRoads } from '../services/osmService';
import { setRoads, onRoadsReady } from '../services/predictionEngine';
import { getCachedCell, putCachedCell, cellId } from '../services/storageService';
import { destination } from '../lib/geo';
import type { RoadSegment } from '../lib/roadGraph';
import type { LatLng } from '../types';

/**
 * Charge et met en cache le réseau routier autour de la position (offline-first
 * via Dexie), avec préchargement de la cellule située devant le véhicule pour ne
 * pas dépendre du réseau en pleine course. Pousse l'ensemble vers le worker.
 */
export function useRoadGraph(): void {
  const fix = useAppStore((s) => s.fix);
  const setRoadsLoaded = useAppStore((s) => s.setRoadsLoaded);

  const loadedCells = useRef(new Set<string>());
  const roadsById = useRef(new Map<number, RoadSegment>());
  const busy = useRef(false);

  useEffect(() => {
    onRoadsReady((n) => setRoadsLoaded(n));
  }, [setRoadsLoaded]);

  useEffect(() => {
    if (!fix) return;
    // Cellule courante + cellule devant (préchargement selon le cap).
    const ahead: LatLng = fix.heading !== null ? destination(fix.pos, fix.heading, 1500) : fix.pos;
    const targets = [fix.pos, ahead];

    const run = async () => {
      if (busy.current) return;
      busy.current = true;
      let changed = false;
      try {
        for (const t of targets) {
          const id = cellId(t);
          if (loadedCells.current.has(id)) continue;
          loadedCells.current.add(id);

          // 1) cache Dexie d'abord (offline-first)
          let roads: RoadSegment[] | null = (await getCachedCell(id))?.roads ?? null;
          // 2) sinon réseau (Overpass) puis mise en cache
          if (!roads) {
            roads = await fetchRoads(t, 1600);
            if (roads.length) await putCachedCell(id, roads);
          }
          if (roads && roads.length) {
            for (const r of roads) roadsById.current.set(r.id, r);
            changed = true;
          }
        }
        if (changed) setRoads([...roadsById.current.values()]);
      } finally {
        busy.current = false;
      }
    };
    void run();
  }, [fix]);
}
