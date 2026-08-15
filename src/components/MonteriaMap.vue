<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, useTemplateRef, watch } from 'vue'
import {
  Map as MapLibreMap,
  addProtocol,
  removeProtocol,
  type AddProtocolAction,
} from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { createMapcnStyle } from '../map/create-style'
import {
  MONTERIA_BOUNDS,
  MONTERIA_CENTER,
  MONTERIA_INITIAL_ZOOM,
  MONTERIA_MAX_ZOOM,
  MONTERIA_MIN_ZOOM,
} from '../map/monteria'
import { useResolvedTheme } from '../map/theme'
import '../map/maplibre-worker'
import 'maplibre-gl/dist/maplibre-gl.css'

const theme = useResolvedTheme()
const container = useTemplateRef<HTMLElement>('container')
const zoom = ref(MONTERIA_INITIAL_ZOOM)
let mapInstance: MapLibreMap | undefined
let resizeObserver: ResizeObserver | undefined

const canZoomIn = computed(() => zoom.value < MONTERIA_MAX_ZOOM)
const canZoomOut = computed(() => zoom.value > MONTERIA_MIN_ZOOM)

function zoomIn() {
  mapInstance?.zoomTo(mapInstance.getZoom() + 1, { duration: 300 })
}

function zoomOut() {
  mapInstance?.zoomTo(mapInstance.getZoom() - 1, { duration: 300 })
}

watch(theme, (next) => {
  mapInstance?.setStyle(createMapcnStyle(next), { diff: false })
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
    minZoom: MONTERIA_MIN_ZOOM,
    maxZoom: MONTERIA_MAX_ZOOM,
    maxBounds: MONTERIA_BOUNDS,
    renderWorldCopies: false,
    attributionControl: { compact: true },
  })

  const syncZoom = () => {
    zoom.value = instance.getZoom()
  }
  instance.on('zoom', syncZoom)
  instance.on('load', syncZoom)

  resizeObserver = new ResizeObserver(() => {
    instance.resize()
  })
  resizeObserver.observe(el)

  mapInstance = instance
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
      aria-label="Mapa de Montería"
    />
    <div class="map-controls" role="group" aria-label="Controles del mapa">
      <div class="control-group">
        <button
          type="button"
          class="control-button"
          aria-label="Acercar"
          :disabled="!canZoomIn"
          @click="zoomIn"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </button>
        <button
          type="button"
          class="control-button"
          aria-label="Alejar"
          :disabled="!canZoomOut"
          @click="zoomOut"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>
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
  position: relative;
  width: 100%;
  height: 100svh;
  color: var(--mapcn-foreground);
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

.map-controls {
  position: absolute;
  z-index: 10;
  right: 0.5rem;
  bottom: 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.control-group {
  display: flex;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid var(--mapcn-border);
  border-radius: 0.375rem;
  background: var(--mapcn-background);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

.control-button {
  display: flex;
  width: 2rem;
  height: 2rem;
  align-items: center;
  justify-content: center;
  border: 0;
  background: transparent;
  color: var(--mapcn-foreground);
  cursor: pointer;
  transition: background-color 150ms ease;
}

.control-button:first-child {
  border-top-left-radius: 0.375rem;
  border-top-right-radius: 0.375rem;
}

.control-button:last-child {
  border-bottom-left-radius: 0.375rem;
  border-bottom-right-radius: 0.375rem;
}

.control-button:hover:not(:disabled) {
  background: var(--mapcn-accent);
}

.control-button:focus-visible {
  outline: 2px solid var(--mapcn-ring);
  outline-offset: -2px;
}

.control-button:disabled {
  cursor: default;
  opacity: 0.5;
  pointer-events: none;
}

:deep(.maplibregl-ctrl-attrib) {
  border: 1px solid var(--mapcn-border);
  border-radius: 0.375rem;
  background: var(--mapcn-background);
  color: var(--mapcn-muted);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
}

:deep(.maplibregl-ctrl-attrib a) {
  color: var(--mapcn-muted);
}

:deep(.maplibregl-ctrl-attrib a:hover) {
  color: var(--mapcn-foreground);
}

:deep(.maplibregl-ctrl-attrib-button) {
  background-color: transparent;
}

.map-shell[data-theme='dark'] :deep(.maplibregl-ctrl-attrib-button) {
  filter: invert(1);
}

:deep(.maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib) {
  margin: 0 0.5rem 0.5rem 0;
}
</style>
