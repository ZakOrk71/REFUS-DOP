import { useAppStore } from '../store/useAppStore';

/** Boutons flottants (orientation, recentrage) + grand bouton DÉMARRER/ARRÊTER. */
export function SessionButton(): React.JSX.Element {
  const sessionActive = useAppStore((s) => s.sessionActive);
  const setSessionActive = useAppStore((s) => s.setSessionActive);
  const orientation = useAppStore((s) => s.orientation);
  const toggleOrientation = useAppStore((s) => s.toggleOrientation);
  const follow = useAppStore((s) => s.follow);
  const setFollow = useAppStore((s) => s.setFollow);
  const setView = useAppStore((s) => s.setView);

  return (
    <>
      <div className="float-controls">
        <button className="fbtn" onClick={() => setView('history')} title="Historique des trajets">
          🕘
        </button>
        <button
          className={`fbtn ${orientation === 'heading-up' ? 'on' : ''}`}
          onClick={toggleOrientation}
          title="Orientation de la carte"
        >
          {orientation === 'heading-up' ? '🧭' : '⬆'}
        </button>
        <button
          className={`fbtn ${follow ? 'on' : ''}`}
          onClick={() => setFollow(true)}
          title="Recentrer / suivre"
        >
          ⌖
        </button>
      </div>

      {sessionActive && (
        <button className="session-btn stop" onClick={() => setSessionActive(false)}>
          ■ ARRÊTER
        </button>
      )}
    </>
  );
}
