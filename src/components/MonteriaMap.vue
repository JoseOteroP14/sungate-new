<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import {
  LngLatBounds,
  Map as MapLibreMap,
  addProtocol,
  removeProtocol,
  type AddProtocolAction,
  type MapGeoJSONFeature,
  type MapMouseEvent,
  type PaddingOptions,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import RoofSavingsPanel, { type PanelView } from './RoofSavingsPanel.vue'
import { createMapcnStyle } from '../map/create-style'
import {
  MONTERIA_BOUNDS,
  MONTERIA_CENTER,
  MONTERIA_INITIAL_PITCH,
  MONTERIA_INITIAL_ZOOM,
  MONTERIA_MAX_PITCH,
  MONTERIA_MAX_ZOOM,
  MONTERIA_MIN_ZOOM,
} from '../map/monteria'
import {
  OVERTURE_BUILDINGS_LAYER_ID,
  OVERTURE_BUILDINGS_SOURCE_ID,
  OVERTURE_BUILDINGS_SOURCE_LAYER,
} from '../map/overture-buildings'
import { parseRoofFeature, type SelectedRoof } from '../map/roof-feature'
import { SOLAR_LEGEND_STOPS, solarLegendGradient } from '../map/solar'
import { useResolvedTheme } from '../map/theme'
import { ESTRATOS, type Estrato } from '../tariffs/afinia'
import '../map/maplibre-worker'
import 'maplibre-gl/dist/maplibre-gl.css'

const ESTRATO_STORAGE_KEY = 'sungate.estrato'

function loadStoredEstrato(): Estrato | null {
  try {
    const raw = localStorage.getItem(ESTRATO_STORAGE_KEY)
    const value = Number(raw)
    return ESTRATOS.find((entry) => entry === value) ?? null
  } catch {
    return null
  }
}

const theme = useResolvedTheme()
const container = useTemplateRef<HTMLElement>('container')
const overlayPanel = useTemplateRef<HTMLElement>('overlayPanel')
const estrato = ref<Estrato | null>(loadStoredEstrato())
const consumption = ref('')
const selectedRoof = ref<SelectedRoof | null>(null)
const panelView = ref<PanelView>('roof')
let mapInstance: MapLibreMap | undefined
let resizeObserver: ResizeObserver | undefined

function featureIdentifier(id: string) {
  return {
    source: OVERTURE_BUILDINGS_SOURCE_ID,
    sourceLayer: OVERTURE_BUILDINGS_SOURCE_LAYER,
    id,
  }
}

function applyRoofSelection(id: string | undefined) {
  const map = mapInstance
  if (!map || id === undefined) {
    return
  }
  map.setFeatureState(featureIdentifier(id), { selected: true })
}

function clearRoofSelection(id: string | undefined) {
  const map = mapInstance
  if (!map || id === undefined) {
    return
  }
  map.removeFeatureState(featureIdentifier(id), 'selected')
}

function togglePanelView() {
  panelView.value = panelView.value === 'roof' ? 'bill' : 'roof'
}

function selectRoof(roof: SelectedRoof | null) {
  if (selectedRoof.value?.id === roof?.id) {
    return
  }
  clearRoofSelection(selectedRoof.value?.id)
  selectedRoof.value = roof
  applyRoofSelection(roof?.id)
}

function roofCenter(
  feature: MapGeoJSONFeature,
  fallback: [number, number],
): [number, number] {
  const { geometry } = feature
  if (geometry.type !== 'Polygon' && geometry.type !== 'MultiPolygon') {
    return fallback
  }
  const bounds = new LngLatBounds()
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates
  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const position of ring) {
        const lng = position[0]
        const lat = position[1]
        if (lng === undefined || lat === undefined) {
          continue
        }
        bounds.extend([lng, lat])
      }
    }
  }
  if (bounds.isEmpty()) {
    return fallback
  }
  const center = bounds.getCenter()
  return [center.lng, center.lat]
}

function overlayPadding(): PaddingOptions {
  const panel = overlayPanel.value
  const desktop = window.matchMedia('(min-width: 64rem)').matches
  const inset = 24
  if (desktop) {
    return {
      top: inset,
      bottom: inset,
      left: inset,
      right: (panel?.clientWidth ?? 0) + inset,
    }
  }
  return {
    top: inset,
    left: inset,
    right: inset,
    bottom: (panel?.clientHeight ?? 0) + inset,
  }
}

function flyToRoof(feature: MapGeoJSONFeature, event: MapMouseEvent) {
  mapInstance?.flyTo({
    center: roofCenter(feature, [event.lngLat.lng, event.lngLat.lat]),
    zoom: MONTERIA_MAX_ZOOM,
    padding: overlayPadding(),
    essential: true,
  })
}

function onBuildingClick(event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
  const feature = mapInstance?.queryRenderedFeatures(event.point, {
    layers: [OVERTURE_BUILDINGS_LAYER_ID],
  })[0]
  const roof = feature ? parseRoofFeature(feature) : null
  selectRoof(roof)
  if (feature && roof) {
    flyToRoof(feature, event)
  }
}

function bindBuildingPointer() {
  const map = mapInstance
  if (!map) {
    return
  }
  map.on('mouseenter', OVERTURE_BUILDINGS_LAYER_ID, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', OVERTURE_BUILDINGS_LAYER_ID, () => {
    map.getCanvas().style.cursor = ''
  })
}

watch(theme, (next) => {
  mapInstance?.setStyle(createMapcnStyle(next), { diff: false })
})

watch(estrato, (next) => {
  if (next === null) {
    localStorage.removeItem(ESTRATO_STORAGE_KEY)
    return
  }
  localStorage.setItem(ESTRATO_STORAGE_KEY, String(next))
})

onMounted(() => {
  const el = container.value
  if (!el) {
    return
  }

  const protocol = new Protocol()
  addProtocol('pmtiles', protocol.tile as AddProtocolAction)

  const instance = new MapLibreMap({
    container: el,
    style: createMapcnStyle(theme.value),
    center: MONTERIA_CENTER,
    zoom: MONTERIA_INITIAL_ZOOM,
    pitch: MONTERIA_INITIAL_PITCH,
    minZoom: MONTERIA_MIN_ZOOM,
    maxZoom: MONTERIA_MAX_ZOOM,
    maxPitch: MONTERIA_MAX_PITCH,
    maxBounds: MONTERIA_BOUNDS,
    renderWorldCopies: false,
    attributionControl: false,
  })

  resizeObserver = new ResizeObserver(() => {
    instance.resize()
  })
  resizeObserver.observe(el)

  mapInstance = instance
  instance.on('click', onBuildingClick)
  instance.on('style.load', () => {
    applyRoofSelection(selectedRoof.value?.id)
  })
  bindBuildingPointer()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  resizeObserver = undefined
  mapInstance?.remove()
  mapInstance = undefined
  removeProtocol('pmtiles')
})
</script>

<template>
  <div class="map-shell" :data-theme="theme">
    <div
      ref="container"
      class="map"
      role="application"
      aria-label="Mapa de potencial solar"
    />
    <div
      class="solar-legend"
      role="img"
      aria-label="Potencial fotovoltaico anual por techo, de menor a mayor"
    >
      <p class="solar-legend-title">Potencial FV</p>
      <div
        class="solar-legend-ramp"
        :style="{ background: solarLegendGradient(theme) }"
      />
      <div class="solar-legend-ticks">
        <span v-for="stop in SOLAR_LEGEND_STOPS" :key="stop.value">
          {{ stop.label }}
        </span>
      </div>
      <p class="solar-legend-unit">kWh/año</p>
    </div>
    <div class="map-overlay">
      <div class="map-overlay-spacer">
        <div class="brand" aria-label="Sunprofit">
          <svg
            class="brand-mark"
            viewBox="64 195 106 84"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="m 130.82706 198.64815
                 c 1.67174 4.32252 6.31283 8.55257 9.20755 12.17084
                   0.85946 1.07429 2.08496 3.39469 3.50287 3.72969
                   2.29205 0.54152 6.14465 -1.42907 8.45625 -1.87761
                   -1.04722 -3.84428 -6.03222 -8.05467 -8.57609 -11.1125
                   -0.91469 -1.09949 -1.95737 -3.08423 -3.33404 -3.62128
                   -2.40372 -0.93772 -6.66177 0.70372 -9.25654 0.71086
                 m -14.81667 1.85209
                   10.42165 13.22916
                   3.87627 4.25886
                   3.16458 -0.59471
                   7.40834 -2.07665
                 c -1.89603 -4.25409 -6.18989 -8.26645 -9.10159 -11.90625
                   -0.96509 -1.20642 -2.16812 -3.47697 -3.64353 -4.07348
                   -1.16481 -0.47093 -2.98315 0.0949 -4.18822 0.25703
                   -2.63783 0.35483 -5.29675 0.5723 -7.9375 0.90604
                 m -15.875 1.85208
                 c 2.64406 5.30921 7.61891 10.13721 11.2648 14.81667
                   0.96493 1.23847 2.51615 4.30317 4.12697 4.66777
                   1.10536 0.25019 2.5911 -0.46407 3.65823 -0.7325
                   2.87681 -0.72365 5.95904 -1.30192 8.73125 -2.34777
                 l -10.26669 -12.96459
                   -4.33051 -4.85702
                   -3.92363 0.28459
                   -9.26042 1.13285
                 m -3.968748 2.11667
                   -20.96741 25.4
                   -6.4974 7.9375
                   -3.22686 4.49791
                 h 17.99167
                 l -9.26042 26.9875
                 c 5.02142 -3.84068 9.12841 -10.66882 13.0834 -15.61041
                   5.86249 -7.32492 13.165868 -14.27542 18.137438 -22.225
                 l -6.349998 -0.26459
                 h -11.64167
                 c 1.46089 -6.31474 4.13862 -12.69526 6.36409 -18.78541
                   0.75927 -2.07781 2.82559 -5.75409 2.36716 -7.9375
                 m 48.683338 11.90625
                 c 0.58619 1.73841 2.03555 3.06541 3.14335 4.49791
                   2.40818 3.11401 4.87574 6.18592 7.33423 9.26042
                   0.95527 1.19463 2.32771 3.90249 3.8336 4.39032
                   1.95054 0.63189 6.87419 -1.98629 8.70757 -2.80282
                 l -10.15706 -12.7
                   -4.14086 -4.55693
                   -8.72083 1.9111
                 m -13.22917 3.43958
                 c 2.30068 5.16202 7.67415 9.82406 11.14313 14.2875
                   0.99671 1.28244 2.74222 4.47812 4.46831 4.72759
                   2.77416 0.40095 7.04406 -2.48971 9.78856 -3.14009
                   -2.16483 -4.85841 -7.12857 -9.25451 -10.35325 -13.49375
                   -0.98107 -1.28974 -2.67006 -4.32273 -4.24477 -4.84355
                   -1.00672 -0.33297 -2.42279 0.38558 -3.39365 0.64084
                   -2.43128 0.63924 -4.91693 1.48597 -7.40833 1.82146
                 m -14.81667 3.96875
                 c 2.44887 5.49449 8.01863 10.55762 11.67229 15.34583
                   0.93735 1.22843 2.58942 4.46402 4.21313 4.73045
                   1.1666 0.19142 2.87615 -0.74478 3.95833 -1.1357
                   2.71465 -0.98063 5.45724 -1.90786 8.20209 -2.801
                   -2.91756 -5.05314 -7.5115 -9.4074 -11.08086 -14.02291
                   -1.08868 -1.40777 -2.77921 -4.56397 -4.53998 -5.10813
                   -1.15684 -0.35753 -2.84525 0.45311 -3.95833 0.76251
                   -2.81197 0.78165 -5.65789 1.43778 -8.46667 2.22895
                 m 13.75834 46.30208
                 v -16.13958
                 h -5.29167
                 v 16.93333
                 h -36.512498
                   -7.9375
                 l -3.35364 0.27194
                   -3.79011 5.01973
                 h 38.629168
                 c 5.76391 0 12.90837 1.14794 18.52083 -0.14005
                   2.19595 -0.50394 4.34594 -1.96759 6.35 -2.96962
                   3.52991 -1.76495 7.09036 -3.44454 10.58333 -5.2784
                   3.75199 -1.96984 7.57418 -3.82969 11.37709 -5.69936
                   1.32124 -0.64957 3.65074 -1.1626 4.49057 -2.45679
                   0.91998 -1.41772 0.27193 -4.81903 0.27193 -6.47453
                 V 235.9544
                 c -1.36372 0.31549 -3.87926 0.72975 -4.86744 1.77328
                   -0.88737 0.9371 -0.42423 3.37932 -0.42423 4.57672
                 v 9.525
                 c 0 1.1958 0.357 3.11099 -0.27193 4.17699
                   -1.15892 1.96433 -5.42175 3.10145 -7.40099 4.09043
                   -6.48021 3.23802 -13.41846 7.9854 -20.37291 9.98883
                 z"
            />
          </svg>
          <span class="brand-word">Sunprofit</span>
        </div>
      </div>
      <button
        type="button"
        class="view-switch"
        :aria-label="
          panelView === 'roof' ? 'Simular factura' : 'Calcular ahorro en techo'
        "
        :title="
          panelView === 'roof' ? 'Simular factura' : 'Calcular ahorro en techo'
        "
        @click="togglePanelView"
      >
        <svg
          v-if="panelView === 'roof'"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M7 8.5h10M7 12h7M8.2 4h7.6L18 6.8V20H6V6.8L8.2 4Z"
          />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            fill="none"
            stroke="currentColor"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.75"
            d="M4 20V10.5L12 4l8 6.5V20H4ZM9.5 20v-6h5v6M12 8.2v.01M8.2 9.4l.7.7M15.8 9.4l-.7.7"
          />
        </svg>
      </button>
      <aside ref="overlayPanel" class="map-overlay-panel">
        <RoofSavingsPanel
          v-model:estrato="estrato"
          v-model:consumption="consumption"
          :roof="selectedRoof"
          :theme="theme"
          :view="panelView"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.map-shell {
  --mapcn-background: #fff;
  --mapcn-foreground: #0a0a0a;
  --mapcn-muted: #737373;
  --mapcn-border: #e5e5e5;
  --mapcn-accent: #f5f5f5;
  --mapcn-ring: #a1a1aa;
  --savings-display: 'Fraunces', 'Iowan Old Style', serif;
  --savings-ui: 'Sora', 'Segoe UI', sans-serif;
  position: relative;
  width: 100%;
  height: 100svh;
  color: var(--mapcn-foreground);
  font-family: var(--savings-ui);
}

.map-shell[data-theme='dark'] {
  --mapcn-background: #0a0a0a;
  --mapcn-foreground: #fafafa;
  --mapcn-muted: #a3a3a3;
  --mapcn-border: #262626;
  --mapcn-accent: rgb(38 38 38 / 0.4);
  --mapcn-ring: #52525b;
}

.map {
  width: 100%;
  height: 100%;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: max-content;
  color: #fff;
  filter: drop-shadow(0 1px 10px rgb(0 0 0 / 0.42));
}

.brand-mark {
  display: block;
  flex-shrink: 0;
  width: 2.65rem;
  height: auto;
  fill: currentColor;
}

.brand-word {
  font-family: var(--savings-display);
  font-size: 1.55rem;
  font-weight: 600;
  font-optical-sizing: auto;
  letter-spacing: 0.01em;
  line-height: 1;
}

.solar-legend {
  position: absolute;
  z-index: 6;
  left: 16px;
  top: 4.75rem;
  width: min(18rem, calc(100% - 32px));
  padding: 12px 14px 10px;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 16px;
  background: rgb(255 255 255 / 0.72);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    0 8px 32px rgb(0 0 0 / 0.08);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}

.map-shell[data-theme='dark'] .solar-legend {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(10 10 10 / 0.55);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 8px 32px rgb(0 0 0 / 0.28);
}

.solar-legend-title,
.solar-legend-unit {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
}

.solar-legend-title {
  font-family: var(--savings-display);
  font-weight: 600;
}

.solar-legend-unit {
  margin-top: 4px;
  color: var(--mapcn-muted);
}

.solar-legend-ramp {
  height: 8px;
  margin: 8px 0 6px;
  border-radius: 999px;
}

.solar-legend-ticks {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  color: var(--mapcn-muted);
}

.map-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  display: grid;
  grid-template-rows: auto 1fr auto;
  box-sizing: border-box;
  padding: 16px;
  pointer-events: none;
}

.map-overlay-spacer {
  min-width: 0;
}

.view-switch {
  box-sizing: border-box;
  display: grid;
  grid-row: 2;
  align-self: end;
  justify-self: end;
  place-items: center;
  width: 36px;
  height: 36px;
  margin: 0 0 12px;
  padding: 0;
  pointer-events: auto;
  appearance: none;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 12px;
  background: rgb(255 255 255 / 0.72);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    0 8px 32px rgb(0 0 0 / 0.08);
  color: var(--mapcn-foreground);
  cursor: pointer;
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}

.view-switch:hover,
.view-switch:focus-visible {
  background: rgb(255 255 255 / 0.88);
  outline: none;
}

.view-switch:focus-visible {
  outline: 2px solid var(--mapcn-ring);
  outline-offset: 2px;
}

.map-shell[data-theme='dark'] .view-switch {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(10 10 10 / 0.55);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 8px 32px rgb(0 0 0 / 0.28);
}

.map-shell[data-theme='dark'] .view-switch:hover,
.map-shell[data-theme='dark'] .view-switch:focus-visible {
  background: rgb(10 10 10 / 0.72);
}

.view-switch svg {
  display: block;
  width: 18px;
  height: 18px;
}

.map-overlay-panel {
  grid-row: 3;
  width: 100%;
  max-height: min(52svh, 34rem);
  min-width: 0;
  min-height: 0;
  align-self: end;
  overflow: hidden;
  pointer-events: auto;
  border: 1px solid rgb(255 255 255 / 0.45);
  border-radius: 24px;
  background: rgb(255 255 255 / 0.72);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    0 8px 32px rgb(0 0 0 / 0.08);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
}

.map-shell[data-theme='dark'] .map-overlay-panel {
  border-color: rgb(255 255 255 / 0.12);
  background: rgb(10 10 10 / 0.55);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.08),
    0 8px 32px rgb(0 0 0 / 0.28);
}

@media (min-width: 64rem) {
  .solar-legend {
    top: auto;
    bottom: 16px;
  }

  .map-overlay {
    grid-template-columns: minmax(0, 3fr) minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    padding: 12px;
  }

  .map-overlay-spacer {
    grid-column: 1;
    grid-row: 1;
  }

  .view-switch {
    grid-column: 1;
    grid-row: 1;
    align-self: start;
    justify-self: end;
    margin: 0 12px 0 0;
    background: rgb(255 255 255 / 0.28);
  }

  .view-switch:hover,
  .view-switch:focus-visible {
    background: rgb(255 255 255 / 0.45);
  }

  .map-shell[data-theme='dark'] .view-switch {
    background: rgb(10 10 10 / 0.35);
  }

  .map-shell[data-theme='dark'] .view-switch:hover,
  .map-shell[data-theme='dark'] .view-switch:focus-visible {
    background: rgb(10 10 10 / 0.55);
  }

  .brand {
    margin: 4px 0 0 4px;
  }

  .map-overlay-panel {
    grid-column: 2;
    grid-row: 1;
    align-self: stretch;
    max-height: none;
    border-radius: 24px;
    background: rgb(255 255 255 / 0.28);
  }

  .map-shell[data-theme='dark'] .map-overlay-panel {
    background: rgb(10 10 10 / 0.35);
  }
}
</style>
