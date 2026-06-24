import { useAppStore } from '../store/useAppStore';
import { msToKmh } from '../lib/format';

/** Surimpression permanente : vitesse, rue et quartier courants + erreurs GPS. */
export function Hud(): React.JSX.Element {
  const fix = useAppStore((s) => s.fix);
  const quartier = useAppStore((s) => s.currentQuartier);
  const nextQuartier = useAppStore((s) => s.nextQuartier);
  const street = useAppStore((s) => s.currentStreet);
  const gpsError = useAppStore((s) => s.gpsError);
  const sessionActive = useAppStore((s) => s.sessionActive);

  return (
    <div className="hud">
      <div className="hud-top">
        <div className="hud-card">
          <span className="hud-label">RUE ACTUELLE</span>
          <span className="hud-street">{street ?? '—'}</span>
        </div>
        <div className="hud-card">
          <span className="hud-label">QUARTIER</span>
          <span className="hud-quartier">{quartier ?? '—'}</span>
          {nextQuartier && <span className="hud-next">→ {nextQuartier}</span>}
        </div>
      </div>

      {sessionActive && (
        <div className="speedo">
          <span className="speedo-val">{fix ? msToKmh(fix.speed) : 0}</span>
          <span className="speedo-unit">km/h</span>
        </div>
      )}

      {gpsError && <div className="hud-error">{gpsError}</div>}
    </div>
  );
}
