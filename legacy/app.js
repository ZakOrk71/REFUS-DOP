'use strict';

/* =======================================================================
   REFUS-DOP — Assistant de poursuite
   Suivi GPS temps réel (boussole + interpolation) + prédiction de la
   prochaine rue, du grand axe (direction) et de la prochaine ville.
   ======================================================================= */

const CHALON = [46.7806, 4.8537];
const R = 6371000;

/* ---------- Outils géo ---------- */
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;
function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]), dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]), dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function destination(point, brng, dist) {
  const d = dist / R, b = toRad(brng);
  const lat1 = toRad(point[0]), lon1 = toRad(point[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), (toDeg(lon2) + 540) % 360 - 180];
}
function angleDiff(a, b) { return ((b - a + 540) % 360) - 180; }
function cardinal(deg) {
  return ['N','NE','E','SE','S','SO','O','NO'][Math.round(deg / 45) % 8];
}
function fmtDist(m) {
  if (m == null) return '';
  return m < 950 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}
function pointToSegment(p, a, b) {
  const mLat = 111320, mLon = 111320 * Math.cos(toRad(p[0]));
  const ax = (a[1] - p[1]) * mLon, ay = (a[0] - p[0]) * mLat;
  const bx = (b[1] - p[1]) * mLon, by = (b[0] - p[0]) * mLat;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : (-ax * dx - ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(cx, cy), point: [p[0] + cy / mLat, p[1] + cx / mLon] };
}

/* Importance d'une voie (pour choisir le « grand axe ») */
const CLASS_RANK = {
  motorway: 7, trunk: 6, primary: 5, secondary: 4, tertiary: 3,
  motorway_link: 6, trunk_link: 5, primary_link: 4, secondary_link: 3,
  unclassified: 2, residential: 1, living_street: 1,
};
function nameBonus(name) {
  return /(avenue|boulevard|^cours |^cours$| cours |quai|route|rocade|p[eé]riph|voie|pont)/i.test(name) ? 2 : 0;
}
function roadScore(cls, name) { return (CLASS_RANK[cls] || 1) + nameBonus(name); }

/* ---------- État ---------- */
let map, gpsMarker, accCircle, trailLine, nextMarker, townMarker, headingRay;
const trail = [];
let lastPos = null, lastTime = null;
let smoothedHeading = null, gpsHeading = null, smoothedSpeed = 0;
let compassHeading = null, lastCompassAt = 0;
let firstFix = false;
let lastOverpassAt = 0, lastOverpassCenter = null;
let lastPlacesAt = 0, lastPlacesCenter = null;
let roads = [], places = [];
let graph = new Map();   // graphe routier : clé nœud -> { p:[lat,lon], e:[arêtes] }
let watchId = null, wakeLock = null, followMode = true;
const anim = { from: null, to: null, start: 0, dur: 1000, render: CHALON };
const dbg = { fixes: 0, dt: 0, lat: 0, lon: 0, acc: 0, vgps: null, vcalc: 0,
              hgps: null, overpass: '—', places: '—' };
let debugOn = false;

function currentHeading() {
  if (compassHeading !== null && Date.now() - lastCompassAt < 3000) return compassHeading;
  return smoothedHeading;
}

/* ---------- Démarrage ---------- */
document.getElementById('startBtn').addEventListener('click', start);
document.getElementById('debugBtn').addEventListener('click', () => {
  debugOn = !debugOn;
  document.getElementById('debug').classList.toggle('hidden', !debugOn);
});

function start() {
  const errEl = document.getElementById('startError');
  errEl.textContent = '';
  if (!('geolocation' in navigator)) { errEl.textContent = "Géolocalisation non supportée."; return; }
  initMap();
  requestWakeLock();
  enableCompass();
  beginWatch();
  requestAnimationFrame(renderLoop);
  setInterval(updateReadouts, 200);
  document.getElementById('startOverlay').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('recenterBtn').classList.remove('hidden');
  document.getElementById('debugBtn').classList.remove('hidden');
  setStatus('Recherche du signal GPS…');
}

function beginWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
    enableHighAccuracy: true, maximumAge: 0, timeout: 20000,
  });
}
function setStatus(msg) { document.getElementById('nextStreet').textContent = msg; }

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.5 }).setView(CHALON, 15);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20, attribution: '© OpenStreetMap © CARTO',
  }).addTo(map);
  headingRay = L.polyline([], { color: '#18c37d', weight: 7, opacity: 0.65, lineCap: 'round', lineJoin: 'round' }).addTo(map);
  trailLine = L.polyline([], { color: '#2f81f7', weight: 5, opacity: 0.55 }).addTo(map);
  accCircle = L.circle(CHALON, { radius: 0, color: '#2f81f7', weight: 1, fillColor: '#2f81f7', fillOpacity: 0.12 });
  const icon = L.divIcon({ className: '',
    html: '<div class="gps-wrap"><div class="gps-cone"></div><div class="gps-dot"></div></div>',
    iconSize: [40, 40], iconAnchor: [20, 20] });
  gpsMarker = L.marker(CHALON, { icon, interactive: false, keyboard: false });
  nextMarker = L.circleMarker(CHALON, { radius: 7, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1 });
  townMarker = L.circleMarker(CHALON, { radius: 8, color: '#fff', weight: 2, fillColor: '#18c37d', fillOpacity: 1 });
  map.on('dragstart', () => { followMode = false; document.getElementById('recenterBtn').classList.add('active'); });
  document.getElementById('recenterBtn').addEventListener('click', () => {
    followMode = true;
    document.getElementById('recenterBtn').classList.remove('active');
    if (lastPos) map.setView(lastPos, Math.max(map.getZoom(), 17), { animate: true });
  });
}

/* ---------- Boussole ---------- */
function enableCompass() {
  const handler = e => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
    if (h !== null) {
      compassHeading = (compassHeading === null) ? h : (compassHeading + angleDiff(compassHeading, h) * 0.25 + 360) % 360;
      lastCompassAt = Date.now();
    }
  };
  const attach = () => {
    window.addEventListener('deviceorientation', handler, true);
    window.addEventListener('deviceorientationabsolute', handler, true);
  };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function')
    DOE.requestPermission().then(s => { if (s === 'granted') attach(); }).catch(() => {});
  else attach();
}

/* ---------- Animation fluide ---------- */
function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!anim.to) return;
  const t = Math.min(1, (performance.now() - anim.start) / anim.dur);
  const e = t * (2 - t);
  const lat = anim.from[0] + (anim.to[0] - anim.from[0]) * e;
  const lon = anim.from[1] + (anim.to[1] - anim.from[1]) * e;
  anim.render = [lat, lon];
  gpsMarker.setLatLng(anim.render);
  accCircle.setLatLng(anim.render);
  if (followMode && map) map.panTo(anim.render, { animate: false });
  const hdg = currentHeading();
  const wrap = gpsMarker.getElement() && gpsMarker.getElement().querySelector('.gps-wrap');
  if (wrap) {
    if (hdg !== null) { wrap.style.transform = `rotate(${hdg}deg)`; wrap.classList.add('moving'); }
    else wrap.classList.remove('moving');
  }
}

/* ---------- GPS ---------- */
function onPosition(pos) {
  const { latitude, longitude, accuracy, speed, heading } = pos.coords;
  const here = [latitude, longitude];
  const now = pos.timestamp || Date.now();
  const dt = lastTime ? (now - lastTime) / 1000 : 0;
  const movedDist = lastPos ? haversine(lastPos, here) : 0;

  let spd = (typeof speed === 'number' && speed >= 0) ? speed : null;
  const vcalc = dt > 0.2 ? movedDist / dt : 0;
  if (spd === null) spd = vcalc;
  smoothedSpeed = smoothedSpeed * 0.5 + spd * 0.5;

  gpsHeading = (typeof heading === 'number' && !isNaN(heading) && spd > 1.2) ? heading : null;
  let hdg = gpsHeading;
  if (hdg === null && lastPos && movedDist > Math.max(5, accuracy * 0.5)) hdg = bearing(lastPos, here);
  if (hdg !== null)
    smoothedHeading = (smoothedHeading === null) ? hdg
      : (smoothedHeading + angleDiff(smoothedHeading, hdg) * 0.5 + 360) % 360;

  if (!firstFix) {
    firstFix = true;
    gpsMarker.addTo(map); accCircle.addTo(map);
    map.setView(here, 17, { animate: true });
    anim.render = here;
    setStatus('Avance pour calculer la trajectoire…');
  }
  anim.from = anim.render || here;
  anim.to = here;
  anim.start = performance.now();
  anim.dur = Math.max(400, Math.min(1500, dt > 0 ? dt * 1000 : 1000));

  accCircle.setRadius(accuracy || 0);
  trail.push(here);
  if (trail.length > 500) trail.shift();
  trailLine.setLatLngs(trail);
  lastPos = here; lastTime = now;

  dbg.fixes++; dbg.dt = Math.round(dt * 1000); dbg.lat = latitude; dbg.lon = longitude;
  dbg.acc = accuracy; dbg.vgps = (typeof speed === 'number' && speed >= 0) ? speed : null;
  dbg.vcalc = vcalc; dbg.hgps = gpsHeading;

  updatePredictions(here);
}

function onGeoError(err) {
  const msgs = {
    1: "Localisation refusée. Réglages › Safari › Position › Autoriser, puis recharge.",
    2: "Position GPS indisponible (signal faible).",
    3: "Signal GPS lent à arriver, nouvelle tentative…",
  };
  const msg = msgs[err.code] || err.message;
  if (!document.getElementById('startOverlay').classList.contains('hidden'))
    document.getElementById('startError').textContent = msg;
  else setStatus(msg);
  if (err.code === 3) beginWatch();
}

/* ---------- Affichage textuel ---------- */
function updateReadouts() {
  const hdg = currentHeading();
  document.getElementById('speed').textContent = Math.round(smoothedSpeed * 3.6);
  document.getElementById('accuracy').textContent = dbg.acc ? Math.round(dbg.acc) : '—';
  document.getElementById('heading').textContent = hdg !== null ? `${cardinal(hdg)} ${Math.round(hdg)}°` : '—';
  const arrow = document.getElementById('directionArrow');
  if (hdg !== null) arrow.style.transform = `rotate(${hdg}deg)`;
  const tArrow = document.getElementById('townArrow');
  if (tArrow && tArrow.dataset.brng) tArrow.style.transform = `rotate(${(+tArrow.dataset.brng) - hdg}deg)`;

  if (debugOn) {
    const src = (compassHeading !== null && Date.now() - lastCompassAt < 3000) ? 'boussole' : 'gps';
    document.getElementById('debug').textContent =
`FIX #${dbg.fixes}   Δ ${dbg.dt} ms
lat ${dbg.lat.toFixed(6)}  lon ${dbg.lon.toFixed(6)}
précision : ${dbg.acc ? Math.round(dbg.acc) + ' m' : '—'}
vitesse  gps:${dbg.vgps !== null ? (dbg.vgps*3.6).toFixed(1) : '—'}  calc:${(dbg.vcalc*3.6).toFixed(1)} km/h
cap      gps:${dbg.hgps !== null ? Math.round(dbg.hgps)+'°' : '—'}  bouss:${compassHeading !== null ? Math.round(compassHeading)+'°' : '—'}
cap utilisé : ${hdg !== null ? Math.round(hdg)+'° ('+src+')' : '—'}
routes:${roads.length}  villes:${places.length}  quartiers:${typeof QUARTIERS!=='undefined'?QUARTIERS.length:0}
overpass:${dbg.overpass}  villes:${dbg.places}`;
  }
}

/* ---------- Prédictions ---------- */
async function updatePredictions(here) {
  const hdg = currentHeading();
  if (hdg === null) return;
  const spd = smoothedSpeed;
  const streetAhead = Math.max(80, Math.min(600, spd * 8));
  const axisAhead = Math.max(400, Math.min(2500, spd * 30));

  // Réseau routier (Overpass) rafraîchi quand on a bougé de 250 m
  if (!lastOverpassCenter || haversine(lastOverpassCenter, here) > 250) {
    if (Date.now() - lastOverpassAt > 4000) {
      lastOverpassAt = Date.now(); lastOverpassCenter = here;
      fetchRoads(here).catch(() => {});
    }
  }
  // Villes alentour rafraîchies quand on a bougé de 3 km
  if (!lastPlacesCenter || haversine(lastPlacesCenter, here) > 3000) {
    if (Date.now() - lastPlacesAt > 8000) {
      lastPlacesAt = Date.now(); lastPlacesCenter = here;
      fetchPlaces(here).catch(() => {});
    }
  }

  // 1) Prochaine rue — en SUIVANT le graphe routier (itinéraire le plus probable)
  const path = predictPath(here, hdg, axisAhead);
  let pathStreets = [];
  if (path) {
    pathStreets = path.streets;
    headingRay.setLatLngs(path.poly);          // trace l'itinéraire prédit sur la carte
    if (pathStreets.length) {
      const s0 = pathStreets[0];
      const t = turnLabel(s0.turn);
      const turnEl = document.getElementById('nextTurn');
      document.getElementById('nextStreet').textContent = s0.name;
      turnEl.textContent = s0.contresens ? `⚠ ${t.txt} (à contresens)` : `${t.icon} ${t.txt}`;
      turnEl.classList.toggle('contresens', !!s0.contresens);
      document.getElementById('nextDist').textContent = fmtDist(s0.dist);
      const chips = [];
      if (path.fork) {
        const ft = turnLabel(path.fork.turn);
        const cls = path.fork.contresens ? 'chip fork contresens' : 'chip fork';
        const pre = path.fork.contresens ? `⚠ ou ${path.fork.name} à contresens` : `ou ${ft.icon} ${path.fork.name}`;
        chips.push(`<span class="${cls}">${pre}</span>`);
      }
      for (const s of pathStreets.slice(1, 4)) {
        const st = turnLabel(s.turn);
        chips.push(`<span class="chip${s.contresens ? ' contresens' : ''}">${s.contresens ? '⚠ ' : st.icon + ' '}${s.name}</span>`);
      }
      document.getElementById('upcoming').innerHTML = chips.join('');
      nextMarker.setLatLng(s0.point);
      if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
    } else {
      document.getElementById('nextTurn').textContent = '↑ tout droit';
      document.getElementById('nextTurn').classList.remove('contresens');
    }
  }

  // 2) DIRECTION = quartier vers lequel on va (sinon grand axe : avenue/boulevard)
  const curRoad = nearestSegment(here);
  const axisCands = pathStreets.slice();
  if (curRoad) axisCands.push({ name: curRoad.name, cls: curRoad.cls, dist: 0 });
  const axis = pickMajorAxis(axisCands);
  const quartier = pickQuartier(here, hdg, spd);
  const dName = document.getElementById('directionName');
  const dAxis = document.getElementById('directionAxis');
  const dMeta = document.getElementById('directionMeta');
  if (quartier) {
    dName.textContent = quartier.name;
    dMeta.textContent = fmtDist(quartier.dist);
    dAxis.textContent = axis ? `par ${axis.name}` : '';
  } else if (axis) {
    dName.textContent = axis.name;
    dMeta.textContent = fmtDist(axis.dist);
    dAxis.textContent = '';
  }

  // 3) VERS = prochaine ville selon cap + vitesse (recalcul à chaque cycle, cache local)
  const town = pickNextTown(here, hdg, spd);
  if (town) {
    document.getElementById('townName').textContent = town.name;
    document.getElementById('townDist').textContent = `${fmtDist(town.dist)} · ${cardinal(town.brng)}`;
    const tArrow = document.getElementById('townArrow');
    tArrow.dataset.brng = town.brng;
    townMarker.setLatLng(town.point);
    if (!map.hasLayer(townMarker)) townMarker.addTo(map);
  }

  const cur = nearestRoad(here);
  document.getElementById('currentStreet').textContent = cur ? cur.name : '—';
}

/* ---------- Suivi du graphe routier (itinéraire le plus probable) ---------- */
const nodeKey = p => p[0].toFixed(6) + ',' + p[1].toFixed(6);

/* Construit le graphe : chaque nœud OSM -> arêtes vers ses voisins */
function buildGraph() {
  graph = new Map();
  const add = (a, b, name, cls, legal) => {
    const ka = nodeKey(a);
    if (!graph.has(ka)) graph.set(ka, { p: a, e: [] });
    graph.get(ka).e.push({ to: nodeKey(b), p: b, name, cls, legal, brng: bearing(a, b) });
  };
  for (const road of roads)
    for (let i = 0; i < road.geom.length - 1; i++) {
      // legal = circulation autorisée dans ce sens (faux = à contresens d'un sens unique)
      add(road.geom[i], road.geom[i + 1], road.name, road.cls, road.dir !== -1);
      add(road.geom[i + 1], road.geom[i], road.name, road.cls, road.dir !== 1);
    }
}

/* Segment routier le plus proche de la position (la rue où l'on roule) */
function nearestSegment(here) {
  let best = null;
  for (const road of roads)
    for (let i = 0; i < road.geom.length - 1; i++) {
      const a = road.geom[i], b = road.geom[i + 1];
      const seg = pointToSegment(here, a, b);
      if (!best || seg.dist < best.dist) best = { a, b, name: road.name, cls: road.cls, dist: seg.dist };
    }
  return best && best.dist < 60 ? best : null;
}

function turnLabel(turn) {
  const a = Math.abs(turn);
  if (a < 22) return { icon: '↑', txt: 'tout droit' };
  if (a < 55) return turn > 0 ? { icon: '↗', txt: 'à droite' } : { icon: '↖', txt: 'à gauche' };
  return turn > 0 ? { icon: '↱', txt: 'à droite' } : { icon: '↰', txt: 'à gauche' };
}

/* Prédit l'itinéraire en SUIVANT les rues : on reste sur sa voie et, à chaque
   intersection, on choisit la continuation la plus probable (la plus droite,
   même nom prioritaire, plus gros axe), sans demi-tour. Renvoie la suite des
   rues réellement empruntées + la géométrie du trajet + d'éventuelles bifurcations. */
function predictPath(here, hdg, maxDist) {
  const seg = nearestSegment(here);
  if (!seg) return null;
  // Sens de circulation le long du segment courant, aligné sur le cap
  let prevKey, curKey, curP, curBrng, curName, curCls;
  if (Math.abs(angleDiff(hdg, bearing(seg.a, seg.b))) <= Math.abs(angleDiff(hdg, bearing(seg.b, seg.a)))) {
    prevKey = nodeKey(seg.a); curKey = nodeKey(seg.b); curP = seg.b; curBrng = bearing(seg.a, seg.b);
  } else {
    prevKey = nodeKey(seg.b); curKey = nodeKey(seg.a); curP = seg.a; curBrng = bearing(seg.b, seg.a);
  }
  curName = seg.name; curCls = seg.cls;

  const streets = [];                  // { name, cls, point, dist, turn }
  const poly = [here, curP];
  let traveled = haversine(here, curP);
  let lastName = seg.name;
  let fork = null;                     // alternative au premier vrai changement de rue

  for (let steps = 0; steps < 120 && traveled < maxDist; steps++) {
    const node = graph.get(curKey);
    if (!node) break;
    let bestLegal = null, secondLegal = null, bestAny = null;
    for (const e of node.e) {
      if (e.to === prevKey && e.name === curName) continue; // pas de demi-tour sur la même voie
      const turn = angleDiff(curBrng, e.brng);
      if (Math.abs(turn) > 140) continue;                   // demi-tour : impossible
      const score = -Math.abs(turn)                          // priorité à la trajectoire la plus droite
                    + (e.name === curName ? 60 : 0)          // continuité de la même rue
                    + (roadScore(e.cls, e.name)) * 5;        // gros axes plus probables
      const cand = { e, turn, score };
      if (!bestAny || score > bestAny.score) bestAny = cand;
      if (e.legal) {
        if (!bestLegal || score > bestLegal.score) { secondLegal = bestLegal; bestLegal = cand; }
        else if (!secondLegal || score > secondLegal.score) secondLegal = cand;
      }
    }
    if (!bestAny) break;                                     // cul-de-sac
    const chosen = bestLegal || bestAny;                    // légal en priorité, sinon contresens forcé
    const e = chosen.e;
    const contresens = !e.legal;

    // Changement de rue = une « prochaine rue » de l'itinéraire
    if (e.name && e.name !== lastName) {
      const prevLast = lastName;
      streets.push({ name: e.name, cls: e.cls, point: node.p, dist: traveled, turn: chosen.turn, contresens });
      if (streets.length === 1) {
        // (a) raccourci à contresens nettement plus droit : un fuyard peut forcer le sens interdit
        if (bestLegal && bestAny !== bestLegal && !bestAny.e.legal &&
            Math.abs(bestAny.turn) + 15 < Math.abs(bestLegal.turn) &&
            bestAny.e.name && bestAny.e.name !== prevLast) {
          fork = { name: bestAny.e.name, turn: bestAny.turn, contresens: true };
        }
        // (b) sinon bifurcation légale en T : 2e option comparable avec virage marqué
        else if (secondLegal && Math.abs(chosen.turn) > 35 && chosen.score - secondLegal.score < 25 &&
                 secondLegal.e.name && secondLegal.e.name !== prevLast) {
          fork = { name: secondLegal.e.name, turn: secondLegal.turn, contresens: !secondLegal.e.legal };
        }
      }
      lastName = e.name;
    }
    traveled += haversine(node.p, e.p);
    poly.push(e.p);
    prevKey = curKey; curKey = e.to; curP = e.p; curBrng = e.brng; curName = e.name; curCls = e.cls;
    if (streets.length >= 5) break;
  }
  return { streets, poly, fork };
}

/* Choisit la voie la plus importante de l'itinéraire (pour « par … ») */
function pickMajorAxis(cands) {
  let best = null;
  for (const c of cands) {
    const s = roadScore(c.cls, c.name) - c.dist / 1500;
    if (!best || s > best.s) best = { name: c.name, dist: c.dist, s };
  }
  return best;
}

function nearestRoad(here) {
  let best = null;
  for (const road of roads)
    for (let i = 0; i < road.geom.length - 1; i++) {
      const seg = pointToSegment(here, road.geom[i], road.geom[i + 1]);
      if (!best || seg.dist < best.dist) best = { name: road.name, dist: seg.dist };
    }
  return best && best.dist < 60 ? best : null;
}

/* Quartier vers lequel on se dirige (liste OSM intégrée, grands quartiers prioritaires) */
function pickQuartier(here, hdg, spd) {
  if (typeof QUARTIERS === 'undefined' || !QUARTIERS.length) return null;
  const reach = Math.max(900, Math.min(3500, spd * 60 + 700)); // portée selon vitesse
  let best = null;
  for (const q of QUARTIERS) {
    const pt = [q.y, q.x];
    const dist = haversine(here, pt);
    if (dist < 40 || dist > reach) continue;
    const off = Math.abs(angleDiff(hdg, bearing(here, pt)));
    if (off > 60) continue;
    const score = q.w * 2 - off * 0.03 - (dist / reach) * 1.6;
    if (!best || score > best.score) best = { name: q.name || q.n, dist, score };
  }
  return best;
}

/* Prochaine ville selon le cap et la vitesse */
function pickNextTown(here, hdg, spd) {
  if (!places.length) return null;
  const ideal = Math.max(3000, Math.min(25000, spd * 150 + 2500)); // vise plus loin si rapide
  let best = null;
  for (const p of places) {
    const dist = haversine(here, p.pt);
    if (dist < 1500) continue;                       // pas la ville où l'on est déjà
    const brng = bearing(here, p.pt);
    const off = Math.abs(angleDiff(hdg, brng));
    if (off > 55) continue;                          // seulement ce qui est devant
    const score = p.weight * 2.2
                - off * 0.045
                - Math.abs(dist - ideal) / ideal * 1.4;
    if (!best || score > best.score) best = { name: p.name, dist, brng, point: p.pt, score };
  }
  return best;
}

/* ---------- Overpass : réseau routier ---------- */
async function fetchRoads(center) {
  const q = `[out:json][timeout:12];
    way(around:800,${center[0]},${center[1]})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"][name];
    out geom;`;
  const data = await overpass(q);
  if (!data) { dbg.overpass = 'erreur'; return; }
  roads = (data.elements || []).filter(e => e.geometry && e.tags && e.tags.name)
    .map(e => {
      const t = e.tags;
      // Sens de circulation autorisé : 1 = sens du tracé, -1 = inverse, 0 = double sens
      let dir = 0;
      if (t.junction === 'roundabout' || t.oneway === 'yes' || t.oneway === 'true' || t.oneway === '1') dir = 1;
      else if (t.oneway === '-1' || t.oneway === 'reverse') dir = -1;
      return { name: t.name, cls: t.highway, dir, geom: e.geometry.map(g => [g.lat, g.lon]) };
    });
  buildGraph();
  dbg.overpass = `ok (${roads.length}, ${roads.filter(r => r.dir).length} sens unique)`;
}

/* ---------- Overpass : villes / villages ---------- */
async function fetchPlaces(center) {
  const q = `[out:json][timeout:15];
    node(around:25000,${center[0]},${center[1]})[place~"^(city|town|village|suburb)$"][name];
    out;`;
  const data = await overpass(q);
  if (!data) { dbg.places = 'erreur'; return; }
  const W = { city: 4, town: 3, village: 1.5, suburb: 2 };
  places = (data.elements || []).filter(e => e.tags && e.tags.name && e.lat)
    .map(e => ({ name: e.tags.name, pt: [e.lat, e.lon], weight: W[e.tags.place] || 1 }));
  dbg.places = `ok (${places.length})`;
}

async function overpass(q) {
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!res.ok) continue;
      return await res.json();
    } catch (e) {}
  }
  return null;
}

/* ---------- Wake Lock ---------- */
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', async () => {
        if (wakeLock !== null && document.visibilityState === 'visible') {
          try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
      });
    }
  } catch (e) {}
}
