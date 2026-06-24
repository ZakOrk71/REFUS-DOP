/// <reference lib="webworker" />
/**
 * Worker de prédiction : détient le réseau routier et le graphe, et répond aux
 * requêtes de prédiction. Tout le calcul lourd (construction du graphe,
 * recherche de plus proche segment, suivi d'itinéraire) reste hors du thread UI.
 */
import { buildGraph, predict, type RoadSegment, type RoadGraph } from '../lib/roadGraph';
import type { WorkerRequest, WorkerResponse } from './messages';

let roads: RoadSegment[] = [];
let graph: RoadGraph = new Map();

const post = (msg: WorkerResponse) => (self as DedicatedWorkerGlobalScope).postMessage(msg);

self.onmessage = (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'setRoads') {
    roads = msg.roads;
    graph = buildGraph(roads);
    post({ type: 'ready', roads: roads.length });
  } else if (msg.type === 'query') {
    if (!roads.length) {
      post({
        type: 'result',
        id: msg.id,
        prediction: { currentStreet: null, distanceToDecision: null, exits: [], nextStreets: [], majorAxis: null, poly: [msg.pos] },
      });
      return;
    }
    const prediction = predict(roads, graph, msg.pos, msg.heading, msg.maxDist);
    post({ type: 'result', id: msg.id, prediction });
  }
};
