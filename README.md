# REFUS-DOP — Assistant de poursuite

Web app mobile qui suit ta position **GPS en temps réel** et indique, pendant
un refus d'obtempérer :

- 🛣️ **La prochaine rue probable** en **suivant le graphe routier réel** : l'app reste sur ta voie
  et, à chaque intersection, choisit la continuation la plus probable (la plus droite, même nom
  prioritaire, plus gros axe, sans demi-tour). Elle indique **tout droit / à gauche / à droite**,
  la distance, et signale les **bifurcations** (en T : « à gauche ou à droite »).
  Elle ne nomme donc plus une rue perpendiculaire qu'on ne peut pas traverser tout droit.
- ⚠️ **Sens uniques pris en compte (mode hybride)** : la prédiction privilégie les trajets **légaux**
  (sens uniques `oneway`, ronds-points), mais comme un fuyard force souvent, elle **signale le
  contresens** « ⚠ à contresens » quand c'est la continuation logique (sens interdit pris à l'envers).
- ➡️ **La direction (grand axe)** : l'avenue / le boulevard / la voie majeure vers laquelle tu vas,
  choisie par importance réelle de la voie (les noms qu'on utilise vraiment en intervention),
  + le quartier connu en complément s'il existe
- 🏁 **La prochaine ville** (façon panneau routier) calculée selon **ton cap et ta vitesse** :
  plus tu vas vite, plus la cible visée est loin (autoroute → ville lointaine ; en ville → localité proche)
- 📍 Ta **rue actuelle**, ta **vitesse** et ton **cap** (boussole de l'iPhone)
- 🗺️ Une **carte fluide** (interpolation 60 fps) avec ta trace et le rayon de trajectoire
- 🐞 Un **panneau de débogage** (fixes GPS, précision, vitesses, caps, état des services)

Tout fonctionne **dans le navigateur du téléphone**, sans serveur ni clé API
payante. Les seules requêtes réseau sont les fonds de carte
(OpenStreetMap), le réseau routier (Overpass) et le géocodage de localité
(Nominatim).

## ⚠️ Usage

À utiliser **comme passager** ou sur un support fixe — **jamais en conduisant**.
La prédiction est une estimation basée sur ta direction et le tracé des rues :
elle aide à anticiper, elle ne remplace pas ton jugement.

## Comment ça marche

1. L'app lit ta position via l'**API de géolocalisation** du navigateur
   (`watchPosition`, haute précision).
2. Elle calcule ton **cap** (depuis le GPS, ou depuis tes derniers déplacements).
3. Elle télécharge le **réseau routier** autour de toi (Overpass / OpenStreetMap).
4. Elle **projette ta trajectoire** vers l'avant et repère les rues croisées
   situées devant toi → c'est la *prochaine rue probable* (+ les suivantes).
5. Elle projette **plus loin** (proportionnel à ta vitesse) et géocode le point
   pour donner la **ville/quartier** vers lequel tu te diriges.

Les distances de projection s'**adaptent à la vitesse** : plus tu vas vite,
plus l'app regarde loin devant.

## Lancer l'app

### Option A — GitHub Pages (recommandé, accessible depuis le téléphone)
1. Sur GitHub : **Settings → Pages**.
2. *Source* : branche `main` (ou ta branche), dossier `/ (root)`.
3. Ouvre l'URL fournie (ex. `https://<user>.github.io/REFUS-DOP/`) sur ton téléphone.
4. « Ajouter à l'écran d'accueil » pour l'installer comme une app (plein écran).

> La géolocalisation **exige HTTPS**. GitHub Pages est en HTTPS, c'est parfait.

### Option B — En local pour tester
```bash
# Python
python3 -m http.server 8000
# puis ouvrir http://localhost:8000 (localhost est autorisé pour le GPS)
```
Pour tester depuis le téléphone en local, il faut du HTTPS (ex. `ngrok`,
`mkcert`) car le GPS est bloqué hors `localhost`/HTTPS.

## Utilisation
1. Ouvre l'app, appuie sur **▶ DÉMARRER LE SUIVI**.
2. Autorise la **localisation** quand le navigateur le demande.
3. La carte se centre sur toi et te suit. Le bandeau du haut affiche la
   prochaine rue et la direction ; la barre du bas, tes données.
4. Bouton ⌖ pour recentrer la carte si tu l'as déplacée.

## Limites / pistes d'amélioration
- La prédiction suit le **cap géométrique** : à une intersection complexe,
  plusieurs rues peuvent être proposées (affichées en « → » sous la principale).
- Overpass/Nominatim sont des services publics gratuits avec des limites de
  débit ; l'app les interroge avec parcimonie (throttling). Pour un usage
  intensif, on peut héberger sa propre instance Overpass ou utiliser une clé
  de routage dédiée.
- Évolutions possibles : suivi de la rue le long du graphe routier (au lieu
  d'une simple projection), alertes vocales, mode nuit auto, enregistrement
  des trajets.

## Données des quartiers

Les noms de quartiers proviennent d'OpenStreetMap et sont **intégrés en dur**
dans `quartiers.js` (101 quartiers de Chalon-sur-Saône et ses alentours, avec
coordonnées réelles). Ça garantit des noms précis et connus (Prés Saint-Jean /
ZUP, Les Aubépins, Saint-Cosme, Le Stade, Bellevue, Plateau Saint-Jean,
Boucicaut, Citadelle, Île Saint-Laurent…), même hors-ligne. Les grands
quartiers sont priorisés (`w:3`) sur les lotissements/zones (`w:1`).

Pour régénérer/étendre la liste depuis OSM :
```bash
curl -s -A 'REFUS-DOP/1.0' -G 'https://overpass-api.de/api/interpreter' \
  --data-urlencode 'data=[out:json];node(around:13000,46.7806,4.8537)[place~"^(suburb|quarter|neighbourhood)$"][name];out;'
```

## Pile technique
- HTML / CSS / JavaScript (aucun build)
- [Leaflet](https://leafletjs.com/) + OpenStreetMap (carte)
- [Overpass API](https://overpass-api.de/) (réseau routier)
- [Nominatim](https://nominatim.org/) (géocodage de localité)
- PWA (manifest + service worker) pour l'installation sur mobile
