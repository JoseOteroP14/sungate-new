import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { z } from 'zod'
import { MONTERIA_BBOX } from '../../src/map/monteria.ts'

export const GHI_GRID_PATH = join(import.meta.dir, '../../data/solar/ghi-grid.json')

/** ECMWF IFS ~9 km. SARAH-3 (Meteosat) no cubre longitud 76°W. */
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const MODEL = 'ecmwf_ifs'
const GRID_STEP_DEG = 0.1
const MJ_TO_KWH = 1 / 3.6
const BATCH_SIZE = 40
const USER_AGENT = 'Sungate/0.0.0 (Monteria rooftop solar potential)'

const LocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  daily: z.object({
    time: z.array(z.string()),
    shortwave_radiation_sum: z.array(z.number().nullable()),
  }),
})

const ArchiveSchema = z.union([LocationSchema, z.array(LocationSchema)])

export type GhiCell = {
  lat: number
  lon: number
  ghi_kwh_m2_year: number
}

export type GhiGrid = {
  source: string
  model: string
  start_date: string
  end_date: string
  cell_degrees: number
  cells: GhiCell[]
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function archiveWindow(): { start_date: string; end_date: string } {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 2)
  const start = new Date(end)
  start.setUTCFullYear(start.getUTCFullYear() - 1)
  start.setUTCDate(start.getUTCDate() + 1)
  return { start_date: isoDate(start), end_date: isoDate(end) }
}

function gridPoints(): { lat: number; lon: number }[] {
  const points: { lat: number; lon: number }[] = []
  for (
    let lat = MONTERIA_BBOX.minLat;
    lat <= MONTERIA_BBOX.maxLat + 1e-9;
    lat += GRID_STEP_DEG
  ) {
    for (
      let lon = MONTERIA_BBOX.minLon;
      lon <= MONTERIA_BBOX.maxLon + 1e-9;
      lon += GRID_STEP_DEG
    ) {
      points.push({ lat: Number(lat.toFixed(5)), lon: Number(lon.toFixed(5)) })
    }
  }
  return points
}

function annualKwhM2(sums: (number | null)[]): number {
  let totalMj = 0
  let days = 0
  for (const value of sums) {
    if (value === null) {
      continue
    }
    totalMj += value
    days += 1
  }
  if (days < 300) {
    throw new Error(`Open-Meteo returned ${days} valid GHI days (need ≥ 300)`)
  }
  return (totalMj / days) * 365.25 * MJ_TO_KWH
}

async function fetchBatch(
  points: { lat: number; lon: number }[],
  start_date: string,
  end_date: string,
): Promise<GhiCell[]> {
  const url = new URL(ARCHIVE_URL)
  url.searchParams.set('latitude', points.map((p) => p.lat).join(','))
  url.searchParams.set('longitude', points.map((p) => p.lon).join(','))
  url.searchParams.set('start_date', start_date)
  url.searchParams.set('end_date', end_date)
  url.searchParams.set('daily', 'shortwave_radiation_sum')
  url.searchParams.set('models', MODEL)
  url.searchParams.set('timezone', 'America/Bogota')

  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!response.ok) {
    throw new Error(`Open-Meteo ${response.status}: ${await response.text()}`)
  }

  const parsed = ArchiveSchema.parse(await response.json())
  const locations = Array.isArray(parsed) ? parsed : [parsed]
  if (locations.length !== points.length) {
    throw new Error(
      `Open-Meteo returned ${locations.length} locations, expected ${points.length}`,
    )
  }

  return locations.map((location, index) => ({
    lat: points[index].lat,
    lon: points[index].lon,
    ghi_kwh_m2_year: Number(
      annualKwhM2(location.daily.shortwave_radiation_sum).toFixed(1),
    ),
  }))
}

export async function loadOrFetchGhiGrid(
  options: { force?: boolean; allowStale?: boolean } = {},
): Promise<GhiGrid> {
  const force = options.force === true
  const allowStale = options.allowStale === true
  const window = archiveWindow()
  if (!force) {
    const cached = Bun.file(GHI_GRID_PATH)
    if (await cached.exists()) {
      const grid = (await cached.json()) as GhiGrid
      const fresh = grid.end_date === window.end_date
      if (grid.model === MODEL && grid.cells.length > 0 && (fresh || allowStale)) {
        return grid
      }
    }
  }

  const points = gridPoints()
  const cells: GhiCell[] = []
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE)
    cells.push(...(await fetchBatch(batch, window.start_date, window.end_date)))
    console.log(`GHI ${Math.min(i + BATCH_SIZE, points.length)}/${points.length}`)
  }

  const grid: GhiGrid = {
    source: ARCHIVE_URL,
    model: MODEL,
    start_date: window.start_date,
    end_date: window.end_date,
    cell_degrees: GRID_STEP_DEG,
    cells,
  }
  await mkdir(dirname(GHI_GRID_PATH), { recursive: true })
  await Bun.write(GHI_GRID_PATH, `${JSON.stringify(grid, null, 2)}\n`)
  return grid
}

export function nearestGhi(lat: number, lon: number, cells: GhiCell[]): number {
  let best = cells[0]
  let bestDist = Infinity
  for (const cell of cells) {
    const dist = (cell.lat - lat) ** 2 + (cell.lon - lon) ** 2
    if (dist < bestDist) {
      bestDist = dist
      best = cell
    }
  }
  return best.ghi_kwh_m2_year
}
