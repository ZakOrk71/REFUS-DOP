import { useAppStore } from '../store/useAppStore';
import { turnLabel } from '../lib/turn';
import { fmtDist } from '../lib/format';

/**
 * Sorties probables à la prochaine intersection, avec pourcentage, sens du
 * virage et nom de la rue. Plus le grand axe vers lequel on se dirige.
 */
export function PredictionPanel(): React.JSX.Element | null {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const prediction = useAppStore((s) => s.prediction);
  const quartier = useAppStore((s) => s.currentQuartier);

  if (!sessionActive || !prediction) return null;
  const { exits, majorAxis, distanceToDecision } = prediction;

  return (
    <div className="predict">
      <div className="predict-head">
        <span className="predict-title">PROCHAINE INTERSECTION</span>
        {distanceToDecision != null && (
          <span className="predict-dist">{fmtDist(distanceToDecision)}</span>
        )}
      </div>

      {exits.length > 0 ? (
        <div className="exits">
          {exits.map((e, i) => {
            const t = turnLabel(e.turn);
            const pct = Math.round(e.prob * 100);
            return (
              <div className={`exit ${i === 0 ? 'top' : ''}`} key={`${e.street}-${i}`}>
                <span className="exit-icon">{t.icon}</span>
                <span className="exit-name">{e.street || 'voie sans nom'}</span>
                <span className="exit-pct">{pct}%</span>
                <span className="exit-bar" style={{ width: `${pct}%` }} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="exits-empty">Tout droit — pas d'intersection proche</div>
      )}

      {(majorAxis || quartier) && (
        <div className="predict-axis">
          {majorAxis && <span>→ {majorAxis}</span>}
          {quartier && <span className="predict-quartier">· {quartier}</span>}
        </div>
      )}
    </div>
  );
}
