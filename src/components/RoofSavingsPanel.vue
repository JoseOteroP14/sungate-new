<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import {
  AFINIA_RATES,
  ESTRATOS,
  SUBSISTENCE_KWH,
  energyBillCop,
  estimatePanelRoi,
  estimateRoofSavings,
  formatCop,
  formatCopPerKwh,
  formatKwh,
  formatMeasure,
  formatPayback,
  formatPercent,
  formatQuantity,
  type Estrato,
} from '../tariffs/afinia'
import type { SelectedRoof } from '../map/roof-feature'
import {
  DEFAULT_PANEL_AREA_M2,
  PV_MODULE_EFFICIENCY,
  PV_PERFORMANCE_RATIO,
  maxPanelCount,
  resolveGhiKwhM2,
  simulatePanelArray,
} from '../map/solar'

export type PanelView = 'bill' | 'roof'

const estrato = defineModel<Estrato | null>('estrato', { default: null })
const consumptionInput = defineModel<string>('consumption', { default: '' })

const props = defineProps<{
  roof: SelectedRoof | null
  theme: 'light' | 'dark'
  view: PanelView
}>()

const resultEl = useTemplateRef<HTMLElement>('result')
const formulaInfoEl = useTemplateRef<HTMLButtonElement>('formulaInfo')
const formulaPopoverId = useId()
const formulaTitleId = useId()
const arrayHintId = useId()
const panelCountInput = ref('')
const panelAreaInput = ref(String(DEFAULT_PANEL_AREA_M2))
const efficiencyInput = ref(String(Math.round(PV_MODULE_EFFICIENCY * 100)))
const performanceRatioInput = ref(String(Math.round(PV_PERFORMANCE_RATIO * 100)))
const panelPriceInput = ref('')

function parsePositiveNumber(raw: unknown): number | null {
  const text = String(raw ?? '')
    .trim()
    .replace(',', '.')
  if (text.length === 0) {
    return null
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value <= 0) {
    return null
  }
  return value
}

function parsePositiveInteger(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) {
    return null
  }
  const value = Number(text)
  if (!Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

function parsePercent(raw: string): number | null {
  const value = parsePositiveNumber(raw)
  if (value === null || value > 100) {
    return null
  }
  return value / 100
}

function sanitizeDecimalInput(raw: string): string {
  const match = raw.replace(/[^\d.,]/g, '').match(/^(\d*)([.,])?(\d*)/)
  if (!match) {
    return ''
  }
  return `${match[1]}${match[2] ?? ''}${match[3]}`
}

function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '')
}

function onSanitizedInput(
  event: Event,
  sanitize: (raw: string) => string,
  assign: (next: string) => void,
) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  const next = sanitize(target.value)
  assign(next)
  if (target.value !== next) {
    target.value = next
  }
}

function onConsumptionInput(event: Event) {
  onSanitizedInput(event, sanitizeDecimalInput, (next) => {
    consumptionInput.value = next
  })
}

function onPanelCountInput(event: Event) {
  onSanitizedInput(event, sanitizeIntegerInput, (next) => {
    panelCountInput.value = next
  })
}

function onPanelAreaInput(event: Event) {
  onSanitizedInput(event, sanitizeDecimalInput, (next) => {
    panelAreaInput.value = next
  })
}

function onEfficiencyInput(event: Event) {
  onSanitizedInput(event, sanitizeDecimalInput, (next) => {
    efficiencyInput.value = next
  })
}

function onPerformanceRatioInput(event: Event) {
  onSanitizedInput(event, sanitizeDecimalInput, (next) => {
    performanceRatioInput.value = next
  })
}

function onPanelPriceInput(event: Event) {
  onSanitizedInput(event, sanitizeIntegerInput, (next) => {
    panelPriceInput.value = next
  })
}

const consumptionKwh = computed(() => parsePositiveNumber(consumptionInput.value))

const panelCount = computed(() => parsePositiveInteger(panelCountInput.value))
const panelAreaM2 = computed(() => parsePositiveNumber(panelAreaInput.value))
const efficiency = computed(() => parsePercent(efficiencyInput.value))
const performanceRatio = computed(() => parsePercent(performanceRatioInput.value))
const panelPriceCop = computed(() => parsePositiveInteger(panelPriceInput.value))
const ghiKwhM2 = computed(() => {
  if (!props.roof) {
    return null
  }
  const ghi = resolveGhiKwhM2(props.roof)
  return ghi === null || !(ghi > 0) ? null : ghi
})

const roofAreaM2 = computed(() =>
  props.roof?.areaM2 !== undefined && props.roof.areaM2 > 0
    ? props.roof.areaM2
    : null,
)

const panelSimulation = computed(() => {
  if (
    roofAreaM2.value === null ||
    panelCount.value === null ||
    panelAreaM2.value === null ||
    efficiency.value === null ||
    performanceRatio.value === null ||
    ghiKwhM2.value === null
  ) {
    return null
  }
  return simulatePanelArray(
    {
      panelCount: panelCount.value,
      panelAreaM2: panelAreaM2.value,
      efficiency: efficiency.value,
      performanceRatio: performanceRatio.value,
      ghiKwhM2: ghiKwhM2.value,
    },
    roofAreaM2.value,
  )
})

const arrayExceedsRoof = computed(
  () =>
    panelSimulation.value?.ok === false &&
    panelSimulation.value.reason === 'exceeds_roof',
)

const fittedPanelCount = computed(() => {
  if (roofAreaM2.value === null || panelAreaM2.value === null) {
    return null
  }
  return maxPanelCount(roofAreaM2.value, panelAreaM2.value)
})

const occupancyRatio = computed(() => {
  if (roofAreaM2.value === null || !panelSimulation.value) {
    return 0
  }
  return Math.min(1, panelSimulation.value.arrayAreaM2 / roofAreaM2.value)
})

const simulatedKwhYear = computed(() =>
  panelSimulation.value?.ok ? panelSimulation.value.kwhYear : null,
)

const savings = computed(() => {
  if (
    !props.roof ||
    estrato.value === null ||
    simulatedKwhYear.value === null
  ) {
    return null
  }
  return estimateRoofSavings(simulatedKwhYear.value, estrato.value, null)
})

const monthlySavingsCop = computed(() => {
  if (!savings.value) {
    return null
  }
  return savings.value.billSavingsCop ?? savings.value.generationValueCop
})

const roi = computed(() => {
  if (
    panelCount.value === null ||
    panelPriceCop.value === null ||
    monthlySavingsCop.value === null
  ) {
    return null
  }
  return estimatePanelRoi(
    panelCount.value,
    panelPriceCop.value,
    monthlySavingsCop.value,
  )
})

watch(
  () => props.roof?.id,
  () => {
    const roof = props.roof
    if (!roof) {
      panelCountInput.value = ''
      return
    }
    const area = parsePositiveNumber(panelAreaInput.value) ?? DEFAULT_PANEL_AREA_M2
    if (roof.areaM2 !== undefined && roof.areaM2 > 0) {
      panelCountInput.value = String(
        Math.max(1, maxPanelCount(roof.areaM2, area)),
      )
    }
  },
  { immediate: true },
)

const billEstimate = computed(() => {
  if (estrato.value === null || consumptionKwh.value === null) {
    return null
  }
  const kwh = consumptionKwh.value
  const cop = energyBillCop(kwh, estrato.value)
  return {
    kwh,
    cop,
    effectiveTariffCopKwh: cop / kwh,
  }
})

const rates = computed(() =>
  estrato.value === null ? null : AFINIA_RATES[estrato.value],
)

const showBillResult = computed(() => consumptionKwh.value !== null)

const showRoofResult = computed(() => props.roof !== null)

const showResult = computed(() =>
  props.view === 'bill' ? showBillResult.value : showRoofResult.value,
)

function selectEstrato(value: Estrato) {
  estrato.value = value
}

function placeFormulaPopover(event: Event) {
  if (!('newState' in event) || event.newState !== 'open') {
    return
  }
  const popover = event.currentTarget
  const button = formulaInfoEl.value
  if (!(popover instanceof HTMLElement) || !button) {
    return
  }
  requestAnimationFrame(() => {
    const gap = 8
    const edge = 8
    const rect = button.getBoundingClientRect()
    const width = popover.offsetWidth
    const height = popover.offsetHeight
    let left = rect.left - width - gap
    if (left < edge) {
      left = rect.right + gap
    }
    left = Math.max(edge, Math.min(left, window.innerWidth - width - edge))
    const top = Math.max(
      edge,
      Math.min(rect.top, window.innerHeight - height - edge),
    )
    popover.style.left = `${Math.round(left)}px`
    popover.style.top = `${Math.round(top)}px`
  })
}

watch([showResult, () => props.view], async ([visible]) => {
  if (!visible) {
    return
  }
  await nextTick()
  resultEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <div class="savings" :data-theme="theme" :key="view">
    <template v-if="view === 'bill'" :key="'bill'">
      <header class="savings-header">
        <h2 class="savings-title">Simular factura</h2>
        <p class="savings-lede">
          Elige tu estrato e ingresa el consumo mensual para estimar el valor de
          la energía a la tarifa residencial de la zona.
        </p>
      </header>

      <fieldset class="estrato">
        <legend>Estrato socioeconómico</legend>
        <div class="estrato-grid" role="radiogroup" aria-label="Estrato">
          <button
            v-for="value in ESTRATOS"
            :key="value"
            type="button"
            class="estrato-btn"
            role="radio"
            :aria-checked="estrato === value"
            :data-active="estrato === value"
            @click="selectEstrato(value)"
          >
            {{ value }}
          </button>
        </div>
        <p v-if="rates" class="estrato-rate">
          <template v-if="rates.subsistenceCopKwh !== null">
            {{ formatCopPerKwh(rates.subsistenceCopKwh) }} hasta
            {{ SUBSISTENCE_KWH }} kWh ·
            {{ formatCopPerKwh(rates.plenaCopKwh) }} el resto
          </template>
          <template v-else>
            {{ formatCopPerKwh(rates.plenaCopKwh) }} · {{ rates.tipo }}
          </template>
        </p>
      </fieldset>

      <label class="consumption">
        <span>Consumo mensual (kWh)</span>
        <input
          :value="String(consumptionInput ?? '')"
          name="bill-monthly-kwh"
          type="text"
          inputmode="decimal"
          pattern="[0-9]*[.,]?[0-9]*"
          placeholder="Ej. 180"
          autocomplete="off"
          spellcheck="false"
          @input="onConsumptionInput"
        />
        <span class="consumption-hint">
          El costo de factura se actualiza al escribir.
        </span>
      </label>

      <div v-if="showBillResult" ref="result" class="result">
        <template v-if="billEstimate === null">
          <p class="result-label">Costo estimado de factura</p>
          <p class="result-note">
            Selecciona tu estrato para calcular el valor con tu consumo.
          </p>
        </template>
        <template v-else>
          <p class="result-label">Costo estimado de factura</p>
          <p class="result-value">{{ formatCop(billEstimate.cop) }}</p>
          <dl class="result-stats">
            <div>
              <dt>Consumo</dt>
              <dd>{{ formatKwh(billEstimate.kwh) }} kWh/mes</dd>
            </div>
            <div>
              <dt>Tarifa efectiva</dt>
              <dd>{{ formatCopPerKwh(billEstimate.effectiveTariffCopKwh) }}</dd>
            </div>
          </dl>
        </template>
      </div>

      <p v-else-if="estrato === null" class="empty">
        Primero selecciona tu estrato.
      </p>
      <p v-else class="empty">
        Ingresa tu consumo mensual para simular la factura.
      </p>
    </template>

    <template v-else :key="'roof'">
      <header class="savings-header">
        <h2 class="savings-title">Ahorro en tu techo</h2>
      </header>

      <fieldset class="estrato">
        <legend>Estrato socioeconómico</legend>
        <div class="estrato-grid" role="radiogroup" aria-label="Estrato">
          <button
            v-for="value in ESTRATOS"
            :key="value"
            type="button"
            class="estrato-btn"
            role="radio"
            :aria-checked="estrato === value"
            :data-active="estrato === value"
            @click="selectEstrato(value)"
          >
            {{ value }}
          </button>
        </div>
        <p v-if="rates" class="estrato-rate">
          <template v-if="rates.subsistenceCopKwh !== null">
            {{ formatCopPerKwh(rates.subsistenceCopKwh) }} hasta
            {{ SUBSISTENCE_KWH }} kWh ·
            {{ formatCopPerKwh(rates.plenaCopKwh) }} el resto
          </template>
          <template v-else>
            {{ formatCopPerKwh(rates.plenaCopKwh) }} · {{ rates.tipo }}
          </template>
        </p>
      </fieldset>

      <fieldset v-if="roof" class="sim">
        <div class="sim-grid">
          <label class="consumption">
            <span>Cantidad de paneles</span>
            <input
              :value="panelCountInput"
              name="roof-panel-count"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="Ej. 12"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="arrayExceedsRoof"
              :aria-describedby="arrayHintId"
              @input="onPanelCountInput"
            />
          </label>
          <label class="consumption">
            <span>Área de cada panel (m²)</span>
            <input
              :value="panelAreaInput"
              name="roof-panel-area"
              type="text"
              inputmode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="Ej. 2"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="arrayExceedsRoof"
              :aria-describedby="arrayHintId"
              @input="onPanelAreaInput"
            />
          </label>
          <label class="consumption">
            <span>Eficiencia del panel (%)</span>
            <input
              :value="efficiencyInput"
              name="roof-panel-efficiency"
              type="text"
              inputmode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="Ej. 20"
              autocomplete="off"
              spellcheck="false"
              @input="onEfficiencyInput"
            />
          </label>
          <label class="consumption">
            <span>Rendimiento (%)</span>
            <input
              :value="performanceRatioInput"
              name="roof-performance-ratio"
              type="text"
              inputmode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder="Ej. 80"
              autocomplete="off"
              spellcheck="false"
              @input="onPerformanceRatioInput"
            />
          </label>
          <label class="consumption sim-price">
            <span>Precio de cada panel (COP)</span>
            <input
              :value="panelPriceInput"
              name="roof-panel-price"
              type="text"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="Ej. 450000"
              autocomplete="off"
              spellcheck="false"
              @input="onPanelPriceInput"
            />
          </label>
        </div>
        <p v-if="ghiKwhM2 !== null" class="consumption-hint">
          Este techo recibe {{ formatQuantity(ghiKwhM2) }} kWh/m² al año de sol.
        </p>
        <div :id="arrayHintId">
          <div v-if="roofAreaM2 !== null && panelSimulation" class="array-fit">
            <div
              class="array-meter"
              role="meter"
              :aria-valuemin="0"
              :aria-valuemax="100"
              :aria-valuenow="Math.round(occupancyRatio * 100)"
              aria-label="Ocupación del techo"
              :data-invalid="arrayExceedsRoof"
              :style="{ '--occupancy': String(occupancyRatio) }"
            >
              <span />
            </div>
            <p
              class="consumption-hint"
              :class="{ 'sim-error': arrayExceedsRoof }"
              :role="arrayExceedsRoof ? 'alert' : undefined"
            >
              <template v-if="arrayExceedsRoof">
                Los paneles ocuparían
                {{ formatMeasure(panelSimulation.arrayAreaM2) }} m² y el techo
                mide {{ formatQuantity(roofAreaM2) }} m².
                <template v-if="fittedPanelCount === 0">
                  Un panel de este tamaño no cabe en el techo.
                </template>
                <template v-else-if="fittedPanelCount !== null">
                  Con este tamaño caben hasta
                  {{ formatQuantity(fittedPanelCount) }}
                  {{ fittedPanelCount === 1 ? 'panel' : 'paneles' }}.
                </template>
              </template>
              <template v-else>
                {{ formatMeasure(panelSimulation.arrayAreaM2) }} m² de
                {{ formatQuantity(roofAreaM2) }} m²
                ({{ formatQuantity(occupancyRatio * 100) }}%).
                <template v-if="fittedPanelCount !== null">
                  Caben hasta {{ formatQuantity(fittedPanelCount) }}
                  {{ fittedPanelCount === 1 ? 'panel' : 'paneles' }} de este
                  tamaño.
                </template>
              </template>
            </p>
          </div>
          <p v-else-if="roofAreaM2 === null" class="consumption-hint sim-error">
            Este techo no tiene área medida, así que no se puede validar el
            arreglo.
          </p>
          <p v-else class="consumption-hint">
            El área total de los paneles no puede superar el área del techo. La
            generación se calcula con irradiación × área de paneles × eficiencia ×
            factor de rendimiento.
          </p>
        </div>
      </fieldset>

      <div
        v-if="showRoofResult && roof && panelSimulation?.ok"
        ref="result"
        class="result"
      >
        <template v-if="savings">
          <div class="result-heading">
            <p class="result-label">
              {{
                savings.billSavingsCop === null
                  ? 'Ahorro potencial mensual'
                  : 'Ahorro estimado en factura'
              }}
            </p>
            <button
              ref="formulaInfo"
              type="button"
              class="formula-info"
              :popovertarget="formulaPopoverId"
              aria-label="Cómo se calcula este ahorro"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle
                  cx="12"
                  cy="12"
                  r="8.25"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.75"
                />
                <path
                  fill="none"
                  stroke="currentColor"
                  stroke-linecap="round"
                  stroke-width="1.75"
                  d="M12 11.2V17M12 7.6h.01"
                />
              </svg>
            </button>
            <div
              :id="formulaPopoverId"
              class="formula-popover"
              popover="auto"
              :aria-labelledby="formulaTitleId"
              @toggle="placeFormulaPopover"
            >
              <div class="formula-popover-head">
                <h3 :id="formulaTitleId">Cómo se calcula este ahorro</h3>
                <button
                  type="button"
                  class="formula-close"
                  :popovertarget="formulaPopoverId"
                  popovertargetaction="hide"
                  aria-label="Cerrar explicación"
                >
                  Cerrar
                </button>
              </div>
              <template v-if="savings.billSavingsCop === null">
                <p>
                  Es el dinero que dejarías de pagarle a la empresa de energía
                  si usaras en casa la electricidad que podría producir tu techo
                  en un mes.
                </p>
                <div class="formula-eqs">
                  <p class="formula-eq">
                    <span>Área de paneles</span>
                    <span class="formula-op">=</span>
                    <span>Cantidad de paneles × Área de cada panel</span>
                  </p>
                  <p class="formula-eq">
                    <span>Electricidad del techo en un año</span>
                    <span class="formula-op">=</span>
                    <span>
                      Irradiación × Área de paneles × Eficiencia × Factor de
                      rendimiento
                    </span>
                  </p>
                  <p class="formula-eq">
                    <span>Electricidad del techo en un mes</span>
                    <span class="formula-op">=</span>
                    <span>Electricidad del techo en un año ÷ 12 meses</span>
                  </p>
                  <p class="formula-eq">
                    <span>Ahorro del mes</span>
                    <span class="formula-op">=</span>
                    <span>Valor de una factura de la electricidad del techo en un mes</span>
                  </p>
                  <p v-if="rates?.subsistenceCopKwh !== null" class="formula-eq">
                    <span>Valor de una factura</span>
                    <span class="formula-op">=</span>
                    <span>
                      Kilovatios hora al precio de subsistencia × Precio de
                      subsistencia + Kilovatios hora al precio completo × Precio
                      completo
                    </span>
                  </p>
                  <p v-else class="formula-eq">
                    <span>Valor de una factura</span>
                    <span class="formula-op">=</span>
                    <span>Electricidad del mes × Precio completo</span>
                  </p>
                </div>
                <dl class="formula-terms">
                  <div>
                    <dt>Electricidad del techo en un año</dt>
                    <dd>
                      Cuánta electricidad estimamos que generarían los paneles
                      que simulaste durante doce meses, según su área, su
                      eficiencia y el sol de la zona.
                    </dd>
                  </div>
                  <div>
                    <dt>Área de paneles</dt>
                    <dd>
                      La cantidad de paneles multiplicada por el área de cada
                      uno. No puede ser mayor que el área del techo.
                    </dd>
                  </div>
                  <div>
                    <dt>Irradiación</dt>
                    <dd>
                      La energía del sol que llega a un metro cuadrado en un
                      año, en kilovatios hora. La toma el mapa según la zona del
                      techo; no se escribe a mano.
                    </dd>
                  </div>
                  <div>
                    <dt>Eficiencia</dt>
                    <dd>
                      Qué parte de esa luz convierte cada panel en electricidad.
                      Un módulo típico de silicio ronda el 20 %.
                    </dd>
                  </div>
                  <div>
                    <dt>Factor de rendimiento</dt>
                    <dd>
                      Las pérdidas del sistema: inversor, suciedad, temperatura
                      y cableado. Un valor habitual es 80 %.
                    </dd>
                  </div>
                  <div>
                    <dt>Electricidad del techo en un mes</dt>
                    <dd>
                      Esa producción del año repartida en doce meses iguales.
                    </dd>
                  </div>
                  <template v-if="rates?.subsistenceCopKwh !== null">
                    <div>
                      <dt>Límite de subsistencia</dt>
                      <dd>
                        Los primeros 173 kilovatios hora de cada mes. Es la
                        cantidad de electricidad que, en estratos 1, 2 y 3, se
                        cobra más barata.
                      </dd>
                    </div>
                    <div>
                      <dt>Kilovatios hora al precio de subsistencia</dt>
                      <dd>
                        La menor cantidad entre la electricidad del mes y el
                        límite de subsistencia. Si usas 173 o menos, es toda tu
                        electricidad del mes. Si usas más, son solo esos 173.
                      </dd>
                    </div>
                    <div>
                      <dt>Kilovatios hora al precio completo</dt>
                      <dd>
                        Lo que pasa del límite de subsistencia. Si no lo pasas,
                        esto vale cero.
                      </dd>
                    </div>
                    <div>
                      <dt>Precio de subsistencia</dt>
                      <dd>
                        Lo que cobra el servicio de energía por cada kilovatio
                        hora dentro del límite de subsistencia, según tu
                        estrato.
                      </dd>
                    </div>
                  </template>
                  <div>
                    <dt>Precio completo</dt>
                    <dd>
                      Lo que cobra el servicio de energía por cada kilovatio
                      hora
                      {{
                        rates?.subsistenceCopKwh !== null
                          ? 'cuando ya se pasó el límite de subsistencia'
                          : 'de tu estrato'
                      }}.
                    </dd>
                  </div>
                  <div>
                    <dt>Ahorro del mes</dt>
                    <dd>
                      El valor de esa factura de la electricidad del techo. Lo
                      mostramos así cuando aún no has escrito cuánta
                      electricidad usas en casa.
                    </dd>
                  </div>
                </dl>
              </template>
              <template v-else>
                <p>
                  Es la diferencia entre lo que pagarías hoy y lo que pagarías
                  si parte de esa electricidad la produce tu techo.
                </p>
                <div class="formula-eqs">
                  <p class="formula-eq">
                    <span>Área de paneles</span>
                    <span class="formula-op">=</span>
                    <span>Cantidad de paneles × Área de cada panel</span>
                  </p>
                  <p class="formula-eq">
                    <span>Electricidad del techo en un año</span>
                    <span class="formula-op">=</span>
                    <span>
                      Irradiación × Área de paneles × Eficiencia × Factor de
                      rendimiento
                    </span>
                  </p>
                  <p class="formula-eq">
                    <span>Electricidad del techo en un mes</span>
                    <span class="formula-op">=</span>
                    <span>Electricidad del techo en un año ÷ 12 meses</span>
                  </p>
                  <p class="formula-eq">
                    <span>Electricidad que seguirías comprando</span>
                    <span class="formula-op">=</span>
                    <span>
                      la mayor cantidad entre 0 y Consumo del mes −
                      Electricidad del techo en un mes
                    </span>
                  </p>
                  <p class="formula-eq">
                    <span>Ahorro del mes</span>
                    <span class="formula-op">=</span>
                    <span>
                      Valor de una factura del consumo del mes − Valor de una
                      factura de la electricidad que seguirías comprando
                    </span>
                  </p>
                  <p v-if="rates?.subsistenceCopKwh !== null" class="formula-eq">
                    <span>Valor de una factura</span>
                    <span class="formula-op">=</span>
                    <span>
                      Kilovatios hora al precio de subsistencia × Precio de
                      subsistencia + Kilovatios hora al precio completo × Precio
                      completo
                    </span>
                  </p>
                  <p v-else class="formula-eq">
                    <span>Valor de una factura</span>
                    <span class="formula-op">=</span>
                    <span>Electricidad del mes × Precio completo</span>
                  </p>
                </div>
                <dl class="formula-terms">
                  <div>
                    <dt>Consumo del mes</dt>
                    <dd>
                      La electricidad que usas en casa, tomada de lo que
                      escribiste en el simulador de factura.
                    </dd>
                  </div>
                  <div>
                    <dt>Electricidad del techo en un mes</dt>
                    <dd>
                      La producción estimada del arreglo de paneles en un año,
                      repartida en doce meses iguales.
                    </dd>
                  </div>
                  <div>
                    <dt>Electricidad que seguirías comprando</dt>
                    <dd>
                      Lo que queda de tu consumo después de restar lo que
                      produce el techo. Si el techo produce más de lo que usas,
                      esto queda en cero.
                    </dd>
                  </div>
                  <template v-if="rates?.subsistenceCopKwh !== null">
                    <div>
                      <dt>Límite de subsistencia</dt>
                      <dd>
                        Los primeros 173 kilovatios hora de cada mes. Es la
                        cantidad de electricidad que, en estratos 1, 2 y 3, se
                        cobra más barata.
                      </dd>
                    </div>
                    <div>
                      <dt>Kilovatios hora al precio de subsistencia</dt>
                      <dd>
                        La menor cantidad entre la electricidad de esa factura
                        y el límite de subsistencia.
                      </dd>
                    </div>
                    <div>
                      <dt>Kilovatios hora al precio completo</dt>
                      <dd>
                        Lo que pasa del límite de subsistencia. Si no lo pasas,
                        esto vale cero.
                      </dd>
                    </div>
                    <div>
                      <dt>Precio de subsistencia</dt>
                      <dd>
                        Lo que cobra el servicio de energía por cada kilovatio
                        hora dentro del límite de subsistencia, según tu
                        estrato.
                      </dd>
                    </div>
                  </template>
                  <div>
                    <dt>Precio completo</dt>
                    <dd>
                      Lo que cobra el servicio de energía por cada kilovatio
                      hora
                      {{
                        rates?.subsistenceCopKwh !== null
                          ? 'cuando ya se pasó el límite de subsistencia'
                          : 'de tu estrato'
                      }}.
                    </dd>
                  </div>
                  <div>
                    <dt>Ahorro del mes</dt>
                    <dd>
                      La diferencia entre esas dos facturas. Si el techo
                      produce más de lo que consumes, ese sobrante no entra en
                      el ahorro, porque venderlo a la red suele pagarse menos
                      que la luz de la casa.
                    </dd>
                  </div>
                </dl>
              </template>
              <template v-if="roi">
                <p>El retorno dice en cuánto tiempo se recupera lo que cuestan los paneles con el ahorro de la factura.</p>
                <div class="formula-eqs">
                  <p class="formula-eq">
                    <span>Inversión</span>
                    <span class="formula-op">=</span>
                    <span>Cantidad de paneles × Precio de cada panel</span>
                  </p>
                  <p class="formula-eq">
                    <span>Ahorro anual</span>
                    <span class="formula-op">=</span>
                    <span>Ahorro del mes × 12 meses</span>
                  </p>
                  <p class="formula-eq">
                    <span>Tiempo de retorno</span>
                    <span class="formula-op">=</span>
                    <span>Inversión ÷ Ahorro anual</span>
                  </p>
                  <p class="formula-eq">
                    <span>ROI anual</span>
                    <span class="formula-op">=</span>
                    <span>Ahorro anual ÷ Inversión</span>
                  </p>
                </div>
                <dl class="formula-terms">
                  <div>
                    <dt>Precio de cada panel</dt>
                    <dd>
                      Lo que escribiste como costo de un módulo. No incluye
                      inversor, cables ni instalación.
                    </dd>
                  </div>
                  <div>
                    <dt>Inversión</dt>
                    <dd>El costo de todos los paneles juntos.</dd>
                  </div>
                  <div>
                    <dt>Tiempo de retorno</dt>
                    <dd>
                      Cuánto tardarías en recuperar esa inversión si cada año
                      ahorras lo mismo. Es un retorno simple, sin inflación ni
                      intereses.
                    </dd>
                  </div>
                  <div>
                    <dt>ROI anual</dt>
                    <dd>
                      Qué parte de la inversión recuperas en un año con el
                      ahorro de factura.
                    </dd>
                  </div>
                </dl>
              </template>
            </div>
          </div>
          <p class="result-value">
            {{ formatCop(savings.billSavingsCop ?? savings.generationValueCop) }}
          </p>
          <dl class="result-stats">
            <div>
              <dt>Generación</dt>
              <dd>{{ formatKwh(savings.kwhMonth) }} kWh/mes</dd>
            </div>
            <div v-if="panelCount !== null && panelAreaM2 !== null">
              <dt>Paneles</dt>
              <dd>
                {{ formatQuantity(panelCount) }} ×
                {{ formatMeasure(panelAreaM2) }} m²
              </dd>
            </div>
            <div>
              <dt>Área de paneles</dt>
              <dd>{{ formatMeasure(panelSimulation.arrayAreaM2) }} m²</dd>
            </div>
            <div v-if="roof.areaM2 !== undefined">
              <dt>Área del techo</dt>
              <dd>{{ formatQuantity(roof.areaM2) }} m²</dd>
            </div>
            <div>
              <dt>Tarifa efectiva</dt>
              <dd>{{ formatCopPerKwh(savings.effectiveTariffCopKwh) }}</dd>
            </div>
            <div>
              <dt>Potencial anual</dt>
              <dd>{{ formatKwh(simulatedKwhYear ?? 0) }} kWh</dd>
            </div>
            <template v-if="roi">
              <div>
                <dt>Inversión</dt>
                <dd>{{ formatCop(roi.investmentCop) }}</dd>
              </div>
              <div>
                <dt>Ahorro anual</dt>
                <dd>{{ formatCop(roi.annualSavingsCop) }}</dd>
              </div>
              <div>
                <dt>Retorno</dt>
                <dd>
                  {{
                    roi.paybackYears === null
                      ? 'Sin ahorro'
                      : formatPayback(roi.paybackYears)
                  }}
                </dd>
              </div>
              <div v-if="roi.simpleRoi !== null">
                <dt>ROI anual</dt>
                <dd>{{ formatPercent(roi.simpleRoi) }}</dd>
              </div>
            </template>
          </dl>
          <p v-if="roi" class="result-note">
            El retorno cubre solo el costo de los módulos, no instalación ni
            inversor.
          </p>
          <p v-else-if="panelPriceCop === null" class="result-note">
            Escribe el precio de cada panel para calcular el retorno de la
            inversión.
          </p>
          <p v-if="savings.surplusKwh > 0" class="result-note">
            Excedente estimado: {{ formatKwh(savings.surplusKwh) }} kWh/mes. No se
            incluye en el ahorro de factura (la venta a red suele pagarse por debajo
            de la tarifa plena).
          </p>
        </template>
        <template v-else>
          <p class="result-label">Potencial del arreglo</p>
          <p class="result-value">{{ formatKwh(simulatedKwhYear ?? 0) }} kWh</p>
          <dl class="result-stats">
            <div>
              <dt>Generación</dt>
              <dd>{{ formatKwh((simulatedKwhYear ?? 0) / 12) }} kWh/mes</dd>
            </div>
            <div v-if="panelCount !== null && panelAreaM2 !== null">
              <dt>Paneles</dt>
              <dd>
                {{ formatQuantity(panelCount) }} ×
                {{ formatMeasure(panelAreaM2) }} m²
              </dd>
            </div>
            <div>
              <dt>Área de paneles</dt>
              <dd>{{ formatMeasure(panelSimulation.arrayAreaM2) }} m²</dd>
            </div>
            <div v-if="roof.areaM2 !== undefined">
              <dt>Área del techo</dt>
              <dd>{{ formatQuantity(roof.areaM2) }} m²</dd>
            </div>
          </dl>
          <p class="result-note">
            Selecciona tu estrato para ver el ahorro en pesos y el retorno de
            la inversión.
          </p>
        </template>
      </div>

      <p v-else-if="roof && arrayExceedsRoof" class="empty sim-error" role="alert">
        Reduce la cantidad o el tamaño de los paneles para que quepan en el
        techo.
      </p>
      <p v-else-if="roof" class="empty">
        Completa las características de los paneles para calcular el ahorro.
      </p>
      <p v-else class="empty">
        Toca un techo en el mapa para calcular el ahorro potencial.
      </p>
    </template>
  </div>
</template>

<style scoped>
.savings {
  --savings-display: 'Fraunces', 'Iowan Old Style', serif;
  --savings-ui: 'Sora', 'Segoe UI', sans-serif;
  display: flex;
  flex-direction: column;
  gap: 18px;
  height: 100%;
  min-height: 0;
  padding: 22px 22px 18px;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  font-family: var(--savings-ui);
}

.savings::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.savings-header {
  display: grid;
  gap: 6px;
}

.fineprint,
.estrato-rate,
.consumption-hint,
.result-note,
.empty {
  margin: 0;
  color: var(--mapcn-muted);
}

.savings-title {
  margin: 0;
  font-family: var(--savings-display);
  font-size: 1.65rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.15;
}

.savings-lede,
.fineprint,
.estrato-rate,
.consumption-hint,
.result-note,
.empty {
  font-size: 0.78rem;
  line-height: 1.45;
}

.savings-lede {
  margin: 0;
}

.estrato,
.sim {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.estrato legend,
.sim legend,
.consumption > span:first-child {
  display: block;
  margin-bottom: 8px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.estrato-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
}

.estrato-btn {
  appearance: none;
  height: 40px;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.35);
  color: inherit;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.estrato-btn:hover,
.estrato-btn:focus-visible {
  background: rgb(255 255 255 / 0.55);
  outline: none;
}

.estrato-btn[data-active='true'] {
  border-color: transparent;
  background: #9a3412;
  color: #fff7ed;
}

.savings[data-theme='dark'] .estrato-btn {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(255 255 255 / 0.06);
}

.savings[data-theme='dark'] .estrato-btn:hover,
.savings[data-theme='dark'] .estrato-btn:focus-visible {
  background: rgb(255 255 255 / 0.12);
}

.savings[data-theme='dark'] .estrato-btn[data-active='true'] {
  background: #fbbf24;
  color: #431407;
}

.estrato-rate {
  margin-top: 8px;
}

.sim {
  display: grid;
  gap: 10px;
}

.sim-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 10px;
}

.sim-grid > * {
  min-width: 0;
}

.sim-price {
  grid-column: 1 / -1;
}

.array-fit {
  display: grid;
  gap: 8px;
}

.array-meter {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.35);
}

.array-meter > span {
  display: block;
  width: calc(var(--occupancy, 0) * 100%);
  height: 100%;
  border-radius: inherit;
  background: #9a3412;
}

.array-meter[data-invalid='true'] > span {
  background: #b91c1c;
}

.savings[data-theme='dark'] .array-meter {
  background: rgb(255 255 255 / 0.08);
}

.savings[data-theme='dark'] .array-meter > span {
  background: #fbbf24;
}

.savings[data-theme='dark'] .array-meter[data-invalid='true'] > span {
  background: #f87171;
}

.sim-error,
.consumption-hint.sim-error {
  color: #9f1239;
}

.savings[data-theme='dark'] .sim-error,
.savings[data-theme='dark'] .consumption-hint.sim-error {
  color: #fda4af;
}

.consumption input[aria-invalid='true'] {
  border-color: #9f1239;
}

.savings[data-theme='dark'] .consumption input[aria-invalid='true'] {
  border-color: #fda4af;
}

.consumption {
  display: grid;
  gap: 8px;
}

.consumption input {
  width: 100%;
  height: 42px;
  padding: 0 12px;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.35);
  color: inherit;
  font-family: inherit;
  font-size: 0.95rem;
  appearance: textfield;
  -moz-appearance: textfield;
}

.consumption input::-webkit-outer-spin-button,
.consumption input::-webkit-inner-spin-button {
  margin: 0;
  appearance: none;
}

.consumption input:focus-visible {
  outline: 2px solid var(--mapcn-ring);
  outline-offset: 2px;
}

.savings[data-theme='dark'] .consumption input {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(255 255 255 / 0.06);
}

.result {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  padding: 16px;
  border-radius: 20px;
  background: rgb(154 52 18 / 0.08);
}

.savings[data-theme='dark'] .result {
  background: rgb(251 191 36 / 0.08);
}

.result-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--mapcn-muted);
}

.result-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.result-heading .result-label {
  flex: 1;
  min-width: 0;
}

.formula-info {
  box-sizing: border-box;
  display: grid;
  flex-shrink: 0;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  appearance: none;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 999px;
  background: rgb(255 255 255 / 0.35);
  color: inherit;
  cursor: pointer;
}

.formula-info svg {
  display: block;
  width: 14px;
  height: 14px;
}

.formula-info:focus-visible {
  outline: 2px solid var(--mapcn-ring);
  outline-offset: 2px;
}

.savings[data-theme='dark'] .formula-info {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(255 255 255 / 0.08);
}

.formula-popover {
  box-sizing: border-box;
  width: min(22.5rem, calc(100vw - 2rem));
  max-height: min(70svh, 32rem);
  position: fixed;
  margin: 0;
  inset: auto;
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  padding: 16px 16px 14px;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 20px;
  background: rgb(255 255 255 / 0.92);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    0 8px 24px rgb(0 0 0 / 0.12);
  color: var(--mapcn-foreground);
  font-family: var(--savings-ui);
  font-size: 0.84rem;
  line-height: 1.45;
}

.formula-popover::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.formula-popover:popover-open {
  display: grid;
  gap: 12px;
}

.formula-popover::backdrop {
  display: none;
}

.savings[data-theme='dark'] .formula-popover {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(18 18 18 / 0.94);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 12px 40px rgb(0 0 0 / 0.4);
}

.formula-popover p,
.formula-popover h3 {
  margin: 0;
}

.formula-popover-head {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 12px;
}

.formula-popover h3 {
  font-family: var(--savings-display);
  font-size: 1.15rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.2;
}

.formula-close {
  appearance: none;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--mapcn-muted);
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
}

.formula-close:focus-visible {
  outline: 2px solid var(--mapcn-ring);
  outline-offset: 2px;
}

.formula-eqs {
  display: grid;
  gap: 8px;
}

.formula-eq {
  display: grid;
  gap: 4px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgb(154 52 18 / 0.08);
  font-family: var(--savings-display);
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.35;
}

.formula-op {
  color: var(--mapcn-muted);
  font-family: var(--savings-ui);
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.savings[data-theme='dark'] .formula-eq {
  background: rgb(251 191 36 / 0.1);
}

.formula-terms {
  display: grid;
  gap: 10px;
  margin: 0;
}

.formula-terms dt {
  font-size: 0.72rem;
  font-weight: 600;
}

.formula-terms dd {
  margin: 2px 0 0;
  color: var(--mapcn-muted);
}

.result-value {
  margin: 0;
  font-family: var(--savings-display);
  font-size: clamp(1.6rem, 3vw, 2.15rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.result-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
  margin: 8px 0 0;
}

.result-stats div {
  min-width: 0;
}

.result-stats dt {
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--mapcn-muted);
}

.result-stats dd {
  margin: 2px 0 0;
  font-size: 0.82rem;
  font-weight: 600;
}

.empty {
  padding: 14px 16px;
  border-radius: 16px;
  background: rgb(255 255 255 / 0.28);
}

.savings[data-theme='dark'] .empty {
  background: rgb(255 255 255 / 0.05);
}

.fineprint {
  margin-top: auto;
  padding-top: 8px;
}

@media (max-width: 63.99rem) {
  .savings {
    padding: 16px 16px 14px;
    gap: 14px;
  }

  .savings-title {
    font-size: 1.35rem;
  }

  .savings-lede {
    display: none;
  }
}
</style>
