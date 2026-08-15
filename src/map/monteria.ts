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

/** Centro urbano (Plaza de Bolívar). */
export const MONTERIA_CENTER: LngLatLike = [-75.8814, 8.755]

export const MONTERIA_MIN_ZOOM = 10
export const MONTERIA_MAX_ZOOM = 18
export const MONTERIA_INITIAL_ZOOM = 13

export const MONTERIA_TILES_PATH = '/tiles/monteria.pmtiles'
