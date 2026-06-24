import { useRef } from 'react';
import { useAppStore } from '../store/useAppStore';
import { requestCompassPermission } from '../hooks/useHeading';
import { parseGpx } from '../hooks/useSimulator';

/** Écran de démarrage : demande GPS + boussole dans le geste utilisateur. */
export function PermissionGate(): React.JSX.Element | null {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const setSessionActive = useAppStore((s) => s.setSessionActive);
  const setDemoMode = useAppStore((s) => s.setDemoMode);
  const setDemoTrackPoints = useAppStore((s) => s.setDemoTrackPoints);
  const fileRef = useRef<HTMLInputElement | null>(null);

  if (sessionActive) return null;

  const start = async () => {
    await requestCompassPermission(); // iOS : doit être dans le geste
    setSessionActive(true);
  };

  const startDemo = (points: ReturnType<typeof parseGpx> | null) => {
    setDemoTrackPoints(points && points.length > 1 ? points : null);
    setDemoMode(true);
    setSessionActive(true);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const pts = parseGpx(await file.text());
    startDemo(pts);
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>REFUS-DOP</h1>
        <p className="gate-sub">Assistant de poursuite — Chalon-sur-Saône</p>
        <p className="gate-desc">
          Suivi GPS temps réel, prédiction des prochaines rues et enregistrement
          du trajet. Autorise la <strong>localisation</strong> et la{' '}
          <strong>boussole</strong> quand le navigateur le demande.
        </p>
        <button className="session-btn start" onClick={() => void start()}>
          ▶ DÉMARRER LE SUIVI
        </button>

        <div className="gate-demo">
          <button className="gate-demo-btn" onClick={() => startDemo(null)}>
            ▶ Mode démo (rejeu)
          </button>
          <button className="gate-demo-btn" onClick={() => fileRef.current?.click()}>
            ↥ Rejouer un GPX
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".gpx,application/gpx+xml,application/xml"
            style={{ display: 'none' }}
            onChange={(e) => void onFile(e)}
          />
        </div>

        <p className="gate-hint">
          À utiliser comme passager ou sur support — jamais en conduisant. La
          prédiction est une aide, pas une certitude. Le mode démo permet de
          tester sans bouger.
        </p>
      </div>
    </div>
  );
}
