<script setup lang="ts">
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import {
  AFINIA_RATES,
  AFINIA_TARIFF_META,
  ESTRATOS,
  SUBSISTENCE_KWH,
  energyBillCop,
  estimateRoofSavings,
  formatCop,
  formatCopPerKwh,
  formatKwh,
  formatQuantity,
  type Estrato,
} from '../tariffs/afinia'
import type { SelectedRoof } from '../map/roof-feature'

const estrato = defineModel<Estrato | null>('estrato', { default: null })
const consumptionInput = defineModel<string>('consumption', { default: '' })

const props = defineProps<{
  roof: SelectedRoof | null
  theme: 'light' | 'dark'
}>()

const emit = defineEmits<{
  clear: []
}>()

const resultEl = useTemplateRef<HTMLElement>('result')

function parseConsumptionKwh(raw: unknown): number | null {
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

function onConsumptionInput(event: Event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  consumptionInput.value = target.value
}

const consumptionKwh = computed(() => parseConsumptionKwh(consumptionInput.value))

const savings = computed(() => {
  if (!props.roof || estrato.value === null) {
    return null
  }
  return estimateRoofSavings(props.roof.kwhYear, estrato.value, consumptionKwh.value)
})

const billEstimate = computed(() => {
  if (estrato.value === null || consumptionKwh.value === null) {
    return null
  }
  const kwh = consumptionKwh.value
  const cop = energyBillCop(kwh, estrato.value)
  const gridKwhAfter = savings.value?.gridKwhAfter
  return {
    kwh,
    cop,
    effectiveTariffCopKwh: cop / kwh,
    billAfterCop:
      gridKwhAfter === undefined || gridKwhAfter === null
        ? null
        : energyBillCop(gridKwhAfter, estrato.value),
  }
})

const rates = computed(() =>
  estrato.value === null ? null : AFINIA_RATES[estrato.value],
)

const heroCop = computed(() => {
  if (!savings.value) {
    return billEstimate.value?.cop ?? null
  }
  return savings.value.billSavingsCop ?? savings.value.generationValueCop
})

const heroLabel = computed(() => {
  if (!savings.value) {
    return 'Costo estimado de factura'
  }
  return savings.value.billSavingsCop === null
    ? 'Ahorro potencial mensual'
    : 'Ahorro estimado en factura'
})

const showResult = computed(
  () => savings.value !== null || consumptionKwh.value !== null,
)

function selectEstrato(value: Estrato) {
  estrato.value = value
}

watch(showResult, async (visible) => {
  if (!visible) {
    return
  }
  await nextTick()
  resultEl.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <div class="savings" :data-theme="theme">
    <header class="savings-header">
      <p class="savings-kicker">{{ AFINIA_TARIFF_META.periodo }}</p>
      <h2 class="savings-title">Ahorro en tu techo</h2>
      <p class="savings-lede">
        Elige tu estrato y toca un edificio para estimar el valor de la energía
        solar a la tarifa residencial de la zona.
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
        type="text"
        inputmode="decimal"
        placeholder="Ej. 180"
        autocomplete="off"
        @input="onConsumptionInput"
      />
      <span class="consumption-hint">
        El costo de factura se actualiza al escribir. Si también eliges un techo,
        se estima el ahorro solar sobre ese consumo.
      </span>
    </label>

    <div v-if="showResult" ref="result" class="result">
      <template v-if="heroCop === null">
        <p class="result-label">Costo estimado de factura</p>
        <p class="result-note">
          Selecciona tu estrato para calcular el valor con tu consumo.
        </p>
      </template>
      <template v-else>
        <p class="result-label">{{ heroLabel }}</p>
        <p class="result-value">{{ formatCop(heroCop) }}</p>
        <dl v-if="savings && roof" class="result-stats">
          <div>
            <dt>Generación</dt>
            <dd>{{ formatKwh(savings.kwhMonth) }} kWh/mes</dd>
          </div>
          <div v-if="roof.areaM2 !== undefined">
            <dt>Área del techo</dt>
            <dd>{{ formatQuantity(roof.areaM2) }} m²</dd>
          </div>
          <div v-if="billEstimate">
            <dt>Consumo</dt>
            <dd>{{ formatKwh(billEstimate.kwh) }} kWh/mes</dd>
          </div>
          <div v-if="billEstimate">
            <dt>Factura actual</dt>
            <dd>{{ formatCop(billEstimate.cop) }}</dd>
          </div>
          <div v-if="billEstimate && billEstimate.billAfterCop !== null">
            <dt>Factura con solar</dt>
            <dd>{{ formatCop(billEstimate.billAfterCop) }}</dd>
          </div>
          <div>
            <dt>Tarifa efectiva</dt>
            <dd>{{ formatCopPerKwh(savings.effectiveTariffCopKwh) }}</dd>
          </div>
          <div>
            <dt>Potencial anual</dt>
            <dd>{{ formatKwh(roof.kwhYear) }} kWh</dd>
          </div>
        </dl>
        <dl v-else-if="billEstimate" class="result-stats">
          <div>
            <dt>Consumo</dt>
            <dd>{{ formatKwh(billEstimate.kwh) }} kWh/mes</dd>
          </div>
          <div>
            <dt>Tarifa efectiva</dt>
            <dd>{{ formatCopPerKwh(billEstimate.effectiveTariffCopKwh) }}</dd>
          </div>
        </dl>
        <p v-if="savings && savings.surplusKwh > 0" class="result-note">
          Excedente estimado: {{ formatKwh(savings.surplusKwh) }} kWh/mes. No se
          incluye en el ahorro de factura (la venta a red suele pagarse por debajo
          de la tarifa plena).
        </p>
        <p v-else-if="billEstimate && !roof" class="result-note">
          Toca un techo en el mapa para estimar cuánto podrías ahorrar con solar.
        </p>
        <button v-if="roof" type="button" class="clear" @click="emit('clear')">
          Elegir otro techo
        </button>
      </template>
    </div>

    <p v-else-if="estrato === null" class="empty">
      Primero selecciona tu estrato.
    </p>
    <p v-else class="empty">
      Ingresa tu consumo o toca un techo para calcular el ahorro.
    </p>

    <p class="fineprint">
      Nivel 1 · {{ AFINIA_TARIFF_META.ownership }}. Estimado con η 20 % y PR 80 %.
    </p>
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

.savings-kicker,
.fineprint,
.estrato-rate,
.consumption-hint,
.result-note,
.empty {
  margin: 0;
  color: var(--mapcn-muted);
}

.savings-kicker {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
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

.estrato {
  margin: 0;
  padding: 0;
  border: 0;
  min-width: 0;
}

.estrato legend,
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

.clear {
  appearance: none;
  justify-self: start;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
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
