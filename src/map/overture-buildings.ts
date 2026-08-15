import type { LayerSpecification } from 'maplibre-gl'
import { solarFillColor } from './solar'
import type { MapTheme } from './theme'

export const OVERTURE_BUILDINGS_PATH = '/tiles/overture-buildings.pmtiles'
export const OVERTURE_BUILDINGS_SOURCE_ID = 'overture-buildings'
export const OVERTURE_BUILDINGS_SOURCE_LAYER = 'building'
export const OVERTURE_BUILDINGS_LAYER_ID = 'overture-buildings'
export const OVERTURE_BUILDINGS_SELECTED_LAYER_ID = 'overture-buildings-selected'

const BUILDING_OUTLINE = {
  light: '#ffffff',
  dark: '#0e0e0e',
} as const

const SELECTED_LINE = {
  light: '#9a3412',
  dark: '#fef3c7',
} as const

/**
 * Recorte Overture 2026-07-22.0 (theme buildings) para el municipio de Montería.
 *
 * Regenerar geometría:
 * pmtiles extract https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles public/tiles/overture-buildings.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 *
 * Pintar potencial FV (Open-Meteo, precalculado):
 * bun run solar:build
 */
export function overtureBuildingLayers(
  theme: MapTheme,
): LayerSpecification[] {
  return [
    {
      id: OVERTURE_BUILDINGS_LAYER_ID,
      type: 'fill',
      source: OVERTURE_BUILDINGS_SOURCE_ID,
      'source-layer': OVERTURE_BUILDINGS_SOURCE_LAYER,
      minzoom: 12,
      filter: ['!=', ['get', 'is_underground'], true],
      paint: {
        'fill-color': solarFillColor(theme),
        'fill-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          1,
          0.92,
        ],
        'fill-outline-color': BUILDING_OUTLINE[theme],
      },
    },
    {
      id: OVERTURE_BUILDINGS_SELECTED_LAYER_ID,
      type: 'line',
      source: OVERTURE_BUILDINGS_SOURCE_ID,
      'source-layer': OVERTURE_BUILDINGS_SOURCE_LAYER,
      minzoom: 12,
      paint: {
        'line-color': SELECTED_LINE[theme],
        'line-width': 2.5,
        'line-opacity': [
          'case',
          ['boolean', ['feature-state', 'selected'], false],
          1,
          0,
        ],
      },
    },
  ]
}
