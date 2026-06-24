/**
 * Persistance IndexedDB via Dexie : cache du réseau routier (par cellule
 * géographique, pour l'offline-first) et stockage des trajets enregistrés.
 */
import Dexie, { type Table } from 'dexie';
import type { RoadSegment } from '../lib/roadGraph';
import type { LatLng } from '../types';

/** Cellule de cache routier (~2 km), clé = identifiant de cellule. */
export interface RoadCell {
  id: string;
  ts: number;
  roads: RoadSegment[];
}

/** Point enregistré d'un trajet. */
export interface TripPoint {
  t: number;        // horodatage (ms)
  lat: number;
  lng: number;
  speed: number;    // m/s
  heading: number | null;
}

/** Changement de rue ou de quartier horodaté. */
export interface TripChange {
  t: number;
  name: string;
}

/** Trajet enregistré. */
export interface Trip {
  id?: number;
  startedAt: number;
  endedAt: number | null;
  points: TripPoint[];
  streets: TripChange[];
  quartiers: TripChange[];
  distance: number;   // m
  maxSpeed: number;   // m/s
}

class RefusDB extends Dexie {
  roadCells!: Table<RoadCell, string>;
  trips!: Table<Trip, number>;

  constructor() {
    super('refus-dop');
    this.version(1).stores({
      roadCells: 'id, ts',
      trips: '++id, startedAt',
    });
  }
}

export const db = new RefusDB();

/** Taille de cellule en degrés (~2 km en latitude). */
const CELL = 0.02;
export function cellId(p: LatLng): string {
  return `${Math.round(p.lat / CELL)}_${Math.round(p.lng / CELL)}`;
}

/** Durée de validité d'une cellule en cache (7 jours). */
const CELL_TTL = 7 * 24 * 3600 * 1000;

export async function getCachedCell(id: string): Promise<RoadCell | undefined> {
  const cell = await db.roadCells.get(id);
  if (cell && Date.now() - cell.ts < CELL_TTL) return cell;
  return undefined;
}

export async function putCachedCell(id: string, roads: RoadSegment[]): Promise<void> {
  await db.roadCells.put({ id, ts: Date.now(), roads });
}
