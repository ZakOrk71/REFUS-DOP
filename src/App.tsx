import { MapView } from './components/MapView';
import { Hud } from './components/Hud';
import { PredictionPanel } from './components/PredictionPanel';
import { SessionButton } from './components/SessionButton';
import { PermissionGate } from './components/PermissionGate';
import { useGeolocation } from './hooks/useGeolocation';
import { useHeading } from './hooks/useHeading';
import { useWakeLock } from './hooks/useWakeLock';
import { useNeighborhood } from './hooks/useNeighborhood';
import { useRoadGraph } from './hooks/useRoadGraph';
import { useDirectionPredictor } from './hooks/useDirectionPredictor';
import { useAppStore } from './store/useAppStore';

export default function App(): React.JSX.Element {
  const sessionActive = useAppStore((s) => s.sessionActive);

  // Capteurs et dérivés (actifs selon la session).
  useGeolocation();
  useHeading();
  useNeighborhood();
  useRoadGraph();
  useDirectionPredictor();
  useWakeLock(sessionActive);

  return (
    <div className="app">
      <MapView />
      <Hud />
      <PredictionPanel />
      <SessionButton />
      <PermissionGate />
    </div>
  );
}
