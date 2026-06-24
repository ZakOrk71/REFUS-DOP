/**
 * Service OpenStreetMap via Overpass : récupération de la topologie routière
 * (avec sens uniques, accès, classes de voies) autour d'une position.
 * Plusieurs miroirs Overpass en repli, parsing en RoadSegment.
 */
import type { LatLng } from '../types';
import type { RoadSegment } from '../lib/roadGraph';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const DRIVABLE = new RegExp(
  '^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|' +
    'motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$',
);

interface OverpassWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Récupère les voies routières dans un rayon (m) autour du centre. */
export async function fetchRoads(center: LatLng, radius = 1500): Promise<RoadSegment[]> {
  const q = `[out:json][timeout:25];
    way(around:${radius},${center.lat},${center.lng})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"];
    out geom;`;
  const data = await overpass(q);
  if (!data) return [];
  return (data.elements as OverpassWay[])
    .filter((e) => e.type === 'way' && e.geometry && e.tags?.highway)
    .map(parseWay)
    .filter((r): r is RoadSegment => r !== null);
}

function parseWay(e: OverpassWay): RoadSegment | null {
  const t = e.tags ?? {};
  const cls = t.highway ?? '';
  if (!DRIVABLE.test(cls)) return null;

  let dir: 0 | 1 | -1 = 0;
  if (t.junction === 'roundabout' || t.oneway === 'yes' || t.oneway === 'true' || t.oneway === '1') dir = 1;
  else if (t.oneway === '-1' || t.oneway === 'reverse') dir = -1;

  const access = t.access ?? t.motor_vehicle ?? t.vehicle ?? '';
  const drivable = !(access === 'no' || access === 'private');

  return {
    id: e.id,
    name: t.name ?? t.ref ?? '',
    cls,
    dir,
    drivable,
    geom: (e.geometry ?? []).map((g) => ({ lat: g.lat, lng: g.lon }) as LatLng),
  };
}

interface OverpassPolyWay {
  type: 'way';
  id: number;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

/** Récupère les polygones de quartiers (voies fermées place=…) autour du centre. */
export async function fetchNeighborhoods(
  center: LatLng,
  radius = 4000,
): Promise<import('../lib/polygon').NeighborhoodPoly[]> {
  const q = `[out:json][timeout:25];
    way(around:${radius},${center.lat},${center.lng})[place~"^(suburb|quarter|neighbourhood)$"][name];
    out geom;`;
  const data = await overpass(q);
  if (!data) return [];
  return (data.elements as OverpassPolyWay[])
    .filter((e) => e.type === 'way' && e.geometry && e.geometry.length >= 4 && e.tags?.name)
    .map((e) => ({
      name: e.tags!.name,
      ring: e.geometry!.map((g) => ({ lat: g.lat, lng: g.lon })),
    }));
}

async function overpass(query: string): Promise<{ elements: unknown[] } | null> {
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(query) });
      if (!res.ok) continue;
      return (await res.json()) as { elements: unknown[] };
    } catch {
      /* miroir suivant */
    }
  }
  return null;
}
