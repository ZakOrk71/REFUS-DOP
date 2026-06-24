/**
 * Trajet de démonstration (rejeu) traversant Chalon-sur-Saône : permet de
 * tester l'application sans bouger. Points approximatifs le long d'axes réels,
 * du quartier Prés Saint-Jean (ZUP) vers le centre puis Saint-Cosme.
 */
import type { LatLng } from '../types';

export const DEMO_TRACK: LatLng[] = [
  { lat: 46.79480, lng: 4.86540 },
  { lat: 46.79330, lng: 4.86260 },
  { lat: 46.79140, lng: 4.85950 },
  { lat: 46.78960, lng: 4.85700 },
  { lat: 46.78760, lng: 4.85520 },
  { lat: 46.78520, lng: 4.85380 },
  { lat: 46.78300, lng: 4.85320 },
  { lat: 46.78090, lng: 4.85290 },
  { lat: 46.78010, lng: 4.85010 },
  { lat: 46.78000, lng: 4.84700 },
  { lat: 46.77990, lng: 4.84400 },
  { lat: 46.78080, lng: 4.84150 },
  { lat: 46.78260, lng: 4.83980 },
  { lat: 46.78520, lng: 4.83900 },
];
