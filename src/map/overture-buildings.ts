import type { LayerSpecification } from 'maplibre-gl'
import type { MapTheme } from './theme'

export const OVERTURE_BUILDINGS_PATH = '/tiles/overture-buildings.pmtiles'

const BUILDING_PAINT = {
  light: { fill: '#dfdfdf', outline: '#d4d4d4' },
  dark: { fill: '#393939', outline: '#0e0e0e' },
} as const

/**
 * Recorte Overture 2026-07-22.0 (theme buildings) para el municipio de Montería.
 *
 * Regenerar:
 * pmtiles extract https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles public/tiles/overture-buildings.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 */
export function overtureBuildingLayers(
  theme: MapTheme,
): LayerSpecification[] {
  const paint = BUILDING_PAINT[theme]
  return [
    {
      id: 'overture-buildings',
      type: 'fill',
      source: 'overture-buildings',
      'source-layer': 'building',
      minzoom: 12,
      filter: ['!=', ['get', 'is_underground'], true],
      paint: {
        'fill-color': paint.fill,
        'fill-opacity': 0.9,
        'fill-outline-color': paint.outline,
      },
    },
  ]
}
