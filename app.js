'use strict';

/* =======================================================================
   REFUS-DOP — Assistant de poursuite
   Suivi GPS temps réel (boussole + interpolation fluide) + prédiction
   de la prochaine rue et de la direction. 100% navigateur.
   ======================================================================= */

const CHALON = [46.7806, 4.8537];
const R = 6371000;

/* ---------- Outils géo ---------- */
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const dLon = toRad(b[1] - a[1]);
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
  return ['Nord','Nord-Est','Est','Sud-Est','Sud','Sud-Ouest','Ouest','Nord-Ouest'][Math.round(deg / 45) % 8];
}
function pointToSegment(p, a, b) {
  const mPerLat = 111320, mPerLon = 111320 * Math.cos(toRad(p[0]));
  const ax = (a[1] - p[1]) * mPerLon, ay = (a[0] - p[0]) * mPerLat;
  const bx = (b[1] - p[1]) * mPerLon, by = (b[0] - p[0]) * mPerLat;
  const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : (-ax * dx - ay * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(cx, cy), point: [p[0] + cy / mPerLat, p[1] + cx / mPerLon] };
}

/* ---------- État ---------- */
let map, gpsMarker, accCircle, trailLine, nextMarker, dirMarker;
const trail = [];
let lastPos = null, lastTime = null;
let smoothedHeading = null, gpsHeading = null, smoothedSpeed = 0;
let compassHeading = null, lastCompassAt = 0;
let firstFix = false;
let lastGeocodeAt = 0, lastOverpassAt = 0, lastOverpassCenter = null;
let roads = [];
let watchId = null, wakeLock = null, followMode = true;

// Animation (interpolation fluide entre deux points GPS)
const anim = { from: null, to: null, start: 0, dur: 1000, render: CHALON };

// Débogage
const dbg = { fixes: 0, dt: 0, lat: 0, lon: 0, acc: 0, vgps: null, vcalc: 0,
              hgps: null, overpass: '—', nominatim: '—' };
let debugOn = false;

/* ---------- Cap courant : boussole prioritaire, sinon GPS ---------- */
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
  enableCompass();          // demande l'autorisation boussole (geste utilisateur)
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
  trailLine = L.polyline([], { color: '#2f81f7', weight: 5, opacity: 0.6 }).addTo(map);
  accCircle = L.circle(CHALON, { radius: 0, color: '#2f81f7', weight: 1, fillColor: '#2f81f7', fillOpacity: 0.12 });
  const icon = L.divIcon({ className: '',
    html: '<div class="gps-wrap"><div class="gps-cone"></div><div class="gps-dot"></div></div>',
    iconSize: [40, 40], iconAnchor: [20, 20] });
  gpsMarker = L.marker(CHALON, { icon, interactive: false, keyboard: false });
  nextMarker = L.circleMarker(CHALON, { radius: 7, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1 });
  dirMarker  = L.circleMarker(CHALON, { radius: 7, color: '#fff', weight: 2, fillColor: '#18c37d', fillOpacity: 1 });
  map.on('dragstart', () => { followMode = false; document.getElementById('recenterBtn').classList.add('active'); });
  document.getElementById('recenterBtn').addEventListener('click', () => {
    followMode = true;
    document.getElementById('recenterBtn').classList.remove('active');
    if (lastPos) map.setView(lastPos, Math.max(map.getZoom(), 17), { animate: true });
  });
}

/* ---------- Boussole (iOS : webkitCompassHeading) ---------- */
function enableCompass() {
  const handler = e => {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number' && !isNaN(e.webkitCompassHeading)) {
      h = e.webkitCompassHeading;                 // iOS : déjà un cap (0 = Nord, sens horaire)
    } else if (e.absolute && typeof e.alpha === 'number') {
      h = (360 - e.alpha) % 360;                  // Android absolu
    }
    if (h !== null) { compassHeading = h; lastCompassAt = Date.now(); }
  };
  const attach = () => {
    window.addEventListener('deviceorientation', handler, true);
    window.addEventListener('deviceorientationabsolute', handler, true);
  };
  const DOE = window.DeviceOrientationEvent;
  if (DOE && typeof DOE.requestPermission === 'function') {
    DOE.requestPermission().then(state => { if (state === 'granted') attach(); }).catch(() => {});
  } else {
    attach();
  }
}

/* ---------- Boucle d'animation (fluidité temps réel) ---------- */
function renderLoop() {
  requestAnimationFrame(renderLoop);
  if (!anim.to) return;
  const t = Math.min(1, (performance.now() - anim.start) / anim.dur);
  const e = t * (2 - t); // ease-out
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

  // Cible d'animation : on interpole de la position rendue vers le nouveau point
  anim.from = anim.render || here;
  anim.to = here;
  anim.start = performance.now();
  anim.dur = Math.max(400, Math.min(1500, dt > 0 ? dt * 1000 : 1000));

  accCircle.setRadius(accuracy || 0);
  trail.push(here);
  if (trail.length > 500) trail.shift();
  trailLine.setLatLngs(trail);

  lastPos = here; lastTime = now;

  // Débogage
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

/* ---------- Affichage textuel (200 ms) ---------- */
function updateReadouts() {
  const hdg = currentHeading();
  document.getElementById('speed').textContent = Math.round(smoothedSpeed * 3.6);
  document.getElementById('accuracy').textContent = dbg.acc ? Math.round(dbg.acc) : '—';
  document.getElementById('heading').textContent = hdg !== null ? `${cardinal(hdg)} ${Math.round(hdg)}°` : '—';
  const arrow = document.getElementById('directionArrow');
  if (hdg !== null) arrow.style.transform = `rotate(${hdg}deg)`;

  if (debugOn) {
    const src = (compassHeading !== null && Date.now() - lastCompassAt < 3000) ? 'boussole' : 'gps';
    document.getElementById('debug').textContent =
`FIX #${dbg.fixes}   Δ ${dbg.dt} ms
lat ${dbg.lat.toFixed(6)}  lon ${dbg.lon.toFixed(6)}
précision : ${dbg.acc ? Math.round(dbg.acc) + ' m' : '—'}
vitesse  gps:${dbg.vgps !== null ? (dbg.vgps*3.6).toFixed(1) : '—'}  calc:${(dbg.vcalc*3.6).toFixed(1)} km/h
cap      gps:${dbg.hgps !== null ? Math.round(dbg.hgps)+'°' : '—'}  boussole:${compassHeading !== null ? Math.round(compassHeading)+'°' : '—'}
cap utilisé : ${hdg !== null ? Math.round(hdg)+'° ('+src+')' : '—'}
routes en cache : ${roads.length}
overpass : ${dbg.overpass}   nominatim : ${dbg.nominatim}`;
  }
}

/* ---------- Prédictions ---------- */
async function updatePredictions(here) {
  const hdg = currentHeading();
  if (hdg === null) return;
  const spd = smoothedSpeed;
  const streetAhead = Math.max(80, Math.min(600, spd * 8));
  const cityAhead = Math.max(1200, Math.min(6000, spd * 70));

  if (!lastOverpassCenter || haversine(lastOverpassCenter, here) > 250) {
    if (Date.now() - lastOverpassAt > 4000) {
      lastOverpassAt = Date.now(); lastOverpassCenter = here;
      fetchRoads(here).catch(() => {});
    }
  }

  const upcoming = predictStreetsFromRoads(here, hdg, streetAhead);
  if (upcoming.length) {
    document.getElementById('nextStreet').textContent = upcoming[0].name;
    document.getElementById('upcoming').innerHTML =
      upcoming.slice(1, 4).map(s => `<span class="chip">→ ${s.name}</span>`).join('');
    if (upcoming[0].point) { nextMarker.setLatLng(upcoming[0].point); if (!map.hasLayer(nextMarker)) nextMarker.addTo(map); }
  }

  if (Date.now() - lastGeocodeAt > 4000) {
    lastGeocodeAt = Date.now();
    const far = destination(here, hdg, cityAhead);
    dirMarker.setLatLng(far); if (!map.hasLayer(dirMarker)) dirMarker.addTo(map);
    reverseLocality(far).then(loc => { if (loc) document.getElementById('directionName').textContent = loc; }).catch(() => {});
    if (!upcoming.length) {
      const near = destination(here, hdg, streetAhead);
      nextMarker.setLatLng(near); if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
      reverseStreet(near).then(st => { if (st) document.getElementById('nextStreet').textContent = st; }).catch(() => {});
    }
  }

  const cur = nearestRoad(here);
  document.getElementById('currentStreet').textContent = cur ? cur.name : '—';
}

async function fetchRoads(center) {
  const q = `[out:json][timeout:12];
    way(around:700,${center[0]},${center[1]})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"][name];
    out geom;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!res.ok) continue;
      const data = await res.json();
      roads = (data.elements || []).filter(e => e.geometry && e.tags && e.tags.name)
        .map(e => ({ name: e.tags.name, geom: e.geometry.map(g => [g.lat, g.lon]) }));
      dbg.overpass = `ok (${roads.length})`;
      return;
    } catch (e) { dbg.overpass = 'erreur'; }
  }
  dbg.overpass = 'erreur';
}

function nearestRoad(here) {
  let best = null;
  for (const road of roads)
    for (let i = 0; i < road.geom.length - 1; i++) {
      const seg = pointToSegment(here, road.geom[i], road.geom[i + 1]);
      if (!best || seg.dist < best.dist) best = { name: road.name, dist: seg.dist, point: seg.point };
    }
  return best && best.dist < 60 ? best : null;
}

function predictStreetsFromRoads(here, hdg, maxDist) {
  if (!roads.length) return [];
  const current = nearestRoad(here);
  const currentName = current ? current.name : null;
  const found = [], seen = new Set();
  for (let d = 30; d <= maxDist; d += 25) {
    const probe = destination(here, hdg, d);
    let best = null;
    for (const road of roads)
      for (let i = 0; i < road.geom.length - 1; i++) {
        const seg = pointToSegment(probe, road.geom[i], road.geom[i + 1]);
        if (!best || seg.dist < best.dist) best = { name: road.name, dist: seg.dist, point: seg.point };
      }
    if (best && best.dist < 30 && best.name !== currentName && !seen.has(best.name)) {
      if (Math.abs(angleDiff(hdg, bearing(here, best.point))) < 75) {
        seen.add(best.name);
        found.push({ name: best.name, dist: haversine(here, best.point), point: best.point });
      }
    }
  }
  found.sort((a, b) => a.dist - b.dist);
  return found;
}

/* ---------- Nominatim ---------- */
async function nominatimReverse(point, zoom) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point[0]}&lon=${point[1]}&zoom=${zoom}&accept-language=fr`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) { dbg.nominatim = 'erreur'; throw new Error('nominatim'); }
  dbg.nominatim = 'ok';
  return res.json();
}
async function reverseStreet(point) {
  const a = (await nominatimReverse(point, 17)).address || {};
  return a.road || a.pedestrian || a.footway || a.residential || null;
}
async function reverseLocality(point) {
  const a = (await nominatimReverse(point, 14)).address || {};
  return a.suburb || a.neighbourhood || a.quarter || a.village || a.town ||
         a.city_district || a.city || a.municipality || a.county || null;
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
