import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl'

/** Municipio de Montería (OSM relation 1343449). Nominatim: minLon, minLat, maxLon, maxLat. */
export const MONTERIA_BBOX = {
  minLon: -76.2788082,
  minLat: 8.263077,
  maxLon: -75.6694089,
  maxLat: 8.9463209,
} as const

/**
 * Regenerar teselas:
 * pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/tiles/monteria.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 * pmtiles extract https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles public/tiles/overture-buildings.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 * bun run solar:build
 */
export const MONTERIA_BOUNDS: LngLatBoundsLike = [
  [MONTERIA_BBOX.minLon, MONTERIA_BBOX.minLat],
  [MONTERIA_BBOX.maxLon, MONTERIA_BBOX.maxLat],
]

/** Vista inicial ~1.2 km al sur de Plaza de Bolívar. */
export const MONTERIA_CENTER: LngLatLike = [-75.8814, 8.744]

export const MONTERIA_MAX_ZOOM = 18
/** Zoom 13 + 10 tics de rueda (MapLibre ≈ 0.15 niveles por tic). */
export const MONTERIA_INITIAL_ZOOM = 14.51
export const MONTERIA_MIN_ZOOM = MONTERIA_INITIAL_ZOOM

/** Inclinación inicial (0 = zenital). 60° es el máximo por defecto de MapLibre (Ctrl + arrastrar). */
export const MONTERIA_INITIAL_PITCH = 60
export const MONTERIA_MAX_PITCH = 60

export const MONTERIA_TILES_PATH = '/tiles/monteria.pmtiles'
