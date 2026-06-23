import type { StyleSpecification } from 'maplibre-gl';

/**
 * Style MapLibre — fond sombre haute lisibilité, basé sur les tuiles raster
 * CARTO « dark_all » (gratuites, sans clé). Pour passer au vectoriel, remplacer
 * ce style par une URL de style (ex. OpenFreeMap, ou MapTiler avec clé).
 */
export const DARK_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    carto: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap © CARTO',
    },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#05070f' } },
    { id: 'carto', type: 'raster', source: 'carto' },
  ],
};
