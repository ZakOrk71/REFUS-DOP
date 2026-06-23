/** Configuration géographique : Chalon-sur-Saône par défaut. */
import type { LatLng } from '../types';

/** Centre de l'agglomération chalonnaise (vue initiale avant le 1er point GPS). */
export const CHALON_CENTER: LatLng = { lat: 46.7806, lng: 4.8537 };

/** Zoom initial de la carte. */
export const INITIAL_ZOOM = 15;

/** Bornes de zoom du suivi adaptatif (selon la vitesse). */
export const ZOOM_SLOW = 17.5; // arrêté / lent : on voit le détail des rues
export const ZOOM_FAST = 14.5; // rapide : on dézoome pour anticiper

/** Vitesse (m/s) à laquelle on atteint le zoom « rapide ». ~110 km/h. */
export const SPEED_FOR_MAX_DEZOOM = 30;
