/**
 * Client du worker de prédiction : instancie le Web Worker, transmet le réseau
 * routier et corrèle les requêtes/réponses de prédiction par identifiant.
 */
import type { LatLng } from '../types';
import type { RoadSegment, Prediction } from '../lib/roadGraph';
import type { WorkerRequest, WorkerResponse } from '../workers/messages';

const worker = new Worker(new URL('../workers/prediction.worker.ts', import.meta.url), {
  type: 'module',
});

let seq = 0;
const pending = new Map<number, (p: Prediction) => void>();
let readyListener: ((roads: number) => void) | null = null;

worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
  const msg = ev.data;
  if (msg.type === 'result') {
    pending.get(msg.id)?.(msg.prediction);
    pending.delete(msg.id);
  } else if (msg.type === 'ready') {
    readyListener?.(msg.roads);
  }
};

const send = (req: WorkerRequest) => worker.postMessage(req);

/** Transmet le réseau routier courant au worker (reconstruit le graphe). */
export function setRoads(roads: RoadSegment[]): void {
  send({ type: 'setRoads', roads });
}

/** Demande une prédiction ; résout avec le résultat du worker. */
export function query(pos: LatLng, heading: number, maxDist: number): Promise<Prediction> {
  const id = ++seq;
  return new Promise<Prediction>((resolve) => {
    pending.set(id, resolve);
    send({ type: 'query', id, pos, heading, maxDist });
  });
}

/** Notifié quand le graphe est (re)construit. */
export function onRoadsReady(cb: (roads: number) => void): void {
  readyListener = cb;
}
