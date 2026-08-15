import { join } from 'node:path'
import { VectorTile } from '@mapbox/vector-tile'
import { PbfReader } from 'pbf'
import { PMTiles, type Source } from 'pmtiles'
import { MONTERIA_BBOX } from '../../src/map/monteria.ts'
import { geometryAreaM2, geometryCentroid } from './area.ts'

const BUILDINGS_PATH = join(
  import.meta.dir,
  '../../public/tiles/overture-buildings.pmtiles',
)

class BytesSource implements Source {
  constructor(private readonly bytes: ArrayBuffer) {}

  getKey(): string {
    return 'overture-buildings'
  }

  async getBytes(offset: number, length: number) {
    return { data: this.bytes.slice(offset, offset + length) }
  }
}

function lngToTile(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z)
}

function latToTile(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z,
  )
}

export type BuildingFeature = {
  id: string
  class?: string
  subtype?: string
  height?: number
  is_underground: boolean
  area_m2: number
  lon: number
  lat: number
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
}

function asPolygonGeometry(
  geometry: GeoJSON.Geometry,
): GeoJSON.Polygon | GeoJSON.MultiPolygon | null {
  if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
    return geometry
  }
  return null
}

export async function extractBuildings(): Promise<BuildingFeature[]> {
  const bytes = await Bun.file(BUILDINGS_PATH).arrayBuffer()
  const archive = new PMTiles(new BytesSource(bytes))
  const header = await archive.getHeader()
  const z = header.maxZoom
  const minX = lngToTile(MONTERIA_BBOX.minLon, z)
  const maxX = lngToTile(MONTERIA_BBOX.maxLon, z)
  const minY = latToTile(MONTERIA_BBOX.maxLat, z)
  const maxY = latToTile(MONTERIA_BBOX.minLat, z)

  const best = new Map<string, BuildingFeature>()
  let tiles = 0

  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      const response = await archive.getZxy(z, x, y)
      if (!response) {
        continue
      }
      tiles += 1
      const tile = new VectorTile(new PbfReader(response.data))
      const layer = tile.layers.building
      if (!layer) {
        continue
      }
      for (let i = 0; i < layer.length; i++) {
        const feature = layer.feature(i)
        const geojson = feature.toGeoJSON(x, y, z)
        const geometry = asPolygonGeometry(geojson.geometry)
        if (!geometry) {
          continue
        }
        const area_m2 = geometryAreaM2(geometry)
        const id = String(feature.properties.id ?? `${x}/${y}/${i}`)
        const previous = best.get(id)
        if (previous && previous.area_m2 >= area_m2) {
          continue
        }
        const centroid = geometryCentroid(geometry)
        const height = feature.properties.height
        best.set(id, {
          id,
          class:
            typeof feature.properties.class === 'string'
              ? feature.properties.class
              : undefined,
          subtype:
            typeof feature.properties.subtype === 'string'
              ? feature.properties.subtype
              : undefined,
          height: typeof height === 'number' ? height : undefined,
          is_underground: feature.properties.is_underground === true,
          area_m2,
          lon: centroid.lon,
          lat: centroid.lat,
          geometry,
        })
      }
    }
  }

  console.log(`Teselas z${z} leídas: ${tiles}. Edificios únicos: ${best.size}`)
  return [...best.values()]
}
