import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { useAppStore, effectiveHeading } from '../store/useAppStore';
import { DARK_STYLE } from '../config/mapStyle';
import {
  CHALON_CENTER,
  INITIAL_ZOOM,
  ZOOM_SLOW,
  ZOOM_FAST,
  SPEED_FOR_MAX_DEZOOM,
} from '../config/chalon';
import { lerpLatLng, lerpAngle } from '../lib/geo';
import type { LatLng } from '../types';

/** Zoom cible selon la vitesse : lent = rapproché, rapide = dézoomé. */
function zoomForSpeed(speedMs: number): number {
  const t = Math.min(1, Math.max(0, speedMs / SPEED_FOR_MAX_DEZOOM));
  return ZOOM_SLOW + (ZOOM_FAST - ZOOM_SLOW) * t;
}

/**
 * Carte temps réel : MapLibre (fond sombre) + marqueur véhicule directionnel.
 * Le mouvement est interpolé à 60 fps (requestAnimationFrame) par lissage
 * exponentiel vers la dernière position GPS, pour un rendu jamais saccadé même
 * si le GPS ne rafraîchit qu'à 1 Hz. Caméra « heading-up » et zoom adaptatif.
 */
export function MapView(): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerEl = useRef<HTMLDivElement | null>(null);
  const arrowEl = useRef<HTMLDivElement | null>(null);

  // État rendu (interpolé), distinct des cibles GPS.
  const render = useRef<{ pos: LatLng; heading: number; zoom: number; has: boolean }>({
    pos: CHALON_CENTER,
    heading: 0,
    zoom: INITIAL_ZOOM,
    has: false,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [CHALON_CENTER.lng, CHALON_CENTER.lat],
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
      pitchWithRotate: false,
      dragRotate: false,
    });
    mapRef.current = map;

    // Couche « itinéraire probable » (mise à jour quand la prédiction change).
    let routeReady = false;
    let lastPoly: unknown = null;
    map.on('load', () => {
      map.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } },
      });
      map.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#16c37d', 'line-width': 6, 'line-opacity': 0.65 },
      });
      routeReady = true;
    });

    // Quitter le suivi si l'utilisateur déplace la carte manuellement
    // (dragstart n'est émis que par un glissement utilisateur, pas par jumpTo).
    map.on('dragstart', () => useAppStore.getState().setFollow(false));

    // Marqueur véhicule (flèche directionnelle).
    const el = document.createElement('div');
    el.className = 'vehicle';
    const arrow = document.createElement('div');
    arrow.className = 'vehicle-arrow';
    el.appendChild(arrow);
    markerEl.current = el;
    arrowEl.current = arrow;
    const marker = new maplibregl.Marker({ element: el, rotationAlignment: 'viewport' })
      .setLngLat([CHALON_CENTER.lng, CHALON_CENTER.lat])
      .addTo(map);

    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const s = useAppStore.getState();
      const fix = s.fix;
      const r = render.current;

      if (fix) {
        const targetHeading = effectiveHeading(s) ?? r.heading;
        const targetZoom = zoomForSpeed(fix.speed);
        if (!r.has) {
          // Premier point : on se cale directement dessus.
          r.pos = fix.pos;
          r.heading = targetHeading;
          r.zoom = targetZoom;
          r.has = true;
          map.jumpTo({ center: [fix.pos.lng, fix.pos.lat], zoom: targetZoom });
        } else {
          r.pos = lerpLatLng(r.pos, fix.pos, 0.18);
          r.heading = lerpAngle(r.heading, targetHeading, 0.2);
          r.zoom += (targetZoom - r.zoom) * 0.08;
        }
      }

      // Itinéraire probable : ne redessine que quand la prédiction a changé.
      if (routeReady && s.prediction && s.prediction.poly !== lastPoly) {
        lastPoly = s.prediction.poly;
        const src = map.getSource('route') as maplibregl.GeoJSONSource | undefined;
        src?.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: s.prediction.poly.map((p) => [p.lng, p.lat]) },
        });
      }

      marker.setLngLat([r.pos.lng, r.pos.lat]);
      if (arrowEl.current) {
        const screenRot = s.orientation === 'heading-up' ? 0 : r.heading;
        arrowEl.current.style.transform = `rotate(${screenRot}deg)`;
      }
      if (s.follow && r.has) {
        map.jumpTo({
          center: [r.pos.lng, r.pos.lat],
          bearing: s.orientation === 'heading-up' ? r.heading : 0,
          zoom: r.zoom,
        });
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      marker.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="map" />;
}
