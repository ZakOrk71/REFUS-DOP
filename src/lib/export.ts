/** Génération des exports d'un trajet : JSON, GPX et compte-rendu texte. */
import type { Trip, TripChange } from '../services/storageService';
import { fmtDuration, fmtDist, msToKmh } from './format';

const dt = (t: number) => new Date(t).toLocaleString('fr-FR');
const hm = (t: number) =>
  new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Durée moyenne par segment de rue (à partir des horodatages d'entrée). */
function segmentsWithDuration(changes: TripChange[], endedAt: number): { name: string; t: number; dur: number }[] {
  return changes.map((c, i) => {
    const next = i + 1 < changes.length ? changes[i + 1].t : endedAt;
    return { name: c.name, t: c.t, dur: next - c.t };
  });
}

export function tripStats(trip: Trip): {
  duration: number;
  avgSpeed: number; // m/s
  maxSpeed: number; // m/s
} {
  const end = trip.endedAt ?? (trip.points.at(-1)?.t ?? trip.startedAt);
  const duration = end - trip.startedAt;
  const avgSpeed = duration > 0 ? trip.distance / (duration / 1000) : 0;
  return { duration, avgSpeed, maxSpeed: trip.maxSpeed };
}

/** Export brut JSON. */
export function toJSON(trip: Trip): string {
  return JSON.stringify(trip, null, 2);
}

/** Export GPX (trace + horodatage). */
export function toGPX(trip: Trip): string {
  const pts = trip.points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lng.toFixed(6)}">` +
        `<time>${new Date(p.t).toISOString()}</time>` +
        `<speed>${p.speed.toFixed(2)}</speed></trkpt>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="REFUS-DOP" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><time>${new Date(trip.startedAt).toISOString()}</time></metadata>
  <trk>
    <name>Trajet ${dt(trip.startedAt)}</name>
    <trkseg>
${pts}
    </trkseg>
  </trk>
</gpx>`;
}

/** Compte-rendu texte copiable. */
export function toReport(trip: Trip): string {
  const end = trip.endedAt ?? (trip.points.at(-1)?.t ?? trip.startedAt);
  const s = tripStats(trip);
  const streets = segmentsWithDuration(trip.streets, end);

  const lines: string[] = [];
  lines.push('COMPTE-RENDU DE TRAJET — REFUS-DOP');
  lines.push('='.repeat(40));
  lines.push(`Début       : ${dt(trip.startedAt)}`);
  lines.push(`Fin         : ${dt(end)}`);
  lines.push(`Durée       : ${fmtDuration(s.duration)}`);
  lines.push(`Distance    : ${fmtDist(trip.distance)}`);
  lines.push(`Vitesse moy : ${msToKmh(s.avgSpeed)} km/h`);
  lines.push(`Vitesse max : ${msToKmh(s.maxSpeed)} km/h`);
  lines.push('');
  lines.push('RUES EMPRUNTÉES :');
  if (streets.length === 0) lines.push('  (aucune rue identifiée)');
  for (const st of streets) {
    lines.push(`  ${hm(st.t)}  ${st.name || 'voie sans nom'}  (${fmtDuration(st.dur)})`);
  }
  lines.push('');
  lines.push('QUARTIERS TRAVERSÉS :');
  if (trip.quartiers.length === 0) lines.push('  (aucun quartier identifié)');
  for (const q of trip.quartiers) lines.push(`  ${hm(q.t)}  ${q.name}`);
  return lines.join('\n');
}

/** Déclenche le téléchargement d'un fichier texte. */
export function download(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
