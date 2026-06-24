/**
 * Graphe routier et moteur de prédiction (code pur, exécutable dans un Web
 * Worker). Construit un graphe nœuds/arêtes à partir des voies OSM, suit
 * l'itinéraire le plus probable et calcule, à la prochaine intersection, la
 * probabilité de chaque sortie autorisée (sens uniques et accès respectés).
 */
import type { LatLng } from '../types';
import { bearing, haversine, angleDiff, toRad } from './geo';

/** Voie routière issue d'OSM. */
export interface RoadSegment {
  id: number;
  name: string;
  cls: string;          // valeur highway
  dir: 0 | 1 | -1;      // sens autorisé : 0 double, 1 sens du tracé, -1 inverse
  drivable: boolean;    // accès véhicule motorisé autorisé
  geom: LatLng[];
}

interface Edge {
  to: string;           // clé du nœud d'arrivée
  p: LatLng;
  name: string;
  cls: string;
  brng: number;         // cap de cette arête (deg)
  legal: boolean;       // circulation autorisée dans ce sens (sens unique)
  drivable: boolean;    // accès véhicule
}
interface GraphNode {
  p: LatLng;
  edges: Edge[];
}
export type RoadGraph = Map<string, GraphNode>;

/** Une sortie possible à une intersection, avec sa probabilité. */
export interface Exit {
  street: string;
  turn: number;         // angle signé (deg) : <0 gauche, >0 droite
  prob: number;         // 0..1
  legal: boolean;
}

/** Résultat de prédiction renvoyé par le worker. */
export interface Prediction {
  currentStreet: string | null;
  distanceToDecision: number | null;  // distance (m) à la prochaine intersection
  exits: Exit[];                       // sorties triées par probabilité décroissante
  nextStreets: string[];               // suite des rues de l'itinéraire le plus probable
  majorAxis: string | null;            // grand axe vers lequel on se dirige
  poly: LatLng[];                      // géométrie de l'itinéraire probable
}

const CLASS_RANK: Record<string, number> = {
  motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3,
  motorway_link: 6, trunk_link: 5, primary_link: 4, secondary_link: 3,
  unclassified: 2, residential: 1, living_street: 1,
};
function nameBonus(name: string): number {
  return /(avenue|boulevard|^cours| cours |quai|route|rocade|p[eé]riph|voie|pont)/i.test(name) ? 2 : 0;
}
export function roadScore(cls: string, name: string): number {
  return (CLASS_RANK[cls] ?? 1) + nameBonus(name);
}

const key = (p: LatLng): string => p.lat.toFixed(6) + ',' + p.lng.toFixed(6);

/** Construit le graphe à partir des voies (arêtes orientées + légalité). */
export function buildGraph(roads: RoadSegment[]): RoadGraph {
  const g: RoadGraph = new Map();
  const add = (a: LatLng, b: LatLng, r: RoadSegment, legal: boolean) => {
    const ka = key(a);
    let node = g.get(ka);
    if (!node) { node = { p: a, edges: [] }; g.set(ka, node); }
    node.edges.push({ to: key(b), p: b, name: r.name, cls: r.cls, brng: bearing(a, b), legal, drivable: r.drivable });
  };
  for (const r of roads)
    for (let i = 0; i < r.geom.length - 1; i++) {
      add(r.geom[i], r.geom[i + 1], r, r.dir !== -1);
      add(r.geom[i + 1], r.geom[i], r, r.dir !== 1);
    }
  return g;
}

/** Distance point→segment (m) en repère local. */
function pointToSegment(p: LatLng, a: LatLng, b: LatLng): number {
  const mLat = 111320, mLon = 111320 * Math.cos(toRad(p.lat));
  const ax = (a.lng - p.lng) * mLon, ay = (a.lat - p.lat) * mLat;
  const bx = (b.lng - p.lng) * mLon, by = (b.lat - p.lat) * mLat;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : (-ax * dx - ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

/** Voie la plus proche de la position (la rue où l'on roule). */
function nearestSegment(roads: RoadSegment[], pos: LatLng): { a: LatLng; b: LatLng; name: string; cls: string } | null {
  let best: { a: LatLng; b: LatLng; name: string; cls: string; d: number } | null = null;
  for (const r of roads)
    for (let i = 0; i < r.geom.length - 1; i++) {
      const d = pointToSegment(pos, r.geom[i], r.geom[i + 1]);
      if (!best || d < best.d) best = { a: r.geom[i], b: r.geom[i + 1], name: r.name, cls: r.cls, d };
    }
  return best && best.d < 60 ? best : null;
}

/** Sorties autorisées d'un nœud (hors marche arrière, sens interdits, non motorisé). */
function legalExits(node: GraphNode, fromKey: string, inBrng: number): Edge[] {
  const out: Edge[] = [];
  const seen = new Set<string>();
  for (const e of node.edges) {
    if (e.to === fromKey) continue;            // pas de demi-tour direct
    if (!e.legal || !e.drivable) continue;     // sens interdit / accès interdit
    if (Math.abs(angleDiff(inBrng, e.brng)) > 160) continue;
    const k = e.name + '|' + e.to;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/** Probabilités softmax sur les sorties (inertie + hiérarchie + alignement). */
function probabilities(exits: Edge[], inBrng: number): { e: Edge; turn: number; prob: number }[] {
  const scored = exits.map((e) => {
    const turn = angleDiff(inBrng, e.brng);
    const align = 1 - Math.abs(turn) / 180;                 // inertie / alignement
    const hier = (CLASS_RANK[e.cls] ?? 1) / 7;              // hiérarchie de la voie
    const score = 2.4 * align + 1.3 * hier + 0.4 * (nameBonus(e.name) ? 1 : 0);
    return { e, turn, score };
  });
  const T = 1.3; // température softmax : compromis lisibilité (probas non écrasées)
  const exps = scored.map((s) => Math.exp(s.score / T));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  return scored.map((s, i) => ({ e: s.e, turn: s.turn, prob: exps[i] / sum }));
}

/**
 * Calcule la prédiction : itinéraire le plus probable + probabilités à la
 * prochaine vraie intersection. `maxDist` borne la profondeur d'analyse (m).
 */
export function predict(
  roads: RoadSegment[],
  graph: RoadGraph,
  pos: LatLng,
  heading: number,
  maxDist: number,
): Prediction {
  const empty: Prediction = {
    currentStreet: null, distanceToDecision: null, exits: [],
    nextStreets: [], majorAxis: null, poly: [pos],
  };
  const seg = nearestSegment(roads, pos);
  if (!seg) return empty;

  // Sens de circulation aligné sur le cap.
  let prevKey: string, curKey: string, curBrng: number;
  if (Math.abs(angleDiff(heading, bearing(seg.a, seg.b))) <= Math.abs(angleDiff(heading, bearing(seg.b, seg.a)))) {
    prevKey = key(seg.a); curKey = key(seg.b); curBrng = bearing(seg.a, seg.b);
  } else {
    prevKey = key(seg.b); curKey = key(seg.a); curBrng = bearing(seg.b, seg.a);
  }

  const poly: LatLng[] = [pos];
  const nextStreets: string[] = [];
  let exits: Exit[] = [];
  let distanceToDecision: number | null = null;
  let traveled = 0;
  let lastName = seg.name;
  let bestAxis: { name: string; s: number } = { name: seg.name, s: roadScore(seg.cls, seg.name) };

  for (let step = 0; step < 160 && traveled < maxDist; step++) {
    const node = graph.get(curKey);
    if (!node) break;
    poly.push(node.p);
    const ex = legalExits(node, prevKey, curBrng);
    if (ex.length === 0) break; // cul-de-sac

    // Première vraie intersection (≥2 sorties) = point de décision : on fige les probabilités.
    if (ex.length >= 2 && distanceToDecision === null) {
      distanceToDecision = traveled;
      exits = probabilities(ex, curBrng)
        .map((p) => ({ street: p.e.name, turn: p.turn, prob: p.prob, legal: true }))
        .sort((a, b) => b.prob - a.prob)
        .slice(0, 3);
    }

    // Continuation la plus probable (alignement + hiérarchie).
    const ranked = probabilities(ex, curBrng).sort((a, b) => b.prob - a.prob);
    const chosen = ranked[0].e;
    if (chosen.name && chosen.name !== lastName) {
      nextStreets.push(chosen.name);
      lastName = chosen.name;
    }
    const sc = roadScore(chosen.cls, chosen.name);
    if (sc > bestAxis.s) bestAxis = { name: chosen.name, s: sc };

    traveled += haversine(node.p, chosen.p);
    prevKey = curKey; curKey = chosen.to; curBrng = chosen.brng;
    if (nextStreets.length >= 5) break;
  }

  return {
    currentStreet: seg.name,
    distanceToDecision,
    exits,
    nextStreets,
    majorAxis: bestAxis.name,
    poly,
  };
}
