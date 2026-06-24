import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { listTrips, deleteTrip, type Trip } from '../services/storageService';
import { tripStats } from '../lib/export';
import { fmtDuration, fmtDist, msToKmh } from '../lib/format';

/** Historique des trajets enregistrés : consultation, récap, suppression. */
export function HistoryView(): React.JSX.Element | null {
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const setSummaryTripId = useAppStore((s) => s.setSummaryTripId);
  const [trips, setTrips] = useState<Trip[]>([]);

  const refresh = () => void listTrips().then(setTrips);
  useEffect(() => {
    if (view === 'history') refresh();
  }, [view]);

  if (view !== 'history') return null;

  const remove = async (id: number) => {
    await deleteTrip(id);
    refresh();
  };

  return (
    <div className="history">
      <div className="history-head">
        <h2>Historique</h2>
        <button className="modal-close" onClick={() => setView('live')}>✕</button>
      </div>

      {trips.length === 0 && <p className="history-empty">Aucun trajet enregistré pour le moment.</p>}

      <div className="trip-list">
        {trips.map((t) => {
          const s = tripStats(t);
          return (
            <div className="trip-item" key={t.id}>
              <div className="trip-info" onClick={() => t.id != null && setSummaryTripId(t.id)}>
                <span className="trip-date">{new Date(t.startedAt).toLocaleString('fr-FR')}</span>
                <span className="trip-meta">
                  {fmtDist(t.distance)} · {fmtDuration(s.duration)} · max {msToKmh(s.maxSpeed)} km/h
                </span>
              </div>
              <button
                className="trip-del"
                onClick={() => t.id != null && void remove(t.id)}
                title="Supprimer"
              >
                🗑
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
