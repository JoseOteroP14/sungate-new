<script setup lang="ts">
import { onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import {
  Map as MapLibreMap,
  addProtocol,
  removeProtocol,
  type AddProtocolAction,
  type MapGeoJSONFeature,
  type MapMouseEvent,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import RoofSavingsPanel from './RoofSavingsPanel.vue'
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
const estrato = ref<Estrato | null>(loadStoredEstrato())
const consumption = ref('')
const selectedRoof = ref<SelectedRoof | null>(null)
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

function selectRoof(roof: SelectedRoof | null) {
  if (selectedRoof.value?.id === roof?.id) {
    return
  }
  clearRoofSelection(selectedRoof.value?.id)
  selectedRoof.value = roof
  applyRoofSelection(roof?.id)
}

function onBuildingClick(event: MapMouseEvent & { features?: MapGeoJSONFeature[] }) {
  const feature = mapInstance?.queryRenderedFeatures(event.point, {
    layers: [OVERTURE_BUILDINGS_LAYER_ID],
  })[0]
  selectRoof(feature ? parseRoofFeature(feature) : null)
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
      <div class="map-overlay-spacer"></div>
      <aside class="map-overlay-panel">
        <RoofSavingsPanel
          v-model:estrato="estrato"
          v-model:consumption="consumption"
          :roof="selectedRoof"
          :theme="theme"
          @clear="selectRoof(null)"
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

.solar-legend {
  position: absolute;
  z-index: 6;
  left: 16px;
  top: 16px;
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
  right: 12px;
  bottom: 12px;
  left: 12px;
  z-index: 5;
  display: flex;
  pointer-events: none;
}

.map-overlay-spacer {
  display: none;
}

.map-overlay-panel {
  width: 100%;
  max-height: min(52svh, 34rem);
  min-width: 0;
  min-height: 0;
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
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 4fr) minmax(0, 1fr);
    box-sizing: border-box;
    padding: 12px;
  }

  .map-overlay-spacer {
    display: block;
  }

  .map-overlay-panel {
    max-height: none;
    border-radius: 24px;
    background: rgb(255 255 255 / 0.28);
  }

  .map-shell[data-theme='dark'] .map-overlay-panel {
    background: rgb(10 10 10 / 0.35);
  }
}
</style>
