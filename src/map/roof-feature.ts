import { z } from 'zod'
import type { MapGeoJSONFeature } from 'maplibre-gl'

export const RoofFeatureSchema = z.object({
  id: z.coerce.string().min(1),
  kwh_year: z.coerce.number().finite().nonnegative(),
  area_m2: z.coerce.number().finite().nonnegative().optional(),
  ghi_kwh_m2: z.coerce.number().finite().nonnegative().optional(),
})

export type SelectedRoof = {
  id: string
  kwhYear: number
  areaM2?: number
  ghiKwhM2?: number
}

export function parseRoofFeature(
  feature: MapGeoJSONFeature,
): SelectedRoof | null {
  const parsed = RoofFeatureSchema.safeParse({
    id: feature.properties.id ?? feature.id,
    kwh_year: feature.properties.kwh_year,
    area_m2: feature.properties.area_m2,
    ghi_kwh_m2: feature.properties.ghi_kwh_m2,
  })
  if (!parsed.success) {
    return null
  }
  return {
    id: parsed.data.id,
    kwhYear: parsed.data.kwh_year,
    areaM2: parsed.data.area_m2,
    ghiKwhM2: parsed.data.ghi_kwh_m2,
  }
}
