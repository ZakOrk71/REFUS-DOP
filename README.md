# REFUS-DOP

PWA mobile-first d'assistance à la navigation temps réel pour le suivi de
véhicule : position GPS continue, prédiction des prochaines rues/directions en
respectant le code de la route, et enregistrement automatique du trajet pour
compte-rendu.

> ⚠️ **Usage** : à utiliser comme passager ou sur support fixe, **jamais en
> conduisant**. La prédiction de trajectoire est une **aide probabiliste**, pas
> une certitude.

## Stack

React 18 + Vite + TypeScript · MapLibre GL (fond sombre) · Zustand · Dexie
(IndexedDB) · Web Workers · PWA (vite-plugin-pwa / Workbox). Données :
OpenStreetMap (Overpass), Nominatim/Photon, quartiers OSM embarqués (Chalon).

L'architecture détaillée et le découpage en phases sont dans **[HANDOFF.md](./HANDOFF.md)**.

## Développement

```bash
npm install
npm run dev        # serveur de dev (https requis pour le GPS : voir ci-dessous)
npm run build      # typecheck strict + build de production (dossier dist/)
npm run preview     # prévisualise le build
npm run typecheck  # vérification de types seule
```

> Le GPS du navigateur exige un contexte **sécurisé** : `http://localhost` est
> autorisé en dev. Pour tester depuis un téléphone sur le réseau local, exposer
> en HTTPS (ex. `ngrok`, ou `vite --host` derrière un tunnel TLS).

## Déploiement (GitHub Pages, automatique)

Le workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
build et publie sur GitHub Pages à **chaque push sur `main`**.

À faire une seule fois côté dépôt : **Settings → Pages → Build and deployment →
Source : GitHub Actions**. L'URL de l'app s'affiche ensuite dans l'onglet
Actions / Pages. La `base` Vite est relative (`./`), donc l'app fonctionne quel
que soit le sous-chemin du dépôt.

## Structure

```
src/
  config/   chalon.ts, mapStyle.ts
  data/     quartiers.ts (101 quartiers de Chalon, source OSM)
  types/    index.ts
  lib/      geo.ts, kalman.ts, format.ts
  store/    useAppStore.ts (Zustand)
  hooks/    useGeolocation, useHeading, useWakeLock, useNeighborhood (+ à venir)
  components/ MapView, Hud, SessionButton, PermissionGate
legacy/     ancienne app vanilla (archivée, fallback simple)
```

## État

- ✅ **Phase 0** — Scaffold (Vite/React/TS, PWA, CI Pages, store, lib géo, données quartiers)
- ✅ **Phase 1** — Carte temps réel fluide : MapLibre sombre, GPS+Kalman, boussole,
  interpolation 60 fps, heading-up, zoom adaptatif, HUD (vitesse/rue/quartier), Wake Lock
- ✅ **Phase 2** — Graphe routier : Overpass (sens uniques/accès/classes), cache Dexie
  par cellule (offline-first), préchargement devant le véhicule, construction dans un Web Worker
- ✅ **Phase 3** — Moteur de prédiction (worker) : sorties d'intersection **autorisées**
  (sens interdits/accès exclus), **probabilités %** (inertie + hiérarchie + alignement),
  grand axe visé, itinéraire probable tracé sur la carte
- ✅ **Phase 5** — Enregistrement automatique du trajet : polyligne horodatée, journal des
  rues et quartiers, distance/vitesses, sauvegarde IndexedDB, **export JSON / GPX / compte-rendu texte**
- ✅ **Phase 6** — Historique des trajets : liste hors-ligne, récapitulatif, suppression
- ✅ **Phase 4** — Quartiers : détection **point-in-polygon** (polygones OSM) avec repli sur les
  points embarqués, + annonce du **prochain quartier** selon le cap
- ✅ **Phase 7** — Robustesse : **dead reckoning** sur perte de signal GPS, **mode démo / rejeu GPX**
  pour tester sans bouger

### Tester sans bouger
Sur l'écran de démarrage : **« Mode démo (rejeu) »** rejoue un trajet intégré à travers Chalon,
ou **« Rejouer un GPX »** pour importer ta propre trace. Idéal pour voir la prédiction et
l'enregistrement fonctionner depuis un ordinateur.

## Note sur les fonds de carte

Par défaut : tuiles **raster sombres CARTO** (gratuites, sans clé, mises en cache
offline). Pour passer au **vectoriel**, remplacer le style dans
`src/config/mapStyle.ts` par une URL de style (OpenFreeMap sans clé, ou MapTiler
avec clé). MapLibre gère les deux de façon identique.

## Limites connues

- Overpass et Nominatim ont des quotas stricts : le cache/préchargement (Phases
  2/7) est essentiel pour un usage temps réel. Pour un usage intensif, héberger
  sa propre instance Overpass ou des tuiles routières locales.
- La prédiction de virage reste une estimation : aide à l'anticipation, jamais
  une certitude.
