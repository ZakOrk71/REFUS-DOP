import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { GeoKalman } from '../lib/kalman';
import { bearing, haversine, destination } from '../lib/geo';
import type { GpsFix, LatLng } from '../types';

/**
 * Suit la position GPS quand la session est active : `watchPosition` haute
 * précision, lissage Kalman, calcul de vitesse/cap (avec repli sur le
 * déplacement réel quand le capteur ne les fournit pas).
 */
export function useGeolocation(): void {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const demoMode = useAppStore((s) => s.demoMode);
  const setFix = useAppStore((s) => s.setFix);
  const setGpsError = useAppStore((s) => s.setGpsError);

  const kalman = useRef(new GeoKalman(3));
  const prev = useRef<{ pos: LatLng; t: number } | null>(null);
  const lastFix = useRef<GpsFix | null>(null);

  useEffect(() => {
    if (!sessionActive || demoMode) return; // le mode démo pilote setFix lui-même
    if (!('geolocation' in navigator)) {
      setGpsError('Géolocalisation non supportée par ce navigateur.');
      return;
    }
    kalman.current.reset();
    prev.current = null;
    lastFix.current = null;

    const onPos = (p: GeolocationPosition) => {
      const { latitude, longitude, accuracy, speed, heading } = p.coords;
      const t = p.timestamp || Date.now();
      const raw: LatLng = { lat: latitude, lng: longitude };
      const pos = kalman.current.process(latitude, longitude, accuracy ?? 20, t);

      // Vitesse : capteur si dispo, sinon dérivée du déplacement lissé.
      let spd = typeof speed === 'number' && speed >= 0 ? speed : null;
      let moved = 0;
      if (prev.current) {
        moved = haversine(prev.current.pos, pos);
        const dt = (t - prev.current.t) / 1000;
        if (spd === null && dt > 0.2) spd = moved / dt;
      }
      if (spd === null) spd = 0;

      // Cap : capteur si on roule, sinon dérivé du déplacement.
      let hdg: number | null =
        typeof heading === 'number' && !Number.isNaN(heading) && spd > 1.2 ? heading : null;
      if (hdg === null && prev.current && moved > Math.max(5, (accuracy ?? 20) * 0.5)) {
        hdg = bearing(prev.current.pos, pos);
      }

      prev.current = { pos, t };
      const fix: GpsFix = { pos, raw, accuracy: accuracy ?? 0, speed: spd, heading: hdg, timestamp: t };
      lastFix.current = fix;
      setFix(fix);
    };

    const onErr = (e: GeolocationPositionError) => {
      const msgs: Record<number, string> = {
        1: "Localisation refusée. Autorise l'accès GPS dans les réglages du navigateur.",
        2: 'Position GPS indisponible (signal faible).',
        3: 'Signal GPS lent à arriver…',
      };
      setGpsError(msgs[e.code] ?? e.message);
    };

    const id = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 20000,
    });

    // Dead reckoning : en cas de perte de signal (> 2,5 s sans point réel),
    // on extrapole la position depuis le dernier cap et la dernière vitesse.
    const dr = window.setInterval(() => {
      const f = lastFix.current;
      if (!f || f.heading === null || f.speed < 1) return;
      const dt = (Date.now() - f.timestamp) / 1000;
      if (dt < 2.5) return;
      const pos = destination(f.pos, f.heading, f.speed * dt);
      setFix({ ...f, pos, raw: pos, accuracy: (f.accuracy || 15) + dt * 2, timestamp: Date.now() });
    }, 1000);

    return () => {
      navigator.geolocation.clearWatch(id);
      window.clearInterval(dr);
    };
  }, [sessionActive, demoMode, setFix, setGpsError]);
}
