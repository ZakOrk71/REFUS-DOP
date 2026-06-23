import { useAppStore } from '../store/useAppStore';
import { requestCompassPermission } from '../hooks/useHeading';

/** Écran de démarrage : demande GPS + boussole dans le geste utilisateur. */
export function PermissionGate(): React.JSX.Element | null {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const setSessionActive = useAppStore((s) => s.setSessionActive);

  if (sessionActive) return null;

  const start = async () => {
    await requestCompassPermission(); // iOS : doit être dans le geste
    setSessionActive(true);
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
        <p className="gate-hint">
          À utiliser comme passager ou sur support — jamais en conduisant. La
          prédiction est une aide, pas une certitude.
        </p>
      </div>
    </div>
  );
}
