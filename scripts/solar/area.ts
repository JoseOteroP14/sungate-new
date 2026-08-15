const EARTH_RADIUS_M = 6_378_137

function rad(degrees: number): number {
  return (degrees * Math.PI) / 180
}

/**
 * Área de un anillo en m² (exceso esférico, mismo algoritmo que mapbox/geojson-area).
 */
function ringArea(coords: number[][]): number {
  const length = coords.length
  if (length < 3) {
    return 0
  }

  let area = 0
  for (let i = 0; i < length; i++) {
    let lowerIndex: number
    let middleIndex: number
    let upperIndex: number
    if (i === length - 2) {
      lowerIndex = length - 2
      middleIndex = length - 1
      upperIndex = 0
    } else if (i === length - 1) {
      lowerIndex = length - 1
      middleIndex = 0
      upperIndex = 1
    } else {
      lowerIndex = i
      middleIndex = i + 1
      upperIndex = i + 2
    }
    const p1 = coords[lowerIndex]
    const p2 = coords[middleIndex]
    const p3 = coords[upperIndex]
    area += (rad(p3[0]) - rad(p1[0])) * Math.sin(rad(p2[1]))
  }

  return (area * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2
}

function polygonArea(rings: number[][][]): number {
  if (rings.length === 0) {
    return 0
  }
  let area = Math.abs(ringArea(rings[0]))
  for (let i = 1; i < rings.length; i++) {
    area -= Math.abs(ringArea(rings[i]))
  }
  return area
}

export function geometryAreaM2(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): number {
  if (geometry.type === 'Polygon') {
    return polygonArea(geometry.coordinates)
  }
  return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0)
}

export function geometryCentroid(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon,
): { lat: number; lon: number } {
  const ring =
    geometry.type === 'Polygon'
      ? geometry.coordinates[0]
      : geometry.coordinates[0][0]
  if (!ring || ring.length === 0) {
    return { lat: 0, lon: 0 }
  }

  const last = ring[ring.length - 1]
  const closed =
    ring.length > 1 && ring[0][0] === last[0] && ring[0][1] === last[1]
  const count = closed ? ring.length - 1 : ring.length

  let lon = 0
  let lat = 0
  for (let i = 0; i < count; i++) {
    lon += ring[i][0]
    lat += ring[i][1]
  }
  return { lon: lon / count, lat: lat / count }
}
