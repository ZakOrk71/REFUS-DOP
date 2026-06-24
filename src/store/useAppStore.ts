import { create } from 'zustand';
import type { GpsFix, MapOrientation, LatLng } from '../types';
import type { Prediction } from '../lib/roadGraph';

interface AppState {
  /** Suivi GPS actif (session démarrée). */
  sessionActive: boolean;
  /** Dernier point GPS lissé. */
  fix: GpsFix | null;
  /** Cap boussole (deg) ou null. */
  compassHeading: number | null;
  /** Horodatage du dernier relevé boussole (ms). */
  compassAt: number;
  /** Message d'erreur GPS éventuel. */
  gpsError: string | null;

  /** Orientation de la carte. */
  orientation: MapOrientation;
  /** Caméra qui suit le véhicule. */
  follow: boolean;

  /** Mode démo (rejeu d'un trajet simulé, sans GPS réel). */
  demoMode: boolean;
  /** Points d'un GPX importé pour le rejeu (sinon piste de démo intégrée). */
  demoTrackPoints: LatLng[] | null;

  /** Vue active de l'application. */
  view: 'live' | 'history';
  /** Trajet dont on affiche le récapitulatif (null = aucun). */
  summaryTripId: number | null;

  /** Quartier courant (détecté). */
  currentQuartier: string | null;
  /** Prochain quartier probable (selon le cap). */
  nextQuartier: string | null;
  /** Rue courante (issue du moteur de prédiction). */
  currentStreet: string | null;
  /** Dernière prédiction calculée par le worker. */
  prediction: Prediction | null;
  /** Nombre de voies chargées dans le graphe routier. */
  roadsLoaded: number;

  // Actions
  setSessionActive: (v: boolean) => void;
  setFix: (fix: GpsFix) => void;
  setCompass: (heading: number) => void;
  setGpsError: (msg: string | null) => void;
  setOrientation: (o: MapOrientation) => void;
  toggleOrientation: () => void;
  setFollow: (v: boolean) => void;
  setCurrentQuartier: (q: string | null) => void;
  setNextQuartier: (q: string | null) => void;
  setCurrentStreet: (s: string | null) => void;
  setPrediction: (p: Prediction | null) => void;
  setRoadsLoaded: (n: number) => void;
  setView: (v: 'live' | 'history') => void;
  setSummaryTripId: (id: number | null) => void;
  setDemoMode: (v: boolean) => void;
  setDemoTrackPoints: (pts: LatLng[] | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionActive: false,
  fix: null,
  compassHeading: null,
  compassAt: 0,
  gpsError: null,
  orientation: 'heading-up',
  follow: true,
  view: 'live',
  summaryTripId: null,
  demoMode: false,
  demoTrackPoints: null,
  currentQuartier: null,
  nextQuartier: null,
  currentStreet: null,
  prediction: null,
  roadsLoaded: 0,

  setSessionActive: (v) => set({ sessionActive: v }),
  setFix: (fix) => set({ fix, gpsError: null }),
  setCompass: (heading) => set({ compassHeading: heading, compassAt: Date.now() }),
  setGpsError: (msg) => set({ gpsError: msg }),
  setOrientation: (orientation) => set({ orientation }),
  toggleOrientation: () =>
    set((s) => ({ orientation: s.orientation === 'heading-up' ? 'north-up' : 'heading-up' })),
  setFollow: (follow) => set({ follow }),
  setCurrentQuartier: (currentQuartier) => set({ currentQuartier }),
  setNextQuartier: (nextQuartier) => set({ nextQuartier }),
  setCurrentStreet: (currentStreet) => set({ currentStreet }),
  setPrediction: (prediction) => set({ prediction }),
  setRoadsLoaded: (roadsLoaded) => set({ roadsLoaded }),
  setView: (view) => set({ view }),
  setSummaryTripId: (summaryTripId) => set({ summaryTripId }),
  setDemoMode: (demoMode) => set({ demoMode }),
  setDemoTrackPoints: (demoTrackPoints) => set({ demoTrackPoints }),
}));

/**
 * Cap effectif : boussole si récente (< 3 s), sinon cap GPS. Utilitaire pur
 * (pas un hook) pour pouvoir être appelé dans une boucle d'animation.
 */
export function effectiveHeading(s: AppState): number | null {
  if (s.compassHeading !== null && Date.now() - s.compassAt < 3000) return s.compassHeading;
  return s.fix?.heading ?? null;
}
