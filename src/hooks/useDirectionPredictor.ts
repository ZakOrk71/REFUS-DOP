import { useEffect, useRef } from 'react';
import { useAppStore, effectiveHeading } from '../store/useAppStore';
import { query } from '../services/predictionEngine';

/**
 * Interroge le worker de prédiction à chaque nouveau point GPS et met à jour le
 * store (rue courante, prédictions d'intersection, grand axe). La profondeur
 * d'analyse s'adapte à la vitesse (on regarde plus loin quand on roule vite).
 */
export function useDirectionPredictor(): void {
  const fix = useAppStore((s) => s.fix);
  const roadsLoaded = useAppStore((s) => s.roadsLoaded);
  const setPrediction = useAppStore((s) => s.setPrediction);
  const setCurrentStreet = useAppStore((s) => s.setCurrentStreet);
  const inFlight = useRef(false);

  useEffect(() => {
    if (!fix || roadsLoaded === 0) return;
    const heading = effectiveHeading(useAppStore.getState());
    if (heading === null) return;
    if (inFlight.current) return;

    inFlight.current = true;
    const maxDist = Math.max(500, Math.min(3000, fix.speed * 45));
    query(fix.pos, heading, maxDist)
      .then((prediction) => {
        setPrediction(prediction);
        setCurrentStreet(prediction.currentStreet);
      })
      .finally(() => {
        inFlight.current = false;
      });
  }, [fix, roadsLoaded, setPrediction, setCurrentStreet]);
}
