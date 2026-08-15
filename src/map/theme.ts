import { onMounted, onUnmounted, ref, type Ref } from 'vue'

export type MapTheme = 'light' | 'dark'

function getDocumentTheme(): MapTheme | null {
  const root = document.documentElement
  if (root.classList.contains('dark')) {
    return 'dark'
  }
  if (root.classList.contains('light')) {
    return 'light'
  }
  const dataTheme = root.dataset.theme
  if (dataTheme === 'dark' || dataTheme === 'light') {
    return dataTheme
  }
  return null
}

function getSystemTheme(): MapTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

function resolveTheme(): MapTheme {
  return getDocumentTheme() ?? getSystemTheme()
}

/**
 * Resuelve el tema como mapcn: clase/`data-theme` en `<html>`, o preferencia del sistema.
 */
export function useResolvedTheme(themeProp?: MapTheme): Ref<MapTheme> {
  const theme = ref<MapTheme>(themeProp ?? resolveTheme())

  if (themeProp) {
    return theme
  }

  let observer: MutationObserver | undefined
  let mediaQuery: MediaQueryList | undefined

  const onDocumentChange = () => {
    const docTheme = getDocumentTheme()
    if (docTheme) {
      theme.value = docTheme
    }
  }

  const onSystemChange = (event: MediaQueryListEvent) => {
    if (!getDocumentTheme()) {
      theme.value = event.matches ? 'dark' : 'light'
    }
  }

  onMounted(() => {
    observer = new MutationObserver(onDocumentChange)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', onSystemChange)
  })

  onUnmounted(() => {
    observer?.disconnect()
    mediaQuery?.removeEventListener('change', onSystemChange)
  })

  return theme
}
