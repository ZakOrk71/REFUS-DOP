import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { addTrip, type Trip } from '../services/storageService';
import { haversine } from '../lib/geo';
import type { GpsFix } from '../types';

/**
 * Enregistre automatiquement le trajet pendant une session : polyligne
 * horodatée, distance, vitesse max, et journal des changements de rue et de
 * quartier. À l'arrêt, sauvegarde en IndexedDB et ouvre le récapitulatif.
 */
export function useTripRecorder(): void {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const fix = useAppStore((s) => s.fix);
  const setSummaryTripId = useAppStore((s) => s.setSummaryTripId);

  const trip = useRef<Trip | null>(null);
  const lastPoint = useRef<GpsFix | null>(null);

  // Démarrage / arrêt de session.
  useEffect(() => {
    if (sessionActive) {
      trip.current = {
        startedAt: Date.now(),
        endedAt: null,
        points: [],
        streets: [],
        quartiers: [],
        distance: 0,
        maxSpeed: 0,
      };
      lastPoint.current = null;
    } else if (trip.current) {
      // Finalisation : on sauvegarde si le trajet contient des points.
      const t = trip.current;
      trip.current = null;
      if (t.points.length > 1) {
        t.endedAt = Date.now();
        void addTrip(t).then((id) => setSummaryTripId(id));
      }
    }
  }, [sessionActive, setSummaryTripId]);

  // Accumulation des points pendant la session.
  useEffect(() => {
    const t = trip.current;
    if (!sessionActive || !t || !fix) return;

    if (lastPoint.current) {
      t.distance += haversine(lastPoint.current.pos, fix.pos);
    }
    lastPoint.current = fix;
    t.maxSpeed = Math.max(t.maxSpeed, fix.speed);
    t.points.push({ t: fix.timestamp, lat: fix.pos.lat, lng: fix.pos.lng, speed: fix.speed, heading: fix.heading });

    // Journalise les changements de rue / quartier.
    const { currentStreet, currentQuartier } = useAppStore.getState();
    const lastStreet = t.streets.at(-1)?.name ?? null;
    if (currentStreet && currentStreet !== lastStreet) {
      t.streets.push({ t: fix.timestamp, name: currentStreet });
    }
    const lastQuartier = t.quartiers.at(-1)?.name ?? null;
    if (currentQuartier && currentQuartier !== lastQuartier) {
      t.quartiers.push({ t: fix.timestamp, name: currentQuartier });
    }
  }, [fix, sessionActive]);
}
