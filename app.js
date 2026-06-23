'use strict';

/* =======================================================================
   REFUS-DOP — Assistant de poursuite
   Suivi GPS temps réel + prédiction de la prochaine rue et de la direction.
   100% navigateur. Réseau utilisé : fonds de carte (CartoDB/OSM),
   réseau routier (Overpass), géocodage de localité (Nominatim).
   ======================================================================= */

const CHALON = [46.7806, 4.8537]; // Vue initiale avant le 1er point GPS
const R = 6371000;                // Rayon terrestre (m)

/* ---------- Outils géo ---------- */
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

function haversine(a, b) {
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const lat1 = toRad(a[0]), lat2 = toRad(b[0]);
  const dLon = toRad(b[1] - a[1]);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function destination(point, brng, dist) {
  const d = dist / R, b = toRad(brng);
  const lat1 = toRad(point[0]), lon1 = toRad(point[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                         Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), (toDeg(lon2) + 540) % 360 - 180];
}

function angleDiff(a, b) { return ((b - a + 540) % 360) - 180; }

function cardinal(deg) {
  const dirs = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
  return dirs[Math.round(deg / 45) % 8];
}

function pointToSegment(p, a, b) {
  const mPerLat = 111320, mPerLon = 111320 * Math.cos(toRad(p[0]));
  const ax = (a[1] - p[1]) * mPerLon, ay = (a[0] - p[0]) * mPerLat;
  const bx = (b[1] - p[1]) * mPerLon, by = (b[0] - p[0]) * mPerLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : (-(ax) * dx - (ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return { dist: Math.hypot(cx, cy), point: [p[0] + cy / mPerLat, p[1] + cx / mPerLon] };
}

/* ---------- État ---------- */
let map, gpsMarker, accCircle, trailLine, nextMarker, dirMarker;
const trail = [];
let lastPos = null, lastTime = null;
let smoothedHeading = null, smoothedSpeed = 0;
let firstFix = false;
let lastGeocodeAt = 0, lastOverpassAt = 0, lastOverpassCenter = null;
let roads = [];
let watchId = null, wakeLock = null, followMode = true;

/* ---------- Démarrage ---------- */
document.getElementById('startBtn').addEventListener('click', start);

function start() {
  const errEl = document.getElementById('startError');
  errEl.textContent = '';
  if (!('geolocation' in navigator)) {
    errEl.textContent = "Ce navigateur ne supporte pas la géolocalisation.";
    return;
  }
  initMap();
  requestWakeLock();
  beginWatch();
  document.getElementById('startOverlay').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('recenterBtn').classList.remove('hidden');
  setStatus('Recherche du signal GPS…');
}

function beginWatch() {
  if (watchId !== null) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000,
  });
}

function setStatus(msg) {
  document.getElementById('nextStreet').textContent = msg;
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true, zoomSnap: 0.5 })
         .setView(CHALON, 15);

  // Fond de carte épuré (plan simplifié)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 20,
    attribution: '© OpenStreetMap © CARTO',
  }).addTo(map);

  trailLine = L.polyline([], { color: '#2f81f7', weight: 5, opacity: 0.6 }).addTo(map);
  accCircle = L.circle(CHALON, { radius: 0, color: '#2f81f7', weight: 1, fillColor: '#2f81f7', fillOpacity: 0.12 });

  const icon = L.divIcon({
    className: '',
    html: '<div class="gps-wrap"><div class="gps-cone"></div><div class="gps-dot"></div></div>',
    iconSize: [40, 40], iconAnchor: [20, 20],
  });
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

/* ---------- GPS ---------- */
function onPosition(pos) {
  const { latitude, longitude, accuracy, speed, heading } = pos.coords;
  const here = [latitude, longitude];
  const now = pos.timestamp || Date.now();

  // Vitesse : GPS si dispo, sinon calcul via horodatage réel
  let spd = (typeof speed === 'number' && speed >= 0) ? speed : null;
  let movedDist = lastPos ? haversine(lastPos, here) : 0;
  if (spd === null && lastPos && lastTime) {
    const dt = (now - lastTime) / 1000;
    if (dt > 0.2) spd = movedDist / dt;
  }
  if (spd === null) spd = 0;
  smoothedSpeed = smoothedSpeed * 0.5 + spd * 0.5;

  // Cap : GPS si on bouge, sinon depuis le déplacement réel
  let hdg = null;
  if (typeof heading === 'number' && !isNaN(heading) && spd > 1.2) {
    hdg = heading;
  } else if (lastPos && movedDist > Math.max(5, accuracy * 0.5)) {
    hdg = bearing(lastPos, here);
  }
  if (hdg !== null) {
    smoothedHeading = (smoothedHeading === null)
      ? hdg
      : (smoothedHeading + angleDiff(smoothedHeading, hdg) * 0.5 + 360) % 360;
  }

  // Première position : on affiche le marqueur et on zoome dessus
  if (!firstFix) {
    firstFix = true;
    gpsMarker.addTo(map);
    accCircle.addTo(map);
    map.setView(here, 17, { animate: true });
    setStatus('Avance pour calculer la trajectoire…');
  }

  // Trace + marqueur (mise à jour immédiate, à chaque point)
  trail.push(here);
  if (trail.length > 500) trail.shift();
  trailLine.setLatLngs(trail);
  gpsMarker.setLatLng(here);
  accCircle.setLatLng(here).setRadius(accuracy || 0);

  // Oriente le cône du marqueur selon le cap
  const wrap = gpsMarker.getElement() && gpsMarker.getElement().querySelector('.gps-wrap');
  if (wrap) {
    if (smoothedHeading !== null) { wrap.style.transform = `rotate(${smoothedHeading}deg)`; wrap.classList.add('moving'); }
    else wrap.classList.remove('moving');
  }

  if (followMode) map.setView(here, map.getZoom(), { animate: true, duration: 0.25 });
  lastPos = here; lastTime = now;

  // Stats
  document.getElementById('speed').textContent = Math.round(smoothedSpeed * 3.6);
  document.getElementById('accuracy').textContent = accuracy ? Math.round(accuracy) : '—';
  document.getElementById('heading').textContent =
    smoothedHeading !== null ? `${cardinal(smoothedHeading)} ${Math.round(smoothedHeading)}°` : '—';
  const arrow = document.getElementById('directionArrow');
  if (smoothedHeading !== null) arrow.style.transform = `rotate(${smoothedHeading}deg)`;

  updatePredictions(here);
}

function onGeoError(err) {
  const msgs = {
    1: "Localisation refusée. Active le GPS pour ce site : Réglages › Safari › Position, puis « Autoriser ».",
    2: "Position GPS indisponible (signal faible). Vérifie que tu es à l'extérieur / le GPS activé.",
    3: "Signal GPS lent à arriver, nouvelle tentative…",
  };
  const msg = msgs[err.code] || err.message;
  if (!document.getElementById('startOverlay').classList.contains('hidden')) {
    document.getElementById('startError').textContent = msg;
  } else {
    setStatus(msg);
  }
  // On continue d'essayer (sauf refus explicite, où watchPosition est déjà coupé)
  if (err.code === 3) beginWatch();
}

/* ---------- Prédictions ---------- */
async function updatePredictions(here) {
  if (smoothedHeading === null) return;
  const hdg = smoothedHeading;
  const spd = smoothedSpeed;
  const streetAhead = Math.max(80, Math.min(600, spd * 8));
  const cityAhead   = Math.max(1200, Math.min(6000, spd * 70));

  if (!lastOverpassCenter || haversine(lastOverpassCenter, here) > 250) {
    if (Date.now() - lastOverpassAt > 4000) {
      lastOverpassAt = Date.now();
      lastOverpassCenter = here;
      fetchRoads(here).catch(() => {});
    }
  }

  const upcoming = predictStreetsFromRoads(here, hdg, streetAhead);
  if (upcoming.length) {
    document.getElementById('nextStreet').textContent = upcoming[0].name;
    document.getElementById('upcoming').innerHTML =
      upcoming.slice(1, 4).map(s => `<span class="chip">→ ${s.name}</span>`).join('');
    if (upcoming[0].point) {
      nextMarker.setLatLng(upcoming[0].point);
      if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
    }
  }

  if (Date.now() - lastGeocodeAt > 4000) {
    lastGeocodeAt = Date.now();
    const far = destination(here, hdg, cityAhead);
    dirMarker.setLatLng(far);
    if (!map.hasLayer(dirMarker)) dirMarker.addTo(map);
    reverseLocality(far).then(loc => {
      if (loc) document.getElementById('directionName').textContent = loc;
    }).catch(() => {});

    if (!upcoming.length) {
      const near = destination(here, hdg, streetAhead);
      nextMarker.setLatLng(near);
      if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
      reverseStreet(near).then(st => { if (st) document.getElementById('nextStreet').textContent = st; }).catch(() => {});
    }
  }

  const cur = nearestRoad(here);
  document.getElementById('currentStreet').textContent = cur ? cur.name : '—';
}

async function fetchRoads(center) {
  const q = `[out:json][timeout:12];
    way(around:700,${center[0]},${center[1]})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"]
      [name];
    out geom;`;
  const endpoints = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!res.ok) continue;
      const data = await res.json();
      roads = (data.elements || [])
        .filter(e => e.geometry && e.tags && e.tags.name)
        .map(e => ({ name: e.tags.name, geom: e.geometry.map(g => [g.lat, g.lon]) }));
      return;
    } catch (e) {}
  }
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
  if (!res.ok) throw new Error('nominatim');
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
