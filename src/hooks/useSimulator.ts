import { useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { DEMO_TRACK } from '../data/demoTrack';
import { haversine, bearing, lerpLatLng } from '../lib/geo';
import type { LatLng } from '../types';

const TICK_MS = 1000;
const DEMO_SPEED = 13; // m/s (~47 km/h)

/**
 * Mode démo : rejoue une piste (intégrée ou GPX importé) en injectant des
 * points GPS simulés, pour tester l'app sans bouger. Interpole le long de la
 * trace à vitesse constante et calcule cap/vitesse.
 */
export function useSimulator(): void {
  const demoMode = useAppStore((s) => s.demoMode);
  const sessionActive = useAppStore((s) => s.sessionActive);
  const customTrack = useAppStore((s) => s.demoTrackPoints);
  const setFix = useAppStore((s) => s.setFix);
  const setCompass = useAppStore((s) => s.setCompass);
  const dist = useRef(0);

  useEffect(() => {
    if (!demoMode || !sessionActive) return;
    const track: LatLng[] = customTrack && customTrack.length > 1 ? customTrack : DEMO_TRACK;

    // Longueurs cumulées des segments.
    const segLen: number[] = [];
    let total = 0;
    for (let i = 0; i < track.length - 1; i++) {
      const d = haversine(track[i], track[i + 1]);
      segLen.push(d);
      total += d;
    }
    dist.current = 0;

    const id = window.setInterval(() => {
      dist.current = (dist.current + DEMO_SPEED * (TICK_MS / 1000)) % total;
      // Trouve le segment courant.
      let acc = 0;
      let i = 0;
      while (i < segLen.length && acc + segLen[i] < dist.current) {
        acc += segLen[i];
        i++;
      }
      if (i >= segLen.length) i = segLen.length - 1;
      const t = segLen[i] > 0 ? (dist.current - acc) / segLen[i] : 0;
      const pos = lerpLatLng(track[i], track[i + 1], t);
      const hdg = bearing(track[i], track[i + 1]);
      const now = Date.now();
      setCompass(hdg);
      setFix({ pos, raw: pos, accuracy: 6, speed: DEMO_SPEED, heading: hdg, timestamp: now });
    }, TICK_MS);

    return () => window.clearInterval(id);
  }, [demoMode, sessionActive, customTrack, setFix, setCompass]);
}

/** Parse un fichier GPX en liste de points (lat/lng). */
export function parseGpx(xml: string): LatLng[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const pts: LatLng[] = [];
  doc.querySelectorAll('trkpt, rtept, wpt').forEach((el) => {
    const lat = parseFloat(el.getAttribute('lat') ?? '');
    const lng = parseFloat(el.getAttribute('lon') ?? '');
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) pts.push({ lat, lng });
  });
  return pts;
}
