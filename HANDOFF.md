# REFUS-DOP — HANDOFF (architecture & phases)

Assistant de navigation temps réel pour suivi de véhicule / refus d'obtempérer.
PWA mobile-first, React 18 + Vite + TypeScript, MapLibre, offline-first.

> ⚠️ Outil d'**aide à l'anticipation**. La prédiction de trajectoire est
> probabiliste : utile, jamais une certitude. À utiliser comme passager ou sur
> support — jamais en conduisant.

## Décisions de cadrage (validées)

- **Migration** : la PWA React/TS remplace l'app vanilla ; l'ancienne est archivée dans `/legacy`.
- **Déploiement** : GitHub Actions → GitHub Pages à chaque push sur `main` (`.github/workflows/deploy.yml`).
- **Périmètre géo** : Chalon-sur-Saône optimisé (quartiers embarqués, graphe préchargé) mais fonctionne ailleurs en chargeant autour du GPS.
- **Rythme** : plan (ce document) puis scaffold + Phase 1, ensuite phase par phase.

## Stack

| Domaine | Choix |
|---|---|
| Frontend | React 18, Vite, TypeScript strict |
| Carte | MapLibre GL JS (fond sombre). Raster CARTO dark sans clé par défaut ; vecteur (OpenFreeMap/MapTiler) en option (voir note ci-dessous) |
| État | Zustand |
| Données routières | OSM via Overpass (topologie, `oneway`, `access`, classes) |
| Géocodage | Nominatim / Photon, cache local agressif (IndexedDB) |
| Quartiers | Polygones OSM (`boundary`, `place=neighbourhood/suburb/quarter`) + jeu embarqué Chalon |
| Stockage | IndexedDB via Dexie (trajets + cache routier) |
| Calcul lourd | Web Workers (routing, point-in-polygon) — UI jamais bloquée |
| PWA | vite-plugin-pwa (Workbox), manifest, installable iOS/Android, offline-first |
| Géoloc | `watchPosition` highAccuracy + filtre de Kalman + dead reckoning |

> **Note tuiles vectorielles** : les vraies tuiles vectorielles sans clé sont rares.
> Par défaut on utilise un fond **raster sombre CARTO** (zéro clé, fiable, cache offline).
> Passer au vectoriel = remplacer l'URL de style dans `src/config/mapStyle.ts`
> (ex. OpenFreeMap, ou MapTiler avec clé). MapLibre gère les deux à l'identique.

## Architecture des dossiers

```
src/
  main.tsx, App.tsx
  config/        chalon.ts (centre, bbox), mapStyle.ts
  data/          quartiers.ts (jeu embarqué Chalon, issu d'OSM)
  types/         index.ts (types stricts partagés)
  lib/           geo.ts (haversine, bearing…), kalman.ts, format.ts
  store/         useAppStore.ts (Zustand)
  hooks/         useGeolocation, useHeading, useWakeLock,
                 useRoadGraph, useNeighborhood, useDirectionPredictor, useTripRecorder
  services/      osmService, geocodeService, predictionEngine, storageService
  workers/       prediction.worker.ts, geo.worker.ts
  components/    MapView, Hud, SessionButton, PermissionGate,
                 PredictionPanel, TripSummary, HistoryView
```

## Découpage en phases

- **Phase 0 — Scaffold** ✅ : projet Vite/React/TS, PWA, CI Pages, thème sombre, store Zustand, types, lib géo, données quartiers embarquées.
- **Phase 1 — Carte temps réel fluide** ✅ : MapLibre fond sombre, `useGeolocation` (Kalman), boussole, interpolation 60 fps (rAF), mode *heading-up*, zoom adaptatif vitesse, HUD (vitesse / rue / quartier), Wake Lock, bouton DÉMARRER/ARRÊTER.
- **Phase 2 — Graphe routier** : `osmService` Overpass + `useRoadGraph`, cache Dexie, préchargement par rayon, parsing `oneway`/`access`/classes, Web Worker.
- **Phase 3 — Moteur de prédiction** : `predictionEngine` (worker) — intersections, exclusion sens interdits / voies non motorisées, probabilités % (inertie + hiérarchie + alignement), axe majeur + quartier visé.
- **Phase 4 — Quartiers (polygones)** : chargement boundaries OSM, point-in-polygon (turf, worker), quartier actuel + prochain quartier selon cap.
- **Phase 5 — Enregistrement trajet** : `useTripRecorder` + Dexie, log points/rues/quartiers horodatés, récap (distance, durée, vitesses, segments), export JSON/GPX/texte.
- **Phase 6 — Historique** : liste des sessions, rejeu sur carte, suppression.
- **Phase 7 — Robustesse & test** : dead reckoning perte GPS, cache géocodage, offline, **mode test rejeu GPX** pour tester sans bouger.

## État d'avancement

- [x] Phase 0 — Scaffold
- [x] Phase 1 — Carte temps réel fluide
- [x] Phase 2 — Graphe routier (Overpass + cache Dexie par cellule, préchargement, worker)
- [x] Phase 3 — Moteur de prédiction (worker : sorties légales, probabilités %, grand axe, itinéraire)
- [ ] Phase 4 — Quartiers (polygones)
- [x] Phase 5 — Enregistrement trajet (Dexie, rues/quartiers horodatés, récap, export JSON/GPX/texte)
- [x] Phase 6 — Historique (liste, récap, suppression)
- [ ] Phase 7 — Robustesse & test
