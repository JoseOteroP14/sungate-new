import { layers } from '@protomaps/basemaps'
import type { StyleSpecification } from 'maplibre-gl'
import { mapcnFlavor } from './mapcn-flavors'
import { MONTERIA_TILES_PATH } from './monteria'
import {
  OVERTURE_BUILDINGS_PATH,
  overtureBuildingLayers,
} from './overture-buildings'
import type { MapTheme } from './theme'

export function createMapcnStyle(theme: MapTheme): StyleSpecification {
  const origin = window.location.origin
  const basemapUrl = new URL(MONTERIA_TILES_PATH, origin).href
  const buildingsUrl = new URL(OVERTURE_BUILDINGS_PATH, origin).href
  const flavor = mapcnFlavor(theme)
  const basemapLayers = layers('protomaps', flavor, { lang: 'es' }).filter(
    (layer) => layer.id !== 'buildings',
  )
  const overlay = overtureBuildingLayers(theme)
  const labelIndex = basemapLayers.findIndex((layer) => layer.type === 'symbol')
  const mergedLayers =
    labelIndex === -1
      ? [...basemapLayers, ...overlay]
      : [
          ...basemapLayers.slice(0, labelIndex),
          ...overlay,
          ...basemapLayers.slice(labelIndex),
        ]

  return {
    version: 8,
    glyphs:
      'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: `https://protomaps.github.io/basemaps-assets/sprites/v4/${theme}`,
    sources: {
      protomaps: {
        type: 'vector',
        url: `pmtiles://${basemapUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      'overture-buildings': {
        type: 'vector',
        url: `pmtiles://${buildingsUrl}`,
        attribution:
          '<a href="https://docs.overturemaps.org/attribution">Overture Maps</a>',
      },
    },
    layers: mergedLayers as StyleSpecification['layers'],
  }
}
