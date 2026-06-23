/** Types partagés (stricts) de l'application. */

/** Coordonnée géographique. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** Point GPS brut + dérivés, tel que produit par useGeolocation. */
export interface GpsFix {
  pos: LatLng;          // position (lissée par Kalman)
  raw: LatLng;          // position brute du capteur
  accuracy: number;     // précision horizontale (m)
  speed: number;        // vitesse (m/s), >= 0
  heading: number | null; // cap GPS (deg, 0 = Nord), null si indéterminé
  timestamp: number;    // ms epoch
}

/** Quartier embarqué (jeu Chalon, source OSM). */
export interface Quartier {
  n: string;   // nom affiché
  y: number;   // latitude
  x: number;   // longitude
  w: number;   // importance : 3 grand quartier connu, 2 quartier, 1 lotissement/zone
}

/** Mode d'orientation de la carte. */
export type MapOrientation = 'heading-up' | 'north-up';
