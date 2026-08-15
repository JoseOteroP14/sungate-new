import { chmod, mkdir } from 'node:fs/promises'
import { arch, platform } from 'node:os'
import { join } from 'node:path'

const VERSION = '1.31.2'
const TOOLS_DIR = join(import.meta.dir, '../../tools')

type ReleaseAsset = {
  archive: string
  binary: string
}

function releaseAsset(): ReleaseAsset {
  const os = platform()
  const cpu = arch() === 'arm64' ? 'arm64' : 'x86_64'
  if (os === 'win32') {
    return {
      archive: `go-pmtiles_${VERSION}_Windows_x86_64.zip`,
      binary: 'pmtiles.exe',
    }
  }
  if (os === 'linux') {
    return {
      archive: `go-pmtiles_${VERSION}_Linux_${cpu}.tar.gz`,
      binary: 'pmtiles',
    }
  }
  if (os === 'darwin') {
    return {
      archive: `go-pmtiles_${VERSION}_Darwin_${cpu}.tar.gz`,
      binary: 'pmtiles',
    }
  }
  throw new Error(`go-pmtiles no soporta ${os}/${cpu}`)
}

export async function ensurePmtilesCli(): Promise<string> {
  const asset = releaseAsset()
  const binaryPath = join(TOOLS_DIR, asset.binary)
  if (await Bun.file(binaryPath).exists()) {
    return binaryPath
  }

  await mkdir(TOOLS_DIR, { recursive: true })
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${VERSION}/${asset.archive}`
  const archivePath = join(TOOLS_DIR, asset.archive)
  console.log(`Descargando go-pmtiles ${VERSION} (${asset.archive})…`)
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`go-pmtiles download ${response.status}`)
  }
  await Bun.write(archivePath, response)

  const unzip = Bun.spawn(['tar', '-xf', archivePath, '-C', TOOLS_DIR], {
    stdout: 'inherit',
    stderr: 'inherit',
  })
  if ((await unzip.exited) !== 0) {
    throw new Error('No se pudo descomprimir go-pmtiles')
  }

  if (!(await Bun.file(binaryPath).exists())) {
    throw new Error(`${asset.binary} no apareció en tools/`)
  }
  if (platform() !== 'win32') {
    await chmod(binaryPath, 0o755)
  }
  return binaryPath
}
