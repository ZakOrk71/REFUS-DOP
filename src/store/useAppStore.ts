import { create } from 'zustand';
import type { GpsFix, MapOrientation } from '../types';

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

  /** Quartier courant (détecté). */
  currentQuartier: string | null;
  /** Rue courante (renseignée en Phase 3). */
  currentStreet: string | null;

  // Actions
  setSessionActive: (v: boolean) => void;
  setFix: (fix: GpsFix) => void;
  setCompass: (heading: number) => void;
  setGpsError: (msg: string | null) => void;
  setOrientation: (o: MapOrientation) => void;
  toggleOrientation: () => void;
  setFollow: (v: boolean) => void;
  setCurrentQuartier: (q: string | null) => void;
  setCurrentStreet: (s: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sessionActive: false,
  fix: null,
  compassHeading: null,
  compassAt: 0,
  gpsError: null,
  orientation: 'heading-up',
  follow: true,
  currentQuartier: null,
  currentStreet: null,

  setSessionActive: (v) => set({ sessionActive: v }),
  setFix: (fix) => set({ fix, gpsError: null }),
  setCompass: (heading) => set({ compassHeading: heading, compassAt: Date.now() }),
  setGpsError: (msg) => set({ gpsError: msg }),
  setOrientation: (orientation) => set({ orientation }),
  toggleOrientation: () =>
    set((s) => ({ orientation: s.orientation === 'heading-up' ? 'north-up' : 'heading-up' })),
  setFollow: (follow) => set({ follow }),
  setCurrentQuartier: (currentQuartier) => set({ currentQuartier }),
  setCurrentStreet: (currentStreet) => set({ currentStreet }),
}));

/**
 * Cap effectif : boussole si récente (< 3 s), sinon cap GPS. Utilitaire pur
 * (pas un hook) pour pouvoir être appelé dans une boucle d'animation.
 */
export function effectiveHeading(s: AppState): number | null {
  if (s.compassHeading !== null && Date.now() - s.compassAt < 3000) return s.compassHeading;
  return s.fix?.heading ?? null;
}
