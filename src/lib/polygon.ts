/** Test point-dans-polygone (lancer de rayon) pour la détection de quartier. */
import type { LatLng } from '../types';

/** Quartier sous forme de polygone (anneau extérieur). */
export interface NeighborhoodPoly {
  name: string;
  ring: LatLng[];
}

/** Vrai si le point est à l'intérieur de l'anneau (ray casting). */
export function pointInRing(p: LatLng, ring: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const yi = ring[i].lat, xi = ring[i].lng;
    const yj = ring[j].lat, xj = ring[j].lng;
    const intersect =
      yi > p.lat !== yj > p.lat &&
      p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Nom du premier quartier contenant le point, sinon null. */
export function quartierAt(p: LatLng, polys: NeighborhoodPoly[]): string | null {
  for (const poly of polys) if (pointInRing(p, poly.ring)) return poly.name;
  return null;
}
