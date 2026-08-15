import { gzipSync } from 'node:zlib'
import { Database } from 'bun:sqlite'
import geojsonvt from 'geojson-vt'
import vtpbf from 'vt-pbf'
import { MONTERIA_BBOX } from '../../src/map/monteria.ts'

const MIN_ZOOM = 12
const MAX_ZOOM = 14

async function loadFeatures(geojsonseqPath: string): Promise<GeoJSON.Feature[]> {
  const text = await Bun.file(geojsonseqPath).text()
  const features: GeoJSON.Feature[] = []
  for (const line of text.split('\n')) {
    if (line.length === 0) {
      continue
    }
    features.push(JSON.parse(line) as GeoJSON.Feature)
  }
  return features
}

export async function writeMbtiles(
  geojsonseqPath: string,
  mbtilesPath: string,
): Promise<void> {
  const features = await loadFeatures(geojsonseqPath)
  console.log(`Indexando ${features.length} polígonos para teselas z${MIN_ZOOM}–${MAX_ZOOM}…`)

  const index = geojsonvt(
    { type: 'FeatureCollection', features },
    {
      maxZoom: MAX_ZOOM,
      indexMaxZoom: MAX_ZOOM,
      indexMaxPoints: 0,
      tolerance: 2,
      buffer: 64,
      extent: 4096,
    },
  )

  const db = new Database(mbtilesPath, { create: true })
  db.exec('DROP TABLE IF EXISTS tiles')
  db.exec('DROP TABLE IF EXISTS metadata')
  db.exec(
    'CREATE TABLE tiles (zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)',
  )
  db.exec('CREATE TABLE metadata (name TEXT, value TEXT)')
  db.exec(
    'CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)',
  )

  db.exec('BEGIN')
  const insert = db.prepare(
    'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?, ?, ?, ?)',
  )

  let written = 0
  for (const coord of index.tileCoords) {
    if (coord.z < MIN_ZOOM || coord.z > MAX_ZOOM) {
      continue
    }
    const tile = index.getTile(coord.z, coord.x, coord.y)
    if (!tile || tile.features.length === 0) {
      continue
    }
    const raw = vtpbf.fromGeojsonVt(
      { building: tile },
      { version: 2, extent: 4096 },
    )
    const compressed = gzipSync(raw)
    const tmsY = (1 << coord.z) - 1 - coord.y
    insert.run(coord.z, coord.x, tmsY, compressed)
    written += 1
  }
  db.exec('COMMIT')

  const bounds = [
    MONTERIA_BBOX.minLon,
    MONTERIA_BBOX.minLat,
    MONTERIA_BBOX.maxLon,
    MONTERIA_BBOX.maxLat,
  ].join(',')
  const meta = db.prepare('INSERT INTO metadata (name, value) VALUES (?, ?)')
  meta.run('name', 'Overture buildings')
  meta.run('format', 'pbf')
  meta.run('minzoom', String(MIN_ZOOM))
  meta.run('maxzoom', String(MAX_ZOOM))
  meta.run('bounds', bounds)
  meta.run(
    'json',
    JSON.stringify({
      vector_layers: [
        {
          id: 'building',
          minzoom: MIN_ZOOM,
          maxzoom: MAX_ZOOM,
          fields: {
            id: 'String',
            class: 'String',
            subtype: 'String',
            height: 'Number',
            is_underground: 'Boolean',
            kwh_year: 'Number',
            area_m2: 'Number',
            ghi_kwh_m2: 'Number',
          },
        },
      ],
    }),
  )
  db.close()
  console.log(`MBTiles: ${written} teselas → ${mbtilesPath}`)
}
