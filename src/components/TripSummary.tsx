import { useEffect, useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { getTrip, type Trip } from '../services/storageService';
import { tripStats, toJSON, toGPX, toReport, download } from '../lib/export';
import { fmtDuration, fmtDist, msToKmh } from '../lib/format';

/** Récapitulatif d'un trajet (fin de course ou depuis l'historique) + exports. */
export function TripSummary(): React.JSX.Element | null {
  const summaryTripId = useAppStore((s) => s.summaryTripId);
  const setSummaryTripId = useAppStore((s) => s.setSummaryTripId);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (summaryTripId == null) { setTrip(null); return; }
    void getTrip(summaryTripId).then((t) => setTrip(t ?? null));
  }, [summaryTripId]);

  if (summaryTripId == null || !trip) return null;
  const s = tripStats(trip);
  const end = trip.endedAt ?? trip.startedAt;
  const fname = `trajet-${new Date(trip.startedAt).toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(toReport(trip));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      download(`${fname}.txt`, toReport(trip));
    }
  };

  return (
    <div className="modal">
      <div className="modal-card">
        <div className="modal-head">
          <h2>Récapitulatif</h2>
          <button className="modal-close" onClick={() => setSummaryTripId(null)}>✕</button>
        </div>

        <div className="stats-grid">
          <Stat k="Durée" v={fmtDuration(s.duration)} />
          <Stat k="Distance" v={fmtDist(trip.distance)} />
          <Stat k="Vit. moy." v={`${msToKmh(s.avgSpeed)} km/h`} />
          <Stat k="Vit. max" v={`${msToKmh(s.maxSpeed)} km/h`} />
        </div>

        <div className="recap-section">
          <h3>Rues empruntées ({trip.streets.length})</h3>
          <ol className="recap-list">
            {trip.streets.map((st, i) => {
              const next = i + 1 < trip.streets.length ? trip.streets[i + 1].t : end;
              return (
                <li key={`${st.t}-${i}`}>
                  <span className="recap-time">{hm(st.t)}</span>
                  <span className="recap-name">{st.name || 'voie sans nom'}</span>
                  <span className="recap-dur">{fmtDuration(next - st.t)}</span>
                </li>
              );
            })}
            {trip.streets.length === 0 && <li className="recap-empty">Aucune rue identifiée</li>}
          </ol>
        </div>

        <div className="recap-section">
          <h3>Quartiers traversés ({trip.quartiers.length})</h3>
          <div className="chips">
            {trip.quartiers.map((q, i) => <span className="chip" key={`${q.t}-${i}`}>{q.name}</span>)}
            {trip.quartiers.length === 0 && <span className="recap-empty">Aucun quartier identifié</span>}
          </div>
        </div>

        <div className="export-row">
          <button onClick={() => void copyReport()}>{copied ? '✓ Copié' : '📋 Compte-rendu'}</button>
          <button onClick={() => download(`${fname}.txt`, toReport(trip))}>Texte</button>
          <button onClick={() => download(`${fname}.gpx`, toGPX(trip), 'application/gpx+xml')}>GPX</button>
          <button onClick={() => download(`${fname}.json`, toJSON(trip), 'application/json')}>JSON</button>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="stat-box">
      <span className="stat-k">{k}</span>
      <span className="stat-v">{v}</span>
    </div>
  );
}

const hm = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
