'use strict';

/* =======================================================================
   REFUS-DOP — Assistant de poursuite
   Suit la position GPS et prédit la prochaine rue + la direction
   (ville/quartier) en temps réel, à partir du réseau routier OSM.
   100% navigateur, aucune donnée envoyée à un serveur tiers hormis
   les fonds de carte (OSM), le réseau routier (Overpass) et le
   géocodage de localité (Nominatim).
   ======================================================================= */

const CHALON = [46.7806, 4.8537]; // Centre par défaut : Chalon-sur-Saône
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

// Point projeté à `dist` mètres dans la direction `brng` depuis [lat,lon]
function destination(point, brng, dist) {
  const d = dist / R;
  const b = toRad(brng);
  const lat1 = toRad(point[0]), lon1 = toRad(point[1]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                         Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return [toDeg(lat2), (toDeg(lon2) + 540) % 360 - 180];
}

// Différence angulaire signée minimale entre deux caps (−180..180)
function angleDiff(a, b) {
  let d = ((b - a + 540) % 360) - 180;
  return d;
}

// Cap → point cardinal en français
function cardinal(deg) {
  const dirs = ['Nord', 'Nord-Est', 'Est', 'Sud-Est', 'Sud', 'Sud-Ouest', 'Ouest', 'Nord-Ouest'];
  return dirs[Math.round(deg / 45) % 8];
}

// Distance point→segment (en mètres, approx. plan local) + point projeté
function pointToSegment(p, a, b) {
  // Conversion locale en mètres autour de p
  const latRef = toRad(p[0]);
  const mPerLat = 111320;
  const mPerLon = 111320 * Math.cos(latRef);
  const px = 0, py = 0;
  const ax = (a[1] - p[1]) * mPerLon, ay = (a[0] - p[0]) * mPerLat;
  const bx = (b[1] - p[1]) * mPerLon, by = (b[0] - p[0]) * mPerLat;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  const dist = Math.hypot(cx, cy);
  // Reconvertit le point projeté en lat/lon
  const cp = [p[0] + cy / mPerLat, p[1] + cx / mPerLon];
  return { dist, point: cp };
}

/* ---------- État global ---------- */
let map, gpsMarker, trailLine, nextMarker, dirMarker;
const trail = [];
let lastPos = null;          // [lat, lon]
let smoothedHeading = null;  // cap lissé (deg)
let lastGeocodeAt = 0;
let lastOverpassAt = 0;
let lastOverpassCenter = null;
let roads = [];              // réseau routier en cache (issu d'Overpass)
let watchId = null;
let wakeLock = null;
let followMode = true;

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

  watchId = navigator.geolocation.watchPosition(onPosition, onGeoError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 15000,
  });

  document.getElementById('startOverlay').classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
  document.getElementById('stats').classList.remove('hidden');
  document.getElementById('recenterBtn').classList.remove('hidden');
}

function initMap() {
  map = L.map('map', { zoomControl: false, attributionControl: true })
         .setView(CHALON, 16);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap',
  }).addTo(map);

  trailLine = L.polyline([], { color: '#2f81f7', weight: 5, opacity: 0.7 }).addTo(map);

  const icon = L.divIcon({ className: '', html: '<div class="gps-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
  gpsMarker = L.marker(CHALON, { icon }).addTo(map);

  nextMarker = L.circleMarker(CHALON, { radius: 8, color: '#fff', weight: 2, fillColor: '#2f81f7', fillOpacity: 1 });
  dirMarker  = L.circleMarker(CHALON, { radius: 8, color: '#fff', weight: 2, fillColor: '#18c37d', fillOpacity: 1 });

  // Si l'utilisateur déplace la carte manuellement, on quitte le mode suivi
  map.on('dragstart', () => { followMode = false; });
  document.getElementById('recenterBtn').addEventListener('click', () => {
    followMode = true;
    if (lastPos) map.setView(lastPos, map.getZoom());
  });
}

/* ---------- Callback GPS ---------- */
function onPosition(pos) {
  const { latitude, longitude, accuracy, speed, heading } = pos.coords;
  const here = [latitude, longitude];

  // Vitesse (m/s) — depuis le GPS ou calculée
  let spd = (typeof speed === 'number' && speed >= 0) ? speed : 0;

  // Cap : priorité au GPS s'il bouge, sinon calcul depuis le déplacement
  let hdg = null;
  if (typeof heading === 'number' && !isNaN(heading) && spd > 1.5) {
    hdg = heading;
  } else if (lastPos && haversine(lastPos, here) > 4) {
    hdg = bearing(lastPos, here);
    if (spd === 0) {
      // estime la vitesse depuis le déplacement si le GPS ne la donne pas
      spd = haversine(lastPos, here) / 1; // approx (1 maj/s)
    }
  }

  // Lissage du cap (moyenne circulaire pondérée)
  if (hdg !== null) {
    if (smoothedHeading === null) smoothedHeading = hdg;
    else smoothedHeading = (smoothedHeading + angleDiff(smoothedHeading, hdg) * 0.4 + 360) % 360;
  }

  // Trace + marqueur
  trail.push(here);
  if (trail.length > 400) trail.shift();
  trailLine.setLatLngs(trail);
  gpsMarker.setLatLng(here);
  if (followMode) map.setView(here, map.getZoom());

  lastPos = here;

  // Affichage des stats
  document.getElementById('speed').textContent = Math.round(spd * 3.6);
  document.getElementById('accuracy').textContent = accuracy ? Math.round(accuracy) : '—';
  document.getElementById('heading').textContent =
    smoothedHeading !== null ? `${cardinal(smoothedHeading)} ${Math.round(smoothedHeading)}°` : '—';

  // Flèche de direction (oriente vers le cap, relatif au haut = nord)
  const arrow = document.getElementById('directionArrow');
  if (smoothedHeading !== null) arrow.style.transform = `rotate(${smoothedHeading}deg)`;

  // Prédictions (asynchrones, throttlées)
  updatePredictions(here, spd);
}

function onGeoError(err) {
  const map = {
    1: "Localisation refusée. Autorise l'accès GPS dans les réglages du navigateur.",
    2: "Position indisponible (signal GPS faible).",
    3: "Délai de localisation dépassé.",
  };
  const msg = map[err.code] || err.message;
  const errEl = document.getElementById('startError');
  if (!document.getElementById('startOverlay').classList.contains('hidden')) {
    errEl.textContent = msg;
  } else {
    document.getElementById('currentStreet').textContent = msg;
  }
}

/* ---------- Prédictions ---------- */
async function updatePredictions(here, spd) {
  if (smoothedHeading === null) return;
  const hdg = smoothedHeading;

  // Distances adaptatives selon la vitesse
  const streetAhead = Math.max(80, Math.min(600, spd * 8));   // prochaine rue
  const cityAhead   = Math.max(1200, Math.min(6000, spd * 70)); // direction lointaine

  // 1) Réseau routier local via Overpass (mis à jour quand on a bougé de 250 m)
  if (!lastOverpassCenter || haversine(lastOverpassCenter, here) > 250) {
    if (Date.now() - lastOverpassAt > 4000) {
      lastOverpassAt = Date.now();
      lastOverpassCenter = here;
      fetchRoads(here).catch(() => {});
    }
  }

  // 2) Prochaine(s) rue(s) à partir du réseau en cache
  const upcoming = predictStreetsFromRoads(here, hdg, streetAhead);
  const nextEl = document.getElementById('nextStreet');
  if (upcoming.length) {
    nextEl.textContent = upcoming[0].name;
    const chips = upcoming.slice(1, 4)
      .map(s => `<span class="chip">→ ${s.name}</span>`).join('');
    document.getElementById('upcoming').innerHTML = chips;
  }

  // 3) Direction (ville / quartier) via géocodage du point lointain — throttlé
  if (Date.now() - lastGeocodeAt > 5000) {
    lastGeocodeAt = Date.now();
    const far = destination(here, hdg, cityAhead);
    dirMarker.setLatLng(far);
    if (!map.hasLayer(dirMarker)) dirMarker.addTo(map);

    reverseLocality(far).then(loc => {
      if (loc) document.getElementById('directionName').textContent = loc;
    }).catch(() => {});

    // Si Overpass n'a encore rien donné, on géocode aussi la rue projetée
    if (!upcoming.length) {
      const near = destination(here, hdg, streetAhead);
      nextMarker.setLatLng(near);
      if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
      reverseStreet(near).then(st => {
        if (st) document.getElementById('nextStreet').textContent = st;
      }).catch(() => {});
    }
  }

  // Marqueur "prochaine rue" sur la carte
  if (upcoming.length && upcoming[0].point) {
    nextMarker.setLatLng(upcoming[0].point);
    if (!map.hasLayer(nextMarker)) nextMarker.addTo(map);
  }

  // Rue actuelle = route la plus proche du réseau
  const cur = nearestRoad(here);
  if (cur) document.getElementById('currentStreet').textContent = cur.name;
}

/* Récupère le réseau routier nommé autour de la position (Overpass) */
async function fetchRoads(center) {
  const radius = 700;
  const q = `[out:json][timeout:12];
    way(around:${radius},${center[0]},${center[1]})
      [highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"]
      [name];
    out geom;`;
  const endpoints = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q) });
      if (!res.ok) continue;
      const data = await res.json();
      roads = (data.elements || [])
        .filter(e => e.geometry && e.tags && e.tags.name)
        .map(e => ({ name: e.tags.name, geom: e.geometry.map(g => [g.lat, g.lon]) }));
      return;
    } catch (e) { /* essaie l'endpoint suivant */ }
  }
}

/* Route la plus proche de la position courante */
function nearestRoad(here) {
  let best = null;
  for (const road of roads) {
    for (let i = 0; i < road.geom.length - 1; i++) {
      const seg = pointToSegment(here, road.geom[i], road.geom[i + 1]);
      if (!best || seg.dist < best.dist) best = { name: road.name, dist: seg.dist, point: seg.point };
    }
  }
  return best && best.dist < 60 ? best : null;
}

/* Rues probables devant nous, le long du cap, dans le réseau en cache.
   On échantillonne des points projetés et on relève les rues croisées,
   en ne gardant que celles situées « devant » (cap compatible). */
function predictStreetsFromRoads(here, hdg, maxDist) {
  if (!roads.length) return [];
  const current = nearestRoad(here);
  const currentName = current ? current.name : null;
  const found = [];      // { name, dist, point }
  const seen = new Set();

  // Échantillonne le long du cap
  const step = 25;
  for (let d = 30; d <= maxDist; d += step) {
    const probe = destination(here, hdg, d);
    let best = null;
    for (const road of roads) {
      for (let i = 0; i < road.geom.length - 1; i++) {
        const seg = pointToSegment(probe, road.geom[i], road.geom[i + 1]);
        if (!best || seg.dist < best.dist) best = { name: road.name, dist: seg.dist, point: seg.point };
      }
    }
    if (best && best.dist < 30 && best.name !== currentName && !seen.has(best.name)) {
      // Vérifie que la rue est bien « devant » (cap depuis nous compatible)
      const brngToIt = bearing(here, best.point);
      if (Math.abs(angleDiff(hdg, brngToIt)) < 75) {
        seen.add(best.name);
        found.push({ name: best.name, dist: haversine(here, best.point), point: best.point });
      }
    }
  }
  found.sort((a, b) => a.dist - b.dist);
  return found;
}

/* ---------- Géocodage Nominatim (rue + localité) ---------- */
async function nominatimReverse(point, zoom) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
              `&lat=${point[0]}&lon=${point[1]}&zoom=${zoom}&accept-language=fr`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error('nominatim');
  return res.json();
}

async function reverseStreet(point) {
  const d = await nominatimReverse(point, 17);
  const a = d.address || {};
  return a.road || a.pedestrian || a.footway || a.residential || null;
}

async function reverseLocality(point) {
  const d = await nominatimReverse(point, 14);
  const a = d.address || {};
  return a.suburb || a.neighbourhood || a.quarter ||
         a.village || a.town || a.city_district || a.city ||
         a.municipality || a.county || null;
}

/* ---------- Wake Lock (garde l'écran allumé) ---------- */
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
  } catch (e) { /* non bloquant */ }
}
