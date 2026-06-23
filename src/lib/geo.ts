/** Fonctions géographiques de base (WGS84, distances en mètres). */
import type { LatLng } from '../types';

const R = 6_371_000; // rayon terrestre moyen (m)
export const toRad = (d: number): number => (d * Math.PI) / 180;
export const toDeg = (r: number): number => (r * 180) / Math.PI;

/** Distance en mètres entre deux points (haversine). */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Cap (deg, 0 = Nord, sens horaire) du point a vers le point b. */
export function bearing(a: LatLng, b: LatLng): number {
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Point projeté à `dist` mètres dans la direction `brng` (deg). */
export function destination(p: LatLng, brng: number, dist: number): LatLng {
  const d = dist / R;
  const b = toRad(brng);
  const la1 = toRad(p.lat);
  const lo1 = toRad(p.lng);
  const la2 = Math.asin(
    Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b),
  );
  const lo2 =
    lo1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(la1),
      Math.cos(d) - Math.sin(la1) * Math.sin(la2),
    );
  return { lat: toDeg(la2), lng: ((toDeg(lo2) + 540) % 360) - 180 };
}

/** Différence angulaire signée minimale (−180..180). */
export function angleDiff(a: number, b: number): number {
  return ((b - a + 540) % 360) - 180;
}

/** Cap → point cardinal abrégé en français. */
export function cardinal(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[Math.round(deg / 45) % 8];
}

/** Interpolation linéaire entre deux positions (t ∈ [0,1]). */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Interpolation d'angles en tenant compte du passage 0/360. */
export function lerpAngle(a: number, b: number, t: number): number {
  return (a + angleDiff(a, b) * t + 360) % 360;
}
