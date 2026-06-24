/** Types de messages échangés avec le Web Worker de prédiction. */
import type { RoadSegment, Prediction } from '../lib/roadGraph';
import type { LatLng } from '../types';

export type WorkerRequest =
  | { type: 'setRoads'; roads: RoadSegment[] }
  | { type: 'query'; id: number; pos: LatLng; heading: number; maxDist: number };

export type WorkerResponse =
  | { type: 'ready'; roads: number }
  | { type: 'result'; id: number; prediction: Prediction };
