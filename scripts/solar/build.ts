import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { PV_SYSTEM_FACTOR } from '../../src/map/solar.ts'
import { extractBuildings } from './buildings.ts'
import { loadOrFetchGhiGrid, nearestGhi } from './ghi.ts'
import { ensurePmtilesCli } from './pmtiles-cli.ts'
import { writeMbtiles } from './tiles.ts'

const GEOJSONSEQ_PATH = join(
  import.meta.dir,
  '../../data/solar/buildings-solar.geojsonseq',
)
const MBTILES_PATH = join(import.meta.dir, '../../data/solar/overture-buildings.mbtiles')
const OUTPUT_PMTILES = join(
  import.meta.dir,
  '../../data/solar/overture-buildings.pmtiles',
)
const PUBLIC_PMTILES = join(
  import.meta.dir,
  '../../public/tiles/overture-buildings.pmtiles',
)

const MIN_ROOF_M2 = 10

async function writeGeojsonSeq(
  features: GeoJSON.Feature[],
  path: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const writer = Bun.file(path).writer()
  for (const feature of features) {
    writer.write(`${JSON.stringify(feature)}\n`)
  }
  await writer.end()
}

async function convertPmtiles(
  cli: string,
  input: string,
  output: string,
): Promise<void> {
  try {
    await unlink(output)
  } catch {
    // first run
  }
  const proc = Bun.spawn([cli, 'convert', input, output], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  if (code !== 0) {
    throw new Error(`pmtiles convert exited ${code}`)
  }
}

const force = Bun.argv.includes('--force')
const hasSeq = await Bun.file(GEOJSONSEQ_PATH).exists()

if (!hasSeq || force) {
  const grid = await loadOrFetchGhiGrid(force)
  const ghiValues = grid.cells.map((cell) => cell.ghi_kwh_m2_year)
  const ghiMin = Math.min(...ghiValues)
  const ghiMax = Math.max(...ghiValues)
  console.log(
    `GHI ${grid.start_date}→${grid.end_date} (${grid.model}): ${ghiMin.toFixed(0)}–${ghiMax.toFixed(0)} kWh/m²·año, ${grid.cells.length} celdas`,
  )

  const buildings = await extractBuildings()
  const features: GeoJSON.Feature[] = []
  let skipped = 0
  let kwhMin = Infinity
  let kwhMax = 0
  let kwhSum = 0

  for (const building of buildings) {
    if (building.is_underground || building.area_m2 < MIN_ROOF_M2) {
      skipped += 1
      continue
    }
    const ghi = nearestGhi(building.lat, building.lon, grid.cells)
    const kwh_year = Math.round(ghi * building.area_m2 * PV_SYSTEM_FACTOR)
    kwhMin = Math.min(kwhMin, kwh_year)
    kwhMax = Math.max(kwhMax, kwh_year)
    kwhSum += kwh_year
    features.push({
      type: 'Feature',
      properties: {
        id: building.id,
        class: building.class,
        subtype: building.subtype,
        height: building.height,
        is_underground: building.is_underground,
        kwh_year,
        area_m2: Math.round(building.area_m2),
        ghi_kwh_m2: Math.round(ghi),
      },
      geometry: building.geometry,
    })
  }

  console.log(
    `Techos: ${features.length} (omitidos ${skipped}). kWh/año ${kwhMin}–${kwhMax}, suma ${Math.round(kwhSum / 1_000_000)} GWh`,
  )
  await writeGeojsonSeq(features, GEOJSONSEQ_PATH)
} else {
  console.log(`Reusando ${GEOJSONSEQ_PATH}`)
}

try {
  await unlink(MBTILES_PATH)
} catch {
  // first run
}

await writeMbtiles(GEOJSONSEQ_PATH, MBTILES_PATH)
const cli = await ensurePmtilesCli()
await convertPmtiles(cli, MBTILES_PATH, OUTPUT_PMTILES)
await Bun.write(PUBLIC_PMTILES, Bun.file(OUTPUT_PMTILES))
console.log(`Teselas: ${PUBLIC_PMTILES}`)
