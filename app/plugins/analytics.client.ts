import { watch } from 'vue'
import { buildAnalyticsEvent, safePage, safeReferrer } from '~/lib/analytics-model'
import { registerAnalyticsSender } from '~/lib/analytics-events'
import { isAnalyticsEnabled } from '~/lib/analytics-consent'
import { useAnalyticsConsent } from '~/composables/useAnalyticsConsent'

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][]
  gtag?: (...args: unknown[]) => void
}

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig().public
  if (!isAnalyticsEnabled(config.ga4Enabled, config.ga4MeasurementId)) return

  const consent = useAnalyticsConsent()
  const router = useRouter()
  const gaWindow = window as AnalyticsWindow
  let active = false
  let lastPath: string | null = null
  let previousSafeLocation: string | undefined

  function pageView(path: string): void {
    if (!active || consent.choice.value !== 'accepted' || path === lastPath) return
    const page = safePage(path, location.origin)
    const referrer = previousSafeLocation ?? safeReferrer(document.referrer, location.origin)
    const metadata = {
      page_location: page.location,
      page_title: page.title,
      page_referrer: referrer,
    }
    gaWindow.gtag?.('config', config.ga4MeasurementId, {
      update: true,
      send_page_view: false,
      ...metadata,
    })
    gaWindow.gtag?.('event', 'page_view', metadata)
    lastPath = path
    previousSafeLocation = page.location
  }

  function start(): void {
    if (active) return
    active = true
    gaWindow.dataLayer ??= []
    gaWindow.gtag ??= (...args: unknown[]) => { gaWindow.dataLayer!.push(args) }
    gaWindow.gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied' })
    gaWindow.gtag('consent', 'update', { analytics_storage: 'granted' })
    gaWindow.gtag('js', new Date())
    const page = safePage(router.currentRoute.value.path, location.origin)
    // Queue safe defaults before the remote tag can execute.
    gaWindow.gtag('config', config.ga4MeasurementId, {
      send_page_view: false,
      page_location: page.location,
      page_title: page.title,
      page_referrer: safeReferrer(document.referrer, location.origin),
    })
    const script = document.createElement('script')
    script.async = true
    script.src = `https://www.googletagmanager.com/gtag/js?id=${config.ga4MeasurementId}`
    document.head.append(script)

    registerAnalyticsSender(event => {
      if (!active || consent.choice.value !== 'accepted') return
      const safe = safePage(router.currentRoute.value.path, location.origin)
      const built = buildAnalyticsEvent(event)
      gaWindow.gtag?.('event', built.name, {
        ...built.params,
        page_location: safe.location,
        page_title: safe.title,
      })
    })
    pageView(router.currentRoute.value.path)
  }

  router.afterEach((to, _from, failure) => {
    if (!failure) pageView(to.path)
  })
  nuxtApp.hook('app:mounted', () => {
    watch([consent.ready, consent.choice], ([ready, choice]) => {
      if (!ready) return
      if (choice === 'accepted') start()
      else {
        registerAnalyticsSender(null)
        if (active) {
          active = false
          gaWindow.gtag?.('consent', 'update', { analytics_storage: 'denied' })
          location.reload()
        }
      }
    }, { immediate: true })
  })
})
