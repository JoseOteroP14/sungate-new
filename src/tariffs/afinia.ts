import { z } from 'zod'
import tarifasCsv from '../../master/tarifas_energia_monteria_afinia_julio_2026.csv?raw'

export type Estrato = 1 | 2 | 3 | 4 | 5 | 6

export const ESTRATOS = [1, 2, 3, 4, 5, 6] as const satisfies readonly Estrato[]

export const SUBSISTENCE_KWH = 173

export const DEFAULT_ASSET_OWNERSHIP = 'Propiedad del OR'

const CsvRowSchema = z.object({
  propiedad_activos: z.string(),
  estrato: z.string(),
  rango_consumo: z.string(),
  tarifa_kwh_cop: z.coerce.number().positive(),
  tipo_tarifa: z.string(),
  periodo: z.string(),
  empresa: z.string(),
  ciudad: z.string(),
})

export type EstratoRates = {
  subsistenceCopKwh: number | null
  plenaCopKwh: number
  tipo: string
}

function parseCsvRows(text: string): z.infer<typeof CsvRowSchema>[] {
  const lines = text.trim().split(/\r?\n/)
  const header = lines[0]?.split(',')
  if (!header) {
    throw new Error('CSV de tarifas Afinia vacío')
  }
  const index = Object.fromEntries(header.map((key, i) => [key, i]))
  return lines.slice(1).map((line, row) => {
    const cols = line.split(',')
    const parsed = CsvRowSchema.safeParse({
      propiedad_activos: cols[index.propiedad_activos],
      estrato: cols[index.estrato],
      rango_consumo: cols[index.rango_consumo],
      tarifa_kwh_cop: cols[index.tarifa_kwh_cop],
      tipo_tarifa: cols[index.tipo_tarifa],
      periodo: cols[index.periodo],
      empresa: cols[index.empresa],
      ciudad: cols[index.ciudad],
    })
    if (!parsed.success) {
      throw new Error(`Fila ${row + 2} de tarifas Afinia inválida`)
    }
    return parsed.data
  })
}

function isEstrato(value: number): value is Estrato {
  return (ESTRATOS as readonly number[]).includes(value)
}

function estratosFromLabel(label: string): Estrato[] {
  const match = label.match(/Estratos?\s+(\d)(?:\s+y\s+(\d))?/u)
  if (!match) {
    throw new Error(`Estrato no reconocido: ${label}`)
  }
  const first = Number(match[1])
  const second = match[2] === undefined ? undefined : Number(match[2])
  if (!isEstrato(first) || (second !== undefined && !isEstrato(second))) {
    throw new Error(`Estrato no reconocido: ${label}`)
  }
  return second === undefined ? [first] : [first, second]
}

function isSubsistenceRange(rango: string): boolean {
  return rango.startsWith('0 - 173')
}

function buildRates(
  rows: z.infer<typeof CsvRowSchema>[],
  ownership: string,
): Record<Estrato, EstratoRates> {
  const selected = rows.filter((row) => row.propiedad_activos === ownership)
  const rates = {} as Record<Estrato, EstratoRates>
  for (const row of selected) {
    for (const estrato of estratosFromLabel(row.estrato)) {
      const current = rates[estrato] ?? {
        subsistenceCopKwh: null,
        plenaCopKwh: 0,
        tipo: row.tipo_tarifa,
      }
      if (isSubsistenceRange(row.rango_consumo)) {
        current.subsistenceCopKwh = row.tarifa_kwh_cop
      } else {
        current.plenaCopKwh = row.tarifa_kwh_cop
        current.tipo = row.tipo_tarifa
      }
      rates[estrato] = current
    }
  }
  for (const estrato of ESTRATOS) {
    if (!rates[estrato]?.plenaCopKwh) {
      throw new Error(`Falta tarifa plena para estrato ${estrato}`)
    }
  }
  return rates
}

const csvRows = parseCsvRows(tarifasCsv)
const meta = csvRows[0]

export const AFINIA_TARIFF_META = {
  empresa: meta?.empresa ?? 'Afinia S.A.S. E.S.P.',
  ciudad: meta?.ciudad ?? 'Montería',
  periodo: meta?.periodo ?? 'Julio 2026',
  ownership: DEFAULT_ASSET_OWNERSHIP,
} as const

export const AFINIA_RATES = buildRates(csvRows, DEFAULT_ASSET_OWNERSHIP)

export function energyBillCop(kwh: number, estrato: Estrato): number {
  if (kwh <= 0) {
    return 0
  }
  const rates = AFINIA_RATES[estrato]
  if (rates.subsistenceCopKwh === null) {
    return kwh * rates.plenaCopKwh
  }
  const subsidized = Math.min(kwh, SUBSISTENCE_KWH)
  const excess = Math.max(0, kwh - SUBSISTENCE_KWH)
  return subsidized * rates.subsistenceCopKwh + excess * rates.plenaCopKwh
}

export type RoofSavings = {
  kwhMonth: number
  generationValueCop: number
  effectiveTariffCopKwh: number
  billSavingsCop: number | null
  surplusKwh: number
  gridKwhAfter: number | null
}

export function estimateRoofSavings(
  kwhYear: number,
  estrato: Estrato,
  consumptionKwhMonth: number | null,
): RoofSavings {
  const kwhMonth = kwhYear / 12
  const generationValueCop = energyBillCop(kwhMonth, estrato)
  const effectiveTariffCopKwh =
    kwhMonth > 0 ? generationValueCop / kwhMonth : 0

  if (consumptionKwhMonth === null || consumptionKwhMonth <= 0) {
    return {
      kwhMonth,
      generationValueCop,
      effectiveTariffCopKwh,
      billSavingsCop: null,
      surplusKwh: 0,
      gridKwhAfter: null,
    }
  }

  const gridKwhAfter = Math.max(0, consumptionKwhMonth - kwhMonth)
  const billSavingsCop =
    energyBillCop(consumptionKwhMonth, estrato) - energyBillCop(gridKwhAfter, estrato)
  const surplusKwh = Math.max(0, kwhMonth - consumptionKwhMonth)

  return {
    kwhMonth,
    generationValueCop,
    effectiveTariffCopKwh,
    billSavingsCop,
    surplusKwh,
    gridKwhAfter,
  }
}

const copFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const kwhFormat = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
})

const measureFormat = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 2,
})

const copPerKwhFormat = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatCop(value: number): string {
  return copFormat.format(Math.round(value))
}

export function formatQuantity(value: number): string {
  return kwhFormat.format(Math.round(value))
}

export function formatMeasure(value: number): string {
  return measureFormat.format(value)
}

export function formatKwh(value: number): string {
  return formatQuantity(value)
}

export function formatCopPerKwh(value: number): string {
  return `${copPerKwhFormat.format(value)}/kWh`
}

export type PanelRoi = {
  investmentCop: number
  annualSavingsCop: number
  paybackYears: number | null
  simpleRoi: number | null
}

export function estimatePanelRoi(
  panelCount: number,
  unitPriceCop: number,
  monthlySavingsCop: number,
): PanelRoi | null {
  if (
    !Number.isInteger(panelCount) ||
    panelCount <= 0 ||
    !(unitPriceCop > 0) ||
    !Number.isFinite(monthlySavingsCop)
  ) {
    return null
  }

  const investmentCop = panelCount * unitPriceCop
  const annualSavingsCop = monthlySavingsCop * 12
  if (annualSavingsCop <= 0) {
    return {
      investmentCop,
      annualSavingsCop: 0,
      paybackYears: null,
      simpleRoi: 0,
    }
  }

  return {
    investmentCop,
    annualSavingsCop,
    paybackYears: investmentCop / annualSavingsCop,
    simpleRoi: annualSavingsCop / investmentCop,
  }
}

export function formatPayback(years: number): string {
  if (!Number.isFinite(years) || years < 0) {
    return '—'
  }
  const totalMonths = Math.round(years * 12)
  if (totalMonths === 0) {
    return 'menos de 1 mes'
  }
  const yearCount = Math.floor(totalMonths / 12)
  const monthCount = totalMonths % 12
  const parts: string[] = []
  if (yearCount === 1) {
    parts.push('1 año')
  } else if (yearCount > 1) {
    parts.push(`${yearCount} años`)
  }
  if (monthCount === 1) {
    parts.push('1 mes')
  } else if (monthCount > 1) {
    parts.push(`${monthCount} meses`)
  }
  return parts.join(' y ')
}

export function formatPercent(value: number): string {
  return `${measureFormat.format(value * 100)} %`
}
