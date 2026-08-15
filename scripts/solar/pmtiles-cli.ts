import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const VERSION = '1.31.2'
const TOOLS_DIR = join(import.meta.dir, '../../tools')
const EXE_PATH = join(TOOLS_DIR, 'pmtiles.exe')
const ZIP_URL = `https://github.com/protomaps/go-pmtiles/releases/download/v${VERSION}/go-pmtiles_${VERSION}_Windows_x86_64.zip`

export async function ensurePmtilesCli(): Promise<string> {
  if (await Bun.file(EXE_PATH).exists()) {
    return EXE_PATH
  }

  await mkdir(TOOLS_DIR, { recursive: true })
  const zipPath = join(TOOLS_DIR, `go-pmtiles_${VERSION}.zip`)
  console.log(`Descargando go-pmtiles ${VERSION}…`)
  const response = await fetch(ZIP_URL)
  if (!response.ok) {
    throw new Error(`go-pmtiles download ${response.status}`)
  }
  await Bun.write(zipPath, response)

  const unzip = Bun.spawn(
    ['tar', '-xf', zipPath, '-C', TOOLS_DIR],
    { stdout: 'inherit', stderr: 'inherit' },
  )
  if ((await unzip.exited) !== 0) {
    throw new Error('No se pudo descomprimir go-pmtiles')
  }

  const extracted = join(TOOLS_DIR, 'pmtiles.exe')
  if (!(await Bun.file(extracted).exists())) {
    throw new Error('pmtiles.exe no apareció en tools/')
  }
  return extracted
}
