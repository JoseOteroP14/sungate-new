import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl'
import type { MapTheme } from './theme'

/** kWh/año estimados si el techo se cubriera con FV (η 20 % × PR 80 %). */
export const SOLAR_KWH_PROPERTY = 'kwh_year'

/** Rendimiento de módulo c-Si en STC. */
export const PV_MODULE_EFFICIENCY = 0.2

/** Factor de rendimiento (inversor, suciedad, temperatura, cableado). */
export const PV_PERFORMANCE_RATIO = 0.8

export const PV_SYSTEM_FACTOR = PV_MODULE_EFFICIENCY * PV_PERFORMANCE_RATIO

/** Área típica de un módulo residencial (~400 W). */
export const DEFAULT_PANEL_AREA_M2 = 2

export type PanelArrayParams = {
  panelCount: number
  panelAreaM2: number
  efficiency: number
  performanceRatio: number
  ghiKwhM2: number
}

export type PanelArraySimulation =
  | { ok: true; arrayAreaM2: number; kwhYear: number }
  | { ok: false; arrayAreaM2: number; reason: 'invalid' | 'exceeds_roof' }

export function panelArrayAreaM2(
  panelCount: number,
  panelAreaM2: number,
): number {
  return panelCount * panelAreaM2
}

export function maxPanelCount(roofAreaM2: number, panelAreaM2: number): number {
  if (!(roofAreaM2 > 0) || !(panelAreaM2 > 0)) {
    return 0
  }
  return Math.floor(roofAreaM2 / panelAreaM2)
}

export function resolveGhiKwhM2(input: {
  ghiKwhM2?: number
  kwhYear: number
  areaM2?: number
}): number | null {
  if (input.ghiKwhM2 !== undefined && input.ghiKwhM2 > 0) {
    return input.ghiKwhM2
  }
  if (input.areaM2 !== undefined && input.areaM2 > 0) {
    return input.kwhYear / (input.areaM2 * PV_SYSTEM_FACTOR)
  }
  return null
}

export function simulatePanelArray(
  params: PanelArrayParams,
  roofAreaM2: number,
): PanelArraySimulation {
  const arrayAreaM2 = panelArrayAreaM2(params.panelCount, params.panelAreaM2)
  const valuesAreValid =
    Number.isInteger(params.panelCount) &&
    params.panelCount > 0 &&
    params.panelAreaM2 > 0 &&
    params.efficiency > 0 &&
    params.efficiency <= 1 &&
    params.performanceRatio > 0 &&
    params.performanceRatio <= 1 &&
    params.ghiKwhM2 > 0 &&
    Number.isFinite(arrayAreaM2)

  if (!valuesAreValid) {
    return {
      ok: false,
      arrayAreaM2: Number.isFinite(arrayAreaM2) ? Math.max(0, arrayAreaM2) : 0,
      reason: 'invalid',
    }
  }

  if (!(roofAreaM2 > 0) || arrayAreaM2 - roofAreaM2 > 1e-6) {
    return { ok: false, arrayAreaM2, reason: 'exceeds_roof' }
  }

  return {
    ok: true,
    arrayAreaM2,
    kwhYear: Math.round(
      params.ghiKwhM2 *
        arrayAreaM2 *
        params.efficiency *
        params.performanceRatio,
    ),
  }
}

const LIGHT_STOPS = [
  [0, '#fed7aa'],
  [10_000, '#fdba74'],
  [30_000, '#fb923c'],
  [80_000, '#ea580c'],
  [200_000, '#9a3412'],
] as const

const DARK_STOPS = [
  [0, '#431407'],
  [10_000, '#9a3412'],
  [30_000, '#ea580c'],
  [80_000, '#fbbf24'],
  [200_000, '#fef3c7'],
] as const

export const SOLAR_LEGEND_STOPS = [
  { value: 0, label: '0' },
  { value: 10_000, label: '10 mil' },
  { value: 30_000, label: '30 mil' },
  { value: 80_000, label: '80 mil' },
  { value: 200_000, label: '200 mil+' },
] as const

export function solarFillColor(
  theme: MapTheme,
): DataDrivenPropertyValueSpecification<string> {
  const stops = theme === 'dark' ? DARK_STOPS : LIGHT_STOPS
  return [
    'case',
    ['has', SOLAR_KWH_PROPERTY],
    [
      'interpolate',
      ['linear'],
      ['get', SOLAR_KWH_PROPERTY],
      ...stops.flatMap(([value, color]) => [value, color]),
    ],
    theme === 'dark' ? '#393939' : '#dfdfdf',
  ]
}

export function solarLegendGradient(theme: MapTheme): string {
  const stops = theme === 'dark' ? DARK_STOPS : LIGHT_STOPS
  const last = stops[stops.length - 1][0]
  return `linear-gradient(90deg, ${stops
    .map(([value, color]) => `${color} ${(value / last) * 100}%`)
    .join(', ')})`
}
