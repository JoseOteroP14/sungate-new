import type { DataDrivenPropertyValueSpecification } from 'maplibre-gl'
import type { MapTheme } from './theme'

/** kWh/año estimados si el techo se cubriera con FV (η 20 % × PR 80 %). */
export const SOLAR_KWH_PROPERTY = 'kwh_year'

/** Rendimiento de módulo c-Si en STC. */
export const PV_MODULE_EFFICIENCY = 0.2

/** Factor de rendimiento (inversor, suciedad, temperatura, cableado). */
export const PV_PERFORMANCE_RATIO = 0.8

export const PV_SYSTEM_FACTOR = PV_MODULE_EFFICIENCY * PV_PERFORMANCE_RATIO

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
