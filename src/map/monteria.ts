import type { LngLatBoundsLike, LngLatLike } from 'maplibre-gl'

/**
 * Municipio de Montería (OSM relation 1343449).
 * Bounding box from Nominatim: [minLat, maxLat, minLon, maxLon].
 *
 * Regenerar teselas:
 * pmtiles extract https://build.protomaps.com/YYYYMMDD.pmtiles public/tiles/monteria.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 * pmtiles extract https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-07-22.0/buildings.pmtiles public/tiles/overture-buildings.pmtiles --bbox=-76.2788082,8.263077,-75.6694089,8.9463209
 */
export const MONTERIA_BOUNDS: LngLatBoundsLike = [
  [-76.2788082, 8.263077],
  [-75.6694089, 8.9463209],
]

/** Vista inicial ~1.2 km al sur de Plaza de Bolívar. */
export const MONTERIA_CENTER: LngLatLike = [-75.8814, 8.744]

export const MONTERIA_MAX_ZOOM = 18
/** Zoom 13 + 7 tics de rueda (MapLibre ≈ 0.15 niveles por tic). */
export const MONTERIA_INITIAL_ZOOM = 14.06
export const MONTERIA_MIN_ZOOM = MONTERIA_INITIAL_ZOOM

/** Inclinación inicial (0 = zenital). 60° es el máximo por defecto de MapLibre (Ctrl + arrastrar). */
export const MONTERIA_INITIAL_PITCH = 60
export const MONTERIA_MAX_PITCH = 60

export const MONTERIA_TILES_PATH = '/tiles/monteria.pmtiles'
